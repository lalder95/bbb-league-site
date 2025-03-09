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
        
        // Fetch league info
        const leagueResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
        if (!leagueResponse.ok) throw new Error('Failed to fetch league data');
        const leagueInfo = await leagueResponse.json();
        console.log('League info fetched successfully');
        setLeagueData(leagueInfo);
        
        // Get current NFL week
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        if (!seasonResponse.ok) throw new Error('Failed to fetch NFL state');
        const seasonState = await seasonResponse.json();
        console.log('Current NFL week:', seasonState.week);
        setCurrentWeek(seasonState.week);
        
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
        console.log('Fetching matchups for week:', seasonState.week);
        const matchupsResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${seasonState.week}`);
        if (!matchupsResponse.ok) throw new Error('Failed to fetch matchups');
        const matchupsData = await matchupsResponse.json();
        console.log('Matchups fetched:', matchupsData.length);
        
        // Process matchups data to include team names
        const processedMatchups = processMatchups(matchupsData, users, rosters);
        setMatchups(processedMatchups);
        
        // Process standings
        const processedStandings = processStandings(rosters, users);
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
  
  // Helper function to process standings data
  function processStandings(rosters, users) {
    return rosters
      .map(roster => {
        const user = users.find(u => u.user_id === roster.owner_id);
        return {
          rosterId: roster.roster_id,
          teamName: user?.display_name || user?.team_name || `Team ${roster.roster_id}`,
          avatar: user?.avatar,
          wins: roster.settings?.wins || 0,
          losses: roster.settings?.losses || 0,
          ties: roster.settings?.ties || 0,
          pointsFor: roster.settings?.fpts || 0,
          pointsAgainst: roster.settings?.fpts_against || 0,
        };
      })
      .sort((a, b) => {
        // Sort by wins, then points
        if (a.wins !== b.wins) return b.wins - a.wins;
        return b.pointsFor - a.pointsFor;
      });
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
              setStandings([
                { teamName: 'Team A', wins: 5, losses: 2, pointsFor: 845.2, pointsAgainst: 732.1 },
                { teamName: 'Team D', wins: 4, losses: 3, pointsFor: 812.7, pointsAgainst: 798.3 },
                { teamName: 'Team B', wins: 3, losses: 4, pointsFor: 778.9, pointsAgainst: 802.5 },
                { teamName: 'Team C', wins: 2, losses: 5, pointsFor: 721.4, pointsAgainst: 825.3 }
              ]);
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
      <div className="bg-black/30 p-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          <h1 className="text-3xl font-bold text-[#FF4B1F]">Budget Blitz Bowl</h1>
        </div>
      </div>

      {/* League Info Banner */}
      <div className="bg-gradient-to-r from-[#FF4B1F]/20 to-transparent">
        <div className="max-w-7xl mx-auto p-6">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">{leagueData?.name || 'BBB League'}</h2>
              <p className="text-white/70">
                {currentWeek ? `Week ${currentWeek}` : 'Fantasy Football'} | {leagueData?.season || 'Current'} Season
              </p>
            </div>
            <div className="mt-4 md:mt-0">
              <a 
                href={`https://sleeper.app/leagues/${leagueId}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors"
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

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content (Matchups + Standings) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Matchups Section */}
            <div className="bg-black/30 rounded-lg border border-white/10 p-6">
              <h2 className="text-xl font-bold mb-6 text-[#FF4B1F]">
                {currentWeek ? `Week ${currentWeek} Matchups` : 'Current Matchups'}
              </h2>
              
              {matchups.length > 0 ? (
                <div className="space-y-4">
                  {matchups.map((matchup, index) => (
                    <div 
                      key={index}
                      className="bg-black/20 rounded-lg border border-white/10 p-4 hover:border-[#FF4B1F]/50 transition-colors"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {matchup.map((team, teamIndex) => (
                          <div 
                            key={teamIndex} 
                            className={`flex items-center gap-4 ${teamIndex === 0 ? 'md:border-r md:border-white/10' : ''}`}
                          >
                            <div className="w-12 h-12 rounded-full bg-white/10 overflow-hidden flex items-center justify-center">
                              {team.avatar ? (
                                <img 
                                  src={`https://sleepercdn.com/avatars/${team.avatar}`} 
                                  alt={team.teamName}
                                  className="w-full h-full object-cover" 
                                />
                              ) : (
                                <span className="text-xl font-bold text-[#FF4B1F]">
                                  {team.teamName?.charAt(0) || 'T'}
                                </span>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="font-bold truncate">{team.teamName}</div>
                              <div className="flex gap-4">
                                <div>
                                  <span className="text-xs text-white/50">Score</span>
                                  <div className="font-bold text-lg">{team.points?.toFixed(1) || '0.0'}</div>
                                </div>
                                <div>
                                  <span className="text-xs text-white/50">Projected</span>
                                  <div className="text-white/70">{team.projected?.toFixed(1) || '0.0'}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-white/70 py-8">
                  No current matchups available
                </div>
              )}
            </div>
            
            {/* Standings Section */}
            <div className="bg-black/30 rounded-lg border border-white/10 p-6">
              <h2 className="text-xl font-bold mb-6 text-[#FF4B1F]">League Standings</h2>
              
              {standings.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-white/70">
                        <th className="py-2 text-left pl-2">Team</th>
                        <th className="py-2 text-center">Record</th>
                        <th className="py-2 text-center">PF</th>
                        <th className="py-2 text-center">PA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((team, index) => (
                        <tr 
                          key={index}
                          className="border-b last:border-0 border-white/5 hover:bg-white/5 transition-colors"
                        >
                          <td className="py-3 pl-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center">
                                {team.avatar ? (
                                  <img 
                                    src={`https://sleepercdn.com/avatars/${team.avatar}`} 
                                    alt={team.teamName}
                                    className="w-full h-full object-cover" 
                                  />
                                ) : (
                                  <span className="text-sm font-bold text-[#FF4B1F]">
                                    {team.teamName?.charAt(0) || 'T'}
                                  </span>
                                )}
                              </div>
                              <span className="font-medium truncate">{team.teamName}</span>
                            </div>
                          </td>
                          <td className="py-3 text-center">{team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ''}</td>
                          <td className="py-3 text-center">{(team.pointsFor / 100).toFixed(1)}</td>
                          <td className="py-3 text-center">{(team.pointsAgainst / 100).toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center text-white/70 py-8">
                  No standings data available
                </div>
              )}
            </div>
          </div>
          
          {/* Sidebar (News + Quick Links) */}
          <div className="space-y-8">
            {/* News Section */}
            <div className="bg-black/30 rounded-lg border border-white/10 p-6">
              <h2 className="text-xl font-bold mb-6 text-[#FF4B1F]">
                Latest News
              </h2>
              
              {news.length > 0 ? (
                <div className="space-y-4">
                  {news.map((item, index) => (
                    <a
                      key={index}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-black/20 rounded-lg p-4 hover:bg-black/30 transition-colors"
                    >
                      <h3 className="font-bold truncate">{item.title}</h3>
                      <div className="flex text-xs text-white/50 mt-2 justify-between">
                        <span>{item.category}</span>
                        <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-center text-white/70 py-8">
                  No news available
                </div>
              )}
            </div>
            
            {/* Quick Links Section */}
            <div className="bg-black/30 rounded-lg border border-white/10 p-6">
              <h2 className="text-xl font-bold mb-6 text-[#FF4B1F]">
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
      className="block bg-black/20 rounded-lg p-4 hover:bg-black/30 transition-colors"
    >
      <h3 className="font-bold">{title}</h3>
      <p className="text-sm text-white/70">{description}</p>
    </Link>
  );
}