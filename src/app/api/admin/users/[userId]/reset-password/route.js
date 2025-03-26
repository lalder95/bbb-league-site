// src/app/api/admin/users/[userId]/reset-password/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../auth/[...nextauth]/route';
import bcrypt from 'bcryptjs';
import { updateUserPassword } from '@/lib/db-helpers';

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
    }
    
    // Check authorization
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
    
    if (!password || password.length < 8) {
      console.error('Password validation failed: too short');
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    // Hash the password before storing
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Update the user's password in MongoDB
    const result = await updateUserPassword(userId, hashedPassword, passwordChangeRequired);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to update password');
    }
    
    return NextResponse.json({ 
      success: true,
      message: "Password reset successfully and saved to database."
    });
    
  } catch (error) {
    console.error('Failed to reset password:', error);
    return NextResponse.json(
      { error: 'Failed to reset password: ' + error.message },
      { status: 500 }
    );
  }
}