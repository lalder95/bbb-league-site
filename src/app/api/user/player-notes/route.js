import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from '../../auth/[...nextauth]/route';
import clientPromise from '@/lib/mongodb';

function normalizePlayerId(value) {
  return String(value || '').trim();
}

function normalizeListName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function toListKey(value) {
  return normalizeListName(value).toLowerCase();
}

function serializeLists(lists, playerId) {
  return (lists || [])
    .map((list) => {
      const playerIds = Array.isArray(list?.playerIds)
        ? list.playerIds.map((entry) => String(entry).trim()).filter(Boolean)
        : [];

      return {
        name: normalizeListName(list?.name),
        normalizedName: toListKey(list?.normalizedName || list?.name),
        playerCount: playerIds.length,
        selected: playerIds.includes(playerId),
      };
    })
    .filter((list) => list.name && list.normalizedName)
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
}

async function getSessionUser() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.id) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }

  return { session };
}

export async function GET(req) {
  try {
    const auth = await getSessionUser();
    if (auth.error) {
      return auth.error;
    }

    const url = new URL(req.url);
    const playerId = normalizePlayerId(url.searchParams.get('playerId'));
    if (!playerId) {
      return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('bbb-league');
    const notesCollection = db.collection('playerNotes');
    const listsCollection = db.collection('playerLists');

    const [noteDoc, listDoc] = await Promise.all([
      notesCollection.findOne({ userId: auth.session.user.id, playerId }),
      listsCollection.findOne({ userId: auth.session.user.id }),
    ]);

    const lists = serializeLists(listDoc?.lists || [], playerId);

    return NextResponse.json({
      note: String(noteDoc?.note || ''),
      lists,
      selectedLists: lists.filter((list) => list.selected).map((list) => list.name),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const auth = await getSessionUser();
    if (auth.error) {
      return auth.error;
    }

    const body = await req.json();
    const playerId = normalizePlayerId(body?.playerId);
    if (!playerId) {
      return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
    }

    const note = String(body?.note || '');
    const playerName = String(body?.playerName || '').trim();
    const requestedLists = Array.isArray(body?.selectedLists) ? body.selectedLists : [];
    const newListName = normalizeListName(body?.newListName);

    const normalizedSelections = new Map();
    requestedLists.forEach((entry) => {
      const name = normalizeListName(entry);
      const key = toListKey(name);
      if (name && key) {
        normalizedSelections.set(key, name);
      }
    });

    if (newListName) {
      normalizedSelections.set(toListKey(newListName), newListName);
    }

    const client = await clientPromise;
    const db = client.db('bbb-league');
    const notesCollection = db.collection('playerNotes');
    const listsCollection = db.collection('playerLists');

    const existingListsDoc = await listsCollection.findOne({ userId: auth.session.user.id });
    const listMap = new Map();

    (existingListsDoc?.lists || []).forEach((entry) => {
      const name = normalizeListName(entry?.name);
      const normalizedName = toListKey(entry?.normalizedName || name);
      if (!name || !normalizedName) {
        return;
      }

      listMap.set(normalizedName, {
        name,
        normalizedName,
        playerIds: Array.isArray(entry?.playerIds)
          ? entry.playerIds.map((playerEntry) => String(playerEntry).trim()).filter(Boolean)
          : [],
        playerMeta: entry?.playerMeta || {},
        createdAt: entry?.createdAt || new Date(),
        updatedAt: new Date(),
      });
    });

    normalizedSelections.forEach((name, key) => {
      if (!listMap.has(key)) {
        listMap.set(key, {
          name,
          normalizedName: key,
          playerIds: [],
          playerMeta: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });

    const selectedKeys = new Set(normalizedSelections.keys());
    for (const [key, list] of listMap.entries()) {
      const playerIds = new Set(list.playerIds);
      if (selectedKeys.has(key)) {
        playerIds.add(playerId);
      } else {
        playerIds.delete(playerId);
      }

      list.playerIds = Array.from(playerIds);
      list.updatedAt = new Date();
      if (selectedKeys.has(key)) {
        list.name = normalizedSelections.get(key);
        if (playerName) {
          list.playerMeta = { ...(list.playerMeta || {}), [playerId]: { playerName, position: '' } };
        }
      }
    }

    const nextLists = Array.from(listMap.values()).sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    );

    const now = new Date();
    await Promise.all([
      notesCollection.updateOne(
        { userId: auth.session.user.id, playerId },
        {
          $set: {
            userId: auth.session.user.id,
            username: auth.session.user.username || auth.session.user.name || '',
            playerId,
            note,
            ...(playerName ? { playerName } : {}),
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true }
      ),
      listsCollection.updateOne(
        { userId: auth.session.user.id },
        {
          $set: {
            userId: auth.session.user.id,
            username: auth.session.user.username || auth.session.user.name || '',
            lists: nextLists,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true }
      ),
    ]);

    const serializedLists = serializeLists(nextLists, playerId);
    return NextResponse.json({
      success: true,
      note,
      lists: serializedLists,
      selectedLists: serializedLists.filter((list) => list.selected).map((list) => list.name),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const auth = await getSessionUser();
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const playerId = normalizePlayerId(url.searchParams.get('playerId'));
    if (!playerId) {
      return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('bbb-league');
    await db.collection('playerNotes').deleteOne({ userId: auth.session.user.id, playerId });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}