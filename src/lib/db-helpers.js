// src/lib/db-helpers.js
import clientPromise from './mongodb';
import bcrypt from 'bcryptjs';

// Get the MongoDB database
async function getDatabase() {
  const client = await clientPromise;
  return client.db('bbb-league');
}

// Get the users collection
async function getUsersCollection() {
  const db = await getDatabase();
  return db.collection('users');
}

// Get all users
export async function getAllUsers() {
  console.log('Getting all users from MongoDB');
  const users = await getUsersCollection();
  const allUsers = await users.find({}).toArray();
  console.log(`Found ${allUsers.length} users in database`);
  return allUsers;
}

// Get user by ID
export async function getUserById(id) {
  console.log(`Looking up user by ID: ${id}`);
  const users = await getUsersCollection();
  const user = await users.findOne({ id });
  console.log(`User lookup by ID result: ${user ? 'Found user ' + user.username : 'User not found'}`);
  return user;
}

// Get user by username with case-insensitive search
export async function getUserByUsername(username) {
  if (!username) return null;
  
  console.log(`Looking up user by username: ${username}`);
  const users = await getUsersCollection();
  
  // Try case-insensitive search
  const user = await users.findOne({ 
    username: { $regex: new RegExp('^' + username + '$', 'i') } 
  });
  
  console.log(`User lookup result for '${username}': ${user ? 'Found user with ID ' + user.id : 'User not found'}`);
  return user;
}

// Update user password
export async function updateUserPassword(userId, hashedPassword, requireChange = true) {
  try {
    console.log(`Updating password for user ID: ${userId}`);
    const users = await getUsersCollection();
    
    const result = await users.updateOne(
      { id: userId },
      { 
        $set: { 
          password: hashedPassword,
          passwordChangeRequired: requireChange,
          passwordLastChanged: new Date().toISOString() 
        } 
      }
    );
    
    console.log(`Password update result: matchedCount=${result.matchedCount}, modifiedCount=${result.modifiedCount}`);
    
    if (result.matchedCount === 0) {
      console.log(`No user found with ID: ${userId}`);
      return { success: false, error: "User not found" };
    }
    
    return { success: true, persisted: true };
  } catch (error) {
    console.error('Error updating password:', error);
    return { success: false, error: error.message };
  }
}

// Add a new user
export async function addUser(newUser) {
  try {
    console.log(`Adding new user: ${newUser.username}`);
    const users = await getUsersCollection();
    
    // Check if username already exists
    const existing = await users.findOne({ 
      username: { $regex: new RegExp('^' + newUser.username + '$', 'i') } 
    });
    
    if (existing) {
      console.log(`Username already exists: ${newUser.username}`);
      return { success: false, error: "Username already exists" };
    }
    
    // Insert the new user
    const result = await users.insertOne(newUser);
    console.log(`New user added with ID: ${newUser.id}, MongoDB _id: ${result.insertedId}`);
    
    return { success: true, persisted: true, user: newUser };
  } catch (error) {
    console.error('Error adding user:', error);
    return { success: false, error: error.message };
  }
}