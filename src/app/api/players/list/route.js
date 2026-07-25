import { NextResponse } from 'next/server';
import { getNormalizedContractsData } from '@/lib/normalized-contracts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const seen = new Map();

    const { rows } = await getNormalizedContractsData();

    rows.forEach((row) => {
      const id = String(row['Player ID'] || '').trim();
      const name = String(row['Player Name'] || '').trim();
      const position = String(row.Position || '').trim();
      const status = String(row.Status || '').trim();
      if (!id || !name || id === 'Player ID') return;
      if (!seen.has(id) || status === 'Active' || status === 'Future') {
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
