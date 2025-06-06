// Utility functions to fetch and aggregate team data from the Sleeper API

// Helper to fetch JSON
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${url}`);
  return res.json();
}

// Get all leagues for a user (manager)
export async function getUserLeagues(userId, season) {
  const url = `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${season}`;
  return fetchJson(url);
}

// Get all rosters for a league
export async function getLeagueRosters(leagueId) {
  const url = `https://api.sleeper.app/v1/league/${leagueId}/rosters`;
  return fetchJson(url);
}

// Get all users for a league
export async function getLeagueUsers(leagueId) {
  const url = `https://api.sleeper.app/v1/league/${leagueId}/users`;
  return fetchJson(url);
}

// Get all matchups for a league and week
export async function getLeagueMatchups(leagueId, week) {
  const url = `https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`;
  return fetchJson(url);
}

// Get all playoff brackets for a league
export async function getLeaguePlayoffs(leagueId) {
  const url = `https://api.sleeper.app/v1/league/${leagueId}/winners_bracket`;
  return fetchJson(url);
}

// Get all transactions for a league and week
export async function getLeagueTransactions(leagueId, week) {
  const url = `https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`;
  return fetchJson(url);
}

// Get all drafts for a league
export async function getLeagueDrafts(leagueId) {
  const url = `https://api.sleeper.app/v1/league/${leagueId}/drafts`;
  return fetchJson(url);
}

// Get all picks for a draft
export async function getDraftPicks(draftId) {
  const url = `https://api.sleeper.app/v1/draft/${draftId}/picks`;
  return fetchJson(url);
}

// Aggregate all matchups for a league (all weeks)
export async function getAllLeagueMatchups(leagueId, totalWeeks = 18) {
  const allMatchups = [];
  for (let week = 1; week <= totalWeeks; week++) {
    try {
      const weekMatchups = await getLeagueMatchups(leagueId, week);
      allMatchups.push({ week, matchups: weekMatchups });
    } catch (e) {
      // Some weeks may not exist (offseason, etc.)
      continue;
    }
  }
  return allMatchups;
}

// Aggregate all transactions for a league (all weeks)
export async function getAllLeagueTransactions(leagueId, totalWeeks = 18) {
  const allTransactions = [];
  for (let week = 1; week <= totalWeeks; week++) {
    try {
      const weekTx = await getLeagueTransactions(leagueId, week);
      allTransactions.push(...weekTx);
    } catch (e) {
      continue;
    }
  }
  return allTransactions;
}

// Get all "Budget Blitz Bowl" leagues for a user in a season
export async function getBudgetBlitzBowlLeagues(userId, season) {
  const leagues = await getUserLeagues(userId, season);
  // Only include leagues named "Budget Blitz Bowl"
  return leagues.filter(league => league.name === "Budget Blitz Bowl");
}

// Get all "Budget Blitz Bowl" leagues for a user from 2024 to current season (all-time)
export async function getAllTimeBudgetBlitzBowlLeagues(userId) {
  const currentYear = new Date().getFullYear();
  let allLeagues = [];
  for (let season = 2024; season <= currentYear; season++) {
    const leagues = await getUserLeagues(userId, season);
    const bbbLeagues = leagues.filter(league => league.name === "Budget Blitz Bowl");
    allLeagues.push(...bbbLeagues);
  }
  return allLeagues;
}

// Get all "Budget Blitz Bowl" leagues for a user in the current season only
export async function getCurrentSeasonBudgetBlitzBowlLeagues(userId) {
  const currentYear = new Date().getFullYear();
  return getBudgetBlitzBowlLeagues(userId, currentYear);
}

// Get league standings (returns array of {roster_id, wins, losses, division_champ?})
export async function getLeagueStandings(leagueId) {
  // Sleeper's league object contains standings info
  const url = `https://api.sleeper.app/v1/league/${leagueId}`;
  const league = await fetchJson(url);
  const rosters = await getLeagueRosters(leagueId);

  // Get playoff bracket to determine division champs by seed
  let divisionChamps = {};
  try {
    const bracket = await getLeaguePlayoffs(leagueId);
    // Find the first round (lowest round number)
    let minRound = Math.min(...bracket.map(m => m.round));
    const firstRound = bracket.filter(m => m.round === minRound);
    // Get all seeds in the first round, sort, and take top 3
    const seeds = firstRound.map(m => m.seed).filter(Boolean).sort((a, b) => a - b);
    const topSeeds = seeds.slice(0, 3);
    // Find roster_ids for those seeds
    for (const m of firstRound) {
      if (topSeeds.includes(m.seed)) {
        divisionChamps[m.roster_id] = true;
      }
    }
  } catch (e) {
    // If no bracket, fallback to old logic (no division champs)
  }

  return rosters.map(r => ({
    roster_id: r.roster_id,
    wins: r.settings.wins,
    losses: r.settings.losses,
    division_champ: !!divisionChamps[r.roster_id],
  }));
}

// Get playoff results for a league (returns array of {roster_id, appearances, wins, losses, champion})
export async function getPlayoffResults(leagueId) {
  // Get playoff bracket
  let bracket = [];
  try {
    bracket = await getLeaguePlayoffs(leagueId);
  } catch (e) {
    // No playoff data
    return [];
  }
  // Map roster_id to playoff stats
  const stats = {};
  for (const match of bracket) {
    // Only count completed games
    if (match.winner && match.loser) {
      // Winner
      if (!stats[match.winner]) stats[match.winner] = { roster_id: match.winner, appearances: 0, wins: 0, losses: 0, champion: false };
      stats[match.winner].wins += 1;
      stats[match.winner].appearances += 1;
      // Loser
      if (!stats[match.loser]) stats[match.loser] = { roster_id: match.loser, appearances: 0, wins: 0, losses: 0, champion: false };
      stats[match.loser].losses += 1;
      stats[match.loser].appearances += 1;
    }
  }
  // Mark champion (winner of last match)
  if (bracket.length > 0) {
    const lastMatch = bracket[bracket.length - 1];
    if (lastMatch.winner && stats[lastMatch.winner]) {
      stats[lastMatch.winner].champion = true;
    }
  }
  return Object.values(stats);
}