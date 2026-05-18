import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { savePushSubscription, removePushSubscription, getDevicesForUser } from '@/lib/db-helpers';

export const runtime = 'nodejs';

// POST /api/notifications/subscribe — save a push subscription for the current user
export async function POST(request) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subscription = await request.json();
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
  }

  const result = await savePushSubscription(token.username, subscription);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true }, { status: 201 });
}

// DELETE /api/notifications/subscribe — remove a push subscription by endpoint
export async function DELETE(request) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { endpoint } = await request.json();
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });

  const result = await removePushSubscription(token.username, endpoint);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true });
}

// GET /api/notifications/subscribe — list connected devices for the current user
export async function GET(request) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const devices = await getDevicesForUser(token.username);
  return NextResponse.json({ devices });
}
