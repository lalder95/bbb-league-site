// src/app/api/debug/auth-test/route.js
import { NextResponse } from 'next/server';
import { getUserByUsername } from '@/lib/db-helpers';
import bcrypt from 'bcryptjs';

export async function GET(request) {
  // Only enable in development mode for security
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_DEBUG) {
    return NextResponse.json({ error: 'Debug disabled in production' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const password = searchParams.get('password');

    if (!username) {
      return NextResponse.json({ error: 'Username parameter required' });
    }

    // Find the user
    const user = await getUserByUsername(username);
    
    if (!user) {
      return NextResponse.json({ 
        error: 'User not found', 
        usernameProvided: username
      });
    }

    // Safe user info (no password)
    const { password: hashedPassword, ...safeUser } = user;

    // If password was provided, test it
    let passwordResult = null;
    if (password && hashedPassword) {
      try {
        passwordResult = await bcrypt.compare(password, hashedPassword);
      } catch (e) {
        passwordResult = `Error comparing: ${e.message}`;
      }
    }

    return NextResponse.json({
      user: {
        ...safeUser,
        // Show password field name and length but not actual value
        passwordField: hashedPassword ? {
          name: 'password',
          exists: true,
          length: hashedPassword.length,
          startsWith: hashedPassword.substring(0, 7) + '...'
        } : 'missing'
      },
      passwordTest: password ? passwordResult : 'No password provided',
      fieldNames: Object.keys(user || {})
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Error in auth test',
      message: error.message
    }, { status: 500 });
  }
}