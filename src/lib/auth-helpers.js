// src/lib/auth-helpers.js
import path from 'path';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';

// User data cache to reduce file reads
let usersCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 10000; // 10 seconds cache validity

// Default users based on your src/data/users.json
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
  // Note: Other default users removed for brevity but they would remain in the actual file
];

/**
 * Get users - handles both development (file-based) and production (environment-based) modes
 * @returns {Promise<Array>} Array of user objects
 */
export async function getUsers() {
  try {
    // Check if we have a valid cache
    const now = Date.now();
    if (usersCache && (now - cacheTimestamp < CACHE_DURATION)) {
      console.log('Using cached user data');
      return [...usersCache]; // Return a copy to prevent mutations affecting the cache
    }
    
    console.log('Cache invalid or expired, reading users from source');
    
    // In development, try to use the file system
    if (process.env.NODE_ENV === 'development') {
      try {
        const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
        console.log('Reading users from file path:', usersFilePath);
        
        const fileExists = await fs.access(usersFilePath)
          .then(() => true)
          .catch(() => false);
        
        if (!fileExists) {
          console.warn('Users file does not exist, returning default users');
          usersCache = [...DEFAULT_USERS];
          cacheTimestamp = now;
          return [...DEFAULT_USERS];
        }
        
        const data = await fs.readFile(usersFilePath, 'utf8');
        console.log('Users file read successfully');
        
        try {
          const users = JSON.parse(data);
          console.log(`Parsed ${users.length} users from file`);
          
          // Update cache
          usersCache = [...users];
          cacheTimestamp = now;
          
          return [...users];
        } catch (parseError) {
          console.error('Error parsing users JSON:', parseError);
          usersCache = [...DEFAULT_USERS];
          cacheTimestamp = now;
          return [...DEFAULT_USERS];
        }
      } catch (error) {
        console.error('Error reading users file in development:', error);
        usersCache = [...DEFAULT_USERS];
        cacheTimestamp = now;
        return [...DEFAULT_USERS];
      }
    } 
    // In production, try to use environment variables
    else {
      try {
        // First, try to get from USERS_JSON if it exists
        if (process.env.USERS_JSON) {
          const users = JSON.parse(process.env.USERS_JSON);
          usersCache = [...users];
          cacheTimestamp = now;
          return [...users];
        }
        
        // Next, try USERS_BASE64 if it exists
        if (process.env.USERS_BASE64) {
          const decodedUsers = Buffer.from(process.env.USERS_BASE64, 'base64').toString('utf8');
          const users = JSON.parse(decodedUsers);
          usersCache = [...users];
          cacheTimestamp = now;
          return [...users];
        }
        
        // Finally, fallback to the default encoded users
        console.log('Using default users in production');
        usersCache = [...DEFAULT_USERS];
        cacheTimestamp = now;
        return [...DEFAULT_USERS];
      } catch (error) {
        console.error('Error parsing user data in production:', error);
        usersCache = [...DEFAULT_USERS];
        cacheTimestamp = now;
        return [...DEFAULT_USERS];
      }
    }
  } catch (error) {
    console.error('Unexpected error in getUsers:', error);
    return [...DEFAULT_USERS];
  }
}

/**
 * Find a user by ID
 * @param {string} id User ID
 * @returns {Promise<Object|null>} User object or null if not found
 */
export async function getUserById(id) {
  try {
    const users = await getUsers();
    return users.find(user => user.id === id) || null;
  } catch (error) {
    console.error('Error finding user by ID:', error);
    return null;
  }
}

/**
 * Find a user by username
 * @param {string} username Username
 * @returns {Promise<Object|null>} User object or null if not found
 */
export async function getUserByUsername(username) {
  try {
    const users = await getUsers();
    return users.find(user => user.username === username) || null;
  } catch (error) {
    console.error('Error finding user by username:', error);
    return null;
  }
}

/**
 * Update user's password
 * @param {string} userId User ID
 * @param {string} newPassword New password (plaintext)
 * @param {boolean} requireChange Whether to require password change
 * @returns {Promise<boolean>} Success status
 */
export async function updateUserPassword(userId, newPassword, requireChange = false) {
  try {
    // Get current users
    const users = await getUsers();
    const userIndex = users.findIndex(user => user.id === userId);
    
    if (userIndex === -1) {
      return false;
    }
    
    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update user object
    users[userIndex] = {
      ...users[userIndex],
      password: hashedPassword,
      passwordChangeRequired: requireChange,
      passwordLastChanged: new Date().toISOString()
    };
    
    // Update the cache
    usersCache = [...users];
    cacheTimestamp = Date.now();
    
    // In development, write back to file
    if (process.env.NODE_ENV === 'development') {
      try {
        const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
        await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
        return true;
      } catch (error) {
        console.error('Error writing users file in development:', error);
        return false;
      }
    } 
    // In production, update environment variable (if possible)
    else {
      console.log('Password updated in memory, but cannot update environment variables in production');
      // This is where you would update a database in a real production app
      return true;
    }
  } catch (error) {
    console.error('Error updating user password:', error);
    return false;
  }
}

/**
 * Validate user credentials
 * @param {string} username Username
 * @param {string} password Password (plaintext)
 * @returns {Promise<Object|null>} User object without password or null if invalid
 */
export async function validateCredentials(username, password) {
  try {
    if (!username || !password) {
      return null;
    }
    
    const user = await getUserByUsername(username);
    if (!user) {
      console.log(`User not found: ${username}`);
      return null;
    }
    
    // Compare passwords
    let passwordMatch;
    try {
      passwordMatch = await bcrypt.compare(password, user.password);
    } catch (error) {
      console.error('Password comparison error:', error);
      return null;
    }
    
    if (!passwordMatch) {
      console.log(`Invalid password for user: ${username}`);
      return null;
    }
    
    // Update last login timestamp in memory (won't persist in production)
    user.lastLogin = new Date().toISOString();
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    console.error('Error validating credentials:', error);
    return null;
  }
}

/**
 * Save users to file/storage
 * @param {Array} users Array of user objects
 * @returns {Promise<boolean>} Success status
 */
export async function saveUsers(users) {
  try {
    // Update cache
    usersCache = [...users];
    cacheTimestamp = Date.now();
    
    // In development, write to file
    if (process.env.NODE_ENV === 'development') {
      const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
      await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
      return true;
    }
    // In production we would update a database
    return true;
  } catch (error) {
    console.error('Error saving users:', error);
    return false;
  }
}