import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { authOptions } from '../[...nextauth]/route';
import bcrypt from 'bcrypt';

// Get the absolute path to the users.json file
const usersFilePath = path.join(process.cwd(), 'src/data/users.json');

export async function POST(request) {
  try {
    // Try to get session using getServerSession
    const session = await getServerSession(authOptions);
    console.log("Change password API - Session:", session);
    
    // Get data from request body
    const body = await request.json();
    const { newPassword, username } = body;
    
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
    }
    
    // Read users from file
    const usersData = readFileSync(usersFilePath, 'utf8');
    const users = JSON.parse(usersData);
    
    // Find the user by username if session approach failed
    let userIndex = -1;
    
    if (session && session.user.id) {
      userIndex = users.findIndex(user => user.id === session.user.id);
      console.log(`Using session user ID: ${session.user.id}, found at index: ${userIndex}`);
    } else if (username) {
      userIndex = users.findIndex(user => user.username === username);
      console.log(`Using username from request: ${username}, found at index: ${userIndex}`);
    }
    
    if (userIndex === -1) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password and remove passwordChangeRequired flag
    users[userIndex].password = hashedPassword;
    users[userIndex].passwordChangeRequired = false;
    users[userIndex].passwordLastChanged = new Date().toISOString();
    
    console.log(`Change password API - Updated user: ${users[userIndex].username}`);
    
    // Write back to file
    writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to change password:', error);
    return NextResponse.json({ error: 'Failed to change password: ' + error.message }, { status: 500 });
  }
}