import { NextResponse } from 'next/server';
import path from 'path';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import bcryptjs from 'bcryptjs';

// Use dynamic import for fs with error handling
async function readUsersFile() {
  try {
    const { readFile } = await import('node:fs/promises');
    const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
    const data = await readFile(usersFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading users file:', error);
    return [];
  }
}

async function writeUsersFile(users) {
  try {
    const { writeFile } = await import('node:fs/promises');
    const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
    await writeFile(usersFilePath, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing users file:', error);
    return false;
  }
}

export async function GET(request) {
  try {
    // Get session for debugging
    const session = await getServerSession(authOptions);
    console.log("Admin API - Session:", session ? {
      id: session?.user?.id,
      name: session?.user?.name,
      role: session?.user?.role
    } : 'No session');

    // Read users from file
    const users = await readUsersFile();
    
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
    // Get session for debugging
    const session = await getServerSession(authOptions);
    console.log("Admin API POST - Session:", session ? {
      id: session?.user?.id,
      name: session?.user?.name,
      role: session?.user?.role
    } : 'No session');
    
    const { username, email, password, isAdmin, passwordChangeRequired } = await request.json();
    
    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }
    
    // Read existing users
    const users = await readUsersFile();
    
    // Check if username already exists
    if (users.some(user => user.username === username)) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 400 }
      );
    }
    
    // Only check email uniqueness if an email was provided
    if (email && users.some(user => user.email === email)) {
      return NextResponse.json(
        { error: 'Email already exists' },
        { status: 400 }
      );
    }
    
    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcryptjs.hash(password, saltRounds);
    
    // Create new user
    const newUser = {
      id: (users.length + 1).toString(),
      username,
      email: email || "", // Use empty string if email is not provided
      password: hashedPassword, // Store the hashed password
      role: isAdmin ? 'admin' : 'user',
      passwordChangeRequired: passwordChangeRequired || false,
      createdAt: new Date().toISOString()
    };
    
    // Add to users array
    users.push(newUser);
    
    // Write back to file
    await writeUsersFile(users);
    
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