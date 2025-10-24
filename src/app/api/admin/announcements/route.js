// src/app/api/admin/announcements/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import { addAnnouncement, getAllAnnouncements } from '@/lib/db-helpers';

function isAuthorizedSession(session) {
  return !!(session && session.user && session.user.role === 'admin');
}

export async function GET() {
  try {
    let session;
    try { session = await getServerSession(authOptions); } catch {}

    if (!isAuthorizedSession(session) && process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const list = await getAllAnnouncements();
    if (!Array.isArray(list)) {
      return NextResponse.json({ error: list?.error || 'Failed to fetch' }, { status: 500 });
    }

    const announcements = list.map(a => ({
      ...a,
      _id: a._id?.toString?.() || a._id,
      startAt: a.startAt instanceof Date ? a.startAt.toISOString() : a.startAt,
      endAt: a.endAt instanceof Date ? a.endAt.toISOString() : a.endAt,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    }));

    return NextResponse.json({ announcements });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    let session;
    try { session = await getServerSession(authOptions); } catch {}

    const isAuthorized = isAuthorizedSession(session) || process.env.NODE_ENV === 'development';
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { message, link, startAt, endAt } = body || {};
    const result = await addAnnouncement({
      message,
      link: link || '',
      startAt,
      endAt,
      createdBy: session?.user?.id || null,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, announcement: {
      ...result.announcement,
      _id: result.insertedId?.toString?.() || result.insertedId,
      startAt: result.announcement.startAt.toISOString(),
      endAt: result.announcement.endAt.toISOString(),
      createdAt: result.announcement.createdAt.toISOString(),
    } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
