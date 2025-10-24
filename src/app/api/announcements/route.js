// src/app/api/announcements/route.js
import { NextResponse } from 'next/server';
import { getActiveAnnouncements } from '@/lib/db-helpers';

export async function GET() {
  try {
    const list = await getActiveAnnouncements();
    if (Array.isArray(list)) {
      // Serialize Dates to ISO strings for client
      const announcements = list.map(a => ({
        ...a,
        _id: a._id?.toString?.() || a._id,
        startAt: a.startAt instanceof Date ? a.startAt.toISOString() : a.startAt,
        endAt: a.endAt instanceof Date ? a.endAt.toISOString() : a.endAt,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
      }));
      return NextResponse.json({ announcements });
    }
    // If helper returned an error object
    return NextResponse.json({ announcements: [], error: list?.error || 'Unknown error' }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ announcements: [], error: error.message }, { status: 500 });
  }
}
