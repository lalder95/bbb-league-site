'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Home() {
  // Testing mode to help troubleshooting
  const [testMode, setTestMode] = useState(false);
  const [leagueData, setLeagueData] = useState(null);
  const [matchups, setMatchups] = useState([]);
  const [standings, setStandings] = useState([]);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(null);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sleeper User ID - your actual Sleeper user ID
  const USER_ID = '456973480269705216';
  const [leagueId, setLeagueId] = useState(null);

  // Add timeout to prevent infinite loading
  useEffect(() => {
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        console.log('Loading timeout reached - activating debug mode');
        setTestMode(true);
        setLoading(false);
        setError('Loading timeout reached. The data fetch is taking too long or has stalled. Check console for details.');
      }
    }, 10000); // 10 seconds timeout 
    
    return () => clearTimeout(loadingTimeout);
  }, [loading]);

  // First, find the correct BBB league
  useEffect(() => {
    async function findBBBLeague() {
      try {
        console.log('Starting league search...');
        setLoading(true);
        
        // Get current NFL season
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        if (!seasonResponse.ok) throw new Error('Failed to fetch NFL state');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;
        console.log('Current NFL season:', currentSeason);
        
        // Get user's leagues for the current season
        console.log('Fetching leagues for user:', USER_ID);
        const userLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${currentSeason}`);
        if (!userLeaguesResponse.ok) throw new Error('Failed to fetch user leagues');
        const userLeagues = await userLeaguesResponse.json();
        console.log('Found', userLeagues.length, 'leagues for current season');
        
        // DEBUGGING - Log all current season league names
        console.log('Current season league names:', userLeagues.map(league => league.name));
        
        // Try more flexible matching for "Budget Blitz Bowl" in current season
        let bbbLeagues = userLeagues.filter(league => 
          league.name && (
            league.name.includes('Budget Blitz Bowl') || 
            league.name.includes('budget blitz bowl') ||
            league.name.includes('BBB') ||
            (league.name.toLowerCase().includes('budget') && 
            league.name.toLowerCase().includes('blitz'))
          )
        );
        
        console.log('Budget Blitz Bowl leagues found in current season:', bbbLeagues.length);
        
        // If no matching leagues found in current season, try previous season
        if (bbbLeagues.length === 0) {
          console.log('No matching leagues found in current season, trying previous season');
          const prevSeason = (parseInt(currentSeason) - 1).toString();
          const prevSeasonResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${prevSeason}`);
          
          if (prevSeasonResponse.ok) {
            const prevSeasonLeagues = await prevSeasonResponse.json();
            console.log('Previous season leagues found:', prevSeasonLeagues.length);
            console.log('Previous season league names:', prevSeasonLeagues.map(league => league.name));
            
            // Search for Budget Blitz Bowl in previous season leagues
            const prevBBBLeagues = prevSeasonLeagues.filter(league => 
              league.name && (
                league.name.includes('Budget Blitz Bowl') || 
                league.name.includes('budget blitz bowl') ||
                league.name.includes('BBB') ||
                (league.name.toLowerCase().includes('budget') && 
                league.name.toLowerCase().includes('blitz'))
              )
            );
            
            console.log('Budget Blitz Bowl leagues found in previous season:', prevBBBLeagues.length);
            
            if (prevBBBLeagues.length > 0) {
              bbbLeagues = prevBBBLeagues;
            } else {
              // If no matching leagues in either season, use first available league from either season
              console.log('No matching leagues found in any season, using first available league');
              if (userLeagues.length > 0) {
                bbbLeagues = [userLeagues[0]];
                console.log('Using first league from current season:', userLeagues[0].name);
              } else if (prevSeasonLeagues.length > 0) {
                bbbLeagues = [prevSeasonLeagues[0]];
                console.log('Using first league from previous season:', prevSeasonLeagues[0].name);
              } else {
                throw new Error('No leagues found for your user ID');
              }
            }
          } else {
            // If can't fetch previous season, use first available from current season
            console.log('Could not fetch previous season leagues');
            if (userLeagues.length > 0) {
              bbbLeagues = [userLeagues[0]];
              console.log('Using first league from current season:', userLeagues[0].name);
            } else {
              throw new Error('No leagues found for your user ID');
            }
          }
        }
        
        // Sort by season and take the most recent
        const mostRecentLeague = bbbLeagues.sort((a, b) => b.season - a.season)[0];
        console.log('Selected league ID:', mostRecentLeague.league_id, 'Name:', mostRecentLeague.name);
        setLeagueId(mostRecentLeague.league_id);
        // Don't set loading to false here as the second useEffect will handle that
      } catch (err) {
        console.error('Error finding BBB league:', err);
        setError(err.message);
        setLoading(false);
      }
    }
    
    findBBBLeague();
  }, []);

  // Once we have the league ID, fetch all the league data
  useEffect(() => {
    if (!leagueId) return;
    
    async function fetchData() {
      try {
        console.log('Fetching data for league ID:', leagueId);
        
        // Get current NFL week
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        if (!seasonResponse.ok) throw new Error('Failed to fetch NFL state');
        const seasonState = await seasonResponse.json();
        let week = seasonState.week;

        // Force week 1 if season_type is "pre"
        if (seasonState.season_type === "pre") {
          week = 1;
        }

        // Fetch league info
        const leagueResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
        if (!leagueResponse.ok) throw new Error('Failed to fetch league data');
        const leagueInfo = await leagueResponse.json();
        console.log('League info fetched successfully');
        setLeagueData(leagueInfo);

        // Force week to 1 if week is 0 and league is in season
        if (week === 0 && leagueInfo.status === "in_season") {
          week = 1;
        }
        console.log('Current NFL week:', week);
        setCurrentWeek(week);
        
        // Fetch users in the league
        console.log('Fetching league users...');
        const usersResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
        if (!usersResponse.ok) throw new Error('Failed to fetch users');
        const users = await usersResponse.json();
        console.log('Users fetched:', users.length);
        
        // Fetch rosters
        console.log('Fetching league rosters...');
        const rostersResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
        if (!rostersResponse.ok) throw new Error('Failed to fetch rosters');
        const rosters = await rostersResponse.json();
        console.log('Rosters fetched:', rosters.length);
        
        // Fetch matchups for current week
        console.log('Fetching matchups for week:', week);
        const matchupsResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
        if (!matchupsResponse.ok) throw new Error('Failed to fetch matchups');
        const matchupsData = await matchupsResponse.json();
        console.log('Matchups API data:', matchupsData); // <--- Add this line
        
        // Process matchups data to include team names
        const processedMatchups = processMatchups(matchupsData, users, rosters);
        setMatchups(processedMatchups);
        
        // Process standings with division information
        const processedStandings = processStandings(rosters, users, leagueInfo);
        setStandings(processedStandings);
        
        // Fetch news from your API route
        console.log('Fetching news...');
        try {
          const newsResponse = await fetch('/api/news');
          if (!newsResponse.ok) throw new Error('Failed to fetch news');
          const newsData = await newsResponse.json();
          setNews(newsData.slice(0, 5)); // Get top 5 news items
          console.log('News fetched successfully');
        } catch (newsErr) {
          console.warn('Error fetching news, but continuing:', newsErr);
          // Don't fail the whole page if just news fails
        }
        
        // All data loaded successfully
        console.log('All data loaded successfully');
        setLoading(false);
      } catch (err) {
        console.error('Error fetching league data:', err);
        setError(err.message);
        setLoading(false);
      }
    }
    
    fetchData();
  }, [leagueId]);

  // Helper function to process matchups data
  function processMatchups(matchupsData, users, rosters) {
    const matchupPairs = {};
    
    // Group by matchup_id
    matchupsData.forEach(matchup => {
      if (!matchupPairs[matchup.matchup_id]) {
        matchupPairs[matchup.matchup_id] = [];
      }
      
      // Find the roster owner
      const roster = rosters.find(r => r.roster_id === matchup.roster_id);
      const user = users.find(u => u.user_id === roster?.owner_id);
      
      matchupPairs[matchup.matchup_id].push({
        ...matchup,
        teamName: user?.display_name || user?.team_name || `Team ${matchup.roster_id}`,
        avatar: user?.avatar,
        points: matchup.points || 0,
        projected: matchup.projected || 0
      });
    });
    
    return Object.values(matchupPairs);
  }
  
  // Helper function to process standings data with division support
  function processStandings(rosters, users, league) {
    // Custom division names and avatars
    const customDivisions = {
      1: { name: "Wall Street", avatar: "/leagueimages/division1.jpg" },
      2: { name: "Middle Class", avatar: "/leagueimages/division2.jpg" },
      3: { name: "Poor House", avatar: "/leagueimages/division3.jpg" }
    };

    // Extract division information from league settings
    const divisionNames = {};
    if (league?.settings?.divisions) {
      for (let i = 1; i <= 10; i++) {
        // Use custom names if available, else fallback
        if (customDivisions[i]) {
          divisionNames[i] = customDivisions[i].name;
        } else if (league.settings[`division_${i}`]) {
          divisionNames[i] = league.settings[`division_${i}`];
        }
      }
    } else {
      // If no divisions in settings, fallback to custom or default
      for (let i = 1; i <= 3; i++) {
        divisionNames[i] = customDivisions[i]?.name || `Division ${i}`;
      }
    }

    // Process each roster with division information
    const teamsData = rosters.map(roster => {
      const user = users.find(u => u.user_id === roster.owner_id);
      const divisionId = roster.settings?.division || 0;
      return {
        rosterId: roster.roster_id,
        teamName: user?.display_name || user?.team_name || `Team ${roster.roster_id}`,
        avatar: user?.avatar,
        wins: roster.settings?.wins || 0,
        losses: roster.settings?.losses || 0,
        ties: roster.settings?.ties || 0,
        pointsFor: roster.settings?.fpts || 0,
        pointsAgainst: roster.settings?.fpts_against || 0,
        division: divisionId, // Division ID
        divisionName: divisionNames[divisionId] || `Division ${divisionId || 1}`,
        divisionAvatar: customDivisions[divisionId]?.avatar || null
      };
    });

    // Group by division
    const divisions = {};
    teamsData.forEach(team => {
      const divId = team.division;
      if (!divisions[divId]) {
        divisions[divId] = [];
      }
      divisions[divId].push(team);
    });

    // Sort each division by wins, then points
    Object.keys(divisions).forEach(divId => {
      divisions[divId].sort((a, b) => {
        if (a.wins !== b.wins) return b.wins - a.wins;
        return b.pointsFor - a.pointsFor;
      });
    });

    return { 
      divisions,
      divisionNames,
      customDivisions
    };
  }

  // Offseason Content Component for when no matchups are available
  const OffseasonContent = () => {
    return (
      <div className="bg-black/20 rounded-lg border border-white/10 p-4 md:p-6">
        <h3 className="text-lg md:text-xl font-bold mb-4 text-center">Offseason Mode</h3>
        <div className="space-y-4">
          <div className="text-center">
            <p className="mb-4">There are no active matchups at this time.</p>
            <p className="mb-2">While you wait for the next season, you can:</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-black/30 p-3 md:p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Prepare Your Roster</h4>
              <p className="text-sm text-white/70">Review your player contracts and plan your salary cap strategy for the upcoming season.</p>
              <Link href="/my-team" className="text-[#FF4B1F] text-sm mt-2 inline-block hover:underline">
                View My Team →
              </Link>
            </div>
            <div className="bg-black/30 p-3 md:p-4 rounded-lg">
              <h4 className="font-semibold mb-2">League History</h4>
              <p className="text-sm text-white/70">Check out past champions and league records from previous seasons.</p>
              <Link href="/hall-of-fame" className="text-[#FF4B1F] text-sm mt-2 inline-block hover:underline">
                View Hall of Fame →
              </Link>
            </div>
            <div className="bg-black/30 p-3 md:p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Offseason Guide</h4>
              <p className="text-sm text-white/70">Review important dates and deadlines for the offseason.</p>
              <Link href="/offseason" className="text-[#FF4B1F] text-sm mt-2 inline-block hover:underline">
                View Offseason Guide →
              </Link>
            </div>
            <div className="bg-black/30 p-3 md:p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Trade Calculator</h4>
              <p className="text-sm text-white/70">Explore potential trades and plan your team's future.</p>
              <Link href="/trade" className="text-[#FF4B1F] text-sm mt-2 inline-block hover:underline">
                Open Trade Calculator →
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Standings Section Component
  const StandingsSection = ({ standingsData }) => {
    if (!standingsData || Object.keys(standingsData.divisions || {}).length === 0) {
      return (
        <div className="text-center text-white/70 py-8">
          No standings data available
        </div>
      );
    }

    // Flatten all teams for league-wide leader checks
    const allTeams = Object.values(standingsData.divisions).flat();

    // Helper to get unique leader (no tie) for a stat
    function getUniqueLeader(stat, isMax = true) {
      if (!allTeams.length) return null;
      const values = allTeams.map(t => t[stat]);
      const best = isMax ? Math.max(...values) : Math.min(...values);
      const leaders = allTeams.filter(t => t[stat] === best);
      return leaders.length === 1 ? leaders[0].rosterId : null;
    }

    // Find unique league leaders
    const leaderWins = getUniqueLeader('wins', true);
    const leaderLosses = getUniqueLeader('losses', false);
    const leaderTies = getUniqueLeader('ties', true);
    const leaderPF = getUniqueLeader('pointsFor', true);
    const leaderPA = getUniqueLeader('pointsAgainst', false);

    // Orange highlight class
    const orange = "text-[#FF4B1F] font-extrabold";

    return (
      <div>
        {Object.keys(standingsData.divisions).map(divId => (
          <div key={divId} className="mb-8 last:mb-0">
            <div className="flex items-center mb-4">
              {/* Division avatar if available */}
              {standingsData.customDivisions?.[divId]?.avatar && (
                <img
                  src={standingsData.customDivisions[divId].avatar}
                  alt={standingsData.divisionNames[divId]}
                  className="w-10 h-10 rounded-full mr-3 border border-[#FF4B1F] bg-white/10 object-cover"
                />
              )}
              <h3 className="text-xl font-bold border-b border-[#FF4B1F] pb-2 text-[#FF4B1F]">
                {standingsData.divisionNames[divId] || `Division ${divId}`}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-y-2">
                <thead>
                  <tr className="bg-[#FF4B1F]/20 text-white/90">
                    <th className="py-2 px-3 text-left rounded-l-lg">#</th>
                    <th className="py-2 px-3 text-left">Team</th>
                    <th className="py-2 px-3 text-center">W</th>
                    <th className="py-2 px-3 text-center">L</th>
                    <th className="py-2 px-3 text-center">T</th>
                    <th className="py-2 px-3 text-center">PF</th>
                    <th className="py-2 px-3 text-center rounded-r-lg">PA</th>
                  </tr>
                </thead>
                <tbody>
                  {standingsData.divisions[divId].map((team, idx) => (
                    <tr
                      key={team.rosterId}
                      className={`bg-black/20 hover:bg-[#FF4B1F]/10 transition-colors ${
                        idx === 0 ? "border-2 border-[#FF4B1F]/60" : "border border-white/10"
                      } rounded-lg`}
                    >
                      <td className="py-2 px-3 text-center font-bold text-white/80 rounded-l-lg">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center border border-[#FF4B1F]">
                            {team.avatar ? (
                              <img
                                src={`https://sleepercdn.com/avatars/${team.avatar}`}
                                alt={team.teamName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-base font-bold text-[#FF4B1F]">
                                {team.teamName?.charAt(0) || 'T'}
                              </span>
                            )}
                          </div>
                          <span
                            className="font-bold min-w-0 max-w-[9rem] md:max-w-xs overflow-hidden whitespace-nowrap"
                            style={{
                              display: 'block',
                              fontSize: `clamp(0.85rem, ${Math.max(
                                2.2 - (team.teamName?.length || 0) * 0.09,
                                1
                              )}rem, 1.25rem)`
                            }}
                          >
                            {team.teamName}
                          </span>
                        </div>
                      </td>
                      <td className={`py-2 px-3 text-center font-semibold ${team.rosterId === leaderWins ? orange : ""}`}>{team.wins}</td>
                      <td className={`py-2 px-3 text-center font-semibold ${team.rosterId === leaderLosses ? orange : ""}`}>{team.losses}</td>
                      <td className={`py-2 px-3 text-center font-semibold ${team.rosterId === leaderTies ? orange : ""}`}>{team.ties}</td>
                      <td className={`py-2 px-3 text-center ${team.rosterId === leaderPF ? orange : ""}`}>{(team.pointsFor / 100).toFixed(1)}</td>
                      <td className={`py-2 px-3 text-center rounded-r-lg ${team.rosterId === leaderPA ? orange : ""}`}>{(team.pointsAgainst / 100).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  // Helper to render content based on league status
  function renderMainContent() {
    if (!leagueData?.status) return <OffseasonContent />;

    switch (leagueData.status) {
      case "in_season":
        // Always show matchups section, even if empty
        return (
          <div className="space-y-3 md:space-y-4">
            {matchups.length > 0 ? (
              matchups.map((matchup, index) => {
                let winnerIdx = null;
                if (
                  matchup.length === 2 &&
                  typeof matchup[0].points === "number" &&
                  typeof matchup[1].points === "number" &&
                  matchup[0].points !== matchup[1].points
                ) {
                  winnerIdx = matchup[0].points > matchup[1].points ? 0 : 1;
                }
                return (
                  <div
                    key={index}
                    className="bg-black/30 rounded-lg border border-white/10 p-4 flex flex-col"
                  >
                    {/* Responsive layout: vertical on mobile, horizontal on desktop */}
                    <div className={`flex ${isMobile ? 'flex-col items-center gap-2' : 'items-center justify-between gap-2 md:gap-6'}`}>
                      {/* Team 1 */}
                      <div className={`flex items-center ${isMobile ? 'flex-col gap-1 mb-2' : 'flex-1 min-w-0 gap-3'}`}>
                        <div className="w-12 h-12 rounded-full bg-white/10 overflow-hidden flex items-center justify-center border border-[#FF4B1F]">
                          {matchup[0].avatar ? (
                            <img
                              src={`https://sleepercdn.com/avatars/${matchup[0].avatar}`}
                              alt={matchup[0].teamName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xl font-bold text-[#FF4B1F]">
                              {matchup[0].teamName?.charAt(0) || 'T'}
                            </span>
                          )}
                        </div>
                        <span
                          className="font-bold truncate text-center"
                          style={{
                            fontSize: `clamp(1rem, ${Math.max(
                              2.2 - (matchup[0].teamName?.length || 0) * 0.07,
                              1
                            )}rem, 1.25rem)`
                          }}
                        >
                          {matchup[0].teamName}
                        </span>
                        {isMobile && (
                          <div className={`font-extrabold text-2xl text-white text-center w-full ${winnerIdx === 0 ? "text-[#FF4B1F]" : ""}`}>
                            {typeof matchup[0].points === "number" ? matchup[0].points.toFixed(2) : "--"}
                          </div>
                        )}
                      </div>
                      {/* VS and scores */}
                      <div className={`flex ${isMobile ? 'flex-col items-center w-full' : 'items-center'}`}>
                        {!isMobile && (
                          <div className={`font-extrabold text-2xl text-white text-center w-20 ${winnerIdx === 0 ? "text-[#FF4B1F]" : ""}`}>
                            {typeof matchup[0].points === "number" ? matchup[0].points.toFixed(2) : "--"}
                          </div>
                        )}
                        <div className="flex items-center justify-center">
                          <div className="rounded-full bg-[#FF4B1F] text-black font-bold w-10 h-10 flex items-center justify-center text-lg shadow-md">
                            VS
                          </div>
                        </div>
                        {!isMobile && (
                          <div className={`font-extrabold text-2xl text-white text-center w-20 ${winnerIdx === 1 ? "text-[#FF4B1F]" : ""}`}>
                            {typeof matchup[1].points === "number" ? matchup[1].points.toFixed(2) : "--"}
                          </div>
                        )}
                      </div>
                      {/* Team 2 */}
                      <div className={`flex items-center ${isMobile ? 'flex-col gap-1 mt-2' : 'flex-1 min-w-0 gap-3 justify-end'}`}>
                        <span
                          className="font-bold truncate text-center"
                          style={{
                            fontSize: `clamp(1rem, ${Math.max(
                              2.2 - (matchup[1].teamName?.length || 0) * 0.07,
                              1
                            )}rem, 1.25rem)`
                          }}
                        >
                          {matchup[1].teamName}
                        </span>
                        <div className="w-12 h-12 rounded-full bg-white/10 overflow-hidden flex items-center justify-center border border-[#FF4B1F]">
                          {matchup[1].avatar ? (
                            <img
                              src={`https://sleepercdn.com/avatars/${matchup[1].avatar}`}
                              alt={matchup[1].teamName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xl font-bold text-[#FF4B1F]">
                              {matchup[1].teamName?.charAt(0) || 'T'}
                            </span>
                          )}
                        </div>
                        {isMobile && (
                          <div className={`font-extrabold text-2xl text-white text-center w-full ${winnerIdx === 1 ? "text-[#FF4B1F]" : ""}`}>
                            {typeof matchup[1].points === "number" ? matchup[1].points.toFixed(2) : "--"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-white/70 py-8">
                No matchups available for this week.
              </div>
            )}
          </div>
        );
      case "pre_draft":
        return (
          <div className="text-center py-8">
            <h3 className="text-xl font-bold mb-2">Draft Coming Soon!</h3>
            <p>Get ready for the league draft. Prepare your rankings and strategies.</p>
          </div>
        );
      case "complete":
        return (
          <div className="text-center py-8">
            <h3 className="text-xl font-bold mb-2">Season Complete</h3>
            <p>Congratulations to the champion! See the Hall of Fame for past winners.</p>
          </div>
        );
      case "offseason":
      default:
        return <OffseasonContent />;
    }
  }

  const [tweets, setTweets] = useState([]);
  const [showAdamOnly, setShowAdamOnly] = useState(false); // <-- NEW: toggle state

  useEffect(() => {
    async function fetchTweets() {
      try {
        const res = await fetch('/api/admin/contract_changes');
        const data = await res.json();
        // The API returns an array directly, not { data: [...] }
        const allChanges = Array.isArray(data) ? data : [];
        const allTweets = [];
        allChanges.forEach(change => {
          // Only process ai_notes if it's an array
          if (Array.isArray(change.ai_notes)) {
            // Shuffle the ai_notes array for this contract change
            const shuffledNotes = shuffleArray(change.ai_notes);
            // Attach a timestamp to each tweet for display
            shuffledNotes.forEach(note => {
              allTweets.push({
                ...note,
                _timestamp: change.timestamp // Use the contract change timestamp
              });
            });
          }
        });
        setTweets(allTweets);
      } catch (err) {
        setTweets([]);
      }
    }
    fetchTweets();
  }, []);

  // Helper to identify Adam Glazerport tweets
  function isAdamTweet(t) {
    const name = (t?.name || '').replace(/^@/, '').trim().toLowerCase();
    return name === 'adam glazerport';
  }

  // Add this helper at the top-level of your file (outside Home)
  function shuffleArray(array) {
    // Fisher-Yates shuffle
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#001A2B] flex items-center justify-center flex-col">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent mb-4"></div>
        <p className="text-white mb-8">Loading league data...</p>
        
        {/* Troubleshooting button */}
        <button
          onClick={() => {
            setTestMode(true);
            setLoading(false);
            setError("Debug mode activated. Check console for API results.");
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Debug Mode (Loading Too Long?)
        </button>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-[#001A2B] text-white flex items-center justify-center flex-col p-6">
        <h1 className="text-3xl font-bold text-[#FF4B1F] mb-4">Error Loading League Data</h1>
        <p className="mb-4">{error}</p>
        <p className="text-sm text-white/70 mb-8">
          {testMode ? 
            "Debug mode active. Try entering a league ID manually below." : 
            "If you're setting up this site for the first time, make sure to update the USER_ID in the Home component with your Sleeper user ID."}
        </p>
        
        {/* Manual League ID Input */}
        <div className="mb-8 w-full max-w-md">
          <h2 className="text-xl font-bold mb-4 text-[#FF4B1F]">Manually Enter League ID</h2>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Enter Sleeper League ID" 
              className="flex-1 px-4 py-2 bg-black/30 border border-white/10 rounded text-white"
              onChange={(e) => setLeagueId(e.target.value)}
            />
            <button 
              className="px-4 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors"
              onClick={() => {
                console.log('Manual league ID set:', leagueId);
                setError(null);
                setLoading(true);
              }}
            >
              Load
            </button>
          </div>
        </div>
        
        {/* Sample data option for testing */}
        {testMode && (
          <button
            onClick={() => {
              console.log('Loading sample data');
              setLeagueData({ name: 'Budget Blitz Bowl (Sample)' });
              setMatchups([
                [
                  { teamName: 'Team A', points: 120.5, projected: 115.2 },
                  { teamName: 'Team B', points: 105.3, projected: 110.8 }
                ],
                [
                  { teamName: 'Team C', points: 95.7, projected: 100.1 },
                  { teamName: 'Team D', points: 130.2, projected: 125.6 }
                ]
              ]);
              setStandings({
                divisions: {
                  1: [
                    { rosterId: 1, teamName: 'Team A', wins: 5, losses: 2, pointsFor: 845.2, pointsAgainst: 732.1 },
                    { rosterId: 2, teamName: 'Team B', wins: 3, losses: 4, pointsFor: 778.9, pointsAgainst: 802.5 }
                  ],
                  2: [
                    { rosterId: 3, teamName: 'Team D', wins: 4, losses: 3, pointsFor: 812.7, pointsAgainst: 798.3 },
                    { rosterId: 4, teamName: 'Team C', wins: 2, losses: 5, pointsFor: 721.4, pointsAgainst: 825.3 }
                  ]
                },
                divisionNames: {
                  1: "East Division",
                  2: "West Division"
                }
              });
              setCurrentWeek(8);
              setNews([
                { title: 'Sample News Item 1', link: '#', category: 'News', timestamp: new Date().toString() },
                { title: 'Sample News Item 2', link: '#', category: 'News', timestamp: new Date().toString() }
              ]);
              setError(null);
              setLoading(false);
            }}
            className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 transition-colors mb-8"
          >
            Load Sample Data For Testing
          </button>
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      {/* Header Banner - Just the title, no navigation */}
      <div className={`${isMobile ? 'p-3' : 'p-6'} bg-black/30 border-b border-white/10`}>
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          <img
            src="/logo.png"
            alt="BBB League"
            className={`${isMobile ? 'h-12 w-12' : 'h-16 w-16'} transition-transform hover:scale-105`}
          />
        </div>
      </div>

      {/* League Info Banner */}
      <div className="bg-gradient-to-r from-[#FF4B1F]/20 to-transparent">
        <div className={`max-w-7xl mx-auto ${isMobile ? 'p-3' : 'p-6'}`}>
          <div className={`flex flex-col ${isMobile ? '' : 'md:flex-row'} items-center justify-between`}>
            <div>
              <h2 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold`}>{leagueData?.name || 'BBB League'}</h2>
              <p className="text-white/70">
                {currentWeek ? `Week ${currentWeek}` : 'Fantasy Football'} | {leagueData?.season || 'Current'} Season
              </p>
            </div>
            <div className={`${isMobile ? 'mt-2' : 'mt-4 md:mt-0'}`}>
              <a 
                href={`https://sleeper.app/leagues/${leagueId}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors text-sm"
              >
                <span>View on Sleeper</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className={`max-w-7xl mx-auto ${isMobile ? 'p-2' : 'p-6'}`}>
        <div className={`grid grid-cols-1 ${isMobile ? 'gap-4' : 'lg:grid-cols-3 gap-8'}`}>
          {/* Main Content (Matchups + Standings) */}
          <div className={`${isMobile ? '' : 'lg:col-span-2'} space-y-6 md:space-y-8`}>
            {/* Matchups Section */}
            <div className="bg-black/30 rounded-lg border border-white/10 p-4 md:p-6">
              <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold mb-4 md:mb-6 text-[#FF4B1F]`}>
                {currentWeek ? `Week ${currentWeek} Matchups` : 'Current Matchups'}
              </h2>
              {renderMainContent()}
            </div>
            
            {/* Standings Section */}
            <div className="bg-black/30 rounded-lg border border-white/10 p-4 md:p-6">
              <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold mb-4 md:mb-6 text-[#FF4B1F]`}>League Standings</h2>
              <StandingsSection standingsData={standings} />
            </div>
          </div>
          
          {/* Sidebar (News + Quick Links) */}
          <div className="space-y-6 md:space-y-8">
            {/* News Section */}
            <div className="bg-black/30 rounded-lg border border-white/10 p-4 md:p-6">
              <div className={`flex items-center justify-between ${isMobile ? 'mb-4' : 'mb-6'}`}>
                <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold text-[#FF4B1F]`}>
                  League bAnker Feed
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAdamOnly(v => !v)}
                  title={showAdamOnly ? 'Showing Adam Glazerport only' : 'Show only Adam Glazerport'}
                  className={`text-xs px-2 py-1 rounded border transition-colors
                    ${showAdamOnly
                      ? 'bg-[#FF4B1F] text-black border-[#FF4B1F]'
                      : 'bg-black/20 text-white/70 border-white/20 hover:text-white hover:border-[#FF4B1F]'}
                  `}
                >
                  AG Only
                </button>
              </div>
              <BankerFeed tweets={showAdamOnly ? tweets.filter(isAdamTweet) : tweets} />
            </div>
            
            {/* Quick Links Section */}
            <div className="bg-black/30 rounded-lg border border-white/10 p-4 md:p-6">
              <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold mb-4 md:mb-6 text-[#FF4B1F]`}>
                Quick Links
              </h2>
              
              <div className="space-y-2">
                <LinkCard 
                  title="Salary Cap Space" 
                  description="Check team cap situations" 
                  href="/salary-cap" 
                />
                <LinkCard 
                  title="Trade Calculator" 
                  description="Analyze potential trades" 
                  href="/trade" 
                />
                <LinkCard 
                  title="Offseason Guide" 
                  description="Key dates and deadlines" 
                  href="/offseason" 
                />
                <LinkCard 
                  title="Hall of Fame" 
                  description="Past league champions" 
                  href="/hall-of-fame" 
                />
                <LinkCard 
                  title="League Rules" 
                  description="Official rulebook" 
                  href="/rules" 
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// Link card component - Keep this for the Quick Links section
function LinkCard({ title, description, href }) {
  return (
    <Link 
      href={href}
      className="block bg-black/20 rounded-lg p-3 md:p-4 hover:bg-black/30 transition-colors"
    >
      <h3 className="font-bold">{title}</h3>
      <p className="text-sm text-white/70">{description}</p>
    </Link>
  );
}

// Add this helper at the top-level of your file (outside Home)
function shuffleArray(array) {
  // Fisher-Yates shuffle
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function BankerFeed({ tweets }) {
  if (!tweets || tweets.length === 0) {
    return (
      <div className="text-center text-white/70 py-6 md:py-8">
        No tweets available
      </div>
    );
  }
  return (
    <div
      className="space-y-2 overflow-y-auto"
      style={{
        maxHeight: '420px',
        scrollbarWidth: 'thin',
        scrollbarColor: '#FF4B1F #1a232b'
      }}
    >
      {tweets.map((tweet, idx) => (
        <div
          key={idx}
          className="bg-black/20 rounded-xl px-4 py-3 border border-white/10 flex flex-col gap-2"
        >
          {/* Top: Avatar, Name, Handle */}
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {tweet.role === "journalist" ? (
                <span
                  title="Verified"
                  className="inline-block w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-2xl border-2 border-blue-300"
                >
                  ✓
                </span>
              ) : (
                <span className="inline-block w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-2xl border-2 border-gray-500">
                  {tweet.name?.charAt(1) || "@"}
                </span>
              )}
            </div>
            {/* Name and handle */}
            <div className="flex flex-col">
              <span className="font-bold text-white leading-tight text-base">
                {tweet.name?.replace(/^@/, '') || "Unknown"}
              </span>
              <span className="text-gray-400 text-sm leading-tight">
                @{tweet.name?.replace(/^@/, '')}
              </span>
            </div>
          </div>
          {/* Body */}
          <div className="text-white/90 text-lg leading-snug px-1 pt-1 pb-2">
            {tweet.reaction}
          </div>
          {/* Timestamp */}
          <div className="text-xs text-gray-400 pl-1 pt-1 flex items-center gap-2">
            {tweet._timestamp ? formatTweetDate(tweet._timestamp) : ""}
            <span>·</span>
            <span className="text-blue-400 font-medium">bAnker for iPhone</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Helper to format the date like ... (e.g., "1:21 PM · 1/4/21")
function formatTweetDate(dateString) {
  const date = new Date(dateString);
  if (isNaN(date)) return "";
  const hours = date.getHours() % 12 || 12;
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = date.getHours() >= 12 ? "PM" : "AM";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear().toString().slice(-2);
  return `${hours}:${minutes} ${ampm} · ${month}/${day}/${year}`;
}