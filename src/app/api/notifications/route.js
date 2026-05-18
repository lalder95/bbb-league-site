import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getNotificationsForUser } from '@/lib/db-helpers';

export const runtime = 'nodejs';

// GET /api/notifications — return current user's notifications (newest first, limit 50)
export async function GET(request) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const notifications = await getNotificationsForUser(token.username);
  return NextResponse.json({
    notifications: notifications.map(n => ({
      ...n,
      _id: n._id?.toString(),
      createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
    })),
  });
}
