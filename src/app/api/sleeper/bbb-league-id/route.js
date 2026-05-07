import { NextResponse } from 'next/server';

const USER_ID = '456973480269705216';

function isBBBLeague(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return (
    lower.includes('budget blitz bowl') ||
    lower.includes('bbb') ||
    (lower.includes('budget') && lower.includes('blitz'))
  );
}

export async function GET() {
  try {
    const seasonRes = await fetch('https://api.sleeper.app/v1/state/nfl', { cache: 'no-store' });
    if (!seasonRes.ok) throw new Error('Failed to fetch NFL state');
    const { season: currentSeason } = await seasonRes.json();

    const fetchLeagues = async (season) => {
      const res = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${season}`, { cache: 'no-store' });
      if (!res.ok) return [];
      return res.json();
    };

    let leagues = await fetchLeagues(currentSeason);
    let bbbLeagues = leagues.filter(l => isBBBLeague(l.name));

    if (bbbLeagues.length === 0) {
      const prevLeagues = await fetchLeagues(String(Number(currentSeason) - 1));
      bbbLeagues = prevLeagues.filter(l => isBBBLeague(l.name));
    }

    if (bbbLeagues.length === 0 && leagues.length > 0) {
      bbbLeagues = [leagues[0]];
    }

    if (bbbLeagues.length === 0) {
      return NextResponse.json({ error: 'No BBB league found.' }, { status: 404 });
    }

    const mostRecent = bbbLeagues.sort((a, b) => Number(b.season) - Number(a.season))[0];
    return NextResponse.json({ leagueId: mostRecent.league_id, leagueName: mostRecent.name, season: mostRecent.season });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
