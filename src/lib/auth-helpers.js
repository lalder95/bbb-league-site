// src/lib/auth-helpers.js
import path from 'path';
import bcrypt from 'bcryptjs';

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
  },
  {
    "id": "2",
    "username": "aintEZBNwheezE",
    "email": "",
    "password": "$2b$10$/BnqdmCx/KoYrfvEwuY3IuEc9s3q.d.9OyoQ3rj/grmzxEDfJ5G1e",
    "role": "user",
    "passwordChangeRequired": true,
    "createdAt": "2025-03-23T20:44:44.438Z",
    "sleeperId": "913497379737829376",
    "lastLogin": null
  },
  {
    "id": "3",
    "username": "Chewy2552",
    "email": "",
    "password": "$2b$10$3B.zVjGodGtjJkyUQPu/yuKv0oNKatP3P.35qJn4823o.MbfliI5C",
    "role": "user",
    "passwordChangeRequired": true,
    "createdAt": "2025-03-23T20:44:53.897Z",
    "sleeperId": "756760079197458432",
    "lastLogin": null
  },
  {
    "id": "4",
    "username": "Delusional1",
    "email": "",
    "password": "$2b$10$eIDzU910QmbqD1rCUNvfxe.dPfUg7todVgwXYiAhXFI4MsIfYwanq",
    "role": "user",
    "passwordChangeRequired": true,
    "createdAt": "2025-03-23T20:45:01.263Z",
    "sleeperId": "696154532161347584",
    "lastLogin": null
  },
  {
    "id": "5",
    "username": "DylanBears2022",
    "email": "",
    "password": "$2b$10$f9kBfG5oFf4XK8AoVEbf0eh9f65h1ujFne8.LpFe2ltshZyoTQwKu",
    "role": "user",
    "passwordChangeRequired": true,
    "createdAt": "2025-03-23T20:45:06.734Z",
    "sleeperId": "820806976639475712",
    "lastLogin": null
  },
  {
    "id": "6",
    "username": "EthanL21",
    "email": "",
    "password": "$2b$10$rlXfucKL7EUmGReuAe4Dt.uzfeMQh2bBPpdxe2hA7Tp8Wqqi0WHg.",
    "role": "user",
    "passwordChangeRequired": true,
    "createdAt": "2025-03-23T20:45:12.173Z",
    "sleeperId": "885739177386393600",
    "lastLogin": null
  },
  {
    "id": "7",
    "username": "Henrypavlak3",
    "email": "",
    "password": "$2b$10$fCC5.vuPzxKgNj9UV6Xy9OGmAccvray9SL02flNoISSHNaFjS/85y",
    "role": "user",
    "passwordChangeRequired": true,
    "createdAt": "2025-03-23T20:45:17.293Z",
    "sleeperId": "885724639740096512",
    "lastLogin": null
  },
  {
    "id": "8",
    "username": "jwalwer81",
    "email": "",
    "password": "$2b$10$D17oo4nZJZVmzkLRswzDR.gJL6YBYt.XGXRQ.2ro5w/4NGhBgUBS.",
    "role": "user",
    "passwordChangeRequired": true,
    "createdAt": "2025-03-23T20:45:22.318Z",
    "sleeperId": "672674056419475456",
    "lastLogin": null
  },
  {
    "id": "9",
    "username": "mlthomas5095",
    "email": "",
    "password": "$2b$10$miaL6AWSl346wprZEq74Guprd7TI6EsA7OmxWfwHNUwMrWxM9lw/6",
    "role": "user",
    "passwordChangeRequired": true,
    "createdAt": "2025-03-23T20:45:28.337Z",
    "sleeperId": "717639328456572928",
    "lastLogin": null
  },
  {
    "id": "10",
    "username": "Schoontang",
    "email": "",
    "password": "$2b$10$3P8oLGQRXf1nx0.cUwAV2ONrbf1HD4Zq.TnaKj0RuLhz.xPeDB/R6",
    "role": "user",
    "passwordChangeRequired": true,
    "createdAt": "2025-03-23T20:45:32.601Z",
    "sleeperId": "600829464699531264",
    "lastLogin": null
  },
  {
    "id": "11",
    "username": "tylercrain",
    "email": "",
    "password": "$2b$10$QdoVYnM4rNGTK0Lgz7z1Vee6Lgt49NSZIvj3GZ24ex7k44VbhFqT6",
    "role": "user",
    "passwordChangeRequired": true,
    "createdAt": "2025-03-23T20:45:37.273Z",
    "sleeperId": "608494374518607872",
    "lastLogin": null
  },
  {
    "id": "12",
    "username": "Vikingsfan80",
    "email": "",
    "password": "$2b$10$5GK2ScS7SMML9kQoNxn4kOrx.BbaFkqsJp3Pnp75Y.312uwrlUMUi",
    "role": "user",
    "passwordChangeRequired": true,
    "createdAt": "2025-03-23T20:45:42.055Z",
    "sleeperId": "820483197975519232",
    "lastLogin": null
  }
];

// Safely encode the DEFAULT_USERS for environment variables
const encodedDefaultUsers = Buffer.from(JSON.stringify(DEFAULT_USERS)).toString('base64');

/**
 * Get users - handles both development (file-based) and production (environment-based) modes
 * @returns {Promise<Array>} Array of user objects
 */
export async function getUsers() {
  try {
    // In development, try to use the file system
    if (process.env.NODE_ENV === 'development') {
      try {
        const fsPromises = await import('fs/promises');
        const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
        const data = await fsPromises.readFile(usersFilePath, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        console.error('Error reading users file in development:', error);
        return DEFAULT_USERS;
      }
    } 
    // In production, try to use environment variables
    else {
      try {
        // First, try to get from USERS_JSON if it exists
        if (process.env.USERS_JSON) {
          return JSON.parse(process.env.USERS_JSON);
        }
        
        // Next, try USERS_BASE64 if it exists
        if (process.env.USERS_BASE64) {
          const decodedUsers = Buffer.from(process.env.USERS_BASE64, 'base64').toString('utf8');
          return JSON.parse(decodedUsers);
        }
        
        // Finally, fallback to the default encoded users
        console.log('Using default encoded users in production');
        return DEFAULT_USERS;
      } catch (error) {
        console.error('Error parsing user data in production:', error);
        return DEFAULT_USERS;
      }
    }
  } catch (error) {
    console.error('Unexpected error in getUsers:', error);
    return DEFAULT_USERS;
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
    
    // In development, write back to file
    if (process.env.NODE_ENV === 'development') {
      try {
        const fsPromises = await import('fs/promises');
        const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
        await fsPromises.writeFile(usersFilePath, JSON.stringify(users, null, 2));
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
 * Get the encoded default users for environment variables
 * @returns {string} Base64 encoded users JSON
 */
export function getEncodedDefaultUsers() {
  return encodedDefaultUsers;
}