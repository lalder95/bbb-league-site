import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === 'admin';
  if (!isAdmin) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { ok: true, session };
}

// POST /api/admin/mock-drafts
// Create a new mock draft
export async function POST(request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  try {
    const client = await clientPromise;
    const db = client.db();
    const body = await request.json();
    const nowDate = body.date || new Date().toISOString().split('T')[0];
    const doc = {
      title: body.title?.trim() || 'Untitled Mock Draft',
      description: body.description?.trim() || '',
      content: body.content || '',
      author: body.author?.trim() || auth.session.user?.username || 'Commissioner',
      date: nowDate,
      active: body.active === true,
      archived: body.archived === true ? true : false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (doc.active) {
      // Ensure only one is active
      await db.collection('mockDrafts').updateMany({ active: true }, { $set: { active: false } });
    }
    const result = await db.collection('mockDrafts').insertOne(doc);
    return NextResponse.json({ id: result.insertedId, draft: { _id: result.insertedId, ...doc } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create mock draft', details: err.message }, { status: 500 });
  }
}

// PUT /api/admin/mock-drafts
// Update existing mock draft: expects { id, ...fields }
export async function PUT(request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  try {
    const client = await clientPromise;
    const db = client.db();
    const body = await request.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const { ObjectId } = await import('mongodb');
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    const update = { ...fields, updatedAt: new Date() };
    if (update.active === true) {
      await db.collection('mockDrafts').updateMany({ active: true, _id: { $ne: _id } }, { $set: { active: false } });
    }
    const result = await db.collection('mockDrafts').findOneAndUpdate(
      { _id },
      { $set: update },
      { returnDocument: 'after' }
    );
    if (!result.value) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ draft: result.value });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update mock draft', details: err.message }, { status: 500 });
  }
}

// DELETE /api/admin/mock-drafts?id=...
export async function DELETE(request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const client = await clientPromise;
    const db = client.db();
    const { ObjectId } = await import('mongodb');
    const _id = new ObjectId(id);
    const result = await db.collection('mockDrafts').deleteOne({ _id });
    if (result.deletedCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete mock draft', details: err.message }, { status: 500 });
  }
}
