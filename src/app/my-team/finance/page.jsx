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

  React.useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/login";
    }
  }, [status]);

  if (status === "loading") return null;
  if (status === 'unauthenticated' || !session) {
    if (typeof window !== 'undefined') window.location.href = '/login';
    return null;
  }
  const [playerContracts, setPlayerContracts] = useState([]);

  useEffect(() => {
    async function fetchPlayerData() {
      const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
      const text = await response.text();
      const rows = text.split('\n').filter(Boolean);
      if (rows.length < 2) return setPlayerContracts([]);
      const header = rows[0].split(',').map(h => h.trim());
      const headerMap = {};
      header.forEach((col, idx) => { headerMap[col] = idx; });

      const contracts = [];
      rows.slice(1).forEach((row, idx) => {
        const values = row.split(',');
        if (values.length !== header.length) return;
        contracts.push({
          playerId: values[headerMap["Player ID"]],
          playerName: values[headerMap["Player Name"]],
          position: values[headerMap["Position"]],
          contractType: values[headerMap["Contract Type"]],
          status: values[headerMap["Status"]],
          team: values[headerMap["TeamDisplayName"]],
          curYear: (values[headerMap["Status"]] === 'Active' || values[headerMap["Status"]] === 'Future')
            ? parseFloat(values[headerMap["Relative Year 1 Salary"]]) || 0
            : parseFloat(values[headerMap["Relative Year 1 Dead"]]) || 0,
          year2: (values[headerMap["Status"]] === 'Active' || values[headerMap["Status"]] === 'Future')
            ? parseFloat(values[headerMap["Relative Year 2 Salary"]]) || 0
            : parseFloat(values[headerMap["Relative Year 2 Dead"]]) || 0,
          year3: (values[headerMap["Status"]] === 'Active' || values[headerMap["Status"]] === 'Future')
            ? parseFloat(values[headerMap["Relative Year 3 Salary"]]) || 0
            : parseFloat(values[headerMap["Relative Year 3 Dead"]]) || 0,
          year4: (values[headerMap["Status"]] === 'Active' || values[headerMap["Status"]] === 'Future')
            ? parseFloat(values[headerMap["Relative Year 4 Salary"]]) || 0
            : parseFloat(values[headerMap["Relative Year 4 Dead"]]) || 0,
          isDeadCap: !(values[headerMap["Status"]] === 'Active' || values[headerMap["Status"]] === 'Future'),
          contractFinalYear: values[headerMap["Contract Final Year"]],
          age: values[headerMap["Age"]],
          ktcValue: values[headerMap["Current KTC Value"]] ? parseInt(values[headerMap["Current KTC Value"]], 10) : null,
          rfaEligible: values[headerMap["Will Be RFA?"]],
          franchiseTagEligible: values[headerMap["Franchise Tag Eligible?"]],
        });
      });
      setPlayerContracts(contracts);
    }
    fetchPlayerData();
  }, []);

  const activeContracts = playerContracts.filter(p => p.status === 'Active' && p.team);
  const allTeamNames = Array.from(new Set(activeContracts.map(p => p.team?.trim()).filter(Boolean)));
  // let myTeamName = '';
  // if (session?.user?.name) {
  //   const nameLower = session.user.name.trim().toLowerCase();
  //   myTeamName = allTeamNames.find(t => t.toLowerCase() === nameLower) || '';
  // }
  // if (!myTeamName) {
  //   const teamCounts = {};
  //   activeContracts.forEach(p => {
  //     const t = p.team.trim();
  //     teamCounts[t] = (teamCounts[t] || 0) + 1;
  //   });
  //   myTeamName = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  // }
  // Determine team without defaulting to most common.
  const EMAIL_TO_TEAM = Object.freeze({
    // 'user@example.com': 'Your Team Name',
  });
  const normalize = s => (s || '').trim().toLowerCase();
  let myTeamName = '';
  const userTeamFromSession =
    session?.user?.teamName ||
    session?.user?.team ||
    session?.user?.team_name ||
    session?.user?.teamSlug ||
    session?.user?.team_slug;
  if (userTeamFromSession) {
    const val = normalize(userTeamFromSession);
    myTeamName =
      allTeamNames.find(t => normalize(t) === val) ||
      allTeamNames.find(t => normalize(t).includes(val)) ||
      '';
  }
  if (!myTeamName && session?.user?.email) {
    const mapped = EMAIL_TO_TEAM[normalize(session.user.email)];
    if (mapped) {
      const val = normalize(mapped);
      myTeamName =
        allTeamNames.find(t => normalize(t) === val) ||
        allTeamNames.find(t => normalize(t).includes(val)) ||
        '';
    }
  }
  if (!myTeamName && session?.user?.name) {
    const val = normalize(session.user.name);
    myTeamName =
      allTeamNames.find(t => normalize(t) === val) ||
      allTeamNames.find(t => normalize(t).includes(val)) ||
      '';
  }

  if (!myTeamName) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6 text-white text-center">Finance & Salary Cap Management</h2>
        <div className="bg-red-900/40 border border-red-600 text-red-200 px-4 py-3 rounded text-center">
          Unable to determine your team from your session. Please contact an admin.
        </div>
      </div>
    );
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