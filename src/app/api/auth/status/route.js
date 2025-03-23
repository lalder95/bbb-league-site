import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { readFileSync } from 'fs';
import path from 'path';
import { authOptions } from '../[...nextauth]/route';

// Get the absolute path to the users.json file
const usersFilePath = path.join(process.cwd(), 'src/data/users.json');

export async function GET(request) {
  try {
    // Get session from the request
    const session = await getServerSession(authOptions);
    console.log("Status API - Session:", session);
    
    if (!session) {
      console.log("Status API - No session found");
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    
    // Read users from file
    const usersData = readFileSync(usersFilePath, 'utf8');
    const users = JSON.parse(usersData);
    
    // Find the current user
    const currentUser = users.find(user => user.id === session.user.id);
    console.log("Status API - Found user:", currentUser ? {
      id: currentUser.id,
      username: currentUser.username,
      passwordChangeRequired: currentUser.passwordChangeRequired
    } : 'User not found');
    
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Prepare and return user status
    const response = {
      username: currentUser.username,
      email: currentUser.email,
      role: currentUser.role,
      passwordChangeRequired: currentUser.passwordChangeRequired || false
    };
    
    console.log("Status API - Sending response:", response);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Status API - Error:", error);
    return NextResponse.json({ error: 'Failed to get user status' }, { status: 500 });
  }
}