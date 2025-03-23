// src/app/api/admin/users/[userId]/reset-password/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../auth/[...nextauth]/route';
import bcrypt from 'bcryptjs';
import { getUsers } from '@/lib/auth-helpers';

export async function POST(request, { params }) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { userId } = params;
    const { password, passwordChangeRequired } = await request.json();
    
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }
    
    // Get users
    const users = await getUsers();
    const userIndex = users.findIndex(user => user.id === userId);
    
    if (userIndex === -1) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Update user
    users[userIndex].password = hashedPassword;
    users[userIndex].passwordChangeRequired = passwordChangeRequired === false ? false : true;
    users[userIndex].passwordLastChanged = new Date().toISOString();
    
    // Save to file if in development
    if (process.env.NODE_ENV === 'development') {
      try {
        const fsPromises = await import('fs/promises');
        const path = await import('path');
        const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
        await fsPromises.writeFile(usersFilePath, JSON.stringify(users, null, 2));
      } catch (fileError) {
        console.error('Error writing users file:', fileError);
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to reset password:', error);
    return NextResponse.json(
      { error: 'Failed to reset password: ' + error.message },
      { status: 500 }
    );
  }
}