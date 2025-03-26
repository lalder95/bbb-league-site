// src/app/api/admin/users/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import { getUsers } from '@/lib/auth-helpers';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request) {
  try {
    console.log('Admin users API called');
    
    // First try to get the server session
    let session;
    try {
      session = await getServerSession(authOptions);
      console.log('Session retrieved:', session ? {
        userId: session.user?.id,
        name: session.user?.name,
        role: session.user?.role
      } : 'No session found');
    } catch (sessionError) {
      console.error('Error getting session:', sessionError);
      // Continue without session - we'll handle auth manually as backup
    }
    
    // If no session or not admin, try a fallback approach with direct file reading
    if (!session || session.user?.role !== 'admin') {
      console.log('Session auth failed, using direct file access as fallback');
      
      // We're in development, so we can read users directly in an emergency
      if (process.env.NODE_ENV === 'development') {
        try {
          // Read users directly from file
          const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
          console.log('Reading users from file directly:', usersFilePath);
          
          const fileContent = await fs.readFile(usersFilePath, 'utf8');
          const allUsers = JSON.parse(fileContent);
          
          // Remove passwords before sending
          const safeUsers = allUsers.map(({ password, ...user }) => user);
          console.log(`Successfully read ${safeUsers.length} users directly from file`);
          
          return NextResponse.json(safeUsers);
        } catch (fileError) {
          console.error('Error reading users file directly:', fileError);
          // Fall through to unauthorized response
        }
      }
      
      // If all fallback methods fail, return unauthorized
      console.error('All authentication methods failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Regular path - get users using our helper
    console.log('Session authenticated as admin, fetching users');
    const users = await getUsers();
    console.log(`Found ${users.length} users`);
    
    // Remove passwords before sending to client
    const safeUsers = users.map(({ password, ...user }) => user);
    
    return NextResponse.json(safeUsers);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch users: ' + error.message
    }, { status: 500 });
  }
}