// src/app/api/debug/check-user/route.js
import { NextResponse } from 'next/server';
import { getUserByUsername, getAllUsers } from '@/lib/db-helpers';

export async function GET(request) {
  // Only enable in development mode
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Debug endpoint disabled in production' }, { status: 403 });
  }

  try {
    // Get username from query string
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      // Just return count and first user sample (no sensitive data)
      const allUsers = await getAllUsers();
      
      const sampleUser = allUsers.length > 0 ? {
        id: allUsers[0].id,
        username: allUsers[0].username,
        fields: Object.keys(allUsers[0])
      } : null;
      
      return NextResponse.json({ 
        count: allUsers.length,
        sampleUser,
        message: "Add ?username=theusername to check for a specific user" 
      });
    }

    // Check if user exists
    const user = await getUserByUsername(username);
    
    if (!user) {
      return NextResponse.json({ 
        exists: false, 
        message: `User '${username}' not found in the database`
      });
    }

    // Return user info but not password
    const { password, ...safeUser } = user;
    
    return NextResponse.json({ 
      exists: true, 
      user: safeUser 
    });
  } catch (error) {
    console.error('Error in check-user debug endpoint:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}