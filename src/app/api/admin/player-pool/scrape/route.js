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
  const out = players.map((p, idx) => {
    // Try multiple likely keys for name
    const name = (
      p.display_name || p.playerName || p.name || p.full_name || p.player || p.username || 'Unknown Player'
    );
    // Try multiple keys for id
    const id = (p.playerID ?? p.id ?? p.pid ?? p.uuid ?? ('ktc_' + (idx + 1)));
    // Position keys
    const pos = (p.position ?? p.pos ?? p.playerPosition ?? 'WR');
    // Rank keys (overall or positional)
    const rankNum = (p.rank ?? p.overallRank ?? p.positionalRank ?? (idx + 1));
    // Value-like fields: KTC often uses numeric strings with commas
    const rawVal = (
      p.value ?? p.ktc_value ?? p.superflexValue ?? p.sfValue ?? p.tradeValue ?? p.valueSF ?? p.value_oneQB ?? p.oneQBValue ?? p.sf ?? p.val ?? null
    );
    let parsedVal = 0;
    if (rawVal !== null && rawVal !== undefined) {
      if (typeof rawVal === 'string') {
        const cleaned = rawVal.replace(/[,\s]/g, '');
        const n = Number(cleaned);
        parsedVal = Number.isFinite(n) ? n : 0;
      } else {
        const n = Number(rawVal);
        parsedVal = Number.isFinite(n) ? n : 0;
      }
    }

    return {
      id: String(id),
      name: String(name),
      position: String(pos).toUpperCase(),
      rank: Number(rankNum),
      value: parsedVal,
    };
  })
  .filter(p => p.name && p.position && Number.isFinite(p.rank))
  .sort((a, b) => a.rank - b.rank);
  if (out.length === 0) throw new Error('No valid players found after normalization.');
  return out;
}

// Scrape KeepTradeCut rookie rankings and extract playersArray with a regex over HTML.
// Note: This uses public web content; if KTC changes structure, this may need adjustment.
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  try {
    const url = 'https://keeptradecut.com/dynasty-rankings/rookie-rankings';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch KTC page: ${res.status}` }, { status: 400 });
    }
    const html = await res.text();
    const match = html.match(/var\s+playersArray\s*=\s*(\[.*?\]);/s);
    if (!match) {
      return NextResponse.json({ error: 'playersArray not found in KTC page source' }, { status: 500 });
    }
    let playersArr;
    try {
      playersArr = JSON.parse(match[1]);
    } catch (e) {
      return NextResponse.json({ error: 'Failed to parse playersArray JSON from KTC' }, { status: 500 });
    }

    const pool = normalizeKTCPlayers(playersArr);
    const outPath = path.join(process.cwd(), 'public', 'data', 'player-pool.json');
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(pool, null, 2), 'utf-8');

    return NextResponse.json({ ok: true, count: pool.length, file: '/data/player-pool.json' });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Failed to scrape player pool' }, { status: 500 });
  }
}
