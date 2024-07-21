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

// Function to get board items
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

  try {
    const response = await axios.post('https://api.monday.com/v2', { query }, { headers });
    console.log('Fetched board items:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching board items:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Function to merge contacts
async function mergeContacts(items, emailColumnId) {
  const emailMap = {};
  const duplicates = [];

  items.forEach(item => {
    const itemId = item.id;
    const email = item.column_values.find(column => column.id === emailColumnId)?.text;

    if (email) {
      if (emailMap[email]) {
        emailMap[email].push(item);
      } else {
        emailMap[email] = [item];
      }
    }
  });

  for (const [email, group] of Object.entries(emailMap)) {
    if (group.length > 1) {
      const original = group[0];
      for (let i = 1; i < group.length; i++) {
        await mergeItem(original, group[i]);
        await deleteItem(group[i].id);
      }
      await updateItem(original.id, original.column_values);
    }
  }
}

// Function to merge duplicate item into the original item
async function mergeItem(original, duplicate) {
  duplicate.column_values.forEach(column => {
    if (column.text) {
      const originalColumn = original.column_values.find(col => col.id === column.id);
      if (!originalColumn.text) {
        originalColumn.text = column.text;
      }
    }
  });
}

// Function to update the original item
async function updateItem(itemId, values) {
  const updates = {};
  values.forEach(column => {
    updates[column.id] = column.text;
  });

  const mutation = `
  mutation {
    change_multiple_column_values(item_id: ${itemId}, board_id: ${BOARD_ID}, column_values: ${JSON.stringify(updates).replace(/"([^"]+)":/g, '$1:')}) {
      id
    }
  }`;

  try {
    const response = await axios.post('https://api.monday.com/v2', { query: mutation }, { headers });
    console.log('Updated item:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error updating item:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Function to delete a duplicate item
async function deleteItem(itemId) {
  const mutation = `
  mutation {
    delete_item (item_id: ${itemId}) {
      id
    }
  }`;

  try {
    const response = await axios.post('https://api.monday.com/v2', { query: mutation }, { headers });
    console.log('Deleted item:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error deleting item:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Main function to orchestrate merging
async function main() {
  console.log('Fetching board items...');
  const boardData = await getBoardItems(BOARD_ID);
  const items = boardData.data.boards[0].items;
  console.log('Merging contacts...');
  await mergeContacts(items, EMAIL_COLUMN_ID);
  console.log('Contacts merged successfully.');
}

// Handler function for the serverless function
module.exports = async (req, res) => {
  try {
    console.log('Merge contacts job started.');
    await main();
    console.log('Merge contacts job finished.');
    res.status(200).send('Merge contacts job finished.');
  } catch (error) {
    console.error('Error running job:', error.response ? error.response.data : error.message);
    res.status(500).send('Error running merge contacts job.');
  }
};
