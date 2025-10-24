// src/app/api/admin/announcements/[id]/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]/route';
import { updateAnnouncement, deleteAnnouncement } from '@/lib/db-helpers';

function isAuthorizedSession(session) {
  return !!(session && session.user && session.user.role === 'admin');
}

export async function PATCH(request, { params }) {
  try {
    let session;
    try { session = await getServerSession(authOptions); } catch {}

    const isAuthorized = isAuthorizedSession(session) || process.env.NODE_ENV === 'development';
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params || {};
    const body = await request.json();
    const { message, link, startAt, endAt } = body || {};

    const result = await updateAnnouncement(id, { message, link, startAt, endAt });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    let session;
    try { session = await getServerSession(authOptions); } catch {}

    const isAuthorized = isAuthorizedSession(session) || process.env.NODE_ENV === 'development';
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params || {};
    const result = await deleteAnnouncement(id);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
