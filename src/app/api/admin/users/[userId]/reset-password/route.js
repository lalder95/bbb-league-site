// src/app/api/admin/users/[userId]/reset-password/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../auth/[...nextauth]/route';
import bcrypt from 'bcryptjs'; // Use bcryptjs consistently
import fs from 'fs/promises';
import path from 'path';

export async function POST(request, { params }) {
  try {
    console.log('Reset password API called for user ID:', params.userId);
    
    // First try to get the server session
    let session;
    try {
      session = await getServerSession(authOptions);
      console.log('Session retrieved for reset password:', session ? {
        userId: session.user?.id,
        name: session.user?.name,
        role: session.user?.role
      } : 'No session found');
    } catch (sessionError) {
      console.error('Error getting session for reset password:', sessionError);
      // We'll continue without session and handle auth manually
    }
    
    // Skip auth check in development as a fallback
    let isAuthorized = false;
    
    if (session?.user?.role === 'admin') {
      console.log('User authorized via session');
      isAuthorized = true;
    } else if (process.env.NODE_ENV === 'development') {
      console.log('Development environment - bypassing auth check');
      isAuthorized = true;
    }
    
    if (!isAuthorized) {
      console.error('Unauthorized reset password attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { userId } = params;
    console.log('Resetting password for user ID:', userId);
    
    const body = await request.json();
    const { password, passwordChangeRequired } = body;
    console.log('Received password reset request:', { 
      passwordLength: password?.length, 
      passwordChangeRequired 
    });
    
    if (!password || password.length < 8) {
      console.error('Password validation failed: too short');
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }
    
    // Read users directly from file in development mode
    let users = [];
    let fileUpdated = false;
    
    try {
      const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
      console.log('Reading users from file for password reset:', usersFilePath);
      
      const fileContent = await fs.readFile(usersFilePath, 'utf8');
      users = JSON.parse(fileContent);
      console.log(`Successfully read ${users.length} users from file`);
    } catch (fileError) {
      console.error('Error reading users file:', fileError);
      return NextResponse.json(
        { error: 'Failed to read users file: ' + fileError.message },
        { status: 500 }
      );
    }
    
    // Find the user
    const userIndex = users.findIndex(user => user.id === userId);
    console.log('User index in array:', userIndex);
    
    if (userIndex === -1) {
      console.error('User not found with ID:', userId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Hash the new password
    const saltRounds = 10;
    console.log('Hashing password...');
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Update user
    console.log('Updating user data...');
    users[userIndex].password = hashedPassword;
    users[userIndex].passwordChangeRequired = passwordChangeRequired === false ? false : true;
    users[userIndex].passwordLastChanged = new Date().toISOString();
    
    // Write the updated users back to the file
    try {
      const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
      console.log('Writing updated users back to file:', usersFilePath);
      
      await fs.writeFile(
        usersFilePath, 
        JSON.stringify(users, null, 2),
        'utf8'
      );
      
      console.log('Users file updated successfully');
      fileUpdated = true;
    } catch (writeError) {
      console.error('Error writing users file:', writeError);
      return NextResponse.json(
        { error: 'Failed to write updated users: ' + writeError.message },
        { status: 500 }
      );
    }
    
    console.log('Password reset successful for user ID:', userId);
    return NextResponse.json({ 
      success: true,
      fileUpdated: fileUpdated
    });
  } catch (error) {
    console.error('Failed to reset password:', error);
    return NextResponse.json(
      { error: 'Failed to reset password: ' + error.message },
      { status: 500 }
    );
  }
}