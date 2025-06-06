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

// Example: Aggregate all matchups for a league (all weeks)
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

// Example: Aggregate all transactions for a league (all weeks)
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

// Example usage in your aggregation functions:
// const bbbLeagues = await getBudgetBlitzBowlLeagues(userId, season);
// for (const league of bbbLeagues) { ... }

// You can now use these helpers to build higher-level aggregations for your badge groups.
// For example, to get all-time record, playoff appearances, etc., you would:
// - Fetch all leagues for the user
// - For each league, fetch all matchups and aggregate wins/losses/playoff results

// Add more aggregation utilities as needed for your badge groups!