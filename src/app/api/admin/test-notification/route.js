import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getAllUsers } from '@/lib/db-helpers';
import { createNotification } from '@/utils/notificationUtils';

export const runtime = 'nodejs';

/**
 * POST /api/admin/test-notification
 * Sends a test notification to the requesting admin and returns a full diagnostic report.
 * Protected to admin role.
 */
export async function POST(request) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (token.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const diag = {
    tokenUsername: token.username,
    tokenName: token.name,
    tokenRole: token.role,
    allUsersCount: null,
    allUsernames: [],
    notificationResult: null,
    vapidConfigured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_EMAIL),
    mongodbUri: !!process.env.MONGODB_URI,
  };

  try {
    const allUsers = await getAllUsers();
    diag.allUsersCount = allUsers.length;
    diag.allUsernames = allUsers.map((u) => u.username ?? null);
  } catch (err) {
    diag.allUsersError = err.message;
  }

  try {
    const result = await createNotification(token.username, {
      title: 'Test Notification',
      message: 'This is a test notification from the admin panel.',
      link: '/account',
      type: 'system',
    });
    diag.notificationResult = result;
  } catch (err) {
    diag.notificationError = err.message;
  }

  return NextResponse.json({ ok: true, diag });
}
