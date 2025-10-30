'use client';

import React, { useState, useEffect, useMemo, startTransition } from 'react';
import Link from 'next/link';
import PlayerProfileCard from './my-team/components/PlayerProfileCard';
import EscapeKeyListener from './player-contracts/EscapeKeyListener';
import SwipeDownListener from './player-contracts/SwipeDownListener';

const MemoPlayerProfileCard = React.memo(
  function MemoPlayerProfileCard(props) {
    return <PlayerProfileCard {...props} />;
  },
  (prev, next) =>
    prev.playerId === next.playerId &&
    prev.teamName === next.teamName &&
    prev.expanded === next.expanded
);

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

  // NEW: Add selectedWeek state for week navigation
  const [selectedWeek, setSelectedWeek] = useState(null);

  // NEW: Starters related state (using BBB_Contracts.csv for player info)
  const [playerInfoMap, setPlayerInfoMap] = useState({});
  const [playersLoading, setPlayersLoading] = useState(false);
  const [expandedMatchups, setExpandedMatchups] = useState({}); // matchup_id -> bool

  // ADD THIS LINE for player card modal state
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [playerGameStates, setPlayerGameStates] = useState({});
  // Announcements
  const [announcements, setAnnouncements] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/announcements', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
      } catch {
        if (!cancelled) setAnnouncements([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const [isMobile, setIsMobile] = useState(false);
  const [teamAvatars, setTeamAvatars] = useState({}); // NEW: for expanded card avatar support

  // Mobile detection
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

        setCurrentWeek(week); // Set currentWeek from API

        // NEW: Set selectedWeek to currentWeek if not already set
        setSelectedWeek(w => w ?? week);

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

        // NEW: build team avatar map for PlayerProfileCard
        const avatarMap = {};
        users.forEach(u => {
          if (u?.display_name) avatarMap[u.display_name] = u.avatar;
        });
        setTeamAvatars(avatarMap);

        // Fetch rosters
        console.log('Fetching league rosters...');
        const rostersResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
        if (!rostersResponse.ok) throw new Error('Failed to fetch rosters');
        const rosters = await rostersResponse.json();
        console.log('Rosters fetched:', rosters.length);
        
        // Fetch matchups for selectedWeek (not week)
        console.log('Fetching matchups for week:', selectedWeek ?? week);
        const matchupsResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${selectedWeek ?? week}`);
        if (!matchupsResponse.ok) throw new Error('Failed to fetch matchups');
        const matchupsData = await matchupsResponse.json();
        console.log('Matchups API data:', matchupsData);
        
        // Process matchups data to include team names & starters
        const processedMatchups = processMatchups(matchupsData, users, rosters);
        setMatchups(processedMatchups);

        // Collect unique starter IDs
        const starterIds = [...new Set(
          matchupsData.flatMap(m => (m.starters || []).filter(s => s && s !== '0'))
        )];

        if (starterIds.length) {
          setPlayersLoading(true);
          try {
            const info = await fetchStarterPlayerInfo(starterIds);
            setPlayerInfoMap(info);
          } catch (e) {
            console.warn('Failed to load starter player info from contracts CSV:', e);
          } finally {
            setPlayersLoading(false);
          }
        }
        
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
        }
        
        console.log('All data loaded successfully');
        setLoading(false);
      } catch (err) {
        console.error('Error fetching league data:', err);
        setError(err.message);
        setLoading(false);
      }
    }
    
    fetchData();
  }, [leagueId, selectedWeek]); // <-- Add selectedWeek as dependency

  // Helper: fetch player info from BBB_Contracts.csv
  async function fetchStarterPlayerInfo(neededIds = []) {
    // CSV expected at this URL; adjust if path changes
    const resp = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
    if (!resp.ok) throw new Error('Failed to fetch BBB_Contracts.csv');
    const text = await resp.text();
    const lines = text.trim().split('\n').filter(Boolean);
    const header = lines.shift(); // remove header

    const headerCols = header.split(',');

    // Header helpers
    const findIdx = (re, def = -1) => {
      const i = headerCols.findIndex(h => re.test(h));
      return i !== -1 ? i : def;
    };
    const num = (v) => {
      const n = parseFloat(String(v ?? '').replace(/[$,]/g, '').trim());
      return Number.isFinite(n) ? n : 0;
    };

    // Indices we need
    const idIndex = findIdx(/^(player\s*id|playerid)$/i, 0);
    const nameIndex = findIdx(/player.*name/i, 1);
    const posIndex = findIdx(/^(pos|position)$/i, 21);
    const teamDisplayIndex = findIdx(/teamdisplayname/i, 33);
    const nflTeamIndex = findIdx(/^(nfl\s*team|nfl_team)$/i, -1);
    const statusIndex = findIdx(/^status$/i, 14);
    const relY1Index = findIdx(/^relative\s*year\s*1\s*salary$/i, -1);

    const needed = new Set(neededIds);
    const activeRowById = new Map();
    const anyRowById = new Map();

    // First pass: collect the Active contract row for each needed player
    for (const line of lines) {
      if (!needed.size && activeRowById.size) break;
      const cols = line.split(',');
      const pid = cols[idIndex];
      if (!pid) continue;

      if (!anyRowById.has(pid)) anyRowById.set(pid, cols);

      if (!needed.has(pid)) continue;
      const st = (cols[statusIndex] || '').trim().toLowerCase();
      if (st === 'active') {
        activeRowById.set(pid, cols);
      }
    }

    // Build result map
    const map = {};
    neededIds.forEach(pid => {
      const row = activeRowById.get(pid) || anyRowById.get(pid);
      const name = row ? (row[nameIndex] || 'Unknown') : 'Unknown';
      const position = row ? (row[posIndex] || '') : '';
      const teamDisplayName = row ? (row[teamDisplayIndex] || '') : '';
      const nflTeam = row && nflTeamIndex >= 0 ? (row[nflTeamIndex] || '') : '';

      // Rule: use Relative Year 1 Salary from Active contract
      const salary = row && activeRowById.has(pid) && relY1Index >= 0 ? num(row[relY1Index]) : 0;

      map[pid] = {
        id: pid,
        name,
        position,
        teamDisplayName,
        nflTeam,
        salary,
        isDeadCap: false
      };
    });

    return map;
  }

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
        starters: (matchup.starters || []).filter(s => s && s !== '0'),
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
        if (customDivisions[i]) {
          divisionNames[i] = customDivisions[i].name;
        } else if (league.settings[`division_${i}`]) {
          divisionNames[i] = league.settings[`division_${i}`];
        }
      }
    } else {
      for (let i = 1; i <= 3; i++) {
        divisionNames[i] = customDivisions[i]?.name || `Division ${i}`;
      }
    }

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
        division: divisionId,
        divisionName: divisionNames[divisionId] || `Division ${divisionId || 1}`,
        divisionAvatar: customDivisions[divisionId]?.avatar || null
      };
    });

    const divisions = {};
    teamsData.forEach(team => {
      const divId = team.division;
      if (!divisions[divId]) {
        divisions[divId] = [];
      }
      divisions[divId].push(team);
    });

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

  // Offseason Content Component
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
              <p className="text-sm text-white/70">Explore potential trades and plan your team&apos;s future.</p>
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

    const allTeams = Object.values(standingsData.divisions).flat();

    function getUniqueLeader(stat, isMax = true) {
      if (!allTeams.length) return null;
      const values = allTeams.map(t => t[stat]);
      const best = isMax ? Math.max(...values) : Math.min(...values);
      const leaders = allTeams.filter(t => t[stat] === best);
      return leaders.length === 1 ? leaders[0].rosterId : null;
    }

    const leaderWins = getUniqueLeader('wins', true);
    const leaderLosses = getUniqueLeader('losses', false);
    const leaderTies = getUniqueLeader('ties', true);
    const leaderPF = getUniqueLeader('pointsFor', true);
    const leaderPA = getUniqueLeader('pointsAgainst', false);

    const orange = "text-[#FF4B1F] font-extrabold";

    return (
      <div>
        {Object.keys(standingsData.divisions).map(divId => (
          <div key={divId} className="mb-8 last:mb-0">
            <div className="flex items-center mb-4">
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
                      <td className={`py-2 px-3 text-center ${team.rosterId === leaderPF ? orange : ""}`}>{(team.pointsFor / 1).toFixed(1)}</td>
                      <td className={`py-2 px-3 text-center rounded-r-lg ${team.rosterId === leaderPA ? orange : ""}`}>{(team.pointsAgainst / 1).toFixed(1)}</td>
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
        return (
          <div className="space-y-3 md:space-y-4">
            {/* Week navigation header */}
            <div className="flex items-center justify-center mb-4">
              <button
                className="px-2 py-1 rounded hover:bg-[#FF4B1F]/30 transition-colors text-[#FF4B1F] font-bold text-lg"
                onClick={() => setSelectedWeek(w => Math.max(1, (w || 1) - 1))}
                disabled={selectedWeek <= 1}
                aria-label="Previous Week"
                title="Previous Week"
              >
                ←
              </button>
              <span className="mx-4 text-xl font-bold text-[#FF4B1F]">
                {selectedWeek ? `Week ${selectedWeek} Matchups` : 'Current Matchups'}
              </span>
              <button
                className="px-2 py-1 rounded hover:bg-[#FF4B1F]/30 transition-colors text-[#FF4B1F] font-bold text-lg"
                onClick={() => setSelectedWeek(w => Math.min(18, (w || 1) + 1))}
                aria-label="Next Week"
                title="Next Week"
              >
                →
              </button>
            </div>
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
                const id = matchup[0]?.matchup_id || index;
                const expanded = expandedMatchups[id];

                return (
                  <div
                    key={id}
                    className="bg-black/30 rounded-lg border border-white/10 p-4 flex flex-col"
                  >
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                      {/* Left Team */}
                      <div className="flex flex-col items-center min-w-0">
                        <span
                          className="font-bold truncate whitespace-nowrap text-center"
                          style={{
                            fontSize: `clamp(1rem, ${Math.max(
                              2.2 - (matchup[0].teamName?.length || 0) * 0.09,
                              1
                            )}rem, 1.25rem)`
                          }}
                          title={matchup[0].teamName}
                        >
                          {matchup[0].teamName}
                        </span>
                        <div className="w-12 h-12 rounded-full bg-white/10 overflow-hidden flex items-center justify-center border border-[#FF4B1F] mt-2">
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
                        <div className={`mt-2 font-extrabold text-2xl text-white text-center w-full ${winnerIdx === 0 ? "text-[#FF4B1F]" : ""}`}>
                          {typeof matchup[0].points === "number" ? matchup[0].points.toFixed(2) : "--"}
                        </div>
                      </div>
                      {/* VS Center */}
                      <div className="flex flex-col items-center justify-center min-w-[60px]">
                        <div className="rounded-full bg-[#FF4B1F] text-black font-bold w-10 h-10 flex items-center justify-center text-lg shadow-md mb-2">
                          VS
                        </div>
                        <button
                          onClick={() =>
                            setExpandedMatchups(prev => ({ ...prev, [id]: !prev[id] }))
                          }
                          className="text-xs px-2 py-1 rounded bg-[#FF4B1F]/20 text-[#FF4B1F] border border-[#FF4B1F]/40 hover:bg-[#FF4B1F]/30 transition"
                          aria-label={expanded ? 'Hide Matchup' : 'Show Matchup'}
                          title={expanded ? 'Hide Matchup' : 'Show Matchup'}
                        >
                          {expanded ? 'Hide Matchup' : 'Show Matchup'}
                        </button>
                      </div>
                      {/* Right Team */}
                      <div className="flex flex-col items-center min-w-0">
                        <span
                          className="font-bold truncate whitespace-nowrap text-center"
                          style={{
                            fontSize: `clamp(1rem, ${Math.max(
                              2.2 - (matchup[1].teamName?.length || 0) * 0.09,
                              1
                            )}rem, 1.25rem)`
                          }}
                          title={matchup[1].teamName}
                        >
                          {matchup[1].teamName}
                        </span>
                        <div className="w-12 h-12 rounded-full bg-white/10 overflow-hidden flex items-center justify-center border border-[#FF4B1F] mt-2">
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
                        <div className={`mt-2 font-extrabold text-2xl text-white text-center w-full ${winnerIdx === 1 ? "text-[#FF4B1F]" : ""}`}>
                          {typeof matchup[1].points === "number" ? matchup[1].points.toFixed(2) : "--"}
                        </div>
                      </div>
                    </div>
                    {/* Starters Section */}
                    {expanded && (
                      <div className="mt-4 border-t border-white/10 pt-4">
                        {playersLoading && (
                          <div className="text-sm text-white/60">Loading starters...</div>
                        )}
                        {!playersLoading && (
                          <AlignedStarters
                            leftTeam={matchup[0]}
                            rightTeam={matchup[1]}
                            playerInfoMap={playerInfoMap}
                            selectedWeek={selectedWeek}
                            expandedPlayerId={expandedPlayerId}
                            setExpandedPlayerId={setExpandedPlayerId}
                            playerGameStates={playerGameStates}
                            setPlayerGameStates={setPlayerGameStates}
                            isMobile={isMobile} // pass mobile flag down
                          />
                        )}
                      </div>
                    )}
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
  const [showAdamOnly, setShowAdamOnly] = useState(false);

  const [peopleFilterOpen, setPeopleFilterOpen] = useState(false);
  const [peopleOptions, setPeopleOptions] = useState([]);
  const [peopleEnabled, setPeopleEnabled] = useState({});
  const [teamOptions, setTeamOptions] = useState(['All']);
  const [selectedTeam, setSelectedTeam] = useState('All');

  useEffect(() => {
    async function fetchTweets() {
      try {
        const res = await fetch('/api/admin/contract_changes');
        const data = await res.json();
        const allChanges = Array.isArray(data) ? data : [];
        const allTweets = [];
        allChanges.forEach(change => {
          if (Array.isArray(change.ai_notes)) {
            const shuffledNotes = shuffleArray(change.ai_notes);
            shuffledNotes.forEach(note => {
              allTweets.push({
                ...note,
                _timestamp: change.timestamp,
                _team: change.team || '',
                _parentNotes: change.notes || ''
              });
            });
          }
        });

        const sorted = allTweets.sort((a, b) => {
          const at = new Date(a?._timestamp).getTime();
            const bt = new Date(b?._timestamp).getTime();
          if (isNaN(bt) && isNaN(at)) return 0;
          if (isNaN(bt)) return -1;
          if (isNaN(at)) return 1;
          return bt - at;
        });

        const personMap = {};
        const teamSet = new Set();
        sorted.forEach(t => {
          const display = (t?.name || '').replace(/^@/, '').trim();
          const norm = display.toLowerCase();
          if (display) personMap[norm] = display;
          if (t?._team) teamSet.add(t._team);
        });

        setTweets(sorted);
        setPeopleOptions(Object.values(personMap).sort((a, b) => a.localeCompare(b)));
        setPeopleEnabled(prev => {
          if (Object.keys(prev).length) return prev;
          const init = {};
          Object.keys(personMap).forEach(k => (init[k] = true));
          return init;
        });
        setTeamOptions(['All', ...Array.from(teamSet).sort()]);
      } catch (err) {
        setTweets([]);
      }
    }
    fetchTweets();
  }, []);

  function isAdamTweet(t) {
    const name = (t?.name || '').replace(/^@/, '').trim().toLowerCase();
    return name === 'adam glazerport';
  }

  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ESPN Week Hub: de-dupe and cache scoreboard + summaries per week (60s TTL)
const ESPN_WEEK_HUB = (typeof window !== 'undefined'
  ? (window.__ESPN_WEEK_HUB ||= (() => {
      const TTL = 60000; // 60s
      let currentWeek = null;
      let sb = { data: null, at: 0, promise: null };
      const summaries = new Map(); // eventId -> { data, at, promise }

      const isFresh = (at) => at && (Date.now() - at < TTL);

      async function fetchJson(url) {
        const res = await fetch(url);
        try {
          return await res.json(); // API routes already return { ok, data }
        } catch {
          return { ok: false, data: null };
        }
      }

      function resetForWeek(week) {
        currentWeek = week ?? null;
        sb = { data: null, at: 0, promise: null };
        summaries.clear();
      }

      function ensureScoreboard(week) {
        if (currentWeek !== (week ?? null)) resetForWeek(week);
        if (sb.data && isFresh(sb.at)) return Promise.resolve(sb.data);
        if (sb.promise) return sb.promise;

        const url = `/api/espn/scoreboard?seasontype=2${week ? `&week=${week}` : ''}`;
        const p = fetchJson(url)
          .then(json => {
            sb = { data: json, at: Date.now(), promise: null };
            return json;
          })
          .catch(err => {
            sb.promise = null;
            throw err;
          });
        sb.promise = p;
        return p;
      }

      function ensureSummary(eventId) {
        const entry = summaries.get(eventId);
        if (entry?.data && isFresh(entry.at)) return Promise.resolve(entry.data);
        if (entry?.promise) return entry.promise;

        const p = fetchJson(`/api/espn/summary?event=${eventId}`)
          .then(json => {
            summaries.set(eventId, { data: json, at: Date.now(), promise: null });
            return json;
          })
          .catch(err => {
            const e = summaries.get(eventId);
            if (e) e.promise = null;
            throw err;
          });
        summaries.set(eventId, { data: null, at: 0, promise: p });
        return p;
      }

      return { ensureScoreboard, ensureSummary, ttl: TTL };
    })())
  : { ensureScoreboard: async () => ({ ok: false, data: null }), ensureSummary: async () => ({ ok: false, data: null }), ttl: 60000 });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#001A2B] flex items-center justify-center flex-col">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent mb-4"></div>
        <p className="text-white mb-8">Loading league data...</p>
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
        {testMode && (
          <button
            onClick={() => {
              console.log('Loading sample data');
              setLeagueData({ name: 'Budget Blitz Bowl (Sample)' });
              setMatchups([
                [
                  { teamName: 'Team A', points: 120.5, projected: 115.2, starters: [] },
                  { teamName: 'Team B', points: 105.3, projected: 110.8, starters: [] }
                ],
                [
                  { teamName: 'Team C', points: 95.7, projected: 100.1, starters: [] },
                  { teamName: 'Team D', points: 130.2, projected: 125.6, starters: [] }
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

  const visibleTweets = (showAdamOnly ? tweets.filter(isAdamTweet) : tweets)
    .filter(t => {
      const key = (t?.name || '').replace(/^@/, '').trim().toLowerCase();
      return peopleEnabled[key] !== false;
    })
    .filter(t => selectedTeam === 'All' || (t._team || '') === selectedTeam);

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className={`${isMobile ? 'p-3' : 'p-6'} bg-black/30 border-b border-white/10`}>
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          <img
            src="/logo.png"
            alt="BBB League"
            className={`${isMobile ? 'h-12 w-12' : 'h-16 w-16'} transition-transform hover:scale-105`}
          />
        </div>
      </div>
      
      {announcements.length > 0 && (
        <div className="bg-[#FF4B1F] border-2 border-[#001A2B] mb-3 md:mb-4">
          <div className={`max-w-7xl mx-auto ${isMobile ? 'p-3' : 'p-4'} space-y-2`}>
            {announcements.map((a, idx) => (
              <div
                key={a._id}
                className={`px-2 py-1 ${idx > 0 ? 'border-t border-[#001A2B]/40 mt-2 pt-2' : ''}`}
              >
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="text-black font-extrabold leading-snug text-xl md:text-2xl">
                    {a.message}
                  </div>
                  {a.link && (
                    <a
                      href={a.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-black/40 hover:bg-black/50 text-white font-semibold border border-black/30 shadow-sm"
                    >
                      Click Here
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
          <div className={`${isMobile ? '' : 'lg:col-span-2'} space-y-6 md:space-y-8`}>
            <div className="bg-black/30 rounded-lg border border-white/10 p-4 md:p-6">
              <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold mb-4 md:mb-6 text-[#FF4B1F]`}>
                {currentWeek ? `Week ${currentWeek} Matchups` : 'Current Matchups'}
              </h2>
              {renderMainContent()}
            </div>
            
            <div className="bg-black/30 rounded-lg border border-white/10 p-4 md:p-6">
              <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold mb-4 md:mb-6 text-[#FF4B1F]`}>League Standings</h2>
              <StandingsSection standingsData={standings} />
            </div>
          </div>
          
            <div className="space-y-6 md:space-y-8">
            <div className="bg-black/30 rounded-lg border border-white/10 p-4 md:p-6">
              <div className={`flex items-center justify-between ${isMobile ? 'mb-4' : 'mb-6'}`}>
                <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold text-[#FF4B1F]`}>
                  League bAnker Feed
                </h2>
                <div className="flex items-center gap-2 relative">
                  <button
                    type="button"
                    onClick={() => setShowAdamOnly(v => !v)}
                    title={showAdamOnly ? 'Showing Adam Glazerport only' : 'Show only Adam Glazerport'}
                    className={`text-xs px-2 py-1 rounded border transition-colors
                      ${showAdamOnly
                        ? 'bg-[#FF4B1F] text-black border-[#FF4B1F]'
                        : 'bg-black/20 text-white/70 border-white/20 hover:text-white hover:border-[#FF4B1F]'}`}
                  >
                    AG Only
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setPeopleFilterOpen(o => !o)}
                      className="text-xs px-2 py-1 rounded border bg-black/20 text-white/70 border-white/20 hover:text-white hover:border-[#FF4B1F] transition-colors"
                      title="Filter by person"
                    >
                      People
                    </button>
                    {peopleFilterOpen && (
                      <div className="absolute right-0 mt-2 w-56 max-h-64 overflow-auto bg-[#0b1420] border border-white/10 rounded-md shadow-lg z-10 p-2 space-y-1">
                        {peopleOptions.length === 0 ? (
                          <div className="text-xs text-white/60 px-1 py-1">No people found</div>
                        ) : (
                          peopleOptions.map(displayName => {
                            const key = displayName.toLowerCase();
                            const checked = peopleEnabled[key] !== false;
                            return (
                              <label key={key} className="flex items-center gap-2 text-xs text-white/80 px-1 py-1 hover:bg-white/5 rounded">
                                <input
                                  type="checkbox"
                                  className="accent-[#FF4B1F]"
                                  checked={checked}
                                  onChange={(e) =>
                                    setPeopleEnabled(prev => ({ ...prev, [key]: e.target.checked }))
                                  }
                                />
                                <span>@{displayName}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                  <select
                    value={selectedTeam}
                    onChange={(e) => setSelectedTeam(e.target.value)}
                    className="text-xs px-2 py-1 rounded border bg-black/20 text-white/80 border-white/20 hover:border-[#FF4B1F] focus:outline-none"
                    title="Filter by team"
                  >
                    {teamOptions.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <BankerFeed tweets={visibleTweets} />
            </div>
            
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
      {/* Full-page player modal (match Player Contracts UI) */}
      {expandedPlayerId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setExpandedPlayerId(null)}
        >
          <div
            className="bg-transparent p-0 rounded-lg shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <PlayerProfileCard
              playerId={expandedPlayerId}
              expanded={true}
              className="w-56 h-80 sm:w-72 sm:h-[26rem] md:w-80 md:h-[30rem] max-w-full max-h-[90vh]"
              teamAvatars={teamAvatars}
              teamName={playerInfoMap[expandedPlayerId]?.teamDisplayName || ''}
              onExpandClick={() => setExpandedPlayerId(null)}
            />
            <button
              className="absolute top-2 right-2 text-white bg-black/60 rounded-full px-3 py-1 hover:bg-black"
              onClick={() => setExpandedPlayerId(null)}
              aria-label="Close"
              title="Close"
            >
              ×
            </button>
          </div>
          <EscapeKeyListener onEscape={() => setExpandedPlayerId(null)} />
          <SwipeDownListener onSwipeDown={() => setExpandedPlayerId(null)} />
        </div>
      )}

      <style jsx global>{`
        @keyframes bbb-swell {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .animate-swell {
          animation: bbb-swell 1.6s ease-in-out infinite;
          will-change: transform;
          transform-origin: center;
        }
      `}</style>
    </main>
  );
}

// Link card component
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

function shuffleArray(array) {
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
        No posts available
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
          <div className="flex items-center gap-3">
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
            <div className="flex flex-col">
              <span className="font-bold text-white leading-tight text-base">
                {tweet.name?.replace(/^@/, '') || "Unknown"}
              </span>
              <span className="text-gray-400 text-sm leading-tight">
                @{tweet.name?.replace(/^@/, '')}
              </span>
            </div>
          </div>
          <div className="text-white/90 text-lg leading-snug px-1 pt-1 pb-2">
            {tweet.reaction}
          </div>
          <div className="text-xs text-gray-400 pl-1 pt-1 flex items-center gap-2">
            {tweet._timestamp ? formatTweetDate(tweet._timestamp) : ""}
            <span>·</span>
            <span className="text-blue-400 font-medium">bAnker for Mobile</span>
          </div>
          {tweet._parentNotes ? (
            <div className="text-[11px] text-white/50 italic pl-1">
              {tweet._parentNotes}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function formatTweetDate(dateString) {
  const date = new Date(dateString);
  if (isNaN(date)) return "";
  const hours = date.getHours() % 12 || 12;
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = date.getHours() >= 12 ? "PM" : "AM";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear().toString().slice(-2);
  return `${month}/${day}/${year} ${hours}:${minutes} ${ampm}`;
}

// WeeklyStats: COPY OF THE ESPN LOGIC USED IN PlayerProfileCard (adapted for lightweight row usage)
// UI UPDATED to prevent truncation and include game state (kickoff, live clock, final).
function WeeklyStats({ playerName, position, nflTeam, week, onGameStateChange, showGroups = true }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Small client-side cache (same as PlayerProfileCard)
  // CHANGED: default cache TTL to 60s to match refresh cadence
  const ESPN_CACHE_TTL_DEFAULT = 60000; // 60s
  const ESPN_CACHE =
    typeof window !== "undefined"
      ? (window.__ESPN_CACHE ||= new Map())
      : new Map();

  async function fetchCachedJson(url, ttlMs = ESPN_CACHE_TTL_DEFAULT, fetchOpts = {}) {
    const now = Date.now();
    const entry = ESPN_CACHE.get(url);
    if (entry && entry.expiresAt > now) {
      if (entry.data) return entry.data;
      if (entry.promise) return entry.promise;
    }
    const promise = fetch(url, fetchOpts)
      .then(r => r.json())
      .then(json => {
        ESPN_CACHE.set(url, { data: json, expiresAt: now + ttlMs });
        return json;
      })
      .catch(err => {
        ESPN_CACHE.delete(url);
        throw err;
      });
    ESPN_CACHE.set(url, { promise, expiresAt: now + ttlMs });
    return promise;
  }

  // Helpers (identical to PlayerProfileCard)
  function normalizeLoose(str) {
    return String(str)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }
  function titleCase(s) {
    if (!s) return '';
    return String(s)
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, ch => ch.toUpperCase());
  }
  function getAthleteName(a) {
    return (
      a?.displayName ||
      a?.athlete?.displayName ||
      a?.athlete?.shortName ||
      a?.athlete?.fullName ||
      a?.athlete?.name ||
      null
    );
  }
  function getAthleteId(a) {
    return a?.athlete?.id ?? a?.id ?? null;
  }
  function normalizeGroupName(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '');
  }
  function desiredGroupsForPosition(pos) {
    const p = String(pos || '').toLowerCase();
    if (p.includes('qb')) return ['passing', 'rushing'];
    if (p.includes('rb')) return ['rushing', 'receiving'];
    if (p.includes('wr')) return ['receiving', 'rushing'];   // include both for WR
    if (p.includes('te')) return ['receiving', 'rushing'];   // include rush if it exists
    return null;
  }
  const NFL_FALLBACK_LABELS = {
    passing: ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACKS', 'QBR', 'RTG'],
    rushing: ['CAR', 'YDS', 'AVG', 'TD', 'LONG'],
    receiving: ['REC', 'YDS', 'AVG', 'TD', 'LONG'],
    fumbles: ['FUM', 'LOST'],
    defensive: ['TOT', 'SOLO', 'SACKS', 'TFL', 'PD', 'QB HITS', 'TD', 'INT'],
    kicking: ['FG', 'PCT', 'LONG', 'XP', 'PTS'],
    kickReturns: ['RET', 'YDS', 'AVG', 'LONG', 'TD'],
    puntReturns: ['RET', 'YDS', 'AVG', 'LONG', 'TD'],
    punts: ['NO', 'YDS', 'AVG', 'TB', 'IN20', 'LONG'],
  };
  function resolveStatHeaders(statGroup) {
    const labels = statGroup?.labels || statGroup?.headers;
    if (Array.isArray(labels) && labels.length) return labels;
    const key = (statGroup?.name || statGroup?.displayName || '').trim();
    if (!key) return [];
    const norm = key.replace(/\s+/g, '').toLowerCase();
    if (NFL_FALLBACK_LABELS[norm]) return NFL_FALLBACK_LABELS[norm];
    const low = key.toLowerCase();
    if (NFL_FALLBACK_LABELS[low]) return NFL_FALLBACK_LABELS[low];
    return [];
  }

  // Abbreviation aliases and team keyword fallback (fixes WAS/WSH, JAX/JAC, etc.)
  const TEAM_ABBR_ALIASES = {
    WSH: ['WSH', 'WAS', 'WFT'],
    WAS: ['WSH', 'WAS', 'WFT'],
    WFT: ['WSH', 'WAS', 'WFT'],
    JAX: ['JAX', 'JAC'],
    JAC: ['JAX', 'JAC'],
    LAR: ['LAR', 'LA'],
    LA: ['LAR', 'LA'],
    LAC: ['LAC', 'SD'],
    SD: ['LAC', 'SD'],
    LV: ['LV', 'OAK'],
    OAK: ['LV', 'OAK'],
    STL: ['STL', 'LAR'],
  };
  const TEAM_KEYWORDS = {
    WSH: ['washington', 'commanders'],
    WAS: ['washington', 'commanders'],
    WFT: ['washington', 'football'],
    JAX: ['jacksonville', 'jaguars'],
    JAC: ['jacksonville', 'jaguars'],
    LAR: ['los angeles', 'rams'],
    LA: ['los angeles', 'rams'],
    LAC: ['los angeles', 'chargers'],
    SD: ['san diego', 'chargers'],
    LV: ['las vegas', 'raiders'],
    OAK: ['oakland', 'raiders'],
  };
  function abbrVariants(abbr) {
    const u = String(abbr || '').toUpperCase();
    const list = TEAM_ABBR_ALIASES[u] || [u];
    return Array.from(new Set([u, ...list]));
  }
  function eventHasTeam(event, variants) {
    const comps = event?.competitions?.[0]?.competitors || [];
    return comps.some(c => {
      const cabbr = c?.team?.abbreviation?.toUpperCase();
      if (variants.includes(cabbr)) return true;
      const nameFields = [
        c?.team?.displayName,
        c?.team?.shortDisplayName,
        c?.team?.name,
        c?.team?.location,
        c?.team?.nickname
      ].filter(Boolean).join(' ');
      const normNames = normalizeLoose(nameFields);
      return variants.some(v => (TEAM_KEYWORDS[v] || []).some(kw => normNames.includes(normalizeLoose(kw))));
    });
  }

  // Game state helpers
  function formatKickoff(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const dow = d.toLocaleDateString(undefined, { weekday: 'short' }); // Sun
    const md = d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }); // 9/15
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); // 7:00 PM EDT
    return `${dow} ${md} - ${time}`;
  }

  function getGameStateFromEvent(event) {
    const status = event?.status || event?.competitions?.[0]?.status;
    const state = status?.type?.state?.toLowerCase?.() || '';
    const short = status?.type?.shortDetail || status?.shortDetail || status?.type?.detail || status?.detail || '';
    const period = status?.period;
    const clock = status?.displayClock;
    const kickoff = event?.date;

    let label = '';
    // Force our own pre-game label so weekday always shows
    if (state === 'pre') {
      label = `Kickoff ${formatKickoff(kickoff)}`;
    } else if (state === 'post') {
      label = 'Final';
    } else if (state === 'in') {
      label = `Q${period || ''} ${clock || ''}`.trim();
    } else {
      // Fallback to whatever ESPN provides if state unclear
      label = short || (kickoff ? `Kickoff ${formatKickoff(kickoff)}` : '');
    }

    return { state, label, period, clock, kickoff };
  }

  // Single loader we can call now and on an interval
  const load = async (silent = false, cancelledRef = { current: false }) => {
    if (!silent) setLoading(true);
    if (!playerName) {
      if (!silent) setLoading(false);
      return;
    }
    const contractName = normalizeLoose(playerName);

    try {
      // CHANGED: scoreboard cache TTL to 60s
      const scoreboardUrl = `/api/espn/scoreboard?seasontype=2${week ? `&week=${week}` : ''}`;
      const scoreboardJson = await fetchCachedJson(scoreboardUrl, 60000);
      if (!scoreboardJson?.ok) {
        if (!silent) setLoading(false);
        return;
      }
      const scoreboard = scoreboardJson.data;
      const allEvents = scoreboard?.events || [];
      let events = allEvents;

      if (nflTeam) {
        const variants = abbrVariants(nflTeam);
        const filtered = allEvents.filter(e => eventHasTeam(e, variants));
        // If we couldn't confidently filter, fall back to all events (so we still show something)
        events = filtered.length ? filtered : allEvents;
      }

      let found = false;
      let firstEventState = null;

      if (events.length > 0) {
        firstEventState = getGameStateFromEvent(events[0]);
      }

      for (const event of events.slice(0, 2)) {
        const eventId = event?.id;
        if (!eventId) continue;

        const gameState = getGameStateFromEvent(event);

        try {
          // CHANGED: summary cache TTL to 60s
          const summaryJson = await fetchCachedJson(`/api/espn/summary?event=${eventId}`, 60000);
          if (!summaryJson?.ok) continue;

          const summary = summaryJson.data;
          const playerBlocks = summary?.boxscore?.players || [];

          // REPLACE the whole matching block below
          for (const team of playerBlocks) {
            for (const statGroup of team?.statistics || []) {
              for (const a of statGroup?.athletes || []) {
                const rawName = getAthleteName(a);
                if (!rawName) continue;
                const apiName = normalizeLoose(rawName);

                if (apiName.includes(contractName) || contractName.includes(apiName)) {
                  const matchedAthleteId = getAthleteId(a);
                  const matchedNameNorm = normalizeLoose(rawName);

                  const wanted = desiredGroupsForPosition(position);
                  const groupsOut = [];
                  const added = new Set(); // de-dupe by group name

                  // Safe group collector
                  function addGroupRow(group) {
                    if (!group) return;
                    const keyNorm = normalizeGroupName(group?.name || group?.displayName || '');
                    if (keyNorm && added.has(keyNorm)) return;

                    const headers = resolveStatHeaders(group);
                    // Try to find the matched athlete's row inside this group
                    const athRow =
                      (group?.athletes || []).find(ga => {
                        const gaId = getAthleteId(ga);
                        const gaName = getAthleteName(ga);
                        const gaNorm = gaName ? normalizeLoose(gaName) : '';
                        return (matchedAthleteId && gaId && gaId === matchedAthleteId) ||
                               (!!gaNorm && gaNorm === matchedNameNorm);
                      }) || a;

                   

                    const rowStats = athRow?.stats || athRow?.statistics || [];
                    if (rowStats && rowStats.length) {
                      groupsOut.push({
                        statType: titleCase(group?.displayName || group?.name || 'Stats'),
                        headers,
                        stats: rowStats,
                      });
                      if (keyNorm) added.add(keyNorm);
                    }
                  }

                  if (Array.isArray(wanted) && wanted.length) {
                    // Collect only the groups we care about for this position
                    for (const wName of wanted) {
                      const g = (team?.statistics || []).find(sg =>
                        normalizeGroupName(sg?.name || sg?.displayName) === normalizeGroupName(wName)
                      );
                      addGroupRow(g);
                    }
                  } else {
                    // No explicit list: include all groups this athlete appears in
                    for (const g of (team?.statistics || [])) {
                      addGroupRow(g);
                    }
                  }

                  // Fallback: only add if the group is not already present and the group name matches a desired group
                                    if (
                    groupsOut.length === 0 &&
                    statGroup &&
                    !Array.isArray(wanted) &&
                    !groupsOut.some(g => normalizeGroupName(g.statType) === normalizeGroupName(statGroup?.name || statGroup?.displayName))
                  ) {
                    const rawStats = a?.stats || a?.statistics || [];
                    if (rawStats && rawStats.length) {
                      const headers = resolveStatHeaders(statGroup);
                      groupsOut.push({
                        statType: titleCase(statGroup?.displayName || statGroup?.name || 'Stats'),
                        headers,
                        stats: rawStats,
                      });
                    }
                  }

                  if (!cancelledRef.current) {
                    startTransition(() => {
                      setStats({
                        displayName: rawName,
                        groups: groupsOut,
                        game: gameState
                      });
                    });
                    if (typeof onGameStateChange === 'function') {
                      onGameStateChange(gameState?.state || null);
                    }
                  }
                  found = true;
                  break;
                }
              }
              if (found) break;
            }
            if (found) break;
          }
          if (found) break;
        } catch {
          // continue
        }
      }

      // Fallback: no stats found, but we still have a game for this team (pre-game, bye, etc.)
      if (!found) {
        if (!cancelledRef.current) {
          startTransition(() => {
            setStats({
              displayName: playerName,
              groups: [],
              game: firstEventState || null
            });
          });
          if (typeof onGameStateChange === 'function') {
            onGameStateChange(firstEventState?.state || null);
          }
        }
      }
    } catch {
      // ignore
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    const cancelledRef = { current: false };
    // Initial load
    load(false, cancelledRef);
    // Refresh every 60 seconds without flicker
    const id = setInterval(() => load(true, cancelledRef), 60000);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [playerName, position, nflTeam, week]);

  // CHANGED: render differently when only the label is requested (mobile collapsed)
  if (loading) {
    return showGroups
      ? <span className="text-xs text-white/40">Loading stats...</span>
      : <span className="text-xs text-white/40">Loading...</span>;
  }

  const statusColor =
    stats?.game?.state === 'in'
      ? 'text-green-400'
      : stats?.game?.state === 'post'
        ? 'text-red-400'
        : 'text-[#FF4B1F]';

  // NEW: label-only mode for mobile collapsed view
  if (!showGroups) {
    return (
      <div className={`mt-1 text-xs font-semibold ${statusColor}`}>
        {stats?.game?.label || 'No game'}
      </div>
    );
  }

  // Add missing helper for group styling
  function groupClasses(statType) {
    const t = String(statType || '').toLowerCase();
    if (t.includes('passing')) return 'bg-blue-900/30 border border-blue-500/20';
    if (t.includes('rushing')) return 'bg-green-900/30 border border-green-500/20';
    if (t.includes('receiving')) return 'bg-purple-900/30 border border-purple-500/20';
    if (t.includes('def') || t.includes('defense')) return 'bg-teal-900/30 border border-teal-500/20';
    if (t.includes('kick') || t.includes('punt')) return 'bg-yellow-900/20 border border-yellow-500/20';
    return 'bg-white/5 border border-white/10';
  }

  return (
    <div className="mt-1 text-xs text-white/80 space-y-1">
      {(stats?.groups || []).length > 0 && stats.groups.map((group, idx) => (
        <div key={idx} className={`whitespace-normal break-words rounded-md px-2 py-2 ${groupClasses(group.statType)}`}>
          <div className="font-semibold text-white leading-tight">{group.statType}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {group.headers.map((h, i) => (
              <div key={i} className="flex items-baseline">
                <span className="text-white/60 mr-1">{h}:</span>
                <span className="font-bold">{group.stats[i]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {stats?.game?.label && (
        <div className={`leading-tight ${statusColor}`}>
          {stats.game.label}
        </div>
      )}
    </div>
  );
}
//# sourceMappingURL=page.js.map
function AlignedStarters({
  leftTeam,
  rightTeam,
  playerInfoMap,
  selectedWeek,
  expandedPlayerId,
  setExpandedPlayerId,
  playerGameStates,
  setPlayerGameStates,
  isMobile
}) {
  const positions = ['QB', 'RB', 'WR', 'TE'];

  // Compact salary display -> currency with 1 decimal
  function formatSalaryShort(num, isDead) {
    const n = Number(num);
    if (!Number.isFinite(n) || n <= 0) return '';
    const formatted = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(n);
    return isDead ? `(${formatted})` : formatted;
  }

  // Build enriched starters
  function buildStarterObjects(team) {
    if (!team || !Array.isArray(team.starters)) return [];
    const pts = team.players_points || team.playersPoints || {};
    const proj = team.players_projected || team.playersProjected || {};
    return team.starters
      .filter(id => id && id !== '0')
      .map((id, idx) => {
        const info = playerInfoMap[id] || { id, name: id, position: '', nflTeam: '', teamDisplayName: '' };
        return {
          ...info,
          score: typeof pts[id] === 'number' ? pts[id] : null,
          projected: typeof proj[id] === 'number' ? proj[id] : null,
          order: idx,
        };
      });
  }

  function groupByPos(arr) {
    const out = {};
    for (const p of arr) {
      const pos = positions.includes(p.position) ? p.position : null;
      if (!pos) continue;
      (out[pos] ||= []).push(p);
    }
    Object.values(out).forEach(list => list.sort((a, b) => a.order - b.order));
    return out;
  }

  const leftStarters = useMemo(() => buildStarterObjects(leftTeam), [leftTeam, playerInfoMap]);
  const rightStarters = useMemo(() => buildStarterObjects(rightTeam), [rightTeam, playerInfoMap]);
  const leftGrouped = useMemo(() => groupByPos(leftStarters), [leftStarters]);
  const rightGrouped = useMemo(() => groupByPos(rightStarters), [rightStarters]);

  // Mobile: collapsible stats, default closed
  const [expandedStats, setExpandedStats] = useState({});
  function toggleStats(pid) {
    setExpandedStats(prev => ({ ...prev, [pid]: !prev[pid] }));
  }

  // Keep these small presentational blocks (desktop)
  function ScoreDesktop({ p }) {
    if (!p) return null;
    return (
      <div className="flex flex-col items-center mx-2 min-w-[60px]">
        <div className="text-sm font-bold text-white">
          {typeof p.score === 'number' ? p.score.toFixed(2) : '--'}
        </div>
        {typeof p.projected === 'number' && (
          <div className="text-[10px] text-white/50">P: {p.projected.toFixed(1)}</div>
        )}
      </div>
    );
  }

  function InfoDesktop({ p, side }) {
    if (!p) return null;
    return (
      <div className={`flex-1 px-2 ${side === 'left' ? 'text-left' : 'text-right'}`}>
        <button
          type="button"
          className="font-semibold text-white hover:underline text-sm"
          onClick={() => setExpandedPlayerId(p.id)}
          style={{
            fontSize: `clamp(0.85rem, ${Math.max(
              1.4 - (p.name?.length || 0) * 0.06,
              0.85
            )}rem, 1.1rem)`,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
            maxWidth: '100%',
          }}
          title={p.name}
        >
          {p.name}
        </button>
        <div className="text-[11px] text-white/50 mt-0.5">
          {p.position} {p.nflTeam || ''}
        </div>
        <div className="mt-1">
          <WeeklyStats
            playerName={p.name}
            position={p.position}
            nflTeam={p.nflTeam}
            week={selectedWeek}
            showGroups={true}
            onGameStateChange={(state) =>
              setPlayerGameStates(prev =>
                prev[p.id] === state ? prev : { ...prev, [p.id]: state }
              )
            }
          />
        </div>
      </div>
    );
  }

  // Memoized PlayerCell so other rows don't re-render when one "Show Stats" toggles
  const PlayerCell = React.memo(function PlayerCellInner({
    side,
    teamName,
    p,
    gs,
    isMobile,
    expanded,
    onToggle
  }) {
    // Effect only depends on the game state flag we pass
    const effectClass = useMemo(
      () => (gs === 'in' ? 'animate-swell' : gs === 'pre' ? 'grayscale' : ''),
      [gs]
    );

    // Guard against missing player
    const scoreText =
      typeof p?.score === 'number'
        ? p.score.toFixed(2)
        : (p?.nflTeam || p?.teamDisplayName || '--');

    // Memoize the card so it never rebuilds unless IDs or salary bits change
    const cardEl = useMemo(() => {
      if (!p) {
        // Placeholder when player is missing
        return (
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-md bg-white/5 border border-white/10" />
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => setExpandedPlayerId(p.id)}
            className={`rounded-md overflow-hidden ${effectClass} focus:outline-none focus:ring-2 focus:ring-[#FF4B1F] transition-transform`}
            title="Open player card"
          >
            <MemoPlayerProfileCard
              playerId={p.id}
              contracts={null}
              expanded={false}
              className="w-20 h-20"
              teamName={teamName}
            />
          </button>
          {formatSalaryShort(p.salary, p.isDeadCap) && (
            <div className="mt-1 text-[13px] leading-none text-white/80 text-center">
              {formatSalaryShort(p.salary, p.isDeadCap)}
            </div>
          )}
        </div>
      );
  }, [effectClass, p, teamName]);

    // After hooks are declared, it's now safe to early-return for missing player
    if (!p) {
      return <div className="bg-black/20 rounded px-2 py-2 min-h-[112px] border border-white/5" />;
    }

    if (isMobile) {
      return (
        <div className="bg-black/40 rounded px-2 py-2 text-xs">
          <div className="flex items-center justify-between">
            {side === 'left' ? (
              <>
                <span className="ml-2">{cardEl}</span>
                <span className="text-white font-extrabold text-base">{scoreText}</span>
              </>
            ) : (
              <>
                <span className="text-white font-extrabold text-base">{scoreText}</span>
                <span className="ml-2">{cardEl}</span>
              </>
            )}
          </div>
          <div className={`px-2 mt-2 ${side === 'left' ? 'text-left items-start' : 'text-right items-end'}`}>
            <button
              type="button"
              className="hover:underline text-white font-bold text-sm"
              onClick={() => setExpandedPlayerId(p.id)}
              style={{
                fontSize: `clamp(0.85rem, ${Math.max(
                  1.4 - (p.name?.length || 0) * 0.06,
                  0.85
                )}rem, 1.1rem)`,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block',
                maxWidth: '100%',
              }}
              title={p.name}
            >
              {p.name}
            </button>

            {/* Same WeeklyStats for mobile as desktop; only groups toggle */}
            <WeeklyStats
              playerName={p.name}
              position={p.position}
              nflTeam={p.nflTeam}
              week={selectedWeek}
              showGroups={expanded}
              onGameStateChange={(state) => {
                if (gs !== state) {
                  setPlayerGameStates(prev => ({ ...prev, [p.id]: state }));
                }
              }}
            />

            <div>
              {/* Only render Show Stats button if game state is not "kickoff" or "No game" */}
              {!(gs === 'pre' || gs === '' || gs === null) && (
                <button
                  type="button"
                  className="text-xs mt-1 px-2 py-1 rounded bg-[#FF4B1F]/20 text-[#FF4B1F] border border-[#FF4B1F]/40 hover:bg-[#FF4B1F]/30 transition"
                  onClick={onToggle}
                  aria-expanded={expanded}
                >
                  {expanded ? 'Hide Stats' : 'Show Stats'}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Desktop render
    return (
      <div className="flex items-stretch justify-between text-xs bg-black/40 rounded px-2 py-2 min-h-[112px]">
        {side === 'left' ? (
          <>
            <span className="ml-2">{cardEl}</span>
            <InfoDesktop p={p} side="left" />
            <ScoreDesktop p={p} />
          </>
        ) : (
          <>
            <ScoreDesktop p={p} />
            <InfoDesktop p={p} side="right" />
            <span className="ml-2">{cardEl}</span>
          </>
        )}
      </div>
    );
  }, (prev, next) => {
    // Only re-render if something visible changes
    return (
      prev.side === next.side &&
      prev.teamName === next.teamName &&
      prev.isMobile === next.isMobile &&
      prev.expanded === next.expanded &&
      prev.gs === next.gs &&
      // compare the minimal fields used in rendering
      prev.p?.id === next.p?.id &&
      prev.p?.name === next.p?.name &&
      prev.p?.position === next.p?.position &&
      prev.p?.nflTeam === next.p?.nflTeam &&
      prev.p?.salary === next.p?.salary &&
      prev.p?.isDeadCap === next.p?.isDeadCap &&
      prev.p?.score === next.p?.score &&
      prev.p?.projected === next.p?.projected
    );
  });

  return (
    <div className="space-y-4">
      {positions.map(pos => {
        const L = leftGrouped[pos] || [];
        const R = rightGrouped[pos] || [];
        const maxLen = Math.max(L.length, R.length);
        if (maxLen === 0) return null;

        const totalL = L.reduce((s, x) => s + (typeof x?.score === 'number' ? x.score : 0), 0);
        const totalR = R.reduce((s, x) => s + (typeof x?.score === 'number' ? x.score : 0), 0);

        return (
          <div key={pos} className="bg-black/20 rounded-lg p-2 border border-white/5">
            <div className="grid grid-cols-2 items-center mb-2">
              <div className="text-xs font-bold text-white/80">Total: {totalL.toFixed(2)}</div>
              <div className="text-xs font-bold text-white/80 text-right">Total: {totalR.toFixed(2)}</div>
              <div className="col-span-2 text-center font-extrabold text-xs tracking-wide text-[#FF4B1F] mt-1">{pos}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: maxLen }).map((_, i) => {
                const lp = L[i];
                const rp = R[i];
                const lExpanded = !!expandedStats[lp?.id];
                const rExpanded = !!expandedStats[rp?.id];
                const lGs = lp ? playerGameStates[lp.id] : undefined;
                const rGs = rp ? playerGameStates[rp.id] : undefined;

                return (
                  <React.Fragment key={i}>
                    <PlayerCell
                      side="left"
                      teamName={leftTeam.teamName}
                      p={lp}
                      gs={lGs}
                      isMobile={isMobile}
                      expanded={lExpanded}
                      onToggle={() => lp && toggleStats(lp.id)}
                    />
                    <PlayerCell
                      side="right"
                      teamName={rightTeam.teamName}
                      p={rp}
                      gs={rGs}
                      isMobile={isMobile}
                      expanded={rExpanded}
                      onToggle={() => rp && toggleStats(rp.id)}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
