'use client';

import React, { useState, useEffect, useMemo } from 'react';
// Removed Recharts import as the Season-by-Season Performance chart section was removed
import Image from 'next/image'; // Add this import
import dynamic from 'next/dynamic';

const BarChartRace = dynamic(() => import('@/components/history/BarChartRace'), { ssr: false });

export default function LeagueHistory() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teams, setTeams] = useState([]);
  const [headToHeadMatrix, setHeadToHeadMatrix] = useState({});
  const [leagues, setLeagues] = useState([]);
  const [currentTeamId, setCurrentTeamId] = useState(null);
  const [loadProgress, setLoadProgress] = useState({ stage: 'Initializing', percentage: 0 });
  const [seasonPerformance, setSeasonPerformance] = useState([]);
  // Removed selectedChartType and playoffData state as we removed the performance chart section
  const [leagueRecords, setLeagueRecords] = useState({
    highestScore: { score: 0, team: '', week: 0, season: '' },
    highestSeasonTotal: { points: 0, team: '', season: '' },
    mostConsecutiveWins: { wins: 0, team: '', season: '' }
  });
  const [selectedMatchup, setSelectedMatchup] = useState(null); // { teamId, opponentId }
  const [matchupList, setMatchupList] = useState([]); // Array of matchup objects
  const [weeklyFrames, setWeeklyFrames] = useState([]); // For weekly bar chart race

  // Add toggles for regular season and playoffs
  const [showRegular, setShowRegular] = useState(true);
  const [showPlayoffs, setShowPlayoffs] = useState(true);
  // Add a third toggle for Consolation
  const [showConsolation, setShowConsolation] = useState(true);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Process data from all leagues to build the head-to-head matrix
  async function processLeagueData(leagues) {
    try {
      setLoadProgress({ stage: 'Processing league data', percentage: 30 });

      // Fetch current NFL state for filtering
      const nflStateResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
      const nflState = await nflStateResponse.json();
      const currentSeason = parseInt(nflState.season);
      const currentWeek = parseInt(nflState.week);

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

        // Fetch brackets ONCE per league
        let winnersBracket = [];
        let losersBracket = [];
        try {
          const winnersBracketRes = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/winners_bracket`);
          if (winnersBracketRes.ok) winnersBracket = await winnersBracketRes.json();
        } catch {}
        try {
          const losersBracketRes = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/losers_bracket`);
          if (losersBracketRes.ok) losersBracket = await losersBracketRes.json();
        } catch {}

        // After fetching winnersBracket and losersBracket
        console.log('Winners Bracket:', winnersBracket);
        console.log('Losers Bracket:', losersBracket);

        // Helper for bracket type
        function getBracketTypeForMatchup(roster1, roster2, week, playoffStartWeek) {
          const r1 = Number(roster1);
          const r2 = Number(roster2);
          const w = Number(week);

          // Map NFL week to bracket round
          const round = playoffStartWeek ? w - Number(playoffStartWeek) + 1 : null;
          if (!round || round < 1) return null;

          // Check winners bracket
          if (winnersBracket.some(m =>
            (Number(m.t1) === r1 && Number(m.t2) === r2 && Number(m.r) === round) ||
            (Number(m.t1) === r2 && Number(m.t2) === r1 && Number(m.r) === round)
          )) {
            console.log(`Winners bracket match: ${r1} vs ${r2} week ${w} (round ${round})`);
            return 'winners';
          }

          // Check losers bracket
          if (losersBracket.some(m =>
            (Number(m.t1) === r1 && Number(m.t2) === r2 && Number(m.r) === round) ||
            (Number(m.t1) === r2 && Number(m.t2) === r1 && Number(m.r) === round)
          )) {
            console.log(`Consolation bracket match: ${r1} vs ${r2} week ${w} (round ${round})`);
            return 'consolation';
          }

          return null;
        }

        // We'll try up to week 18 (NFL max), but stop if no matchups are found
        const MAX_WEEKS = 18;
        for (let week = 1; week <= MAX_WEEKS; week++) {
          // Exclude current and future weeks in the current season
          if (
            parseInt(league.season) === currentSeason &&
            week >= currentWeek
          ) {
            continue;
          }

          setLoadProgress({ 
            stage: `Processing ${league.season} Week ${week}`, 
            percentage: 50 + (i / leagues.length) * 30 + (week / MAX_WEEKS) * (30 / leagues.length) 
          });

          const matchupsResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/matchups/${week}`);
          if (!matchupsResponse.ok) {
            console.warn(`Failed to fetch matchups for week ${week} of league ${league.league_id}`);
            continue;
          }

          const matchups = await matchupsResponse.json();
          if (!matchups || matchups.length === 0) {
            // No more matchups for this league/season
            break;
          }
          
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

              // Exclude games where both scores are 0 (not played yet)
              if (
                user1Id && user2Id &&
                !(team1.points === 0 && team2.points === 0)
              ) {
                const playoffStartWeek = league.settings?.playoff_week_start || 15;
                const bracketType = getBracketTypeForMatchup(team1.roster_id, team2.roster_id, week, playoffStartWeek);

                // Store roster IDs for accurate bracket matching in downstream use
                matchupData.push({
                  season: league.season,
                  week: week,
                  league_id: league.league_id,
                  user1: user1Id,
                  user2: user2Id,
                  roster1: team1.roster_id, // <-- add this
                  roster2: team2.roster_id, // <-- add this
                  score1: team1.points,
                  score2: team2.points,
                  winner: team1.points > team2.points ? user1Id :
                          team2.points > team1.points ? user2Id : null,
                  bracketType
                });
                matchupData.push({
                  season: league.season,
                  week: week,
                  league_id: league.league_id,
                  user1: user2Id,
                  user2: user1Id,
                  roster1: team2.roster_id, // <-- add this
                  roster2: team1.roster_id, // <-- add this
                  score1: team2.points,
                  score2: team1.points,
                  winner: team2.points > team1.points ? user2Id :
                          team1.points > team2.points ? user1Id : null,
                  bracketType
                });

                // Debug: log roster IDs and bracketType
                console.log(
                  `Matchup: week ${week}, rosters ${team1.roster_id} vs ${team2.roster_id}, bracketType: ${bracketType}`
                );
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
            totalGames: 0,
            matchups: [] // <-- Add this line
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

        // Store matchup details for both directions
        matrix[user1][user2].matchups.push({
          season: matchup.season,
          week: matchup.week,
          league_id: matchup.league_id,
          user1: user1,
          user2: user2,
          score1: matchup.score1,
          score2: matchup.score2,
          winner: matchup.winner,
          bracketType: matchup.bracketType // <-- add this
        });
        matrix[user2][user1].matchups.push({
          season: matchup.season,
          week: matchup.week,
          league_id: matchup.league_id,
          user1: user2,
          user2: user1,
          score1: matchup.score2,
          score2: matchup.score1,
          winner: matchup.winner,
          bracketType: matchup.bracketType // <-- add this
        });
      });
      
      setLoadProgress({ stage: 'Finalizing', percentage: 95 });
      
      // Track all-time records while processing matchups
      trackLeagueRecords(matchupData);
  // Build weekly frames for bar chart race (season-week granularity)
  const frames = buildWeeklyFrames(matchupData, teamsArray);
  setWeeklyFrames(frames);
      
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

  // Build season-week frames for cumulative points race
  function buildWeeklyFrames(matchupData, teamsArray) {
    try {
      const seasonWeekMap = new Map(); // key: `${season}-${week}` -> Map<userId, pointsThisWeek>

      matchupData.forEach(m => {
        if (!m?.user1 || !m?.user2) return;
        // Deduplicate mirrored entries by only counting when user1 < user2
        const u1 = String(m.user1);
        const u2 = String(m.user2);
        if (u1 > u2) return; // skip mirrored direction

        const key = `${m.season}-${m.week}`;
        if (!seasonWeekMap.has(key)) seasonWeekMap.set(key, new Map());
        const perUser = seasonWeekMap.get(key);

        const s1 = typeof m.score1 === 'number' ? m.score1 : (typeof m.score1 === 'string' ? parseFloat(m.score1) : 0);
        const s2 = typeof m.score2 === 'number' ? m.score2 : (typeof m.score2 === 'string' ? parseFloat(m.score2) : 0);

        perUser.set(m.user1, (perUser.get(m.user1) || 0) + (isFinite(s1) ? s1 : 0));
        perUser.set(m.user2, (perUser.get(m.user2) || 0) + (isFinite(s2) ? s2 : 0));
      });

      // Sort keys by season asc, then week asc
      const keys = Array.from(seasonWeekMap.keys()).sort((a, b) => {
        const [sa, wa] = a.split('-').map(Number);
        const [sb, wb] = b.split('-').map(Number);
        if (sa !== sb) return sa - sb;
        return wa - wb;
      });

      const frames = keys.map(key => {
        const [season, week] = key.split('-').map(Number);
        const perUserMap = seasonWeekMap.get(key);
        const perUser = {};
        teamsArray.forEach(t => {
          perUser[t.user_id] = perUserMap.get(t.user_id) || 0;
        });
        return { season, week, perUser };
      });

      return frames;
    } catch (e) {
      console.warn('Failed building weekly frames:', e);
      return [];
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
      
      teamsData.forEach(team => {
        seasonData[team.user_id] = {
          user_id: team.user_id,
          display_name: team.display_name,
          avatar: team.avatar,
          seasons: {}
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
                
                // Check for championship/runner-up
                if (roster.settings.playoff_rank === 1) {
                  userSeason.championship = true;
                } else if (roster.settings.playoff_rank === 2) {
                  userSeason.runnerUp = true;
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

  // Helper for playoff/championship formatting
  function getMatchupType(week, bracketType) {
    if (bracketType === 'consolation') return 'consolation';
    if (bracketType === 'winners') {
      if (week === 17) return 'championship';
      return 'playoff';
    }
    return 'regular';
  }

  // Responsive padding
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  // Compute filtered head-to-head matrix based on toggles
  const filteredHeadToHeadMatrix = useMemo(() => {
    if (!teams.length || !Object.keys(headToHeadMatrix).length) return {};

    const matrix = {};
    teams.forEach(team => {
      matrix[team.user_id] = {};
      teams.forEach(opponent => {
        const allMatchups = headToHeadMatrix[team.user_id]?.[opponent.user_id]?.matchups || [];
        // Filter matchups by toggles
        let filteredMatchups = allMatchups.filter(m => {
          const type = getMatchupType(m.week, m.bracketType);
          if (type === 'regular' && showRegular) return true;
          if ((type === 'playoff' || type === 'championship') && showPlayoffs) return true;
          if (type === 'consolation' && showConsolation) return true;
          return false;
        });

        // Deduplicate: only keep one direction for each unique matchup
        filteredMatchups = filteredMatchups.filter((m, idx, arr) =>
          idx === arr.findIndex(
            x =>
              x.season === m.season &&
              x.week === m.week &&
              ((x.user1 === m.user1 && x.user2 === m.user2) ||
               (x.user1 === m.user2 && x.user2 === m.user1)) &&
              x.score1 === m.score1 &&
              x.score2 === m.score2
          )
        );

        // Calculate stats from filtered matchups
        let wins = 0, losses = 0, ties = 0, totalPoints = 0, totalGames = 0;
        filteredMatchups.forEach(m => {
          if (m.winner === team.user_id) wins++;
          else if (m.winner === opponent.user_id) losses++;
          else ties++;
          totalPoints += m.score1;
          totalGames++;
        });

        matrix[team.user_id][opponent.user_id] = {
          wins,
          losses,
          ties,
          totalPoints,
          totalGames,
          matchups: filteredMatchups
        };
      });
    });

    return matrix;
  }, [teams, headToHeadMatrix, showRegular, showPlayoffs, showConsolation]);

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
          If you&apos;re setting up this site for the first time, make sure to update the USER_ID in the Home component with your Sleeper user ID.
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

          <div className="mb-4 flex gap-4">
            <button
              className={`px-4 py-2 rounded ${showRegular ? 'bg-[#FF4B1F] text-white' : 'bg-black/30 text-white/70 hover:bg-black/40'}`}
              onClick={() => setShowRegular(!showRegular)}
            >
              Regular Season
            </button>
            <button
              className={`px-4 py-2 rounded ${showPlayoffs ? 'bg-[#FF4B1F] text-white' : 'bg-black/30 text-white/70 hover:bg-black/40'}`}
              onClick={() => setShowPlayoffs(!showPlayoffs)}
            >
              Playoffs &amp; Championship
            </button>
            <button
              className={`px-4 py-2 rounded ${showConsolation ? 'bg-[#FF4B1F] text-white' : 'bg-black/30 text-white/70 hover:bg-black/40'}`}
              onClick={() => setShowConsolation(!showConsolation)}
            >
              Consolation
            </button>
          </div>
          
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
                              <Image
                                src={`https://sleepercdn.com/avatars/${team.avatar}`} 
                                alt={team.display_name}
                                width={32}
                                height={32}
                                className="w-full h-full object-cover" 
                                loading="lazy"
                                unoptimized={team.avatar.startsWith('http')}
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
                      const record = filteredHeadToHeadMatrix[team.user_id][opponent.user_id];
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
                                <Image
                                  src={`https://sleepercdn.com/avatars/${team.avatar}`} 
                                  alt={team.display_name}
                                  width={32}
                                  height={32}
                                  className="w-full h-full object-cover" 
                                  loading="lazy"
                                  unoptimized={team.avatar.startsWith('http')}
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
                            filteredHeadToHeadMatrix[team.user_id][opponent.user_id];
                            
                          return (
                            <td 
                              key={opponent.user_id}
                              className={`p-3 border border-white/10 text-center cursor-pointer ${
                                isSelf ? 'bg-black/20' : 
                                currentTeamId === team.user_id || currentTeamId === opponent.user_id ? 
                                'bg-white/5' : ''
                              }`}
                              onClick={() => {
                                if (!isSelf && record.totalGames > 0) {
                                  setSelectedMatchup({ teamId: team.user_id, opponentId: opponent.user_id });
                                  setMatchupList(record.matchups);
                                }
                              }}
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
        
        {/* Season Performance Charts section removed per request */}

        {/* All-Time Points: Bar Chart Race */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">All-Time Points Race</h2>
          {(weeklyFrames.length > 0 || (seasonPerformance.length > 0 && teams.length > 0)) ? (
            <BarChartRace
              seasons={seasonPerformance.map(d => d.season)}
              seasonPerformance={seasonPerformance}
              weeklyFrames={weeklyFrames}
              teams={teams}
              topN={Math.min(12, teams.length)}
              stepMs={1200}
            />
          ) : (
            <div className="bg-black/30 rounded-lg border border-white/10 p-6 text-white/60">
              No season data available for the bar chart race.
            </div>
          )}
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

      {selectedMatchup && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#001A2B] rounded-lg shadow-lg max-w-lg w-full p-6 relative">
            <button
              className="absolute top-2 right-2 text-white/70 hover:text-white text-2xl"
              onClick={() => setSelectedMatchup(null)}
            >
              &times;
            </button>
            <h3 className="text-xl font-bold mb-4 text-[#FF4B1F]">
              Matchups: {teams.find(t => t.user_id === selectedMatchup.teamId)?.display_name} vs. {teams.find(t => t.user_id === selectedMatchup.opponentId)?.display_name}
            </h3>
            <div className="max-h-96 overflow-y-auto">
              {matchupList.length === 0 ? (
                <div className="text-white/70">No matchups found.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="p-2 text-left">Season</th>
                      <th className="p-2 text-left">Week</th>
                      <th className="p-2 text-left">Score</th>
                      <th className="p-2 text-left">Winner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchupList
                      // Only show one direction for each unique matchup
                      .filter((m, idx, arr) =>
                        idx === arr.findIndex(
                          x =>
                            x.season === m.season &&
                            x.week === m.week &&
                            ((x.user1 === m.user1 && x.user2 === m.user2) ||
                             (x.user1 === m.user2 && x.user2 === m.user1)) &&
                            x.score1 === m.score1 &&
                            x.score2 === m.score2
                        )
                      )
                      .filter(m => {
                        const type = getMatchupType(m.week, m.bracketType);
                        if (type === 'regular' && showRegular) return true;
                        if ((type === 'playoff' || type === 'championship') && showPlayoffs) return true;
                        if (type === 'consolation' && showConsolation) return true;
                        return false;
                      })
                      .sort((a, b) => {
                        // Sort by season, then week
                        if (a.season !== b.season) return b.season - a.season;
                        return b.week - a.week;
                      })
                      .map((m, idx) => {
                        const type = getMatchupType(m.week, m.bracketType);
                        let rowClass = '';
                        if (type === 'championship') rowClass = 'bg-yellow-400/20 font-bold';
                        else if (type === 'playoff') rowClass = 'bg-blue-400/10 font-semibold';
                        else if (type === 'consolation') rowClass = 'bg-gray-400/10 italic';
                        const winnerName = m.winner
                          ? teams.find(t => t.user_id === m.winner)?.display_name || 'Unknown'
                          : 'Tie';
                        return (
                          <tr key={idx} className={rowClass}>
                            <td className="p-2">{m.season}</td>
                            <td className="p-2">{m.week}</td>
                            <td className="p-2">
                              {teams.find(t => t.user_id === m.user1)?.display_name || 'Team 1'} {m.score1} - {m.score2} {teams.find(t => t.user_id === m.user2)?.display_name || 'Team 2'}
                            </td>
                            <td className="p-2">{winnerName}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}