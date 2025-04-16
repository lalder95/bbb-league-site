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
  export const estimateDraftPositions = (rosters, tradedPicks, draftInfo, draftOrder, getTeamNameFn) => {
    // Group picks by team
    const teamPicks = {};
    const currentYear = new Date().getFullYear().toString();
    
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
    
    // Update with traded picks
    tradedPicks.filter(pick => pick.season === currentYear).forEach(pick => {
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
    // Look through trade history for this pick
    return tradeHistory.find(trade => 
      trade.draft_picks && trade.draft_picks.some(draftPick => 
        draftPick.season === pick.season && 
        draftPick.round === pick.round && 
        draftPick.roster_id === pick.roster_id &&
        draftPick.owner_id === pick.owner_id
      )
    );
  };