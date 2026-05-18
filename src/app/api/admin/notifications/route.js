import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getAllUsers } from '@/lib/db-helpers';
import { createNotification, createNotificationForMany } from '@/utils/notificationUtils';

export const runtime = 'nodejs';

/**
 * POST /api/admin/notifications
 *
 * Body:
 *   {
 *     userIds: ['all'] | ['username1', 'username2', ...],
 *     title: string,
 *     message: string,
 *     link?: string,
 *     type?: string,
 *   }
 *
 * Admin-only. Requires token.role === 'admin'.
 */
export async function POST(request) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (token.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { userIds, title, message, link = null, type = 'system' } = body || {};

  if (!userIds || !title || !message) {
    return NextResponse.json({ error: 'userIds, title, and message are required' }, { status: 400 });
  }

  let targets = userIds;

  if (userIds.length === 1 && userIds[0] === 'all') {
    const allUsers = await getAllUsers();
    targets = allUsers.map(u => u.username).filter(Boolean);
  }

  if (!targets.length) {
    return NextResponse.json({ error: 'No target users found' }, { status: 400 });
  }

  const result = await createNotificationForMany(targets, { title, message, link, type });
  return NextResponse.json({ success: true, ...result });
}
