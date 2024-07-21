const axios = require('axios');

// Define constants
const API_KEY = process.env.MONDAY_API_KEY;
const BOARD_ID = process.env.BOARD_ID;
const EMAIL_COLUMN_ID = process.env.EMAIL_COLUMN_ID;

// Set headers for API requests
const headers = {
  Authorization: API_KEY,
  'Content-Type': 'application/json',
};

// Function to get all board items using pagination with new syntax
async function getAllBoardItems(boardId) {
  let items = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const query = `
    query ($board_id: [ID!]!, $cursor: String) {
      boards(ids: $board_id) {
        items_page(limit: 100, cursor: $cursor) {
          cursor
          items {
            id
            name
            column_values(ids: "${EMAIL_COLUMN_ID}") {
              id
              text
            }
          }
        }
      }
    }`;

    const variables = {
      board_id: boardId,
      cursor: cursor,
    };

    try {
      const response = await axios.post(
        'https://api.monday.com/v2',
        { query, variables },
        { headers }
      );
      const data = response.data.data.boards[0].items_page;
      items = items.concat(data.items);
      cursor = data.cursor;
      hasMore = !!cursor;
      console.log(`Fetched ${data.items.length} items, cursor: ${cursor}`);
    } catch (error) {
      console.error('Error fetching board items:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

  return items;
}

// Function to merge contacts
async function mergeContacts(items, emailColumnId) {
  const emailMap = {};
  items.forEach((item) => {
    const itemId = item.id;
    const email = item.column_values.find((column) => column.id === emailColumnId)?.text;
    if (email) {
      if (emailMap[email]) {
        emailMap[email].push(item);
      } else {
        emailMap[email] = [item];
      }
    }
  });

  console.log(`Email map: ${JSON.stringify(emailMap, null, 2)}`);

  for (const [email, group] of Object.entries(emailMap)) {
    if (group.length > 1) {
      const original = group[0];
      console.log(`Original item for ${email}: ${JSON.stringify(original, null, 2)}`);
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
  duplicate.column_values.forEach((column) => {
    const originalColumn = original.column_values.find((col) => col.id === column.id);
    if (!originalColumn.text) {
      originalColumn.text = column.text;
    }
  });
  console.log(`Merged item ${duplicate.id} into ${original.id}`);
}

// Function to update the original item
async function updateItem(itemId, values) {
  const updates = {};
  values.forEach((column) => {
    if (column.id === EMAIL_COLUMN_ID) {
      updates[column.id] = {
        email: column.text,
        text: "", // Ensure the text field is an empty string
      };
    } else {
      updates[column.id] = column.text;
    }
  });

  const columnValuesString = JSON.stringify(updates).replace(/"([^"]+)":/g, '$1:');
  console.log(`Updating item ${itemId} with values: ${columnValuesString}`);

  const mutation = `
  mutation {
    change_multiple_column_values(item_id: ${itemId}, board_id: ${BOARD_ID}, column_values: "${columnValuesString.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}") {
      id
    }
  }`;

  console.log(`Mutation query: ${mutation}`);

  try {
    const response = await axios.post('https://api.monday.com/v2', { query: mutation }, { headers });
    console.log(`Updated item ${itemId}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error updating item ${itemId}:`, error.response ? error.response.data : error.message);
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
    console.log(`Deleted item ${itemId}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error deleting item ${itemId}:`, error.response ? error.response.data : error.message);
    throw error;
  }
}

// Main function to orchestrate merging
async function main() {
  console.log('Fetching board items...');
  const items = await getAllBoardItems(BOARD_ID);
  console.log('Fetched board items:', JSON.stringify(items, null, 2));
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
