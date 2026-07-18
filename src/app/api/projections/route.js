// src/app/api/projections/route.js
// ESPN Fantasy API projections proxy with per-week MongoDB cache.
// One ESPN call per week covers all players; players are matched by normalized name + team.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getCachedWeekProjections, setCachedWeekProjections } from '@/lib/db-helpers';

// ESPN proTeamId → NFL team abbreviation
const PRO_TEAM_MAP = {
  1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN',
  8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR',
  15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI',
  22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH',
  29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU',
};

// ESPN defaultPositionId → position abbreviation
const POSITION_MAP = {
  1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST',
};

// ESPN stat ID keys for projected stats entries
const STAT_KEYS = {
  passYd: '3', passTD: '4',
  rushAtt: '24', rushYd: '20', rushTD: '23',
  rec: '41', recYd: '42', recTD: '43', targets: '53',
};

function normalizeLoose(str) {
  return String(str).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function extractProjectedStats(statsArr) {
  const projected = (statsArr || []).find(s => s.statSourceId === 1);
  if (!projected) return null;
  const s = projected.stats || {};
  return {
    projectedPts: projected.appliedTotal ?? null,
    passYd:   Number(s[STAT_KEYS.passYd])  || 0,
    passTD:   Number(s[STAT_KEYS.passTD])  || 0,
    rushAtt:  Number(s[STAT_KEYS.rushAtt]) || 0,
    rushYd:   Number(s[STAT_KEYS.rushYd])  || 0,
    rushTD:   Number(s[STAT_KEYS.rushTD])  || 0,
    rec:      Number(s[STAT_KEYS.rec])     || 0,
    recYd:    Number(s[STAT_KEYS.recYd])   || 0,
    recTD:    Number(s[STAT_KEYS.recTD])   || 0,
    targets:  Number(s[STAT_KEYS.targets]) || 0,
  };
}

async function fetchEspnProjectionsForWeek(season, week, leagueId) {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?scoringPeriodId=${week}&view=kona_player_info`;
  const filter = JSON.stringify({
    players: {
      limit: 1500,
      filterStatsForTopScoringPeriodIds: {
        value: 1,
        additionalValue: [`10${season}`, `00${season}`],
      },
    },
  });

  const res = await fetch(url, {
    headers: { 'x-fantasy-filter': filter },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`ESPN Fantasy API returned ${res.status} for season=${season} week=${week}`);
  }

  const data = await res.json();
  const rawPlayers = data?.players || [];

  return rawPlayers.map(entry => {
    const player = entry?.playerPoolEntry?.player || {};
    const stats = entry?.playerPoolEntry?.player?.stats || [];
    const projected = extractProjectedStats(stats);
    return {
      fullName: player.fullName || '',
      normName: normalizeLoose(player.fullName || ''),
      proTeamId: player.proTeamId ?? null,
      teamAbbrev: PRO_TEAM_MAP[player.proTeamId] || null,
      positionId: player.defaultPositionId ?? null,
      position: POSITION_MAP[player.defaultPositionId] || null,
      projected,
    };
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerName = searchParams.get('playerName')?.trim();
  const nflTeam = searchParams.get('nflTeam')?.trim().toUpperCase() || '';
  const position = searchParams.get('position')?.trim().toUpperCase() || '';
  const refresh = searchParams.get('refresh') === '1';

  if (!playerName) {
    return NextResponse.json({ ok: false, error: 'playerName is required' }, { status: 400 });
  }

  const leagueId = process.env.ESPN_FANTASY_LEAGUE_ID;
  if (!leagueId) {
    return NextResponse.json(
      { ok: false, error: 'ESPN_FANTASY_LEAGUE_ID is not configured' },
      { status: 503 }
    );
  }

  // Get current NFL week + season from Sleeper
  let season = new Date().getFullYear();
  let currentWeek = 1;
  try {
    const sleeperRes = await fetch('https://api.sleeper.app/v1/state/nfl', {
      next: { revalidate: 3600 },
    });
    if (sleeperRes.ok) {
      const sleeperState = await sleeperRes.json();
      if (sleeperState?.season) season = Number(sleeperState.season);
      if (sleeperState?.display_week) currentWeek = Number(sleeperState.display_week);
      else if (sleeperState?.week) currentWeek = Number(sleeperState.week);
    }
  } catch {
    // use defaults
  }

  const normTarget = normalizeLoose(playerName);
  const weeks = [];
  let lastRefreshed = null;

  for (let week = currentWeek; week <= 18; week++) {
    let weekPlayers = null;

    // Try cache first (unless refresh=1)
    if (!refresh) {
      try {
        const cached = await getCachedWeekProjections(season, week);
        if (cached?.players) {
          weekPlayers = cached.players;
          if (!lastRefreshed || cached.fetchedAt > lastRefreshed) {
            lastRefreshed = cached.fetchedAt;
          }
        }
      } catch {
        // proceed to fetch
      }
    }

    // Fetch from ESPN on cache miss
    if (!weekPlayers) {
      try {
        weekPlayers = await fetchEspnProjectionsForWeek(season, week, leagueId);
        const now = Date.now();
        await setCachedWeekProjections(season, week, weekPlayers);
        if (!lastRefreshed || now > lastRefreshed) lastRefreshed = now;
      } catch {
        // Skip this week — include null entry so caller knows we tried
        weeks.push({ week, projectedPts: null, passYd: 0, passTD: 0, rushAtt: 0, rushYd: 0, rushTD: 0, rec: 0, recYd: 0, recTD: 0, targets: 0 });
        continue;
      }
    }

    // Find matching player: normalized name containment + optional team/position cross-check
    const candidates = weekPlayers.filter(p => {
      if (!p.normName) return false;
      // Must be a substring match in at least one direction
      return p.normName.includes(normTarget) || normTarget.includes(p.normName);
    });

    let match = null;
    if (candidates.length === 1) {
      match = candidates[0];
    } else if (candidates.length > 1) {
      // Narrow by team abbreviation if available
      if (nflTeam) {
        const teamMatch = candidates.filter(p => p.teamAbbrev === nflTeam);
        if (teamMatch.length === 1) {
          match = teamMatch[0];
        } else if (teamMatch.length > 1 && position) {
          // Further narrow by position
          const posMatch = teamMatch.filter(p => p.position === position);
          match = posMatch[0] || teamMatch[0];
        } else {
          match = teamMatch[0] || candidates[0];
        }
      } else {
        match = candidates[0];
      }
    }

    if (match?.projected) {
      weeks.push({ week, ...match.projected });
    } else {
      weeks.push({ week, projectedPts: null, passYd: 0, passTD: 0, rushAtt: 0, rushYd: 0, rushTD: 0, rec: 0, recYd: 0, recTD: 0, targets: 0 });
    }
  }

  return NextResponse.json({
    ok: true,
    playerName,
    season,
    currentWeek,
    weeks,
    lastRefreshed,
  });
}
