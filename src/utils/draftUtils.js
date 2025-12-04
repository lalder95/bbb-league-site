// src/utils/draftUtils.js
// Helper functions for draft-related components

/**
 * Get team name by roster_id
 */
export const getTeamName = (rosterId, rosters, users) => {
    const roster = rosters.find(r => r.roster_id === parseInt(rosterId));
    if (!roster || !roster.owner_id) return `Team ${rosterId}`;
    
    const user = users.find(u => u.user_id === roster.owner_id);
    return user?.display_name || user?.metadata?.team_name || `Team ${rosterId}`;
  };
  
  /**
   * Get roster_id by team name
   */
  export const getRosterIdByTeamName = (teamName, users, rosters) => {
    const user = users.find(u => u.display_name === teamName || u.metadata?.team_name === teamName);
    if (!user) return null;
    
    const roster = rosters.find(r => r.owner_id === user.user_id);
    return roster?.roster_id || null;
  };
  
  /**
   * Format pick number for display (e.g., "1.01")
   */
  export const formatPickNumber = (round, pick) => {
    return `${round}.${String(pick).padStart(2, '0')}`;
  };
  
  /**
   * Get rookie salary based on pick number
   */
  export const getRookieSalary = (round, pickPosition) => {
    // First round has specific values based on pick position
    if (round === 1) {
      if (pickPosition === 1) return 14;
      if (pickPosition >= 2 && pickPosition <= 3) return 12;
      if (pickPosition >= 4 && pickPosition <= 6) return 10;
      if (pickPosition >= 7 && pickPosition <= 9) return 8;
      if (pickPosition >= 10) return 6;
    }
    // Second round
    else if (round === 2) {
      return 4;
    }
    // Third round
    else if (round === 3) {
      return 2;
    }
    // Fourth through seventh rounds
    else if (round >= 4 && round <= 7) {
      return 1;
    }
    // Default case for any other rounds
    else {
      return 0;
    }
  };
  
  /**
   * Determine pick position based on roster_id and draft order
   */
  export const getPickPositionInRound = (round, rosterId, draftOrder) => {
    // If we have a draft order, use it
    if (draftOrder.length > 0) {
      const position = draftOrder.findIndex(item => item.rosterId === parseInt(rosterId)) + 1;
      return position > 0 ? position : (parseInt(rosterId) || 1); // Fallback to roster_id if not found
    }
    
    // Otherwise fall back to roster_id as a proxy (not ideal, but better than nothing)
    return parseInt(rosterId) || 1;
  };
  
  /**
   * Estimate draft positions and salaries
   */
  export const estimateDraftPositions = (rosters, tradedPicks, draftInfo, draftOrder, getTeamNameFn, targetSeason) => {
    // Group picks by team
    const teamPicks = {};
    // Determine which draft season to use for pick ownership
    const seasonToUse = String(
      targetSeason ??
      // Prefer explicit draftInfo season/start_time if present
      (draftInfo?.season ?? (draftInfo?.start_time ? new Date(Number(draftInfo.start_time)).getFullYear() : undefined)) ??
      // Fallback to next calendar year
      new Date().getFullYear() + 1
    );
    
    // Initialize team picks based on rosters
    rosters.forEach(roster => {
      const teamName = getTeamNameFn(roster.roster_id);
      teamPicks[teamName] = {
        originalPicks: [],
        currentPicks: []
      };
    });
    
    // Add original picks (each team gets one per round)
    rosters.forEach(roster => {
      const teamName = getTeamNameFn(roster.roster_id);
      const rounds = draftInfo?.settings?.rounds || 5;
      
      for (let round = 1; round <= rounds; round++) {
        // Get pick position based on draft order (for first round primarily)
        const pickPosition = getPickPositionInRound(round, roster.roster_id, draftOrder);
        
        // Format pick number for display (e.g. "1.01")
        const pickNumber = formatPickNumber(round, pickPosition);
        
        teamPicks[teamName].originalPicks.push({
          round,
          pickPosition,
          pickNumber,
          originalOwner: teamName,
          currentOwner: teamName,
          salary: getRookieSalary(round, pickPosition)
        });
      }
    });
    
    // Update with traded picks (for the target season only)
    tradedPicks.filter(pick => String(pick.season) === seasonToUse).forEach(pick => {
      const originalOwner = getTeamNameFn(pick.roster_id);
      const currentOwner = getTeamNameFn(pick.owner_id);
      
      // Find the pick in the original owner's picks
      const originalOwnerPicks = teamPicks[originalOwner].originalPicks;
      const pickIndex = originalOwnerPicks.findIndex(p => 
        p.round === pick.round && p.currentOwner === originalOwner
      );
      
      if (pickIndex !== -1) {
        // Update the current owner while preserving pick position
        originalOwnerPicks[pickIndex].currentOwner = currentOwner;
      }
    });
    
    // Reorganize by current ownership
    rosters.forEach(roster => {
      const teamName = getTeamNameFn(roster.roster_id);
      teamPicks[teamName].currentPicks = [];
    });
    
    // Gather all picks for their current owners
    Object.values(teamPicks).forEach(team => {
      team.originalPicks.forEach(pick => {
        if (teamPicks[pick.currentOwner]) {
          teamPicks[pick.currentOwner].currentPicks.push(pick);
        }
      });
    });
    
    return teamPicks;
  };
  
  /**
   * Format trade date
   */
  export const formatTradeDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleDateString();
  };
  
  /**
   * Find trade details for a given pick
   */
  export const findTradeForPick = (pick, tradeHistory) => {
    // Support both our enriched API schema and raw Sleeper transaction schema.
    // Enriched schema (/api/history/trades): trade.picks entries include slot_roster_id and to_roster_id.
    // Raw Sleeper schema: trade.draft_picks (or raw.draft_picks) entries include roster_id (slot) and owner_id (to).
    if (!Array.isArray(tradeHistory)) return null;

    // Prefer strict match on season, round, and slot_roster_id + to_roster_id
    const matchEnriched = (trade) => Array.isArray(trade.picks) && trade.picks.some(tp =>
      String(tp.season) === String(pick.season) &&
      Number(tp.round) === Number(pick.round) &&
      Number(tp.slot_roster_id) === Number(pick.roster_id) &&
      Number(tp.to_roster_id) === Number(pick.owner_id)
    );

    // Fallback: match only by season, round, and slot_roster_id to handle subsequent re-trades or league owner changes
    const matchEnrichedSlotOnly = (trade) => Array.isArray(trade.picks) && trade.picks.some(tp =>
      String(tp.season) === String(pick.season) &&
      Number(tp.round) === Number(pick.round) &&
      Number(tp.slot_roster_id) === Number(pick.roster_id)
    );

    const matchSleeper = (trade) => Array.isArray(trade.draft_picks) && trade.draft_picks.some(dp =>
      String(dp.season) === String(pick.season) &&
      Number(dp.round) === Number(pick.round) &&
      Number(dp.roster_id) === Number(pick.roster_id) &&
      Number(dp.owner_id) === Number(pick.owner_id)
    );

    // Also support raw.draft_picks from the original Sleeper transaction payload
    // Consider either current slot (roster_id) or previous_owner_id to accommodate lineage differences
    const matchSleeperRaw = (trade) => Array.isArray(trade.raw?.draft_picks) && trade.raw.draft_picks.some(dp =>
      String(dp.season) === String(pick.season) &&
      Number(dp.round) === Number(pick.round) &&
      (
        Number(dp.roster_id) === Number(pick.roster_id) ||
        (pick.previous_owner_id != null && Number(dp.roster_id) === Number(pick.previous_owner_id)) ||
        (dp.previous_owner_id != null && Number(dp.previous_owner_id) === Number(pick.roster_id)) ||
        (dp.previous_owner_id != null && pick.previous_owner_id != null && Number(dp.previous_owner_id) === Number(pick.previous_owner_id))
      ) &&
      Number(dp.owner_id) === Number(pick.owner_id)
    );

    // Fallback that uses previous_owner_id as alternative to slot_roster_id when matching enriched picks
    // This addresses cases where the selected Sleeper traded pick shows `previous_owner_id` for slot lineage.
    const matchEnrichedUsingPreviousOwner = (trade) => Array.isArray(trade.picks) && trade.picks.some(tp =>
      String(tp.season) === String(pick.season) &&
      Number(tp.round) === Number(pick.round) &&
      Number(tp.to_roster_id) === Number(pick.owner_id) &&
      (
        Number(tp.slot_roster_id) === Number(pick.roster_id) ||
        Number(tp.previous_owner_id) === Number(pick.roster_id) ||
        (pick.previous_owner_id != null && Number(tp.slot_roster_id) === Number(pick.previous_owner_id)) ||
        (pick.previous_owner_id != null && Number(tp.previous_owner_id) === Number(pick.previous_owner_id))
      )
    );

    // Last-resort fallback: season/round match and same destination roster, when slot lineage cannot be established
    const matchEnrichedByToOnly = (trade) => Array.isArray(trade.picks) && trade.picks.some(tp =>
      String(tp.season) === String(pick.season) &&
      Number(tp.round) === Number(pick.round) &&
      Number(tp.to_roster_id) === Number(pick.owner_id)
    );
    const matchSleeperByToOnly = (trade) => Array.isArray(trade.draft_picks) && trade.draft_picks.some(dp =>
      String(dp.season) === String(pick.season) &&
      Number(dp.round) === Number(pick.round) &&
      Number(dp.owner_id) === Number(pick.owner_id)
    );
    const matchSleeperRawByToOnly = (trade) => Array.isArray(trade.raw?.draft_picks) && trade.raw.draft_picks.some(dp =>
      String(dp.season) === String(pick.season) &&
      Number(dp.round) === Number(pick.round) &&
      Number(dp.owner_id) === Number(pick.owner_id)
    );

    // Ensure the trade involves any of the relevant rosters to avoid unrelated matches
    const tradeInvolvesRelevantRoster = (trade) => {
      const teamIds = Array.isArray(trade.roster_ids)
        ? trade.roster_ids.map(n => Number(n))
        : Array.isArray(trade.teams)
          ? trade.teams.map(t => Number(t?.roster_id))
          : [];
      const targets = [pick.owner_id, pick.roster_id, pick.previous_owner_id].filter(v => v != null).map(Number);
      return targets.some(tid => teamIds.includes(tid));
    };

    return tradeHistory.find(trade => matchEnriched(trade) || matchSleeper(trade) || matchSleeperRaw(trade) || matchEnrichedUsingPreviousOwner(trade))
      || tradeHistory.find(trade => matchEnrichedSlotOnly(trade))
      || tradeHistory.find(trade => tradeInvolvesRelevantRoster(trade) && (matchEnrichedByToOnly(trade) || matchSleeperByToOnly(trade) || matchSleeperRawByToOnly(trade)))
      || null;
  };