'use client';
import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

export default function Analytics() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

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
              team: values[33],
              position: values[21],
              status: status,
              isActive: isActive,
              curYear: isActive ? parseFloat(values[15]) || 0 : parseFloat(values[24]) || 0,
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
      </div>
    );
  }

  const data = calculateTeamInvestments();

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className="bg-black/30 p-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className="h-16 w-16 transition-transform hover:scale-105"
            />
            <h1 className="text-3xl font-bold text-[#FF4B1F]">Analytics</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-black/30 rounded-lg border border-white/10 p-6">
          <h2 className="text-xl font-bold mb-6 text-[#FF4B1F]">Team Investment by Position</h2>
          
          <div className="w-full overflow-x-auto">
            <BarChart
              layout="vertical"
              width={1000}
              height={600}
              data={data}
              margin={{ top: 20, right: 30, left: 120, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" horizontal={false} />
              <XAxis 
                type="number"
                domain={[0, 300]}
                stroke="#fff"
                label={{ 
                  value: 'Cap Space ($)', 
                  position: 'insideBottom',
                  offset: -5,
                  style: { fill: '#fff' }
                }}
              />
              <YAxis 
                type="category"
                dataKey="team" 
                stroke="#fff"
                width={100}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="QB" stackId="a" fill="#ef4444" />
              <Bar dataKey="RB" stackId="a" fill="#3b82f6" />
              <Bar dataKey="WR" stackId="a" fill="#22c55e" />
              <Bar dataKey="TE" stackId="a" fill="#a855f7" />
              <Bar dataKey="DeadCap" stackId="a" fill="#6b7280" />
            </BarChart>
          </div>
        </div>
      </div>
    </main>
  );
}