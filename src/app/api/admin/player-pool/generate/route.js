import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === 'admin';
  if (!isAdmin) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { ok: true, session };
}

function normalizeKTCPlayers(players) {
  const out = players.map((p, idx) => ({
    id: String(p.playerID ?? p.id ?? ('ktc_' + (idx + 1))),
    name: String(p.display_name ?? p.name ?? 'Unknown Player'),
    position: String(p.position ?? p.pos ?? 'WR').toUpperCase(),
    rank: Number(p.rank ?? p.positionalRank ?? idx + 1),
    value: Number(p.value ?? p.ktc_value ?? p.superflexValue ?? 0),
  }))
  .filter(p => p.name && p.position && Number.isFinite(p.rank))
  .sort((a, b) => a.rank - b.rank);
  if (out.length === 0) throw new Error('No valid players found in input JSON.');
  return out;
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  try {
    const body = await request.json().catch(() => ({}));
    const { ktcJsonUrl } = body || {};
    if (!ktcJsonUrl) {
      return NextResponse.json({ error: 'ktcJsonUrl is required' }, { status: 400 });
    }

    const resp = await fetch(ktcJsonUrl, { cache: 'no-store' });
    if (!resp.ok) {
      return NextResponse.json({ error: `Failed to fetch KTC JSON: ${resp.status}` }, { status: 400 });
    }
    const json = await resp.json();
    if (!Array.isArray(json)) {
      return NextResponse.json({ error: 'Expected an array at root of KTC JSON (playersArray)' }, { status: 400 });
    }

    const pool = normalizeKTCPlayers(json);
    const outPath = path.join(process.cwd(), 'public', 'data', 'player-pool.json');
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(pool, null, 2), 'utf-8');

    return NextResponse.json({ ok: true, count: pool.length, file: '/data/player-pool.json' });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Failed to generate player pool' }, { status: 500 });
  }
}
