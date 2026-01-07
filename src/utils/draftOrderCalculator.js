// Server-side utilities for calculating draft order consistently across the app.
// This module intentionally performs Sleeper API fetches and should be used from
// API routes / server code (not directly in client components).

import calculateSeasonMaxPF from '@/utils/maxpf';
import { buildDraftOrder } from '@/utils/draftOrderUtils';

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed fetch: ${url} (${res.status})`);
  return res.json();
}

export async function resolveLeagueYear() {
  const state = await fetchJson('https://api.sleeper.app/v1/state/nfl');
  const yr = Number(state?.season);
  if (!Number.isFinite(yr) || yr < 2000) {
    throw new Error('Could not resolve league year from Sleeper state');
  }
  return yr;
}

/**
 * Determines which rookie draft season we should target.
 * Rule:
 * - default: leagueYear + 1
 * - exception: if any non-complete draft exists for the league, use leagueYear
 */
export async function resolveTargetDraftSeason({ leagueId }) {
  const leagueYear = await resolveLeagueYear();
  if (!leagueId) return leagueYear + 1;

  try {
    const drafts = await fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/drafts`);
    const hasNonCompleteDraft = Array.isArray(drafts)
      ? drafts.some((d) => d?.status && d.status !== 'complete')
      : false;
    return hasNonCompleteDraft ? leagueYear : leagueYear + 1;
  } catch {
    return leagueYear + 1;
  }
}

/**
 * Calculates the league's round-1 draft order (slots 1..12) with MaxPF + playoff finish.
 * Optionally applies traded pick ownership for round 1 in the target season.
 */
export async function calculateDraftOrderForLeague({
  leagueId,
  targetSeason,
  applyRoundOneTrades = true,
} = {}) {
  if (!leagueId) throw new Error('Missing leagueId');

  const resolvedTargetSeason =
    Number.isFinite(Number(targetSeason)) && Number(targetSeason) > 2000
      ? Number(targetSeason)
      : await resolveTargetDraftSeason({ leagueId });

  const [users, rosters, winnersBracket, traded] = await Promise.all([
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/users`),
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/winners_bracket`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
    applyRoundOneTrades
      ? fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Compute MaxPF map
  const maxpfMap = await calculateSeasonMaxPF({ leagueId });

  // Base order (slots -> original roster_id)
  const base = buildDraftOrder({ rosters, maxpfMap, winnersBracket });

  const rosterIdToUserId = Object.fromEntries((rosters || []).map((r) => [r.roster_id, r.owner_id]));
  const userById = new Map((users || []).map((u) => [u.user_id, u]));

  const roundOneTrades = applyRoundOneTrades
    ? (Array.isArray(traded) ? traded : []).filter(
        (tp) => String(tp.season) === String(resolvedTargetSeason) && Number(tp.round) === 1,
      )
    : [];

  const usedTradesCount = roundOneTrades.length;

  const draft_order = (base || [])
    .slice()
    .sort((a, b) => Number(a.slot) - Number(b.slot))
    .map((entry) => {
      const originalRosterId = Number(entry.roster_id);
      const trade = roundOneTrades.find((tp) => Number(tp.roster_id) === originalRosterId);
      const currentRosterId = trade ? Number(trade.owner_id) : originalRosterId;

      const ownerId = rosterIdToUserId[currentRosterId] ?? null;
      const owner = ownerId ? userById.get(ownerId) : null;
      const teamName = owner?.display_name || owner?.username || 'Unknown Team';
      const avatarId = owner?.avatar;
      const avatarUrl = avatarId ? `https://sleepercdn.com/avatars/thumbs/${avatarId}` : null;

      const roster = (rosters || []).find((r) => Number(r.roster_id) === currentRosterId) || null;

      return {
        slot: Number(entry.slot),
        roster_id: currentRosterId,
        original_roster_id: originalRosterId,
        owner_id: ownerId,
        teamName,
        avatarUrl,
        wins: roster?.wins || 0,
        losses: roster?.losses || 0,
        ties: roster?.ties || 0,
        fpts: roster?.fpts || 0,
        maxpf: Number(maxpfMap[originalRosterId] || 0),
      };
    });

  return {
    leagueId,
    targetSeason: resolvedTargetSeason,
    usedTradesCount,
    draft_order,
  };
}
