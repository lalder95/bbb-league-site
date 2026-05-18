import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import clientPromise from '@/lib/mongodb';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

// PATCH /api/account/password
// Body: { currentPassword, newPassword }
export async function PATCH(request) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'currentPassword and newPassword are required' }, { status: 400 });
  }

  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db('bbb-league');
  const users = db.collection('users');

  const user = await users.findOne({ username: { $regex: new RegExp('^' + token.username + '$', 'i') } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });

  const hashed = await bcrypt.hash(newPassword, 12);
  await users.updateOne(
    { _id: user._id },
    { $set: { password: hashed, passwordChangeRequired: false } }
  );

  return NextResponse.json({ success: true });
}
