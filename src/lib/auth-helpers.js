// src/lib/auth-helpers.js
import bcrypt from 'bcryptjs';
import { getUserByUsername } from './db-helpers';

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
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    console.error('Error validating credentials:', error);
    return null;
  }
}