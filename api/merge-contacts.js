const axios = require('axios');

// Define constants
const API_KEY = process.env.MONDAY_API_KEY;
const BOARD_ID = process.env.BOARD_ID;
const EMAIL_COLUMN_ID = process.env.EMAIL_COLUMN_ID;

// Set headers for API requests
const headers = {
  'Authorization': API_KEY,
  'Content-Type': 'application/json'
};

async function getBoardItems(boardId) {
  const query = `
  {
    boards (ids: ${boardId}) {
      items {
        id
        name
        column_values {
          id
          text
        }
      }
    }
  }`;

  const response = await axios.post('https://api.monday.com/v2', { query }, { headers });
  return response.data;
}

async function mergeContacts(items, emailColumnId) {
  const emailMap = {};
  const duplicates = [];

  items.forEach(item => {
    const itemId = item.id;
    const email = item.column_values.find(column => column.id === emailColumnId)?.text;

    if (email) {
      if (emailMap[email]) {
        duplicates.push(item);
      } else {
        emailMap[email] = item;
      }
    }
  });

  // Merge and delete duplicates
  for (const duplicate of duplicates) {
    const original = emailMap[duplicate.column_values.find(column => column.id === emailColumnId).text];
    await mergeItem(original, duplicate);
    await deleteItem(duplicate.id);
  }
}

async function mergeItem(original, duplicate) {
  const updateValues = {};

  duplicate.column_values.forEach(column => {
    if (column.text && column.id !== EMAIL_COLUMN_ID) {
      const originalColumn = original.column_values.find(col => col.id === column.id);
      if (!originalColumn.text) {
        updateValues[column.id] = column.text;
      }
    }
  });

  if (Object.keys(updateValues).length > 0) {
    await updateItem(original.id, updateValues);
  }
}

async function updateItem(itemId, values) {
  const updates = JSON.stringify(values).replace(/"([^"]+)":/g, '$1:');
  const mutation = `
  mutation {
    change_multiple_column_values(item_id: ${itemId}, board_id: ${BOARD_ID}, column_values: ${updates}) {
      id
    }
  }`;

  const response = await axios.post('https://api.monday.com/v2', { query: mutation }, { headers });
  return response.data;
}

async function deleteItem(itemId) {
  const mutation = `
  mutation {
    delete_item (item_id: ${itemId}) {
      id
    }
  }`;

  const response = await axios.post('https://api.monday.com/v2', { query: mutation }, { headers });
  return response.data;
}

async function main() {
  const boardData = await getBoardItems(BOARD_ID);
  const items = boardData.data.boards[0].items;
  await mergeContacts(items, EMAIL_COLUMN_ID);
}

// Handler function for the serverless function
module.exports = async (req, res) => {
  try {
    await main();
    res.status(200).send('Merge contacts job finished.');
  } catch (error) {
    console.error('Error running job:', error);
    res.status(500).send('Error running merge contacts job.');
  }
};
