// src/app/api/admin/users/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import { getAllUsers, addUser } from '@/lib/db-helpers';
import bcrypt from 'bcryptjs';

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
    
    // If no session or not admin, try a fallback approach
    if (!session || session.user?.role !== 'admin') {
      console.log('Session auth failed, checking for development mode');
      
      // We're in development, so we can access users directly
      if (process.env.NODE_ENV === 'development') {
        console.log('Development mode detected - allowing access');
      } else {
        // If all fallback methods fail, return unauthorized
        console.error('All authentication methods failed');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Regular path - get users using our MongoDB helper
    console.log('Fetching users from MongoDB');
    const users = await getAllUsers();
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

export async function POST(request) {
  try {
    // First try to get the server session
    let session;
    try {
      session = await getServerSession(authOptions);
    } catch (sessionError) {
      console.error('Error getting session:', sessionError);
    }
    
    // Check if user is authorized
    let isAuthorized = false;
    
    if (session?.user?.role === 'admin') {
      isAuthorized = true;
    } else if (process.env.NODE_ENV === 'development') {
      isAuthorized = true;
    }
    
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get data from request body
    const body = await request.json();
    const { username, email, password, isAdmin, sleeperId } = body;
    
    if (!username || !password || password.length < 8) {
      return NextResponse.json({ 
        error: 'Username and password (min 8 chars) are required' 
      }, { status: 400 });
    }
    
    // Generate a random ID for the new user
    const id = Date.now().toString();
    
    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create the new user object
    const newUser = {
      id,
      username,
      email: email || '',
      password: hashedPassword,
      role: isAdmin ? 'admin' : 'user',
      passwordChangeRequired: true,
      createdAt: new Date().toISOString(),
      sleeperId: sleeperId || '',
      lastLogin: null
    };
    
    // Add the user to MongoDB
    const result = await addUser(newUser);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'User created successfully and persisted to database'
    });
  } catch (error) {
    console.error('Failed to create user:', error);
    return NextResponse.json({ 
      error: 'Failed to create user: ' + error.message
    }, { status: 500 });
  }
}