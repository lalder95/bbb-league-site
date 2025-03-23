// src/app/api/admin/users/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import { getUsers } from '@/lib/auth-helpers';
import bcrypt from 'bcryptjs';

export async function GET(request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get users using our helper
    const users = await getUsers();
    
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
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { username, email, password, isAdmin, passwordChangeRequired, sleeperId } = await request.json();
    
    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }
    
    // Get existing users
    const users = await getUsers();
    
    // Check if username already exists
    if (users.some(user => user.username === username)) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 400 }
      );
    }
    
    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create new user
    const newUser = {
      id: (users.length + 1).toString(),
      username,
      email: email || "",
      password: hashedPassword,
      role: isAdmin ? 'admin' : 'user',
      passwordChangeRequired: passwordChangeRequired || false,
      createdAt: new Date().toISOString(),
      sleeperId: sleeperId || "",
      lastLogin: null
    };
    
    // Add to users array
    users.push(newUser);
    
    // Store updated users
    if (process.env.NODE_ENV === 'development') {
      try {
        const fsPromises = await import('fs/promises');
        const path = await import('path');
        const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
        await fsPromises.writeFile(usersFilePath, JSON.stringify(users, null, 2));
      } catch (fileError) {
        console.error('Error writing users file:', fileError);
        // Continue anyway, as we have in-memory updates
      }
    }
    
    // Return user without password
    const { password: _, ...safeUser } = newUser;
    return NextResponse.json(safeUser, { status: 201 });
  } catch (error) {
    console.error('Failed to create user:', error);
    return NextResponse.json(
      { error: 'Failed to create user: ' + error.message },
      { status: 500 }
    );
  }
}