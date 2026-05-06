import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

import { authOptions } from '../../auth/[...nextauth]/route';
import clientPromise from '@/lib/mongodb';

function buildPlayerMap() {
  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'data', 'player-pool.json'), 'utf-8');
    const pool = JSON.parse(raw);
    const map = new Map();
    for (const p of pool) {
      if (p?.id) map.set(String(p.id), { name: p.name || '', position: p.position || '' });
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const userId = session.user.id;

    const client = await clientPromise;
    const db = client.db('bbb-league');

    const [noteDocs, listsDoc] = await Promise.all([
      db.collection('playerNotes').find({ userId }).sort({ updatedAt: -1 }).toArray(),
      db.collection('playerLists').findOne({ userId }),
    ]);

    const playerMap = buildPlayerMap();

    const notes = noteDocs
      .filter((d) => d.note && String(d.note).trim())
      .map((d) => ({
        playerId: String(d.playerId),
        note: String(d.note || ''),
        updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
        playerName: d.playerName || playerMap.get(String(d.playerId))?.name || 'Unknown Player',
        position: playerMap.get(String(d.playerId))?.position || '',
      }));

    const rawLists = listsDoc?.lists || [];
    const lists = rawLists.map((list) => {
      const playerIds = (list.playerIds || []).map(String);
      const meta = list.playerMeta || {};
      return {
        name: list.name || '',
        normalizedName: list.normalizedName || '',
        updatedAt: list.updatedAt ? new Date(list.updatedAt).toISOString() : null,
        players: playerIds.map((pid) => ({
          playerId: pid,
          playerName: meta[pid]?.playerName || playerMap.get(pid)?.name || 'Unknown Player',
          position: meta[pid]?.position || playerMap.get(pid)?.position || '',
        })),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    return NextResponse.json({ notes, lists });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}
