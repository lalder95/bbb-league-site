import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export const runtime = 'nodejs';

// GET /api/mock-drafts
// Public: returns list of mock drafts. Supports optional query ?includeArchived=true
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const includeArchived = url.searchParams.get('includeArchived') === 'true';
    const client = await clientPromise;
    const db = client.db();
    const query = includeArchived ? {} : { archived: { $ne: true } };
    const drafts = await db
      .collection('mockDrafts')
      .find(query)
      .sort({ date: -1 })
      .toArray();

    return NextResponse.json({ drafts });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load mock drafts', details: err.message }, { status: 500 });
  }
}
