'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import PlayerProfileCard from '../components/PlayerProfileCard';
import { Bar } from 'react-chartjs-2';
import {
  Chart,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  PointElement,      // <-- add
  LineElement,       // <-- add
  LineController     // <-- add
} from 'chart.js';

Chart.register(
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  PointElement,      // <-- add
  LineElement,       // <-- add
  LineController     // <-- add
);
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

export default function RosterPage() {
  const { data: session, status } = useSession();
  const [playerContracts, setPlayerContracts] = useState([]);
  const [teamAvatars, setTeamAvatars] = useState({});
  const [leagueId, setLeagueId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'playerName', direction: 'asc' });

  // Load contracts
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

  // Find BBB league id for avatars
  useEffect(() => {
    async function findBBBLeague() {
      if (!session?.user?.sleeperId) return;
      try {
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;

        const userLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${session.user.sleeperId}/leagues/nfl/${currentSeason}`);
        const userLeagues = await userLeaguesResponse.json();

        let bbbLeagues = userLeagues.filter(league =>
          league.name && (
            league.name.includes('Budget Blitz Bowl') ||
            league.name.includes('budget blitz bowl') ||
            league.name.includes('BBB') ||
            (league.name.toLowerCase().includes('budget') && league.name.toLowerCase().includes('blitz'))
          )
        );

        if (bbbLeagues.length === 0) {
          const prevSeason = (parseInt(currentSeason) - 1).toString();
          const prevSeasonResponse = await fetch(`https://api.sleeper.app/v1/user/${session.user.sleeperId}/leagues/nfl/${prevSeason}`);
          if (prevSeasonResponse.ok) {
            const prevSeasonLeagues = await prevSeasonResponse.json();
            const prevBBBLeagues = prevSeasonLeagues.filter(league =>
              league.name && (
                league.name.includes('Budget Blitz Bowl') ||
                league.name.includes('budget blitz bowl') ||
                league.name.includes('BBB') ||
                (league.name.toLowerCase().includes('budget') && league.name.toLowerCase().includes('blitz'))
              )
            );
            if (prevBBBLeagues.length > 0) {
              bbbLeagues = prevBBBLeagues;
            } else if (userLeagues.length > 0) {
              bbbLeagues = [userLeagues[0]];
            } else if (prevSeasonLeagues.length > 0) {
              bbbLeagues = [prevSeasonLeagues[0]];
            }
          } else if (userLeagues.length > 0) {
            bbbLeagues = [userLeagues[0]];
          }
        }

        const mostRecentLeague = bbbLeagues.sort((a, b) => b.season - a.season)[0];
        setLeagueId(mostRecentLeague?.league_id || null);
      } catch {
        setLeagueId(null);
      }
    }
    findBBBLeague();
  }, [session?.user?.sleeperId]);

  // Fetch avatars once leagueId found
  useEffect(() => {
    if (!leagueId) return;
    async function fetchAvatars() {
      try {
        const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
        const users = await res.json();
        const avatarMap = {};
        users.forEach(user => {
          avatarMap[user.display_name] = user.avatar;
        });
        setTeamAvatars(avatarMap);
      } catch {}
    }
    fetchAvatars();
  }, [leagueId]);

  if (status === 'loading') return null;

  // Build roster view for the user's team
  const activeContracts = playerContracts.filter(p => p.status === 'Active' && p.team);
  const allTeamNames = Array.from(new Set(activeContracts.map(p => p.team?.trim()).filter(Boolean)));
  let myTeamName = '';
  if (session?.user?.name) {
    const nameLower = session.user.name.trim().toLowerCase();
    myTeamName = allTeamNames.find(t => t.toLowerCase() === nameLower) || '';
    if (!myTeamName) myTeamName = allTeamNames.find(t => t.toLowerCase().includes(nameLower)) || '';
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
    .filter(p => p.team && p.team.trim().toLowerCase() === myTeamName.trim().toLowerCase())
    .sort((a, b) => (b.curYear || 0) - (a.curYear || 0))
    .filter(player => {
      if (seen.has(player.playerId)) return false;
      seen.add(player.playerId);
      return true;
    });

  myContracts = [...myContracts].sort((a, b) => {
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }
    if (sortConfig.direction === 'asc') return aVal > bVal ? 1 : -1;
    return aVal < bVal ? 1 : -1;
  });

  const totalKTC = myContracts.reduce((sum, p) => sum + (p.ktcValue || 0), 0);
  const avgAge = myContracts.length > 0 ? (myContracts.reduce((sum, p) => sum + (parseFloat(p.age) || 0), 0) / myContracts.length).toFixed(1) : '-';

  const headers = [
    { key: 'profile', label: '' },
    { key: 'playerName', label: 'Player Name' },
    { key: 'team', label: 'Team' },
    { key: 'contractType', label: 'Contract Type' },
    { key: 'curYear', label: 'Salary' },
    { key: 'ktcValue', label: <span title="KeepTradeCut Value">KTC</span> },
    { key: 'rfaEligible', label: <span title="Restricted Free Agent Eligible">RFA?</span> },
    { key: 'franchiseTagEligible', label: <span title="Franchise Tag Eligible">FT?</span> },
    { key: 'contractFinalYear', label: 'Final Year' }
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 text-white text-center">Roster Construction & Team Profile</h2>

      {/* Player card modal */}
      {(typeof selectedPlayerId === 'string' || typeof selectedPlayerId === 'number') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setSelectedPlayerId(null)}>
          <div className="bg-transparent p-0 rounded-lg shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <PlayerProfileCard
              playerId={selectedPlayerId}
              expanded={true}
              className="w-56 h-80 sm:w-72 sm:h-[26rem] md:w-80 md:h-[30rem] max-w-full max-h-[90vh]"
              teamName={myTeamName}
              teamAvatars={teamAvatars}
            />
            <button className="absolute top-2 right-2 text-white bg-black/60 rounded-full px-3 py-1 hover:bg-black" onClick={() => setSelectedPlayerId(null)}>×</button>
          </div>
        </div>
      )}

      {/* Roster table */}
      <div className="bg-black/30 rounded-xl border border-white/10 p-6 mb-8 shadow-lg">
        <h3 className="text-xl font-bold text-[#FF4B1F] mb-4">Roster Overview</h3>
        <div className="text-white/80 mb-2">A summary of your current roster, including KTC values, positional breakdown, and age profile.</div>
        {myContracts.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-6 mb-4">
              <div className="bg-white/10 rounded px-4 py-2 text-white/90 font-semibold">Total Players: {myContracts.length}</div>
              <div className="bg-white/10 rounded px-4 py-2 text-white/90 font-semibold">Total KTC: {totalKTC}</div>
              <div className="bg-white/10 rounded px-4 py-2 text-white/90 font-semibold">Avg Age: {avgAge}</div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/10 shadow-xl bg-black/20">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-black/40 border-b border-white/10">
                    {headers.map(({ key, label }) => (
                      <th
                        key={key}
                        onClick={key !== 'profile' ? () => setSortConfig({ key, direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc' }) : undefined}
                        className={`p-3 text-left cursor-pointer hover:bg-white/5 transition-colors ${key === 'ktcValue' || key === 'rfaEligible' || key === 'franchiseTagEligible' ? 'text-center' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          {label}
                          {sortConfig.key === key && key !== 'profile' && (
                            <span className="text-[#FF4B1F]">
                              {sortConfig.direction === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myContracts.map((player) => (
                    <tr key={player.contractId || `${player.playerId}-${player.contractFinalYear || ''}`} className="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                      <td className="p-3">
                        <div style={{ width: 32, height: 32 }} className="flex items-center justify-center">
                          <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-8 h-8 rounded-full overflow-hidden shadow" />
                        </div>
                      </td>
                      <td className="p-3 font-medium text-white/90 cursor-pointer underline" onClick={() => setSelectedPlayerId(player.playerId)}>{player.playerName}</td>
                      <td className="p-3 flex items-center gap-2">
                        {teamAvatars[player.team] ? (
                          <img src={`https://sleepercdn.com/avatars/${teamAvatars[player.team]}`} alt={player.team} className="w-5 h-5 rounded-full mr-2" />
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-white/10 mr-2 inline-block"></span>
                        )}
                        {player.team}
                      </td>
                      <td className="p-3">{player.contractType}</td>
                      <td className="p-3">${player.curYear?.toFixed(1) ?? '-'}</td>
                      <td className="p-3 text-center">{player.ktcValue ?? '-'}</td>
                      <td className="p-3 text-center">{String(player.rfaEligible).toLowerCase() === 'true' ? '✔️' : '❌'}</td>
                      <td className="p-3 text-center">{String(player.franchiseTagEligible).toLowerCase() === 'true' ? '✔️' : '❌'}</td>
                      <td className="p-3">{player.contractFinalYear}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-white/60 italic">No roster found for your account.</div>
        )}
      </div>

      {/* Positional Strength & Balance */}
      <div className="bg-black/30 rounded-xl border border-white/10 p-6 mb-16 shadow-lg">
        <h3 className="text-xl font-bold text-[#FF4B1F] mb-4">Positional Strength & Balance</h3>
        <div className="text-white/80 mb-2">Analyze your team’s strengths and weaknesses by position, split by starters and bench.</div>
        {(() => {
          const starterCounts = { QB: 2, RB: 3, WR: 3, TE: 1 };
          const grouped = {};
          myContracts.forEach(p => {
            const pos = p.position;
            if (!grouped[pos]) grouped[pos] = [];
            grouped[pos].push(p);
          });
          const positions = Object.keys(starterCounts);
          const ktcStarters = [], ktcBench = [];
          positions.forEach(pos => {
            const players = (grouped[pos] || []).sort((a, b) => (b.ktcValue || 0) - (a.ktcValue || 0));
            const starters = players.slice(0, starterCounts[pos]);
            const bench = players.slice(starterCounts[pos]);
            ktcStarters.push(starters.reduce((sum, p) => sum + (p.ktcValue || 0), 0));
            ktcBench.push(bench.reduce((sum, p) => sum + (p.ktcValue || 0), 0));
          });
          return (
            <div className="h-64">
              <h4 className="text-lg font-semibold mb-2 text-white">KTC by Position (Starters vs Bench)</h4>
              <Bar
                data={{
                  labels: positions,
                  datasets: [
                    { label: 'Starters', data: ktcStarters, backgroundColor: '#FF4B1F' },
                    { label: 'Bench', data: ktcBench, backgroundColor: '#1FDDFF' }
                  ]
                }}
                options={{
                  plugins: { legend: { display: true }, chartAreaBackground: { color: '#0a2236' } },
                  layout: { padding: { bottom: 0 } },
                  scales: { x: { grid: { color: '#222' } }, y: { grid: { color: '#222' } } },
                  responsive: true,
                  maintainAspectRatio: false,
                }}
              />
            </div>
          );
        })()}
      </div>

      {/* Age Management */}
      <div className="bg-black/30 rounded-xl border border-white/10 p-6 mb-8 shadow-lg">
        <h3 className="text-xl font-bold text-[#FF4B1F] mb-4">Age Management</h3>
        <div className="text-white/80 mb-2">Track your team’s age profile by position for both starters and bench.</div>
        {(() => {
          const starterCounts = { QB: 2, RB: 3, WR: 3, TE: 1 };
          const grouped = {};
          myContracts.forEach(p => {
            const pos = p.position;
            if (!grouped[pos]) grouped[pos] = [];
            grouped[pos].push(p);
          });
          const positions = Object.keys(starterCounts);
          const ageStarters = [], ageBench = [];
          positions.forEach(pos => {
            const players = (grouped[pos] || []).sort((a, b) => (b.ktcValue || 0) - (a.ktcValue || 0));
            const starters = players.slice(0, starterCounts[pos]);
            const bench = players.slice(starterCounts[pos]);
            ageStarters.push(starters.length ? (starters.reduce((sum, p) => sum + (parseFloat(p.age) || 0), 0) / starters.length).toFixed(1) : 0);
            ageBench.push(bench.length ? (bench.reduce((sum, p) => sum + (parseFloat(p.age) || 0), 0) / bench.length).toFixed(1) : 0);
          });
          return (
            <div className="h-64 mb-8">
              <h4 className="text-lg font-semibold mb-2 text-white">Avg Age by Position (Starters vs Bench)</h4>
              <Bar
                data={{
                  labels: positions,
                  datasets: [
                    { label: 'Starters', data: ageStarters, backgroundColor: '#FF4B1F' },
                    { label: 'Bench', data: ageBench, backgroundColor: '#1FDDFF' }
                  ]
                }}
                options={{
                  plugins: { legend: { display: true }, chartAreaBackground: { color: '#0a2236' } },
                  layout: { padding: { bottom: 0 } },
                  scales: { x: { grid: { color: '#222' } }, y: { grid: { color: '#222' } } },
                  responsive: true,
                  maintainAspectRatio: false,
                }}
              />
            </div>
          );
        })()}
      </div>

      {/* Team Age & KTC vs League */}
      <div className="bg-black/30 rounded-xl border border-white/10 p-6 mb-16 shadow-lg">
        <h3 className="text-xl font-bold text-[#FF4B1F] mb-4">Team Age & KTC vs League</h3>
        <div className="text-white/80 mb-2">Compare your team's average age and total KTC value to the rest of the league (using contract data only).</div>
        {(() => {
          const teamStats = allTeamNames.map(teamName => {
            const contracts = activeContracts.filter(p => p.team === teamName);
            const avgAge = contracts.length > 0 ? (contracts.reduce((sum, p) => sum + (parseFloat(p.age) || 0), 0) / contracts.length).toFixed(1) : 0;
            const totalKTC = contracts.reduce((sum, p) => sum + (p.ktcValue || 0), 0);
            return { teamName, avgAge: parseFloat(avgAge), totalKTC, isUser: teamName === myTeamName };
          });
          if (!teamStats.length) return <div className="text-white/60 italic">No league data available.</div>;

          const leagueAvgAge = (teamStats.reduce((sum, t) => sum + t.avgAge, 0) / teamStats.length).toFixed(1);
          const leagueMinAge = Math.min(...teamStats.map(t => t.avgAge));
          const leagueMaxAge = Math.max(...teamStats.map(t => t.avgAge));
          const leagueAvgKTC = (teamStats.reduce((sum, t) => sum + t.totalKTC, 0) / teamStats.length).toFixed(0);
          const leagueMinKTC = Math.min(...teamStats.map(t => t.totalKTC));
          const leagueMaxKTC = Math.max(...teamStats.map(t => t.totalKTC));
          const sortedByKTC = [...teamStats].sort((a, b) => b.totalKTC - a.totalKTC);

          const minAge = Math.min(...sortedByKTC.map(t => t.avgAge));
          const maxAge = Math.max(...sortedByKTC.map(t => t.avgAge));
          const minKTC = Math.min(...sortedByKTC.map(t => t.totalKTC));
          const maxKTC = Math.max(...sortedByKTC.map(t => t.totalKTC));

          const ageBarColors = sortedByKTC.map(t =>
            t.isUser ? '#FF4B1F' :
            t.avgAge === minAge ? '#00FF99' :
            t.avgAge === maxAge ? '#B266FF' : '#1FDDFF'
          );
          const ktcBarColors = sortedByKTC.map(t =>
            t.isUser ? '#FF4B1F' :
            t.totalKTC === minKTC ? '#00FF99' :
            t.totalKTC === maxKTC ? '#B266FF' : '#1FDDFF'
          );

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-12">
              <div className="h-64">
                <h4 className="text-lg font-semibold mb-2 text-white">Average Age by Team</h4>
                <Bar
                  data={{
                    labels: sortedByKTC.map(t => t.teamName),
                    datasets: [
                      { label: 'Avg Age', data: sortedByKTC.map(t => t.avgAge), backgroundColor: ageBarColors },
                      { label: 'League Avg', data: Array(sortedByKTC.length).fill(parseFloat(leagueAvgAge)), backgroundColor: 'rgba(255,75,31,0.2)', type: 'line', borderColor: '#FF4B1F', borderWidth: 2, pointRadius: 0, fill: false, order: 2 }
                    ]
                  }}
                  options={{
                    plugins: { legend: { display: true }, chartAreaBackground: { color: '#0a2236' } },
                    layout: { padding: { bottom: 0 } },
                    scales: { x: { grid: { color: '#222' } }, y: { grid: { color: '#222' }, min: Math.floor(leagueMinAge) } },
                    responsive: true, maintainAspectRatio: false,
                  }}
                />
                <div className="mt-2 text-center font-bold" style={{ color: '#FF4B1F' }}>League Avg: {leagueAvgAge}</div>
              </div>
              <div className="h-64">
                <h4 className="text-lg font-semibold mb-2 text-white">Total KTC Value by Team</h4>
                <Bar
                  data={{
                    labels: sortedByKTC.map(t => t.teamName),
                    datasets: [
                      { label: 'Total KTC', data: sortedByKTC.map(t => t.totalKTC), backgroundColor: ktcBarColors },
                      { label: 'League Avg', data: Array(sortedByKTC.length).fill(parseFloat(leagueAvgKTC)), type: 'line', borderColor: '#FF4B1F', borderWidth: 2, pointRadius: 0, fill: false, order: 2 }
                    ]
                  }}
                  options={{
                    plugins: { legend: { display: true }, chartAreaBackground: { color: '#0a2236' } },
                    layout: { padding: { bottom: 0 } },
                    scales: { x: { grid: { color: '#222' } }, y: { grid: { color: '#222' }, min: Math.floor(leagueMinKTC / 10000) * 10000 } },
                    responsive: true, maintainAspectRatio: false,
                  }}
                />
                <div className="mt-2 text-center font-bold" style={{ color: '#FF4B1F' }}>League Avg: {leagueAvgKTC}</div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}