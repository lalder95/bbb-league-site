import { NextResponse } from 'next/server';
import { normalizeSleeperProjectionEntries } from '@/utils/seasonSimulatorUtils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season');
    const week = searchParams.get('week');

    if (!season || !week) {
      return NextResponse.json(
        { ok: false, error: 'Missing required query params: season and week' },
        { status: 400 }
      );
    }

    const url = new URL(`https://api.sleeper.com/projections/nfl/${season}/${week}`);
    for (const [key, value] of searchParams.entries()) {
      if (key === 'season' || key === 'week') continue;
      url.searchParams.append(key, value);
    }

    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: `Sleeper projections request failed (${response.status})` },
        { status: 502 }
      );
    }

    const rawPayload = await response.json();
    const projections = Array.from(normalizeSleeperProjectionEntries(rawPayload).values());

    return NextResponse.json(
      {
        ok: true,
        season: Number(season),
        week: Number(week),
        count: projections.length,
        projections,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unknown Sleeper projections error' },
      { status: 502 }
    );
  }
}