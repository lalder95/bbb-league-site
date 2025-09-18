'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ReferenceLine, LabelList } from 'recharts';

// Utility functions
const getAverage = arr => {
  const nums = arr.filter(x => typeof x === 'number' && !isNaN(x));
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
};

const getMedian = arr => {
  const nums = arr.filter(x => typeof x === 'number' && !isNaN(x)).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};

export default function Analytics() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // --- Add missing state for points chart ---
  const [playerPointsMap, setPlayerPointsMap] = useState({});
  const [pointsLoading, setPointsLoading] = useState(true);

  // --- NEW: Sleeper league ID logic from home page ---
  const USER_ID = '456973480269705216';
  const [leagueId, setLeagueId] = useState(null);

  useEffect(() => {
    async function findBBBLeague() {
      try {
        // Get current NFL season
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        if (!seasonResponse.ok) throw new Error('Failed to fetch NFL state');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;

        // Get user's leagues for the current season
        const userLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${currentSeason}`);
        if (!userLeaguesResponse.ok) throw new Error('Failed to fetch user leagues');
        const userLeagues = await userLeaguesResponse.json();

        // Try flexible matching for "Budget Blitz Bowl"
        let bbbLeagues = userLeagues.filter(league =>
          league.name && (
            league.name.includes('Budget Blitz Bowl') ||
            league.name.includes('budget blitz bowl') ||
            league.name.includes('BBB') ||
            (league.name.toLowerCase().includes('budget') &&
              league.name.toLowerCase().includes('blitz'))
          )
        );

        // If not found, try previous season
        if (bbbLeagues.length === 0) {
          const prevSeason = (parseInt(currentSeason) - 1).toString();
          const prevSeasonResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${prevSeason}`);
          if (prevSeasonResponse.ok) {
            const prevSeasonLeagues = await prevSeasonResponse.json();
            const prevBBBLeagues = prevSeasonLeagues.filter(league =>
              league.name && (
                league.name.includes('Budget Blitz Bowl') ||
                league.name.includes('budget blitz bowl') ||
                league.name.includes('BBB') ||
                (league.name.toLowerCase().includes('budget') &&
                  league.name.toLowerCase().includes('blitz'))
              )
            );
            if (prevBBBLeagues.length > 0) {
              bbbLeagues = prevBBBLeagues;
            } else {
              if (userLeagues.length > 0) {
                bbbLeagues = [userLeagues[0]];
              } else if (prevSeasonLeagues.length > 0) {
                bbbLeagues = [prevSeasonLeagues[0]];
              } else {
                throw new Error('No leagues found for your user ID');
              }
            }
          } else {
            if (userLeagues.length > 0) {
              bbbLeagues = [userLeagues[0]];
            } else {
              throw new Error('No leagues found for your user ID');
            }
          }
        }

        // Sort by season and take the most recent
        const mostRecentLeague = bbbLeagues.sort((a, b) => b.season - a.season)[0];
        setLeagueId(mostRecentLeague.league_id);
      } catch (err) {
        setLeagueId(null);
      }
    }
    findBBBLeague();
  }, []);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
        const text = await response.text();
        
        const rows = text.split('\n');
        const parsedData = rows.slice(1)
          .filter(row => row.trim())
          .map(row => {
            const values = row.split(',');
            const status = values[14];
            const isActive = status === 'Active';
            return {
              playerId: values[0],
              playerName: values[1],
              contractType: values[2],
              position: values[21],
              status: status,
              isActive: isActive,
              team: values[33],
              curYear: isActive ? parseFloat(values[15]) || 0 : parseFloat(values[24]) || 0,
              ktcValue: values[34] ? parseInt(values[34], 10) : null,
              relYear1Salary: parseFloat(values[15]) || 0,
              relYear1Dead: parseFloat(values[24]) || 0,
            };
          });
        
        setPlayers(parsedData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const calculateTeamInvestments = () => {
    const investments = {};
    const counts = {};
    
    players.forEach(player => {
      // Only count contracts with Relative Year 1 Salary > 0 OR Relative Year 1 Dead > 0
      const relYear1Salary = parseFloat(player.relYear1Salary ?? player.curYear ?? 0);
      const relYear1Dead = parseFloat(player.relYear1Dead ?? 0);

      if (relYear1Salary > 0 || relYear1Dead > 0) {
        if (!investments[player.team]) {
          investments[player.team] = {
            team: player.team,
            QB: 0,
            RB: 0,
            WR: 0,
            TE: 0,
            DeadCap: 0,
          };
          counts[player.team] = {
            QB: 0,
            RB: 0,
            WR: 0,
            TE: 0,
            DeadCap: 0,
          };
        }

        if (player.isActive) {
          investments[player.team][player.position] += player.curYear;
          counts[player.team][player.position]++;
        } else {
          investments[player.team].DeadCap += player.curYear;
          counts[player.team].DeadCap++;
        }
      }
    });

    // Combine the data
    return Object.entries(investments).map(([team, values]) => ({
      ...values,
      QB_count: counts[team].QB,
      RB_count: counts[team].RB,
      WR_count: counts[team].WR,
      TE_count: counts[team].TE,
      DeadCap_count: counts[team].DeadCap,
    }));
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#001A2B] border border-white/10 rounded p-3">
          <p className="font-bold mb-2">{label}</p>
          {payload.map((entry, index) => {
            const position = entry.dataKey;
            const count = payload[0].payload[`${position}_count`] || 0;
            return (
              <p key={index} style={{ color: entry.color }}>
                {position}: ${entry.value.toFixed(1)} ({count})
              </p>
            );
          })}
          <p className="border-t border-white/10 mt-2 pt-2">
            Total: ${payload.reduce((sum, entry) => sum + entry.value, 0).toFixed(1)}
          </p>
        </div>
      );
    }
    return null;
  };

  // Get unique teams and positions for filters
  const uniqueTeams = Array.from(new Set(players.map(p => p.team))).filter(Boolean).sort();
  const uniquePositions = Array.from(new Set(players.map(p => p.position))).filter(Boolean).sort();

  // Filter state
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('QB'); // Default to QB
  const [hideZeroKTC, setHideZeroKTC] = useState(true); // <-- new toggle, ON by default

  // Data filtered by position only (and active, non-rookie)
  const positionFilteredData = players
    .filter(p =>
      p.isActive &&
      p.contractType !== 'Rookie' &&
      p.position === selectedPosition && // No "All" option, always filter by position
      !isNaN(parseFloat(p.curYear)) &&
      !isNaN(parseFloat(p.ktcValue)) &&
      (!hideZeroKTC || parseFloat(p.ktcValue) > 0) // <-- hide 0 KTC for averages
    );

  // Reference lines use positionFilteredData (not affected by team filter)
  const avgKTC = getAverage(positionFilteredData.map(p => p.ktcValue));
  const avgSalary = getAverage(positionFilteredData.map(p => p.curYear));

  // Chart points use both filters (team and position)
  const scatterData = players
    .filter(p =>
      p.isActive &&
      p.contractType !== 'Rookie' &&
      (!selectedTeam || p.team === selectedTeam) &&
      p.position === selectedPosition &&
      !isNaN(parseFloat(p.curYear)) &&
      !isNaN(parseFloat(p.ktcValue)) &&
      (!hideZeroKTC || parseFloat(p.ktcValue) > 0) // <-- hide 0 KTC for plot
    )
    .map(p => {
      const curYear = parseFloat(p.curYear);
      const ktcValue = parseFloat(p.ktcValue);
      // Log scale can't handle <= 0, so clamp small values to a tiny positive epsilon
      const EPS_Y = 0.01; // salary
      const EPS_X = 1;    // KTC
      return {
        ...p,
        curYear: Math.max(curYear, EPS_Y),
        ktcValue: Math.max(ktcValue, EPS_X),
        playerName: p.playerName || '',
      };
    });

  // Make X/Y domains symmetric around the averages in LOG space so lines cross in the center
  // IMPORTANT: Use positionFilteredData (ignores team) so team changes don't affect axes
  const xValsAll = positionFilteredData
    .map(p => parseFloat(p.ktcValue))
    .filter(v => v > 0);
  const yValsAll = positionFilteredData
    .map(p => parseFloat(p.curYear))
    .filter(v => v > 0);

  const computeCenteredLogDomain = (center, minVal, maxVal, pad = 1.1) => {
    // center, minVal, maxVal must be > 0
    const eps = 1e-6;
    let c = Math.max(center || 0, eps);
    const minP = Math.max(minVal || 0, eps);
    const maxP = Math.max(maxVal || 0, c * 1.01);

    // Distances in log space (base doesn't matter for ratios)
    let up = Math.log(maxP / c);
    let down = Math.log(c / minP);
    let half = Math.max(up, down, Math.log(1.5)) * pad; // ensure non-zero spread

    const lower = c / Math.exp(half);
    const upper = c * Math.exp(half);
    return [lower, upper];
  };

  // Safe centers for log scale (fallback to geometric mean if average <= 0)
  const minX = xValsAll.length ? Math.min(...xValsAll) : 1;
  const maxX = xValsAll.length ? Math.max(...xValsAll) : 10;
  const minY = yValsAll.length ? Math.min(...yValsAll) : 0.01;
  const maxY = yValsAll.length ? Math.max(...yValsAll) : 10;

  const centerX = avgKTC > 0 ? avgKTC : Math.sqrt(minX * maxX);
  const centerY = avgSalary > 0 ? avgSalary : Math.sqrt(minY * maxY);

  const xDomain = xValsAll.length
    ? computeCenteredLogDomain(centerX, minX, maxX, 1.08)
    : [1, 10000];

  const yDomain = yValsAll.length
    ? computeCenteredLogDomain(centerY, minY, maxY, 1.12)
    : [0.01, 100];

  // Reference lines (must be > 0 on log scale)
  const xRef = centerX > 0 ? centerX : xDomain[0] * Math.sqrt(xDomain[1] / xDomain[0]);
  const yRef = centerY > 0 ? centerY : yDomain[0] * Math.sqrt(yDomain[1] / yDomain[0]);

  useEffect(() => {
    if (!leagueId) return;
    async function fetchPlayerPoints() {
      setPointsLoading(true);
      try {
        // Get current season and week from Sleeper API
        const stateResp = await fetch('https://api.sleeper.app/v1/state/nfl');
        const state = await stateResp.json();
        const currentWeek = state.week;

        // Fetch all rosters to get all player IDs in the league
        const rostersResp = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
        const rosters = await rostersResp.json();
        const allPlayerIds = Array.from(new Set(rosters.flatMap(r => r.players || [])));

        // Fetch weekly points for each player for all weeks up to currentWeek
        const pointsMap = {};
        for (let week = 1; week <= currentWeek; week++) {
          const matchupsResp = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
          const matchups = await matchupsResp.json();
          matchups.forEach(m => {
            const pts = m.players_points || {};
            Object.entries(pts).forEach(([pid, val]) => {
              if (!pointsMap[pid]) pointsMap[pid] = [];
              pointsMap[pid][week - 1] = typeof val === 'number' ? val : 0;
            });
          });
        }
        setPlayerPointsMap(pointsMap);
      } catch (err) {
        setPlayerPointsMap({});
      } finally {
        setPointsLoading(false);
      }
    }
    fetchPlayerPoints();
  }, [leagueId]);

  // --- Helper: Get average points for a player ---
  function getAvgPoints(playerId) {
    const arr = playerPointsMap[playerId] || [];
    const nums = arr.filter(x => typeof x === 'number' && !isNaN(x));
    if (!nums.length) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  // --- Prepare scatter data for Salary vs. Avg Points chart ---
  // Add team and position filters to the new chart
  const scatterPointsData = useMemo(() =>
    players
      .filter(p =>
        p.isActive &&
        p.contractType !== 'Rookie' &&
        (!selectedTeam || p.team === selectedTeam) &&
        p.position === selectedPosition && // <-- position filter added
        !isNaN(parseFloat(p.curYear))
      )
      .map(p => {
        const avgPoints = getAvgPoints(p.playerId);
        const curYear = parseFloat(p.curYear);
        // Clamp to small positive values for log scale
        const EPS_Y = 0.01;
        const EPS_X = 0.01;
        return {
          ...p,
          curYear: Math.max(curYear, EPS_Y),
          avgPoints: Math.max(avgPoints, EPS_X),
          playerName: p.playerName || '',
        };
      }), [players, playerPointsMap, selectedTeam, selectedPosition]
  );

  // --- Compute log domains and averages for axes ---
  const xValsPts = scatterPointsData.map(p => p.avgPoints).filter(v => v > 0);
  const yValsPts = scatterPointsData.map(p => p.curYear).filter(v => v > 0);

  const avgPts = getAverage(xValsPts);
  const avgSalaryPts = getAverage(yValsPts);

  const minXPts = xValsPts.length ? Math.min(...xValsPts) : 0.01;
  const maxXPts = xValsPts.length ? Math.max(...xValsPts) : 50;
  const minYPts = yValsPts.length ? Math.min(...yValsPts) : 0.01;
  const maxYPts = yValsPts.length ? Math.max(...yValsPts) : 80;

  const centerXPts = avgPts > 0 ? avgPts : Math.sqrt(minXPts * maxXPts);
  const centerYPts = avgSalaryPts > 0 ? avgSalaryPts : Math.sqrt(minYPts * maxYPts);

  const computeCenteredLogDomainPts = (center, minVal, maxVal, pad = 1.1) => {
    const eps = 1e-6;
    let c = Math.max(center || 0, eps);
    const minP = Math.max(minVal || 0, eps);
    const maxP = Math.max(maxVal || 0, c * 1.01);
    let up = Math.log(maxP / c);
    let down = Math.log(c / minP);
    let half = Math.max(up, down, Math.log(1.5)) * pad;
    const lower = c / Math.exp(half);
    const upper = c * Math.exp(half);
    return [lower, upper];
  };

  const xDomainPts = xValsPts.length
    ? computeCenteredLogDomainPts(centerXPts, minXPts, maxXPts, 1.08)
    : [0.01, 50];

  const yDomainPts = yValsPts.length
    ? computeCenteredLogDomainPts(centerYPts, minYPts, maxYPts, 1.12)
    : [0.01, 100];

  const xRefPts = centerXPts > 0 ? centerXPts : xDomainPts[0] * Math.sqrt(xDomainPts[1] / xDomainPts[0]);
  const yRefPts = centerYPts > 0 ? centerYPts : yDomainPts[0] * Math.sqrt(yDomainPts[1] / yDomainPts[0]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
      </div>
    );
  }

  const data = calculateTeamInvestments();

  // Place quadrant labels using chart area percentages (relative to axis domain)
  const minKTC = 0, maxKTC = 10000;
  const minSalary = 0, maxSalary = 80;
  const labelFontSize = isMobile ? 12 : 18;
  // Use percentages for placement within chart area
  const overpaidX = minKTC + (maxKTC - minKTC) * 0.04;
  const overpaidY = minSalary + (maxSalary - minSalary) * 0.13;
  const fairUpperX = maxKTC - (maxKTC - minKTC) * 0.04;
  const fairUpperY = minSalary + (maxSalary - minSalary) * 0.13;
  const fairLowerX = minKTC + (maxKTC - minKTC) * 0.04;
  const fairLowerY = maxSalary - (maxSalary - minSalary) * 0.08;
  const underpaidX = maxKTC - (maxKTC - minKTC) * 0.04;
  const underpaidY = maxSalary - (maxSalary - minSalary) * 0.08;

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className={`${isMobile ? 'p-4' : 'p-6'} bg-black/30 border-b border-white/10`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className={`${isMobile ? 'h-12 w-12' : 'h-16 w-16'} transition-transform hover:scale-105`}
            />
            <h1 className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-[#FF4B1F]`}>Analytics</h1>
          </div>
        </div>
      </div>

      <div className={`max-w-7xl mx-auto ${isMobile ? 'p-2' : 'p-6'}`}>
        <div className={`bg-black/30 rounded-lg border border-white/10 ${isMobile ? 'p-3' : 'p-6'}`}>
          <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold mb-4 md:mb-2 text-[#FF4B1F]`}>Team Investment by Position</h2>
          <div style={{ fontSize: isMobile ? '0.75em' : '0.8em', color: '#FF4B1F', marginBottom: isMobile ? 12 : 18, fontWeight: 500 }}>
            This chart shows how each team allocates their salary cap across positions and dead cap. Use it to compare roster-building strategies and positional spending.
          </div>
          
          <div className="w-full" style={{ minWidth: 0 }}>
            <ResponsiveContainer width="100%" height={isMobile ? 400 : 600}>
              <BarChart
                layout="vertical"
                data={data}
                margin={{ top: isMobile ? 50 : 60, right: 10, left: isMobile ? 60 : 120, bottom: isMobile ? 40 : 50 }}
              >
                {/* Removed gridlines */}
                {/* <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" horizontal={false} /> */}
                <XAxis 
                  type="number"
                  domain={[0, 300]}
                  stroke="#fff"
                  // Removed axis label
                  // label={isMobile ? undefined : { value: 'Cap Space ($)', position: 'insideBottom', offset: -5, style: { fill: '#fff' } }}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                />
                <YAxis 
                  type="category"
                  dataKey="team" 
                  stroke="#fff"
                  width={isMobile ? 60 : 100}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ fontSize: isMobile ? 10 : 14 }} 
                  verticalAlign="top" 
                  align="center" 
                />
                <Bar dataKey="QB" stackId="a" fill="#ef4444">
                  <LabelList dataKey="QB" content={renderCenteredLabel} fontSize={isMobile ? 10 : 13} />
                </Bar>
                <Bar dataKey="RB" stackId="a" fill="#3b82f6">
                  <LabelList dataKey="RB" content={renderCenteredLabel} fontSize={isMobile ? 10 : 13} />
                </Bar>
                <Bar dataKey="WR" stackId="a" fill="#22c55e">
                  <LabelList dataKey="WR" content={renderCenteredLabel} fontSize={isMobile ? 10 : 13} />
                </Bar>
                <Bar dataKey="TE" stackId="a" fill="#a855f7">
                  <LabelList dataKey="TE" content={renderCenteredLabel} fontSize={isMobile ? 10 : 13} />
                </Bar>
                <Bar dataKey="DeadCap" stackId="a" fill="#6b7280">
                  <LabelList dataKey="DeadCap" content={renderCenteredLabel} fontSize={isMobile ? 10 : 13} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`bg-black/30 rounded-lg border border-white/10 mt-8 ${isMobile ? 'p-3' : 'p-6'}`}>
          <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold mb-4 md:mb-2 text-[#FF4B1F]`}>
            Player Salary vs. KTC Value
          </h2>
          <div style={{ fontSize: isMobile ? '0.75em' : '0.8em', color: '#FF4B1F', marginBottom: isMobile ? 12 : 18, fontWeight: 500 }}>
            This scatter chart compares each player's current salary to their KTC value for the selected position. Quadrants help identify overpaid, underpaid, and fair market contracts.
          </div>
          <div className="flex flex-wrap gap-4 mb-4">
            <div>
              <label className="mr-2">Team:</label>
              <select
                value={selectedTeam}
                onChange={e => setSelectedTeam(e.target.value)}
                className="text-black rounded px-2 py-1"
              >
                <option value="">All</option>
                {uniqueTeams.map(team => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mr-2">Position:</label>
              <select
                value={selectedPosition}
                onChange={e => setSelectedPosition(e.target.value)}
                className="text-black rounded px-2 py-1"
              >
                {uniquePositions.map(pos => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>
            {/* New: hide players with 0 KTC */}
            <label htmlFor="hideZeroKTC" className="flex items-center gap-2 cursor-pointer">
              <input
                id="hideZeroKTC"
                type="checkbox"
                className="accent-[#FF4B1F]"
                checked={hideZeroKTC}
                onChange={e => setHideZeroKTC(e.target.checked)}
              />
              <span>Hide Players with 0 KTC Score</span>
            </label>
          </div>
          <div style={{ width: '100%', height: isMobile ? 400 : 600, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 20, right: 20, bottom: isMobile ? 80 : 100, left: 20 }}
              >
                {/* Removed gridlines */}
                {/* <CartesianGrid stroke="#ffffff20" /> */}
                <XAxis
                  type="number"
                  dataKey="ktcValue"
                  name="KTC"
                  stroke="#fff"
                  scale="log"
                  domain={xDomain}
                  allowDataOverflow={true}
                  tick={false}            // hide number labels
                  tickLine={false}        // hide tick marks
                  label={{ value: 'KTC Score', position: 'insideBottom', offset: -5, fill: '#fff' }}  // keep axis label
                />
                <YAxis
                  type="number"
                  dataKey="curYear"
                  name="Salary"
                  stroke="#fff"
                  scale="log"
                  domain={yDomain}
                  allowDataOverflow={true}
                  tick={false}            // hide number labels
                  tickLine={false}        // hide tick marks
                  label={{ value: 'Current Salary ($)', angle: -90, position: 'insideLeft', fill: '#fff' }} // keep axis label
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const p = payload[0].payload;
                      return (
                        <div className="bg-[#001A2B] border border-white/10 rounded p-3">
                          <div className="font-bold mb-1">{p.playerName}</div>
                          <div>Team: {p.team}</div>
                          <div>Position: {p.position}</div>
                          <div>KTC: {p.ktcValue}</div>
                          <div>Salary: ${p.curYear}</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine x={xRef} stroke="#fff" strokeDasharray="3 3" />
                <ReferenceLine y={yRef} stroke="#fff" strokeDasharray="3 3" />
                {/* Color map for positions */}
                { [
                  { pos: 'QB', color: '#ef4444' },
                  { pos: 'RB', color: '#3b82f6' },
                  { pos: 'WR', color: '#22c55e' },
                  { pos: 'TE', color: '#a855f7' },
                ].map(({ pos, color }) => (
                  <Scatter
                    key={pos}
                    name={pos}
                    data={scatterData.filter(p => p.position === pos)}
                    fill={color}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
            {/* Overlayed quadrant label: Overpaid (top-left) */}
            <div
              style={{
                position: 'absolute',
                left: isMobile ? 90 : 150,
                top: isMobile ? 20 : 40,
                color: 'rgba(251, 191, 36, 0.8)', // yellow at 80% opacity
                fontWeight: 700,
                fontSize: isMobile ? 11 : 15,
                zIndex: 3,
                pointerEvents: 'none',
                textShadow: '0 1px 4px #001A2B, 0 0 2px #fff2',
              }}
            >
              Overpaid
            </div>
            {/* Overlayed quadrant label: Fair Upper Market (top-right) */}
            <div
              style={{
                position: 'absolute',
                right: isMobile ? 24 : 60,
                top: isMobile ? 20 : 40,
                color: 'rgba(251, 191, 36, 0.8)', // yellow at 80% opacity
                fontWeight: 700,
                fontSize: isMobile ? 11 : 15,
                zIndex: 3,
                pointerEvents: 'none',
                textAlign: 'right',
                textShadow: '0 1px 4px #001A2B, 0 0 2px #fff2',
              }}
            >
              Fair Upper Market
            </div>
            {/* Overlayed quadrant label: Fair Lower Market (bottom-left) */}
            <div
              style={{
                position: 'absolute',
                left: isMobile ? 90 : 150,
                bottom: isMobile ? 110 : 160,
                color: 'rgba(251, 191, 36, 0.8)', // yellow at 80% opacity
                fontWeight: 700,
                fontSize: isMobile ? 11 : 15,
                zIndex: 3,
                pointerEvents: 'none',
                textShadow: '0 1px 4px #001A2B, 0 0 2px #fff2',
              }}
            >
              Fair Lower Market
            </div>
            {/* Overlayed quadrant label: Underpaid (bottom-right) */}
            <div
              style={{
                position: 'absolute',
                right: isMobile ? 24 : 60,
                bottom: isMobile ? 110 : 160,
                color: 'rgba(251, 191, 36, 0.8)', // yellow at 80% opacity
                fontWeight: 700,
                fontSize: isMobile ? 11 : 15,
                zIndex: 3,
                pointerEvents: 'none',
                textAlign: 'right',
                textShadow: '0 1px 4px #001A2B, 0 0 2px #fff2',
              }}
            >
              Underpaid
            </div>
            {/* Overlayed explanation and averages */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: isMobile ? 8 : 16,
                textAlign: 'center',
                pointerEvents: 'none',
                zIndex: 2,
                padding: isMobile ? 2 : 8,
                background: 'rgba(0,26,43,0.85)',
              }}
            >
              <div style={{ fontSize: '0.8em', color: '#bbb' }}>
                KTC Position Average: {avgKTC ? avgKTC.toFixed(0) : 'N/A'}
                <br /> {/* Added line break */}
                Salary Position Average: ${avgSalary ? avgSalary.toFixed(2) : 'N/A'}
              </div>
            </div>
          </div>
        </div>

        {/* --- NEW CHART: Player Salary vs. Weekly Average Points --- */}
        <div className={`bg-black/30 rounded-lg border border-white/10 mt-8 ${isMobile ? 'p-3' : 'p-6'}`}>
          <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold mb-4 md:mb-2 text-[#FF4B1F]`}>
            Player Salary vs. Weekly Average Points
          </h2>
          <div style={{ fontSize: isMobile ? '0.75em' : '0.8em', color: '#FF4B1F', marginBottom: isMobile ? 12 : 18, fontWeight: 500 }}>
            This scatter chart compares each player's current salary to their weekly average points scored for the current season. Use it to identify value contracts and overpaid players.
          </div>
          {/* --- Team and Position Filters --- */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div>
              <label className="mr-2">Team:</label>
              <select
                value={selectedTeam}
                onChange={e => setSelectedTeam(e.target.value)}
                className="text-black rounded px-2 py-1"
              >
                <option value="">All</option>
                {uniqueTeams.map(team => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mr-2">Position:</label>
              <select
                value={selectedPosition}
                onChange={e => setSelectedPosition(e.target.value)}
                className="text-black rounded px-2 py-1"
              >
                {uniquePositions.map(pos => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>
          </div>
          {pointsLoading ? (
            <div className="min-h-[300px] flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#FF4B1F] border-t-transparent"></div>
            </div>
          ) : (
            <div style={{ width: '100%', height: isMobile ? 400 : 600, position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: isMobile ? 80 : 100, left: 20 }}
                >
                  <XAxis
                    type="number"
                    dataKey="avgPoints"
                    name="Avg Points"
                    stroke="#fff"
                    scale="log"
                    domain={xDomainPts}
                    allowDataOverflow={true}
                    tick={false}
                    tickLine={false}
                    label={{ value: 'Weekly Avg Points', position: 'insideBottom', offset: -5, fill: '#fff' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="curYear"
                    name="Salary"
                    stroke="#fff"
                    scale="log"
                    domain={yDomainPts}
                    allowDataOverflow={true}
                    tick={false}
                    tickLine={false}
                    label={{ value: 'Current Salary ($)', angle: -90, position: 'insideLeft', fill: '#fff' }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const p = payload[0].payload;
                        return (
                          <div className="bg-[#001A2B] border border-white/10 rounded p-3">
                            <div className="font-bold mb-1">{p.playerName}</div>
                            <div>Team: {p.team}</div>
                            <div>Position: {p.position}</div>
                            <div>Avg Points: {p.avgPoints?.toFixed(2)}</div>
                            <div>Salary: ${p.curYear}</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine x={xRefPts} stroke="#fff" strokeDasharray="3 3" />
                  <ReferenceLine y={yRefPts} stroke="#fff" strokeDasharray="3 3" />
                  { [
                    { pos: 'QB', color: '#ef4444' },
                    { pos: 'RB', color: '#3b82f6' },
                    { pos: 'WR', color: '#22c55e' },
                    { pos: 'TE', color: '#a855f7' },
                  ].map(({ pos, color }) => (
                    <Scatter
                      key={pos}
                      name={pos}
                      data={scatterPointsData.filter(p => p.position === pos)}
                      fill={color}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
              {/* Overlayed quadrant/explanation labels */}
              <div
                style={{
                  position: 'absolute',
                  left: isMobile ? 90 : 150,
                  top: isMobile ? 20 : 40,
                  color: 'rgba(251, 191, 36, 0.8)',
                  fontWeight: 700,
                  fontSize: isMobile ? 11 : 15,
                  zIndex: 3,
                  pointerEvents: 'none',
                  textShadow: '0 1px 4px #001A2B, 0 0 2px #fff2',
                }}
              >
                Overpaid
              </div>
              <div
                style={{
                  position: 'absolute',
                  right: isMobile ? 24 : 60,
                  top: isMobile ? 20 : 40,
                  color: 'rgba(251, 191, 36, 0.8)',
                  fontWeight: 700,
                  fontSize: isMobile ? 11 : 15,
                  zIndex: 3,
                  pointerEvents: 'none',
                  textAlign: 'right',
                  textShadow: '0 1px 4px #001A2B, 0 0 2px #fff2',
                }}
              >
                Fair Upper Market
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: isMobile ? 90 : 150,
                  bottom: isMobile ? 110 : 160,
                  color: 'rgba(251, 191, 36, 0.8)',
                  fontWeight: 700,
                  fontSize: isMobile ? 11 : 15,
                  zIndex: 3,
                  pointerEvents: 'none',
                  textShadow: '0 1px 4px #001A2B, 0 0 2px #fff2',
                }}
              >
                Fair Lower Market
              </div>
              <div
                style={{
                  position: 'absolute',
                  right: isMobile ? 24 : 60,
                  bottom: isMobile ? 110 : 160,
                  color: 'rgba(251, 191, 36, 0.8)',
                  fontWeight: 700,
                  fontSize: isMobile ? 11 : 15,
                  zIndex: 3,
                  pointerEvents: 'none',
                  textAlign: 'right',
                  textShadow: '0 1px 4px #001A2B, 0 0 2px #fff2',
                }}
              >
                Underpaid
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: isMobile ? 8 : 16,
                  textAlign: 'center',
                  pointerEvents: 'none',
                  zIndex: 2,
                  padding: isMobile ? 2 : 8,
                  background: 'rgba(0,26,43,0.85)',
                }}
              >
                <div style={{ fontSize: '0.8em', color: '#bbb' }}>
                  Avg Points Position Average: {avgPts ? avgPts.toFixed(2) : 'N/A'}
                  <br />
                  Salary Position Average: ${avgSalaryPts ? avgSalaryPts.toFixed(2) : 'N/A'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// Custom label renderer for centered labels, hides label if bar is too small
function renderCenteredLabel(props) {
  const { x, y, width, height, value } = props;
  // Minimum width for label to fit (adjust as needed)
  const minWidth = 35;
  if (width < minWidth || value === 0) return null;
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fill="#fff"
      fontWeight={700}
      fontSize={props.fontSize || 13}
      style={{ pointerEvents: 'none' }}
    >
      {`$${value.toFixed(1)}`}
    </text>
  );
}