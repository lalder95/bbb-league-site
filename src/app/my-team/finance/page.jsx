'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Bar } from 'react-chartjs-2';
import {
  Chart,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  ScatterController,
  PointElement,
  LineElement,
  LineController,
} from 'chart.js';

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend, ScatterController, PointElement, LineElement, LineController);
Chart.register({
  id: 'chartAreaBackground',
  beforeDraw: (chart, args, options) => {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    ctx.save();
    ctx.fillStyle = options.color || '#0a2236';
    ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
    ctx.restore();
  }
});

export default function FinancePage() {
  const { data: session, status } = useSession();
  const [playerContracts, setPlayerContracts] = useState([]);

  useEffect(() => {
    async function fetchPlayerData() {
      const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
      const text = await response.text();
      const rows = text.split('\n');
      const contracts = [];
      rows.slice(1).forEach(row => {
        const values = row.split(',');
        if (values.length > 38) {
          contracts.push({
            playerId: values[0],
            playerName: values[1],
            position: values[21],
            contractType: values[2],
            status: values[14],
            team: values[33],
            curYear: (values[14] === 'Active' || values[14] === 'Future') ? parseFloat(values[15]) || 0 : parseFloat(values[24]) || 0,
            year2:  (values[14] === 'Active' || values[14] === 'Future') ? parseFloat(values[16]) || 0 : parseFloat(values[25]) || 0,
            year3:  (values[14] === 'Active' || values[14] === 'Future') ? parseFloat(values[17]) || 0 : parseFloat(values[26]) || 0,
            year4:  (values[14] === 'Active' || values[14] === 'Future') ? parseFloat(values[18]) || 0 : parseFloat(values[27]) || 0,
            isDeadCap: !(values[14] === 'Active' || values[14] === 'Future'),
            contractFinalYear: values[5],
            age: values[32],
            ktcValue: values[34] ? parseInt(values[34], 10) : null,
            rfaEligible: values[37],
            franchiseTagEligible: values[38],
          });
        }
      });
      setPlayerContracts(contracts);
    }
    fetchPlayerData();
  }, []);

  if (status === 'loading') return null;

  const activeContracts = playerContracts.filter(p => p.status === 'Active' && p.team);
  const allTeamNames = Array.from(new Set(activeContracts.map(p => p.team?.trim()).filter(Boolean)));
  let myTeamName = '';
  if (session?.user?.name) {
    const nameLower = session.user.name.trim().toLowerCase();
    myTeamName = allTeamNames.find(t => t.toLowerCase() === nameLower) || '';
  }
  if (!myTeamName) {
    const teamCounts = {};
    activeContracts.forEach(p => {
      const t = p.team.trim();
      teamCounts[t] = (teamCounts[t] || 0) + 1;
    });
    myTeamName = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }

  const seen = new Set();
  let myContracts = activeContracts
    .filter(p => p.team === myTeamName)
    .sort((a, b) => (b.curYear || 0) - (a.curYear || 0))
    .filter(player => {
      if (seen.has(player.playerId)) return false;
      seen.add(player.playerId);
      return true;
    });

  const scatterData = myContracts
    .filter(p => !isNaN(parseFloat(p.curYear)) && !isNaN(parseFloat(p.ktcValue)))
    .map(p => ({ playerName: p.playerName, position: p.position, curYear: parseFloat(p.curYear), ktcValue: parseFloat(p.ktcValue) }));

  const years = ['curYear', 'year2', 'year3', 'year4'];
  const yearLabels = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
  const positions = ['QB', 'RB', 'WR', 'TE'];
  const barData = years.map((yearKey, i) => {
    const yearObj = { year: yearLabels[i] };
    positions.forEach(pos => {
      yearObj[pos] = myContracts.filter(p => p.position === pos).reduce((sum, p) => sum + (parseFloat(p[yearKey]) || 0), 0);
    });
    yearObj['DeadCap'] = playerContracts.filter(p => p.status !== 'Active' && p.team === myTeamName).reduce((sum, p) => sum + (parseFloat(p[yearKey]) || 0), 0);
    return yearObj;
  });
  const posColors = { QB: '#ef4444', RB: '#3b82f6', WR: '#22c55e', TE: '#a855f7', DeadCap: '#6b7280' };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 text-white text-center">Finance & Salary Cap Management</h2>

      {/* Scatter: Salary vs KTC */}
      <div className="bg-black/30 rounded-xl border border-white/10 p-6 mb-8 shadow-lg">
        <h3 className="text-xl font-bold text-[#FF4B1F] mb-4">Player Salary vs. KTC Value</h3>
        <div className="h-96 w-full">
          <Bar
            data={{
              labels: scatterData.map(p => p.playerName),
              datasets: [
                {
                  type: 'scatter',
                  label: 'Players',
                  data: scatterData.map(p => ({ x: p.ktcValue, y: p.curYear, playerName: p.playerName, position: p.position })),
                  backgroundColor: scatterData.map(p => posColors[p.position] || '#1FDDFF'),
                  pointRadius: 6,
                  pointHoverRadius: 8
                }
              ]
            }}
            options={{
              plugins: {
                legend: { display: false },
                chartAreaBackground: { color: '#0a2236' },
                tooltip: {
                  callbacks: {
                    label: ctx => {
                      const d = ctx.raw;
                      return `${d.playerName} (${d.position}): Salary $${d.y}, KTC ${d.x}`;
                    }
                  }
                }
              },
              scales: {
                x: { type: 'linear', title: { display: true, text: 'KTC Value', color: '#fff' }, min: 0, max: 10000, grid: { color: '#222' }, ticks: { color: '#fff' } },
                y: { title: { display: true, text: 'Salary ($)', color: '#fff' }, min: 0, max: 100, grid: { color: '#222' }, ticks: { color: '#fff' } }
              },
              responsive: true,
              maintainAspectRatio: false,
            }}
          />
        </div>
      </div>

      {/* Stacked Salary by Year */}
      <div className="bg-black/30 rounded-xl border border-white/10 p-6 mb-8 shadow-lg">
        <h3 className="text-xl font-bold text-[#FF4B1F] mb-4">Total Salary by Year (Stacked by Position & Dead Cap)</h3>
        <div className="h-96 w-full">
          <Bar
            data={{
              labels: barData.map(d => d.year),
              datasets: positions.concat(['DeadCap']).map(pos => ({
                label: pos,
                data: barData.map(d => d[pos]),
                backgroundColor: posColors[pos],
                stack: 'salary',
              }))
            }}
            options={{
              plugins: {
                legend: { display: true },
                chartAreaBackground: { color: '#0a2236' }
              },
              scales: {
                x: { stacked: true, grid: { color: '#222' }, ticks: { color: '#fff' } },
                y: { stacked: true, min: 0, max: 400, grid: { color: '#222' }, ticks: { color: '#fff' } }
              },
              responsive: true,
              maintainAspectRatio: false,
            }}
          />
        </div>
      </div>
    </div>
  );
}