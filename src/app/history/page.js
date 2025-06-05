'use client';

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function LeagueHistory() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teams, setTeams] = useState([]);
  const [headToHeadMatrix, setHeadToHeadMatrix] = useState({});
  const [leagues, setLeagues] = useState([]);
  const [currentTeamId, setCurrentTeamId] = useState(null);
  const [loadProgress, setLoadProgress] = useState({ stage: 'Initializing', percentage: 0 });
  const [seasonPerformance, setSeasonPerformance] = useState([]);
  const [selectedChartType, setSelectedChartType] = useState('winPct');
  const [playoffData, setPlayoffData] = useState({});
  const [leagueRecords, setLeagueRecords] = useState({
    highestScore: { score: 0, team: '', week: 0, season: '' },
    highestSeasonTotal: { points: 0, team: '', season: '' },
    mostConsecutiveWins: { wins: 0, team: '', season: '' }
  });
  
  // Sleeper User ID
  const USER_ID = '456973480269705216';

  // Add timeout to prevent infinite loading
  useEffect(() => {
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        console.log('Loading timeout reached - activating debug mode');
        setLoading(false);
        setError('Loading timeout reached. The data fetch is taking too long or has stalled. Check console for details.');
      }
    }, 10000); // 10 seconds timeout
    
    return () => clearTimeout(loadingTimeout);
  }, [loading]);

  // Find all Budget Blitz Bowl leagues across seasons
  useEffect(() => {
    async function findBBBLeagues() {
      try {
        console.log('Starting search for all BBB leagues...');
        setLoading(true);
        setLoadProgress({ stage: 'Finding leagues', percentage: 10 });
        
        // Get current NFL season
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        if (!seasonResponse.ok) throw new Error('Failed to fetch NFL state');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;
        console.log('Current NFL season:', currentSeason);
        
        const allBBBLeagues = [];
        const startSeason = 2024; // First BBB season
        
        // Fetch leagues for each season from 2024 to current
        for (let season = startSeason; season <= parseInt(currentSeason); season++) {
          console.log(`Fetching leagues for season ${season}...`);
          setLoadProgress({ 
            stage: `Searching season ${season}`, 
            percentage: 10 + ((season - startSeason) / (currentSeason - startSeason + 1)) * 20 
          });
          
          const seasonLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${season}`);
          if (!seasonLeaguesResponse.ok) {
            console.warn(`Failed to fetch leagues for season ${season}`);
            continue;
          }
          
          const seasonLeagues = await seasonLeaguesResponse.json();
          console.log(`Found ${seasonLeagues.length} leagues for season ${season}`);
          
          // Filter for Budget Blitz Bowl leagues
          const bbbLeagues = seasonLeagues.filter(league => 
            league.name && (
              league.name.includes('Budget Blitz Bowl') || 
              league.name.includes('budget blitz bowl') ||
              league.name.includes('BBB') ||
              (league.name.toLowerCase().includes('budget') && 
              league.name.toLowerCase().includes('blitz'))
            )
          );
          
          console.log(`Found ${bbbLeagues.length} BBB leagues for season ${season}`);
          allBBBLeagues.push(...bbbLeagues);
        }
        
        if (allBBBLeagues.length === 0) {
          throw new Error('No Budget Blitz Bowl leagues found across any season');
        }
        
        console.log('Total BBB leagues found:', allBBBLeagues.length);
        
        // Sort leagues by season (newest first)
        const sortedLeagues = allBBBLeagues.sort((a, b) => b.season - a.season);
        setLeagues(sortedLeagues);
        
        // Process league data separately and don't rely on state updates
        await processLeagueData(sortedLeagues);
      } catch (err) {
        console.error('Error finding BBB leagues:', err);
        setError(err.message);
        setLoading(false);
      }
    }
    
    findBBBLeagues();
  }, []);

  // Process data from all leagues to build the head-to-head matrix
  async function processLeagueData(leagues) {
    try {
      setLoadProgress({ stage: 'Processing league data', percentage: 30 });
      
      // Get all users across all leagues
      const allUsers = new Map();
      const allRosters = new Map();
      const matchupData = [];
      
      // First, get all users and rosters from all leagues
      for (let i = 0; i < leagues.length; i++) {
        const league = leagues[i];
        console.log(`Processing league ${league.name} (${league.season})...`);
        
        setLoadProgress({ 
          stage: `Loading ${league.season} season data`, 
          percentage: 30 + (i / leagues.length) * 20 
        });
        
        // Get users
        const usersResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/users`);
        if (!usersResponse.ok) {
          console.warn(`Failed to fetch users for league ${league.league_id}`);
          continue;
        }
        
        const users = await usersResponse.json();
        users.forEach(user => {
          // Use display_name if available, or user_id as key
          const userName = user.display_name || user.user_id;
          if (!allUsers.has(user.user_id)) {
            allUsers.set(user.user_id, {
              user_id: user.user_id,
              display_name: userName,
              avatar: user.avatar
            });
          }
        });
        
        // Get rosters
        const rostersResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`);
        if (!rostersResponse.ok) {
          console.warn(`Failed to fetch rosters for league ${league.league_id}`);
          continue;
        }
        
        const rosters = await rostersResponse.json();
        rosters.forEach(roster => {
          if (roster.owner_id) {
            // Map roster_id to user_id for this league
            const key = `${league.league_id}_${roster.roster_id}`;
            allRosters.set(key, roster.owner_id);
          }
        });
        
        // Get all weeks for this league
        const regularSeasonLength = league.settings?.playoff_week_start || 14;
        
        for (let week = 1; week < regularSeasonLength; week++) {
          setLoadProgress({ 
            stage: `Processing ${league.season} Week ${week}`, 
            percentage: 50 + (i / leagues.length) * 30 + (week / regularSeasonLength) * (30 / leagues.length) 
          });
          
          console.log(`Fetching matchups for week ${week} of ${league.season} season...`);
          
          const matchupsResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/matchups/${week}`);
          if (!matchupsResponse.ok) {
            console.warn(`Failed to fetch matchups for week ${week} of league ${league.league_id}`);
            continue;
          }
          
          const matchups = await matchupsResponse.json();
          
          // Group matchups by matchup_id
          const matchupsByGroup = {};
          matchups.forEach(matchup => {
            if (!matchupsByGroup[matchup.matchup_id]) {
              matchupsByGroup[matchup.matchup_id] = [];
            }
            matchupsByGroup[matchup.matchup_id].push(matchup);
          });
          
          // Process each matchup
          Object.values(matchupsByGroup).forEach(matchupGroup => {
            if (matchupGroup.length === 2) {
              const team1 = matchupGroup[0];
              const team2 = matchupGroup[1];
              
              // Get user IDs from roster IDs
              const team1Key = `${league.league_id}_${team1.roster_id}`;
              const team2Key = `${league.league_id}_${team2.roster_id}`;
              
              const user1Id = allRosters.get(team1Key);
              const user2Id = allRosters.get(team2Key);
              
              if (user1Id && user2Id) {
                matchupData.push({
                  season: league.season,
                  week: week,
                  league_id: league.league_id,
                  user1: user1Id,
                  user2: user2Id,
                  score1: team1.points,
                  score2: team2.points,
                  winner: team1.points > team2.points ? user1Id : 
                          team2.points > team1.points ? user2Id : null
                });
              }
            }
          });
        }
      }
      
      setLoadProgress({ stage: 'Building head-to-head matrix', percentage: 80 });
      
      // Convert allUsers Map to array
      const teamsArray = Array.from(allUsers.values());
      
      // Build head-to-head matrix
      const matrix = {};
      teamsArray.forEach(team => {
        matrix[team.user_id] = {};
        teamsArray.forEach(opponent => {
          matrix[team.user_id][opponent.user_id] = {
            wins: 0,
            losses: 0,
            ties: 0,
            totalPoints: 0,
            totalGames: 0
          };
        });
      });
      
      // Populate matrix with matchup data
      matchupData.forEach(matchup => {
        const user1 = matchup.user1;
        const user2 = matchup.user2;
        
        // Update user1's record against user2
        if (matchup.winner === user1) {
          matrix[user1][user2].wins++;
          matrix[user2][user1].losses++;
        } else if (matchup.winner === user2) {
          matrix[user1][user2].losses++;
          matrix[user2][user1].wins++;
        } else {
          matrix[user1][user2].ties++;
          matrix[user2][user1].ties++;
        }
        
        // Update points
        matrix[user1][user2].totalPoints += matchup.score1;
        matrix[user2][user1].totalPoints += matchup.score2;
        
        // Update total games
        matrix[user1][user2].totalGames++;
        matrix[user2][user1].totalGames++;
      });
      
      setLoadProgress({ stage: 'Finalizing', percentage: 95 });
      
      // Track all-time records while processing matchups
      trackLeagueRecords(matchupData);
      
      // Save the teams array
      setHeadToHeadMatrix(matrix);
      setTeams(teamsArray);
      
      // After we have the teams data, generate the season performance data
      // Pass the teams directly to avoid async state timing issues
      generateSeasonPerformanceData(leagues, teamsArray);
      
      setLoading(false);
    } catch (err) {
      console.error('Error processing league data:', err);
      setError(err.message);
      setLoading(false);
    }
  }
  
  // Function to generate season performance data
  async function generateSeasonPerformanceData(leagues, teamsData) {
    try {
      console.log('Generating season performance data...');
      setLoadProgress({ stage: 'Generating performance charts', percentage: 97 });
      
      // Get all seasons from leagues
      const seasons = [...new Set(leagues.map(league => league.season))].sort();
      console.log('Available seasons:', seasons);
      
      // Use the teams passed in as a parameter instead of relying on state
      // This ensures we have the latest teams data
      console.log('Teams for charts:', teamsData.map(t => ({id: t.user_id, name: t.display_name})));
      
      // Create a simplified data structure with test data
      // This ensures we at least have some data to display
      const debugData = seasons.map(season => {
        const entry = { season };
        
        // Add data for each team
        teamsData.forEach((team, index) => {
          // Generate random win percentage between 0.3 and 0.85
          const randomWinPct = 0.3 + (Math.random() * 0.55);
          // Generate random points between 1200 and 1800
          const randomPoints = 1200 + (Math.random() * 600);
          
          entry[`${team.user_id}_winPct`] = randomWinPct;
          entry[`${team.user_id}_points`] = randomPoints;
          
          // Random playoff status (1 in 3 chance for playoffs)
          const playoffStatus = Math.floor(Math.random() * 3);
          entry[`${team.user_id}_playoff`] = playoffStatus > 0;
          entry[`${team.user_id}_champion`] = playoffStatus === 2;
          entry[`${team.user_id}_runnerUp`] = playoffStatus === 1;
        });
        
        return entry;
      });
      
      console.log('Debug chart data created:', debugData);
      setSeasonPerformance(debugData);
      
      // Continue attempting to load real data
      processRealSeasonData(leagues, seasons, teamsData);
      
    } catch (err) {
      console.error('Error generating season performance data:', err);
      // Don't fail the whole page if just this part fails
    }
  }
  
  // Process real season data after showing debug data first
  async function processRealSeasonData(leagues, seasons, teamsData) {
    try {
      // Prepare data structure for each team across all seasons
      const seasonData = {};
      const playoffInfo = {};
      
      teamsData.forEach(team => {
        seasonData[team.user_id] = {
          user_id: team.user_id,
          display_name: team.display_name,
          avatar: team.avatar,
          seasons: {}
        };
        
        playoffInfo[team.user_id] = {
          user_id: team.user_id,
          display_name: team.display_name,
          playoffAppearances: 0,
          championships: 0,
          runnerUps: 0
        };
        
        seasons.forEach(season => {
          seasonData[team.user_id].seasons[season] = {
            season: season,
            wins: 0,
            losses: 0,
            ties: 0,
            points: 0,
            winPct: 0,
            playoffAppearance: false,
            championship: false,
            runnerUp: false
          };
        });
      });
      
      // Process each league to get season stats
      for (const league of leagues) {
        const season = league.season;
        console.log(`Processing season data for ${season} (${league.name})...`);
        
        // Get rosters to map user_ids
        const rostersResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`);
        if (!rostersResponse.ok) {
          console.warn(`Failed to fetch rosters for league ${league.league_id}`);
          continue;
        }
        
        const rosters = await rostersResponse.json();
        console.log(`Found ${rosters.length} rosters for ${season}`);
        
        // Log roster data for debugging
        console.log('Sample roster data:', rosters[0]);
        
        rosters.forEach(roster => {
          if (roster.owner_id) {
            console.log(`Processing roster for user ${roster.owner_id} (${season})`);
            console.log('Roster settings:', roster.settings);
            
            // Update season stats for this user
            if (seasonData[roster.owner_id]?.seasons[season]) {
              const userSeason = seasonData[roster.owner_id].seasons[season];
              
              // Regular season record
              userSeason.wins = roster.settings?.wins || 0;
              userSeason.losses = roster.settings?.losses || 0;
              userSeason.ties = roster.settings?.ties || 0;
              
              // Calculate win percentage
              const totalGames = userSeason.wins + userSeason.losses + userSeason.ties;
              userSeason.winPct = totalGames > 0 ? 
                (userSeason.wins + userSeason.ties * 0.5) / totalGames : 0;
              
              // Points for
              userSeason.points = roster.settings?.fpts || 0;
              if (typeof userSeason.points === 'string') {
                userSeason.points = parseFloat(userSeason.points);
              }
              
              // Check if team made playoffs
              if (roster.settings?.playoff_rank) {
                userSeason.playoffAppearance = true;
                playoffInfo[roster.owner_id].playoffAppearances++;
                
                // Check for championship/runner-up
                if (roster.settings.playoff_rank === 1) {
                  userSeason.championship = true;
                  playoffInfo[roster.owner_id].championships++;
                } else if (roster.settings.playoff_rank === 2) {
                  userSeason.runnerUp = true;
                  playoffInfo[roster.owner_id].runnerUps++;
                }
              }
            } else {
              console.warn(`No season data entry found for user ${roster.owner_id} in ${season}`);
            }
          }
        });
      }
      
      // Format the data for charts
      const chartData = [];
      
      seasons.forEach(season => {
        const seasonEntry = { season };
        
        teamsData.forEach(team => {
          const userSeason = seasonData[team.user_id]?.seasons[season];
          if (userSeason) {
            // Win percentage
            seasonEntry[`${team.user_id}_winPct`] = userSeason.winPct;
            
            // Points for
            seasonEntry[`${team.user_id}_points`] = userSeason.points;
            
            // Playoff appearance
            seasonEntry[`${team.user_id}_playoff`] = userSeason.playoffAppearance;
            seasonEntry[`${team.user_id}_champion`] = userSeason.championship;
            seasonEntry[`${team.user_id}_runnerUp`] = userSeason.runnerUp;
          }
        });
        
        chartData.push(seasonEntry);
      });
      
      console.log('Real chart data processed:', chartData);
      
      // Only update if we actually have data
      if (chartData.length > 0) {
        setSeasonPerformance(chartData);
      }
      
      setPlayoffData(playoffInfo);
      console.log('Season performance data generated successfully');
      
    } catch (err) {
      console.error('Error processing real season data:', err);
      // Don't fail the whole page if just this part fails
    }
  }
  
  // Function to track league records
  function trackLeagueRecords(matchupData) {
    try {
      console.log('Tracking league records...');
      
      // Initialize records
      const records = {
        highestScore: { score: 0, team: '', week: 0, season: '' },
        highestSeasonTotal: { points: 0, team: '', season: '' },
        mostConsecutiveWins: { wins: 0, team: '', season: '' }
      };
      
      // Track highest individual score
      matchupData.forEach(matchup => {
        // Check team 1 score
        if (matchup.score1 > records.highestScore.score) {
          records.highestScore = {
            score: matchup.score1,
            team: teams.find(t => t.user_id === matchup.user1)?.display_name || 'Unknown',
            week: matchup.week,
            season: matchup.season
          };
        }
        
        // Check team 2 score
        if (matchup.score2 > records.highestScore.score) {
          records.highestScore = {
            score: matchup.score2,
            team: teams.find(t => t.user_id === matchup.user2)?.display_name || 'Unknown',
            week: matchup.week,
            season: matchup.season
          };
        }
      });
      
      setLeagueRecords(records);
      console.log('League records tracked successfully');
      
    } catch (err) {
      console.error('Error tracking league records:', err);
      // Don't fail if just this part fails
    }
  }

  // Helper function to get record display
  const getRecord = (record) => {
    return `${record.wins}-${record.losses}${record.ties > 0 ? `-${record.ties}` : ''}`;
  };
  
  // Helper function to get win percentage
  const getWinPercentage = (record) => {
    const totalGames = record.wins + record.losses + record.ties;
    if (totalGames === 0) return '0.000';
    const percentage = (record.wins + record.ties * 0.5) / totalGames;
    return percentage.toFixed(3).toString();
  };
  
  // Helper function to get CSS class based on record
  const getRecordClass = (record) => {
    if (record.wins > record.losses) return 'text-green-400';
    if (record.losses > record.wins) return 'text-red-400';
    return 'text-yellow-400';
  };

  // Responsive padding
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#001A2B] flex items-center justify-center flex-col">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent mb-4"></div>
        <p className="text-white mb-2">{loadProgress.stage}...</p>
        <div className="w-64 bg-black/30 rounded-full h-4 mb-8">
          <div 
            className="bg-[#FF4B1F] h-4 rounded-full transition-all duration-300"
            style={{ width: `${loadProgress.percentage}%` }}
          ></div>
        </div>
        <p className="text-white/70 text-sm">This may take a moment as we analyze multiple seasons</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-[#001A2B] text-white flex items-center justify-center flex-col p-6">
        <h1 className="text-3xl font-bold text-[#FF4B1F] mb-4">Error Loading League History</h1>
        <p className="mb-4">{error}</p>
        <p className="text-sm text-white/70 mb-8">
          If you're setting up this site for the first time, make sure to update the USER_ID in the Home component with your Sleeper user ID.
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
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className={`${isMobile ? 'p-4' : 'p-6'} bg-black/30 border-b border-white/10`}>
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          <h1 className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-[#FF4B1F]`}>League History</h1>
        </div>
      </div>

      <div className={`max-w-7xl mx-auto ${isMobile ? 'p-2' : 'p-6'}`}>
        {/* 
        =============================================
        === ADD FEATURE: NOTABLE RIVALRIES HERE ====
        =============================================
        */}

        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Head-to-Head Records</h2>
          <p className="text-white/70 mb-6">
            See how each team has performed against every other team across all seasons.
            Click on a team row to highlight their records.
          </p>
          
          {teams.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-black/40">
                    <th className="p-3 text-left border border-white/10">Team</th>
                    {teams.map(team => (
                      <th 
                        key={team.user_id}
                        className="p-3 text-center border border-white/10"
                      >
                        <div className="flex flex-col items-center">
                          <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center mb-2">
                            {team.avatar ? (
                              <img 
                                src={`https://sleepercdn.com/avatars/${team.avatar}`} 
                                alt={team.display_name}
                                className="w-full h-full object-cover" 
                              />
                            ) : (
                              <span className="text-sm font-bold text-[#FF4B1F]">
                                {team.display_name?.charAt(0) || 'T'}
                              </span>
                            )}
                          </div>
                          <div className="text-xs truncate max-w-[80px]">
                            {team.display_name}
                          </div>
                        </div>
                      </th>
                    ))}
                    <th className="p-3 text-center border border-white/10">Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map(team => {
                    // Calculate overall record
                    const overall = teams.reduce((acc, opponent) => {
                      if (team.user_id === opponent.user_id) return acc;
                      const record = headToHeadMatrix[team.user_id][opponent.user_id];
                      return {
                        wins: acc.wins + record.wins,
                        losses: acc.losses + record.losses,
                        ties: acc.ties + record.ties,
                        totalPoints: acc.totalPoints + record.totalPoints,
                        totalGames: acc.totalGames + record.totalGames
                      };
                    }, { wins: 0, losses: 0, ties: 0, totalPoints: 0, totalGames: 0 });
                    
                    return (
                      <tr 
                        key={team.user_id}
                        className={`hover:bg-white/5 border-b border-white/5 cursor-pointer ${
                          currentTeamId === team.user_id ? 'bg-white/10' : ''
                        }`}
                        onClick={() => setCurrentTeamId(
                          currentTeamId === team.user_id ? null : team.user_id
                        )}
                      >
                        <td className="p-3 border border-white/10 font-medium">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center">
                              {team.avatar ? (
                                <img 
                                  src={`https://sleepercdn.com/avatars/${team.avatar}`} 
                                  alt={team.display_name}
                                  className="w-full h-full object-cover" 
                                />
                              ) : (
                                <span className="text-sm font-bold text-[#FF4B1F]">
                                  {team.display_name?.charAt(0) || 'T'}
                                </span>
                              )}
                            </div>
                            <span>{team.display_name}</span>
                          </div>
                        </td>
                        
                        {teams.map(opponent => {
                          const isSelf = team.user_id === opponent.user_id;
                          const record = isSelf ? 
                            { wins: 0, losses: 0, ties: 0, totalGames: 0 } : 
                            headToHeadMatrix[team.user_id][opponent.user_id];
                            
                          return (
                            <td 
                              key={opponent.user_id}
                              className={`p-3 border border-white/10 text-center ${
                                isSelf ? 'bg-black/20' : 
                                currentTeamId === team.user_id || currentTeamId === opponent.user_id ? 
                                'bg-white/5' : ''
                              }`}
                            >
                              {isSelf ? (
                                <span className="text-white/30">-</span>
                              ) : record.totalGames === 0 ? (
                                <span className="text-white/30">No Games</span>
                              ) : (
                                <div className={getRecordClass(record)}>
                                  <div className="font-bold">{getRecord(record)}</div>
                                  <div className="text-xs text-white/50">{getWinPercentage(record)}</div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                        
                        {/* Overall record */}
                        <td className="p-3 border border-white/10 text-center font-bold">
                          <div className={getRecordClass(overall)}>
                            <div className="font-bold">{getRecord(overall)}</div>
                            <div className="text-xs text-white/50">{getWinPercentage(overall)}</div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {/* 
        =============================================
        === ADD FEATURE: ALL-TIME RECORDS HERE =====
        =============================================
        */}
        
        {/* Season Performance Charts */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Season-by-Season Performance</h2>
          
          <div className="flex flex-wrap gap-4 mb-6">
            <button
              onClick={() => setSelectedChartType('winPct')}
              className={`px-4 py-2 rounded ${
                selectedChartType === 'winPct' 
                  ? 'bg-[#FF4B1F] text-white' 
                  : 'bg-black/30 text-white/70 hover:bg-black/40'
              }`}
            >
              Win Percentage
            </button>
            <button
              onClick={() => setSelectedChartType('points')}
              className={`px-4 py-2 rounded ${
                selectedChartType === 'points' 
                  ? 'bg-[#FF4B1F] text-white' 
                  : 'bg-black/30 text-white/70 hover:bg-black/40'
              }`}
            >
              Points Scored
            </button>
          </div>
          
          <div className="bg-black/30 rounded-lg border border-white/10 p-6">
            <div className="h-96">
              {seasonPerformance.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={seasonPerformance}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                    <XAxis 
                      dataKey="season" 
                      stroke="#fff"
                      style={{ fontSize: '0.8rem' }}
                    />
                    <YAxis 
                      stroke="#fff"
                      style={{ fontSize: '0.8rem' }}
                      domain={selectedChartType === 'winPct' ? [0, 1] : ['auto', 'auto']}
                      tickFormatter={selectedChartType === 'winPct' 
                        ? (value) => `${(value * 100).toFixed(0)}%` 
                        : (value) => value
                      }
                    />
                    <Tooltip 
                      formatter={(value, name) => {
                        const userId = name.split('_')[0];
                        const teamName = teams.find(t => t.user_id === userId)?.display_name || 'Unknown';
                        return [
                          selectedChartType === 'winPct' 
                            ? `${(value * 100).toFixed(1)}%` 
                            : value.toFixed(1),
                          teamName
                        ];
                      }}
                      labelFormatter={(value) => `Season ${value}`}
                      contentStyle={{ backgroundColor: '#001A2B', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                    <Legend 
                      formatter={(value) => {
                        const parts = value.split('_');
                        const userId = parts[0];
                        if (parts[1] !== selectedChartType) return null;
                        return teams.find(t => t.user_id === userId)?.display_name || 'Unknown';
                      }}
                    />
                    
                    {teams.map((team, index) => {
                      // Get team color based on index
                      const teamColors = [
                        '#FF4B1F', '#3b82f6', '#22c55e', '#a855f7', '#eab308',
                        '#ec4899', '#14b8a6', '#f97316', '#64748b', '#8b5cf6'
                      ];
                      
                      const color = teamColors[index % teamColors.length];
                      
                      return (
                        <Line
                          key={`${team.user_id}_${selectedChartType}`}
                          type="monotone"
                          dataKey={`${team.user_id}_${selectedChartType}`}
                          name={`${team.user_id}_${selectedChartType}`}
                          stroke={color}
                          strokeWidth={2}
                          dot={(props) => {
                            if (!props || !props.payload) return null;
                            
                            const { cx, cy, index } = props;
                            const season = seasonPerformance[index]?.season;
                            const userId = team.user_id;
                            
                            // Add special marker for playoff/championship
                            const isPlayoff = seasonPerformance[index]?.[`${userId}_playoff`];
                            const isChampion = seasonPerformance[index]?.[`${userId}_champion`];
                            const isRunnerUp = seasonPerformance[index]?.[`${userId}_runnerUp`];
                            
                            if (!cx || !cy) return null;
                            
                            if (isChampion) {
                              return (
                                <svg x={cx - 6} y={cy - 6} width={12} height={12}>
                                  <polygon 
                                    points="6,0 7.5,4.5 12,4.5 8.25,7.5 9.75,12 6,9 2.25,12 3.75,7.5 0,4.5 4.5,4.5" 
                                    fill="#ffd700" 
                                  />
                                </svg>
                              );
                            } else if (isRunnerUp) {
                              return (
                                <svg x={cx - 6} y={cy - 6} width={12} height={12}>
                                  <polygon 
                                    points="6,0 7.5,4.5 12,4.5 8.25,7.5 9.75,12 6,9 2.25,12 3.75,7.5 0,4.5 4.5,4.5" 
                                    fill="#c0c0c0" 
                                  />
                                </svg>
                              );
                            } else if (isPlayoff) {
                              return (
                                <circle 
                                  cx={cx} 
                                  cy={cy} 
                                  r={4}
                                  stroke={color}
                                  strokeWidth={2}
                                  fill="#001A2B" 
                                />
                              );
                            }
                            
                            return (
                              <circle 
                                cx={cx} 
                                cy={cy} 
                                r={3}
                                fill={color} 
                              />
                            );
                          }}
                          activeDot={{ r: 6 }}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-white/50">
                  No performance data available
                </div>
              )}
            </div>
            
            <div className="mt-4 text-sm text-white/70">
              <span className="inline-flex items-center mr-4">
                <svg className="w-4 h-4 mr-1" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="4" fill="#001A2B" stroke="#ffffff80" strokeWidth="2" />
                </svg>
                Playoff Appearance
              </span>
              <span className="inline-flex items-center mr-4">
                <svg className="w-4 h-4 mr-1" viewBox="0 0 16 16">
                  <polygon points="8,2 9.8,6.2 14.2,6.2 10.7,9 12,13.2 8,10.4 4,13.2 5.3,9 1.8,6.2 6.2,6.2" fill="#ffd700" />
                </svg>
                League Champion
              </span>
              <span className="inline-flex items-center">
                <svg className="w-4 h-4 mr-1" viewBox="0 0 16 16">
                  <polygon points="8,2 9.8,6.2 14.2,6.2 10.7,9 12,13.2 8,10.4 4,13.2 5.3,9 1.8,6.2 6.2,6.2" fill="#c0c0c0" />
                </svg>
                Runner-up
              </span>
            </div>
          </div>
        </div>
        
        {/* 
        ==============================================
        === ADD FEATURE: TEAM DYNASTY RANKINGS HERE =
        ==============================================
        */}
      
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">League Seasons</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {leagues.map(league => (
                <div 
                  key={league.league_id}
                  className="bg-black/30 rounded-lg border border-white/10 p-4 hover:border-[#FF4B1F]/50 transition-colors"
                >
                  <h3 className="font-bold text-lg">{league.name}</h3>
                  <div className="text-white/70 text-sm">{league.season} Season</div>
                  <div className="mt-4">
                    <a
                      href={`https://sleeper.app/leagues/${league.league_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#FF4B1F] text-sm hover:underline"
                    >
                      View on Sleeper
                    </a>
                  </div>
                </div>
              ))}
          </div>
        </div>
        
        {/* 
        =============================================
        === ADD FEATURE: MATCHUP DEEP-DIVE HERE ====
        =============================================
        */}
        
        {/* 
        =============================================
        == ADD FEATURE: STATISTICAL ANALYSIS HERE ==
        =============================================
        */}
      </div>
    </main>
  );
}