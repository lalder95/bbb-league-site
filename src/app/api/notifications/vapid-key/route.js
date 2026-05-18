import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// GET /api/notifications/vapid-key — returns the public VAPID key for push subscription
// Safe to expose publicly; the private key never leaves the server.
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ error: 'Push notifications are not configured' }, { status: 503 });
  return NextResponse.json({ publicKey: key });
}
