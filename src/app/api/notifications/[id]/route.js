import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { markNotificationRead, deleteNotification } from '@/lib/db-helpers';

export const runtime = 'nodejs';

// PATCH /api/notifications/:id — mark a single notification as read
export async function PATCH(request, { params }) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const result = await markNotificationRead(id, token.username);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/notifications/:id — delete a single notification
export async function DELETE(request, { params }) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const result = await deleteNotification(id, token.username);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true });
}
