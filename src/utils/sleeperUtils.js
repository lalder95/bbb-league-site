// Utility to fetch current league week and year from Sleeper API
export async function getSleeperLeagueWeekAndYear(leagueId) {
  if (!leagueId) return { week: null, year: null };
  try {
    // Get league year
    const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
    if (!leagueRes.ok) throw new Error('Failed to fetch league info');
    const leagueData = await leagueRes.json();
    // Get current NFL week
    const stateRes = await fetch('https://api.sleeper.app/v1/state/nfl');
    if (!stateRes.ok) throw new Error('Failed to fetch NFL state');
    const stateData = await stateRes.json();
    // Determine if it's offseason (Jan-Aug)
    const now = new Date();
    let week = stateData.display_week || null;
    if (now.getMonth() < 8) { // Jan (0) through Aug (7)
      week = 'Offseason';
    }
    return {
      week,
      year: leagueData.season || null,
    };
  } catch (e) {
    return { week: null, year: null };
  }
}
