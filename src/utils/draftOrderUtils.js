/**
 * Compute fallback draft order when no upcoming draft is present.
 * Rules:
 * - Picks 1-6: non-playoff teams sorted by MaxPF asc.
 *   Tie-breakers: win% asc, total points (fpts) asc, coin flip.
 * - Picks 7-12: playoff teams ordered by bracket results, reverse (champion gets 12).
 * Inputs come from Sleeper league endpoints.
 */

/** Random coin flip comparator fallback */
function coinFlip() {
  return Math.random() < 0.5 ? -1 : 1;
}

/**
 * Sort non-playoff teams per tie rules.
 * @param {Array<{roster_id:number, maxpf:number, wins:number, losses:number, ties:number, fpts:number}>} teams
 */
export function sortNonPlayoff(teams) {
  return [...teams].sort((a, b) => {
    // MaxPF asc
    if (a.maxpf !== b.maxpf) return a.maxpf - b.maxpf;
    const awp = (a.wins || 0) / Math.max(1, (a.wins || 0) + (a.losses || 0) + (a.ties || 0));
    const bwp = (b.wins || 0) / Math.max(1, (b.wins || 0) + (b.losses || 0) + (b.ties || 0));
    if (awp !== bwp) return awp - bwp; // win% asc
    if ((a.fpts || 0) !== (b.fpts || 0)) return (a.fpts || 0) - (b.fpts || 0); // total points asc
    return coinFlip();
  });
}

/**
 * Build playoff ordering from winners bracket rounds, ignoring consolation.
 * Returns array of roster_ids in bracket finish order from champion -> runner-up -> others...
 * @param {Array} winnersBracket
 */
export function playoffFinishOrder(winnersBracket) {
  // winnersBracket typically is a flat array of matchup objects with shape { r, t1, t2, w, l }
  const matches = Array.isArray(winnersBracket) ? winnersBracket : [];
  if (matches.length === 0) return [];

  // Prefer explicit placement games when present.
  // Sleeper includes a `p` field for placement (1 = championship, 3 = 3rd place, 5 = 5th place, ...).
  // When these games are completed, `w` and `l` are the winner/loser roster_ids.
  const placementMatches = matches
    .filter((m) => Number.isFinite(Number(m?.p)) && m?.w && m?.l)
    .sort((a, b) => Number(a.p) - Number(b.p));

  if (placementMatches.length > 0) {
    const finish = [];
    for (const m of placementMatches) {
      if (m.w && !finish.includes(m.w)) finish.push(m.w);
      if (m.l && !finish.includes(m.l)) finish.push(m.l);
    }
    return finish;
  }

  // Determine final round and final match
  const finalRound = matches.reduce((max, m) => Math.max(max, Number(m.r || 0)), 0);
  const finalMatch = matches.find((m) => Number(m.r || 0) === finalRound && m.w && m.l);
  const champion = finalMatch?.w || null;
  const runnerUp = finalMatch?.l || null;

  // Compute last round reached for each participant
  const participants = new Set();
  const lastRound = new Map(); // roster_id -> max round they appeared in (loss round or last appearance)
  for (const m of matches) {
    const r = Number(m.r || 0);
    if (m.t1) { participants.add(m.t1); lastRound.set(m.t1, Math.max(lastRound.get(m.t1) || 0, r)); }
    if (m.t2) { participants.add(m.t2); lastRound.set(m.t2, Math.max(lastRound.get(m.t2) || 0, r)); }
    if (m.l) { lastRound.set(m.l, Math.max(lastRound.get(m.l) || 0, r)); }
    if (m.w) { lastRound.set(m.w, Math.max(lastRound.get(m.w) || 0, r)); }
  }

  // Build ordered finish: champion, runner-up, then others sorted by lastRound desc
  const order = [];
  if (champion) order.push(champion);
  if (runnerUp) order.push(runnerUp);

  const others = [...participants].filter((rid) => rid !== champion && rid !== runnerUp);
  others.sort((a, b) => (lastRound.get(b) || 0) - (lastRound.get(a) || 0));
  order.push(...others);

  return order;
}

/**
 * Build full 12-pick order combining non-playoff and playoff teams.
 * @param {Object} input
 * @param {Array} input.rosters Sleeper rosters array
 * @param {Record<number, number>} input.maxpfMap roster_id -> MaxPF
 * @param {Array} input.winnersBracket winners bracket rounds
 * @returns {Array<{slot:number, roster_id:number}>}
 */
export function buildDraftOrder({ rosters, maxpfMap, winnersBracket }) {
  // Identify playoff participants from winnersBracket (flat array)
  const matches = Array.isArray(winnersBracket) ? winnersBracket : [];
  const playoffRosterIds = new Set();
  for (const m of matches) {
    if (m.t1) playoffRosterIds.add(m.t1);
    if (m.t2) playoffRosterIds.add(m.t2);
    if (m.w) playoffRosterIds.add(m.w);
    if (m.l) playoffRosterIds.add(m.l);
  }

  // If bracket is empty, infer playoff teams as top 6 by wins then fpts
  if (playoffRosterIds.size === 0 && Array.isArray(rosters) && rosters.length > 0) {
    const ranked = [...rosters]
      .map((r) => ({ rid: r.roster_id, wins: r.wins || 0, fpts: r.fpts || 0 }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return (b.fpts || 0) - (a.fpts || 0);
      })
      .slice(0, 6);
    for (const r of ranked) playoffRosterIds.add(r.rid);
  }

  const nonPlayoff = rosters.filter((r) => !playoffRosterIds.has(r.roster_id)).map((r) => ({
    roster_id: r.roster_id,
    maxpf: Number(maxpfMap[r.roster_id] || 0),
    wins: r.wins || 0,
    losses: r.losses || 0,
    ties: r.ties || 0,
    fpts: r.fpts || 0,
  }));

  const sortedNonPlayoff = sortNonPlayoff(nonPlayoff).slice(0, 6);
  const nonPlayoffPicks = sortedNonPlayoff.map((r, idx) => ({ slot: idx + 1, roster_id: r.roster_id }));

  // Playoff finish order from champion to runner-up etc.
  let finishOrder = playoffFinishOrder(matches);

  // If finishOrder empty (inferred participants), rank playoff teams by wins/fpts and reverse for picks 12..7
  if (finishOrder.length === 0 && playoffRosterIds.size > 0) {
    const playoffRank = rosters
      .filter((r) => playoffRosterIds.has(r.roster_id))
      .map((r) => ({ rid: r.roster_id, wins: r.wins || 0, fpts: r.fpts || 0 }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return (b.fpts || 0) - (a.fpts || 0);
      })
      .map((r) => r.rid);
    // Higher rank should get later pick (12), so keep as champion->... order
    finishOrder = playoffRank;
  }

  const playoffPicks = [];
  let pick = 12;
  for (const rid of finishOrder) {
    playoffPicks.push({ slot: pick, roster_id: rid });
    pick -= 1;
    if (pick < 7) break; // only 6 playoff picks
  }

  return [...nonPlayoffPicks, ...playoffPicks];
}

export default buildDraftOrder;
