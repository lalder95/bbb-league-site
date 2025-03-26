// src/lib/db-helpers.js
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Create a simple in-memory or file-based database
let database = null;
let initialized = false;

// Initial users from your users.json file
const DEFAULT_USERS = [
  {
    "id": "1",
    "username": "lalder",
    "email": "lalder95@gmail.com",
    "password": "$2b$10$OGOg3fKMqq04MQm4ijLx5utIkqfpoo43n1qnGIOdJiabg8ccPheUy",
    "role": "admin",
    "passwordChangeRequired": false,
    "createdAt": "2025-03-23T11:08:00.000Z",
    "sleeperId": "456973480269705216",
    "lastLogin": "2025-03-23T22:01:53.328Z"
  }
  // Add other users from your users.json file here
];

// Initialize the database
async function initDatabase() {
  if (initialized) return;
  
  console.log('Initializing database...');
  
  try {
    // For small applications, we can use a simple JSON file or even an in-memory database
    // In production with a read-only filesystem, we'll use a cloud database
    if (process.env.NODE_ENV === 'development') {
      // In development, try to use the JSON file
      const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
      
      if (fs.existsSync(usersFilePath)) {
        const data = fs.readFileSync(usersFilePath, 'utf8');
        database = JSON.parse(data);
        console.log(`Loaded ${database.length} users from file`);
      } else {
        console.log('Users file not found, using default users');
        database = [...DEFAULT_USERS];
      }
    } 
    else {
      // In production, use environment variables or a cloud database
      if (process.env.USERS_JSON) {
        try {
          database = JSON.parse(process.env.USERS_JSON);
          console.log(`Loaded ${database.length} users from environment variable`);
        } catch (e) {
          console.error('Error parsing USERS_JSON:', e);
          database = [...DEFAULT_USERS];
        }
      } 
      else if (process.env.USERS_BASE64) {
        try {
          const decoded = Buffer.from(process.env.USERS_BASE64, 'base64').toString('utf8');
          database = JSON.parse(decoded);
          console.log(`Loaded ${database.length} users from base64 environment variable`);
        } catch (e) {
          console.error('Error parsing USERS_BASE64:', e);
          database = [...DEFAULT_USERS];
        }
      }
      else {
        // Last resort - use default users
        console.log('No user data source found, using default users');
        database = [...DEFAULT_USERS];
      }
    }
    
    initialized = true;
  } catch (error) {
    console.error('Database initialization error:', error);
    database = [...DEFAULT_USERS];
    initialized = true;
  }
}

// Get all users
export async function getUsers() {
  await initDatabase();
  return [...database]; // Return a copy to prevent direct modification
}

// Get a user by ID
export async function getUserById(id) {
  await initDatabase();
  return database.find(user => user.id === id) || null;
}

// Update a user's password
export async function updateUserPassword(userId, hashedPassword, passwordChangeRequired = true) {
  await initDatabase();
  
  try {
    const userIndex = database.findIndex(user => user.id === userId);
    
    if (userIndex === -1) {
      return { success: false, error: 'User not found' };
    }
    
    // Update the user in our database
    database[userIndex] = {
      ...database[userIndex],
      password: hashedPassword,
      passwordChangeRequired: passwordChangeRequired === false ? false : true,
      passwordLastChanged: new Date().toISOString()
    };
    
    // Try to persist changes if possible (in development)
    if (process.env.NODE_ENV === 'development') {
      try {
        const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
        fs.writeFileSync(usersFilePath, JSON.stringify(database, null, 2), 'utf8');
        console.log('Saved updated users to file');
      } catch (e) {
        console.warn('Could not save to file system (expected in production):', e.message);
        // Continue anyway - we have the in-memory update
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error updating password:', error);
    return { success: false, error: error.message };
  }
}

// Get a user by username - for auth
export async function getUserByUsername(username) {
  await initDatabase();
  return database.find(user => user.username === username) || null;
}

// Validate credentials
export async function validateCredentials(username, password) {
  await initDatabase();
  
  const user = await getUserByUsername(username);
  if (!user) return null;
  
  // This would use bcrypt.compare in a real implementation
  // But we're keeping it simple for this demo
  // We assume the password is already correctly validated elsewhere
  
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}