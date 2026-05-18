import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { markAllNotificationsRead } from '@/lib/db-helpers';

export const runtime = 'nodejs';

// POST /api/notifications/mark-all-read — mark all of the current user's notifications as read
export async function POST(request) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await markAllNotificationsRead(token.username);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true });
}
