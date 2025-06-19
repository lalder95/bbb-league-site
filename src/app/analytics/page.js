'use client';
import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer, ScatterChart, Scatter, ReferenceLine } from 'recharts';

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

  // Data filtered by position only (and active, non-rookie)
  const positionFilteredData = players
    .filter(p =>
      p.isActive &&
      p.contractType !== 'Rookie' &&
      p.position === selectedPosition && // No "All" option, always filter by position
      !isNaN(parseFloat(p.curYear)) &&
      !isNaN(parseFloat(p.ktcValue))
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
      p.position === selectedPosition && // No "All" option
      !isNaN(parseFloat(p.curYear)) &&
      !isNaN(parseFloat(p.ktcValue))
    )
    .map(p => ({
      ...p,
      curYear: parseFloat(p.curYear),
      ktcValue: parseFloat(p.ktcValue),
      playerName: p.playerName || '',
    }));

  const medianKTC = getMedian(scatterData.map(p => p.ktcValue));
  const medianSalary = getMedian(scatterData.map(p => p.curYear));


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
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" horizontal={false} />
                <XAxis 
                  type="number"
                  domain={[0, 300]}
                  stroke="#fff"
                  label={isMobile ? undefined : { 
                    value: 'Cap Space ($)', 
                    position: 'insideBottom',
                    offset: -5,
                    style: { fill: '#fff' }
                  }}
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
                <Bar dataKey="QB" stackId="a" fill="#ef4444" />
                <Bar dataKey="RB" stackId="a" fill="#3b82f6" />
                <Bar dataKey="WR" stackId="a" fill="#22c55e" />
                <Bar dataKey="TE" stackId="a" fill="#a855f7" />
                <Bar dataKey="DeadCap" stackId="a" fill="#6b7280" />
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
          </div>
          <div style={{ width: '100%', height: isMobile ? 400 : 600, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 20, right: 20, bottom: isMobile ? 80 : 100, left: 20 }} // <-- much larger bottom margin
              >
                <CartesianGrid stroke="#ffffff20" />
                <XAxis
                  type="number"
                  dataKey="ktcValue"
                  name="KTC"
                  stroke="#fff"
                  label={{ value: 'KTC Score', position: 'insideBottom', offset: -5, fill: '#fff' }}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                />
                <YAxis
                  type="number"
                  dataKey="curYear"
                  name="Salary"
                  stroke="#fff"
                  label={{ value: 'Current Salary ($)', angle: -90, position: 'insideLeft', fill: '#fff' }}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
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
                <ReferenceLine x={avgKTC} stroke="#fff" strokeDasharray="3 3" />
                <ReferenceLine y={avgSalary} stroke="#fff" strokeDasharray="3 3" />
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
                <span style={{ margin: '0 16px' }} />
                Salary Position Average: ${avgSalary ? avgSalary.toFixed(2) : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}