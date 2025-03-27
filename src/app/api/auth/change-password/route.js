// src/app/api/auth/change-password/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../[...nextauth]/route';
import bcrypt from 'bcryptjs';
import clientPromise from '@/lib/mongodb';

export async function POST(request) {
  try {
    // Get the session
    let session;
    try {
      session = await getServerSession(authOptions);
      console.log("Change password API - Session:", session ? {
        userId: session.user?.id,
        name: session.user?.name,
        role: session.user?.role
      } : 'No session found');
    } catch (sessionError) {
      console.error('Error getting session for password change:', sessionError);
    }
    
    // Get data from request body
    const body = await request.json();
    const { newPassword, username } = body;
    
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
    }
    
    // Connect to MongoDB
    const client = await clientPromise;
    const db = client.db('bbb-league');
    const usersCollection = db.collection('users');
    
    // Find the user
    let user;
    let query = {};
    
    if (session && session.user.id) {
      query = { id: session.user.id };
      console.log(`Using session user ID: ${session.user.id}`);
    } else if (username) {
      // Case-insensitive username query
      query = { username: { $regex: new RegExp('^' + username + '$', 'i') } };
      console.log(`Using username from request: ${username}`);
    } else {
      return NextResponse.json({ error: 'No user identifier provided' }, { status: 400 });
    }
    
    // Find user in MongoDB
    user = await usersCollection.findOne(query);
    
    if (!user) {
      console.error('User not found with query:', query);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Hash the new password
    const saltRounds = 10;
    console.log('Hashing new password...');
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update the user in MongoDB
    const result = await usersCollection.updateOne(
      { _id: user._id },
      { 
        $set: { 
          password: hashedPassword,
          passwordChangeRequired: false,
          passwordLastChanged: new Date().toISOString() 
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      console.error('Failed to update user - no matches found');
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
    
    console.log(`Password changed successfully for user: ${user.username}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to change password:', error);
    return NextResponse.json({ error: 'Failed to change password: ' + error.message }, { status: 500 });
  }
}