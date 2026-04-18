function buildDisplayMaps({ rosters = [], users = [] } = {}) {
  return {
    rosterIdToUserId: Object.fromEntries((rosters || []).map((roster) => [Number(roster.roster_id), roster.owner_id])),
    userIdToDisplay: Object.fromEntries(
      (users || []).map((user) => [user.user_id, user.display_name || user.username || 'Unknown Team']),
    ),
  };
}

function normalizeRosterId(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export function normalizeDraftOrderEntries({ draftOrder = [], rosters = [], users = [] } = {}) {
  const { rosterIdToUserId, userIdToDisplay } = buildDisplayMaps({ rosters, users });

  return (Array.isArray(draftOrder) ? draftOrder : []).map((entry, index) => {
    const rosterId = normalizeRosterId(entry.rosterId ?? entry.roster_id ?? entry.ownerRosterId);
    const originalRosterId = normalizeRosterId(
      entry.originalRosterId ?? entry.original_roster_id ?? entry.rosterId ?? entry.roster_id,
    ) ?? rosterId;

    const userId = entry.userId ?? entry.user_id ?? (rosterId ? rosterIdToUserId[rosterId] ?? null : null);
    const originalUserId = originalRosterId ? rosterIdToUserId[originalRosterId] ?? null : null;
    const teamName = entry.teamName || entry.team_name || (userId ? userIdToDisplay[userId] || 'Unknown Team' : 'Unknown Team');
    const originalOwnerName = entry.originalOwnerName
      || entry.original_owner_name
      || (originalUserId ? userIdToDisplay[originalUserId] || 'Unknown Team' : 'Unknown Team');

    return {
      ...entry,
      round: Number(entry.round) || 1,
      slot: Number(entry.slot) || (index % 12) + 1,
      rosterId,
      originalRosterId,
      userId,
      teamName,
      originalOwnerName,
      isTraded: rosterId !== null && originalRosterId !== null && rosterId !== originalRosterId,
    };
  });
}

export function expandDraftOrderPreview({
  draftOrder = [],
  rosters = [],
  users = [],
  tradedPicks = [],
  targetSeason,
  rounds = 1,
  maxPicks,
} = {}) {
  const normalized = normalizeDraftOrderEntries({ draftOrder, rosters, users });
  if (normalized.length === 0) return [];

  const totalRounds = Math.max(1, Math.min(7, Number(rounds) || 1));
  const maxTotalPicks = Math.max(12, Math.min(84, Number(maxPicks) || totalRounds * 12));
  const hasMultipleRounds = normalized.some((entry) => Number(entry.round) > 1) || normalized.length > 12;

  if (hasMultipleRounds) {
    return normalized
      .slice()
      .sort((a, b) => (Number(a.round) - Number(b.round)) || (Number(a.slot) - Number(b.slot)))
      .slice(0, maxTotalPicks);
  }

  const { rosterIdToUserId, userIdToDisplay } = buildDisplayMaps({ rosters, users });
  const baseRound = normalized.slice().sort((a, b) => Number(a.slot) - Number(b.slot));
  const fullOrder = [];

  for (let round = 1; round <= totalRounds; round += 1) {
    const tradesForRound = (Array.isArray(tradedPicks) ? tradedPicks : []).filter(
      (trade) => String(trade.season) === String(targetSeason) && Number(trade.round) === round,
    );

    for (const entry of baseRound) {
      const originalRosterId = normalizeRosterId(entry.originalRosterId ?? entry.rosterId);
      const roundOneRosterId = normalizeRosterId(entry.rosterId ?? entry.originalRosterId);
      const trade = tradesForRound.find((candidate) => Number(candidate.roster_id) === Number(originalRosterId));
      const ownerRosterId = round === 1
        ? roundOneRosterId
        : (trade ? normalizeRosterId(trade.owner_id) : originalRosterId);
      const ownerUserId = ownerRosterId ? rosterIdToUserId[ownerRosterId] ?? null : null;
      const originalUserId = originalRosterId ? rosterIdToUserId[originalRosterId] ?? null : null;
      const originalOwnerName = entry.originalOwnerName
        || (originalUserId ? userIdToDisplay[originalUserId] || 'Unknown Team' : 'Unknown Team');

      if (round === 1) {
        fullOrder.push({
          ...entry,
          round,
          slot: Number(entry.slot),
          rosterId: roundOneRosterId,
          originalRosterId,
          userId: entry.userId ?? ownerUserId,
          teamName: entry.teamName || (ownerUserId ? userIdToDisplay[ownerUserId] || 'Unknown Team' : 'Unknown Team'),
          originalOwnerName,
          isTraded: roundOneRosterId !== null && originalRosterId !== null && roundOneRosterId !== originalRosterId,
        });
        continue;
      }

      fullOrder.push({
        round,
        slot: Number(entry.slot),
        rosterId: ownerRosterId,
        originalRosterId,
        userId: ownerUserId,
        teamName: ownerUserId ? userIdToDisplay[ownerUserId] || 'Unknown Team' : 'Unknown Team',
        originalOwnerName,
        isTraded: ownerRosterId !== null && originalRosterId !== null && ownerRosterId !== originalRosterId,
      });
    }
  }

  return fullOrder.slice(0, maxTotalPicks);
}
