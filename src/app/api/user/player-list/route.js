import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from '../../auth/[...nextauth]/route';
import clientPromise from '@/lib/mongodb';

function normalizeListName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function toListKey(value) {
  return normalizeListName(value).toLowerCase();
}

async function getAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  return { session };
}

// DELETE: remove an entire list by normalizedName
export async function DELETE(req) {
  try {
    const auth = await getAuth();
    if (auth.error) return auth.error;

    const { normalizedName } = await req.json();
    const key = toListKey(normalizedName);
    if (!key) return NextResponse.json({ error: 'normalizedName is required' }, { status: 400 });

    const client = await clientPromise;
    const db = client.db('bbb-league');

    await db.collection('playerLists').updateOne(
      { userId: auth.session.user.id },
      { $pull: { lists: { normalizedName: key } }, $set: { updatedAt: new Date() } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}

// PATCH: rename a list
export async function PATCH(req) {
  try {
    const auth = await getAuth();
    if (auth.error) return auth.error;

    const { normalizedName, newName } = await req.json();
    const oldKey = toListKey(normalizedName);
    const cleanName = normalizeListName(newName);
    const newKey = toListKey(cleanName);

    if (!oldKey || !cleanName) {
      return NextResponse.json({ error: 'normalizedName and newName are required' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('bbb-league');

    await db.collection('playerLists').updateOne(
      { userId: auth.session.user.id, 'lists.normalizedName': oldKey },
      {
        $set: {
          'lists.$.name': cleanName,
          'lists.$.normalizedName': newKey,
          'lists.$.updatedAt': new Date(),
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({ success: true, name: cleanName, normalizedName: newKey });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}

// POST: create an empty list OR add a player to an existing list
// body { name } → create list
// body { normalizedName, playerId } → add player to list
export async function POST(req) {
  try {
    const auth = await getAuth();
    if (auth.error) return auth.error;

    const body = await req.json();
    const client = await clientPromise;
    const db = client.db('bbb-league');
    const userId = auth.session.user.id;
    const username = auth.session.user.username || auth.session.user.name || '';
    const now = new Date();

    // ── Create empty list ──────────────────────────────────────────────────
    if (body.name && !body.normalizedName) {
      const cleanName = normalizeListName(body.name);
      const key = toListKey(cleanName);
      if (!key) return NextResponse.json({ error: 'name is required' }, { status: 400 });

      const existing = await db.collection('playerLists').findOne({ userId });
      const already = (existing?.lists || []).some((l) => l.normalizedName === key);
      if (already) return NextResponse.json({ error: 'A list with that name already exists' }, { status: 409 });

      const newList = { name: cleanName, normalizedName: key, playerIds: [], createdAt: now, updatedAt: now };
      await db.collection('playerLists').updateOne(
        { userId },
        {
          $push: { lists: newList },
          $set: { updatedAt: now, userId, username },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );
      return NextResponse.json({ success: true, name: cleanName, normalizedName: key });
    }

    // ── Add player to list ─────────────────────────────────────────────────
    const key = toListKey(body.normalizedName);
    const pid = String(body.playerId || '').trim();
    if (!key || !pid) {
      return NextResponse.json({ error: 'normalizedName and playerId are required' }, { status: 400 });
    }

    const pName = String(body.playerName || '').trim();
    const pPos = String(body.position || '').trim();

    const metaUpdate = pName
      ? { [`lists.$.playerMeta.${pid}`]: { playerName: pName, position: pPos } }
      : {};

    await db.collection('playerLists').updateOne(
      { userId, 'lists.normalizedName': key },
      {
        $addToSet: { 'lists.$.playerIds': pid },
        $set: { ...metaUpdate, 'lists.$.updatedAt': now, updatedAt: now },
      }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}

// PUT: remove a player from a list
export async function PUT(req) {
  try {
    const auth = await getAuth();
    if (auth.error) return auth.error;

    const { normalizedName, playerId } = await req.json();
    const key = toListKey(normalizedName);
    const pid = String(playerId || '').trim();

    if (!key || !pid) {
      return NextResponse.json({ error: 'normalizedName and playerId are required' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('bbb-league');

    await db.collection('playerLists').updateOne(
      { userId: auth.session.user.id, 'lists.normalizedName': key },
      {
        $pull: { 'lists.$.playerIds': pid },
        $set: { 'lists.$.updatedAt': new Date(), updatedAt: new Date() },
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}
