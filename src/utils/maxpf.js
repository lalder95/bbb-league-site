// Server-friendly MaxPF calculator utilities

import { fetchJson } from '../lib/assistant-gm/fetch.js';

const PLAYER_METADATA_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MATCHUP_CONCURRENCY = 4;
let playerMetadataCache = null;
let playerMetadataCacheExpiresAt = 0;
let playerMetadataPromise = null;

async function getPlayerMetadata(deadlineAt) {
  if (playerMetadataCache && Date.now() < playerMetadataCacheExpiresAt) return playerMetadataCache;
  if (playerMetadataPromise) return playerMetadataPromise;

  playerMetadataPromise = fetchJson('https://api.sleeper.app/v1/players/nfl', { deadlineAt })
    .then((players) => {
      playerMetadataCache = players;
      playerMetadataCacheExpiresAt = Date.now() + PLAYER_METADATA_TTL_MS;
      return players;
    })
    .finally(() => {
      playerMetadataPromise = null;
    });
  return playerMetadataPromise;
}

async function fetchMatchupsByWeek(leagueId, lastWeek, concurrency = DEFAULT_MATCHUP_CONCURRENCY, deadlineAt) {
  const weeks = Array.from({ length: lastWeek }, (_, index) => index + 1);
  const results = new Array(weeks.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(weeks.length || 1, Math.floor(concurrency) || DEFAULT_MATCHUP_CONCURRENCY));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < weeks.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${weeks[index]}`, { timeoutMs: 5000, deadlineAt });
      } catch (error) {
        if (error?.code === 'REQUEST_DEADLINE_EXCEEDED') throw error;
        // Preserve the existing behavior of skipping unavailable matchup weeks.
        results[index] = null;
      }
    }
  }));

  return results;
}

export function buildStarterSlots(rosterPositions = []) {
  const ignored = new Set(['BN', 'IR', 'TAXI']);
  const slots = rosterPositions.filter((p) => !ignored.has(p));
  const flexDefs = {
    FLEX: ['RB', 'WR', 'TE'],
    WRT: ['RB', 'WR', 'TE'],
    WRR: ['WR', 'RB'],
    RWT: ['RB', 'WR', 'TE'],
    SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  };
  return { slots, flexDefs };
}

function resolvePlayerName(player) {
  return player?.name || player?.player_name || player?.fullName || player?.full_name || player?.display_name || '';
}

export function fillWeeklyMaxDetailed(weeklyPlayers, slots, flexDefs) {
  const byPoints = [...weeklyPlayers].sort((a, b) => (b.points || 0) - (a.points || 0));
  const chosen = [];
  const assignments = [];
  const used = new Set();
  const getPlayerId = (player) => String(player?.player_id ?? player?.playerId ?? player?.id ?? '');
  const isEligible = (pos, slot) => {
    if (slot in flexDefs) return flexDefs[slot].includes(pos);
    return pos === slot;
  };
  for (const slot of slots) {
    const pick = byPoints.find((p) => {
      const playerId = getPlayerId(p);
      return playerId && !used.has(playerId) && isEligible(p.position, slot);
    });
    if (pick) {
      const playerId = getPlayerId(pick);
      used.add(playerId);
      chosen.push(pick);
      assignments.push({
        slot,
        playerId,
        name: resolvePlayerName(pick),
        position: pick.position || 'UNK',
        points: Number(pick.points || 0),
      });
    }
  }
  const total = chosen.reduce((sum, p) => sum + (p.points || 0), 0);
  return { total, chosen: chosen.map((p) => getPlayerId(p)), assignments };
}

export function fillWeeklyMax(weeklyPlayers, slots, flexDefs) {
  const result = fillWeeklyMaxDetailed(weeklyPlayers, slots, flexDefs);
  return { total: result.total, chosen: result.chosen };
}

export async function calculateSeasonMaxPF({
  leagueId,
  league: providedLeague,
  state: providedState,
  playersMeta: providedPlayersMeta,
  matchupConcurrency = DEFAULT_MATCHUP_CONCURRENCY,
  deadlineAt,
}) {
  const [league, state, playersMeta] = await Promise.all([
    providedLeague ? Promise.resolve(providedLeague) : fetchJson(`https://api.sleeper.app/v1/league/${leagueId}`, { deadlineAt }),
    providedState ? Promise.resolve(providedState) : fetchJson('https://api.sleeper.app/v1/state/nfl', { deadlineAt }),
    providedPlayersMeta ? Promise.resolve(providedPlayersMeta) : getPlayerMetadata(deadlineAt),
  ]);
  const { slots, flexDefs } = buildStarterSlots(league.roster_positions || []);

  // Determine the last regular-season week for THIS league.
  // Sleeper stores the playoff start week; regular season ends the week before.
  const playoffWeekStart = Number(league?.settings?.playoff_week_start);
  const regularSeasonLastWeek = Number.isFinite(playoffWeekStart) && playoffWeekStart > 1
    ? playoffWeekStart - 1
    : 14; // fallback for older leagues / missing settings

  // During the regular season, cap to the current week.
  // In offseason/postseason, Sleeper's state.week can reset (often to 1), which would
  // incorrectly truncate MaxPF to only a handful of weeks.
  const seasonType = String(state?.season_type || '').toLowerCase();
  const currentWeek = Number(state?.week);
  const lastWeek =
    seasonType === 'regular' && Number.isFinite(currentWeek) && currentWeek > 0
      ? Math.min(regularSeasonLastWeek, currentWeek)
      : regularSeasonLastWeek;

  const weeklyMatchups = await fetchMatchupsByWeek(leagueId, lastWeek, matchupConcurrency, deadlineAt);
  const maxPf = {};
  for (const matchups of weeklyMatchups) {
    if (!Array.isArray(matchups)) continue;

    const byRoster = new Map();
    for (const m of matchups) {
      const rosterId = m.roster_id;
      if (!rosterId) continue;
      const playersPoints = m.players_points || {};
      const players = Object.keys(playersPoints).map((pid) => ({
        player_id: pid,
        position: playersMeta[pid]?.position || 'UNK',
        points: Number(playersPoints[pid] || 0),
      }));
      byRoster.set(rosterId, players);
    }

    for (const [rid, weeklyPlayers] of byRoster.entries()) {
      const { total } = fillWeeklyMax(weeklyPlayers, slots, flexDefs);
      maxPf[rid] = (maxPf[rid] || 0) + total;
    }
  }

  return maxPf;
}

export default calculateSeasonMaxPF;
