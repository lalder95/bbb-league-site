import { NextResponse } from 'next/server';

const CSV_URL = 'https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(CSV_URL, { next: { revalidate: 300 } }); // cache 5 min
    if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
    const text = await res.text();

    const rows = text.split('\n');
    const seen = new Map();

    rows.slice(1).forEach((row) => {
      const cols = row.split(',');
      const id = String(cols[0] || '').trim();
      const name = String(cols[1] || '').trim();
      const position = String(cols[21] || '').trim();
      const status = String(cols[14] || '').trim();
      if (!id || !name || id === 'Player ID') return;
      // prefer Active row if we've already seen this player
      if (!seen.has(id) || status === 'Active') {
        seen.set(id, { id, name, position });
      }
    });

    const players = Array.from(seen.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );

    return NextResponse.json(players);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}
