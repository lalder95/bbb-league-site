import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const USER_ID = '456973480269705216';

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Sleeper fetch failed ${res.status}: ${url}`);
  return res.json();
}

export async function GET() {
  try {
    // Determine the current NFL season
    const state = await fetchJson('https://api.sleeper.app/v1/state/nfl', {
      next: { revalidate: 3600 },
    });
    const season = state?.season || String(new Date().getFullYear());

    // Fetch all leagues for the known commissioner user
    const leagues = await fetchJson(
      `https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${season}`,
      { next: { revalidate: 3600 } }
    );

    if (!Array.isArray(leagues) || leagues.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No leagues found for current season' },
        { status: 404 }
      );
    }

    // Pick the league with the highest season value (most recent)
    const sorted = [...leagues].sort(
      (a, b) => Number(b.season || 0) - Number(a.season || 0)
    );
    const league = sorted[0];

    return NextResponse.json(
      {
        ok: true,
        league_id: league.league_id,
        league_name: league.name,
        season: league.season,
        scoring_settings: league.scoring_settings || {},
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Unknown error' },
      { status: 502 }
    );
  }
}
