'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ActivityBadges from './components/ActivityBadges';
import TeamPedigreeBadges from './components/TeamPedigreeBadges';
import PlayerProfileCard from './components/PlayerProfileCard';
import {
  getAllLeagueTransactions,
  getUserLeagues,
  getLeagueDrafts,
  getDraftPicks,
  getLeagueRosters,
  getLeagueStandings,
  getPlayoffResults
} from './myTeamApi';
import { Bar } from 'react-chartjs-2';
import {
  Chart,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  LineController
} from 'chart.js';

Chart.register(
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  LineController
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

function groupByYear(items, getYear) {
  return items.reduce((acc, item) => {
    const year = getYear(item);
    if (!acc[year]) acc[year] = [];
    acc[year].push(item);
    return acc;
  }, {});
}

export default function MyTeam() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activity, setActivity] = useState({
    trades: 0,
    playersAdded: 0,
    rookiesDrafted: 0,
  });
  const [pedigree, setPedigree] = useState({
    championships: 0,
    divisionTitles: 0,
    allTimeRecord: '0-0',
    allTimeWinPct: '0.0%',
    playoffAppearances: 0,
    playoffRecord: '0-0',
    playoffWinPct: '0.0%',
  });
  const [loading, setLoading] = useState(true);
  const [leagueRosters, setLeagueRosters] = useState({});
  const [leagueTradedPicks, setLeagueTradedPicks] = useState({});
  const loaded = useRef(false);

  // Player map from BBB_Contracts.csv
  const [playerMap, setPlayerMap] = useState({});
  // Add full player contract data
  const [playerContracts, setPlayerContracts] = useState([]);
  // Sorting and player card modal
  const [sortConfig, setSortConfig] = useState({ key: 'playerName', direction: 'asc' });
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [activeTab, setActiveTab] = useState('Roster');
  const [teamState, setTeamState] = useState("Compete");
  const [assetPriority, setAssetPriority] = useState(["QB", "RB", "WR", "TE", "Picks"]);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [strategyNotes, setStrategyNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveError, setSaveError] = useState("");
  const tabs = [
    'Roster',
    'Finance',
    'Draft',
    'Free Agency',
    'Assistant GM',
    'Badges',
    'Media',
  ];

  useEffect(() => {
    // Load player map and contracts from BBB_Contracts.csv (same logic as player-contracts page)
    async function fetchPlayerData() {
      const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
      const text = await response.text();
      const rows = text.split('\n');
      const headers = rows[0].split(',');
      const idIdx = headers.findIndex(h => h.trim().toLowerCase() === 'playerid' || h.trim().toLowerCase() === 'player_id');
      const nameIdx = headers.findIndex(h => h.trim().toLowerCase() === 'playername' || h.trim().toLowerCase() === 'player_name');
      const map = {};
      const contracts = [];
      rows.slice(1).forEach(row => {
        const values = row.split(',');
        if (values[idIdx] && values[nameIdx]) {
          map[values[idIdx].trim()] = values[nameIdx].trim();
        }
        // Build contract object (from Player Contracts page)
        if (values.length > 38) {
          contracts.push({
            playerId: values[0],
            playerName: values[1],
            position: values[21],
            contractType: values[2],
            status: values[14],
            team: values[33],
            curYear: values[14] === 'Active' ? parseFloat(values[15]) || 0 : parseFloat(values[24]) || 0,
            year2: values[14] === 'Active' ? parseFloat(values[16]) || 0 : parseFloat(values[25]) || 0,
            year3: values[14] === 'Active' ? parseFloat(values[17]) || 0 : parseFloat(values[26]) || 0,
            year4: values[14] === 'Active' ? parseFloat(values[18]) || 0 : parseFloat(values[27]) || 0,
            isDeadCap: values[14] !== 'Active',
            contractFinalYear: values[5],
            age: values[32],
            ktcValue: values[34] ? parseInt(values[34], 10) : null,
            rfaEligible: values[37],
            franchiseTagEligible: values[38],
          });
        }
      });
      setPlayerMap(map);
      setPlayerContracts(contracts);
    }
    fetchPlayerData();
  }, []);

  function getPlayerName(id) {
    return playerMap[String(id)] || id;
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated' || loaded.current) return;
    loaded.current = true;

    async function fetchActivityAndPedigree() {
      if (!session?.user?.sleeperId) return;
      setLoading(true);

      const allLeagues = [];
      const currentYear = new Date().getFullYear();
      for (let season = 2024; season <= currentYear; season++) {
        const leagues = await getUserLeagues(session.user.sleeperId, season);
        const bbbLeagues = leagues.filter(league => league.name === "Budget Blitz Bowl");
        allLeagues.push(...bbbLeagues);
      }

      // Fetch rosters and traded picks for each league
      const rostersMap = {};
      const tradedPicksMap = {};
      for (const league of allLeagues) {
        const rosters = await getLeagueRosters(league.league_id);
        rostersMap[league.league_id] = rosters;
        // Fetch traded picks for this league
        try {
          const resp = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/traded_picks`);
          if (resp.ok) {
            const picks = await resp.json();
            tradedPicksMap[league.league_id] = picks;
          } else {
            tradedPicksMap[league.league_id] = [];
          }
        } catch {
          tradedPicksMap[league.league_id] = [];
        }
      }
      setLeagueRosters(rostersMap);
      setLeagueTradedPicks(tradedPicksMap);

      let trades = [];
      let playersAdded = [];
      let rookiesDrafted = [];

      // Pedigree stats
      let championships = 0;
      let divisionTitles = 0;
      let allTimeWins = 0;
      let allTimeLosses = 0;
      let playoffAppearances = 0;
      let playoffWins = 0;
      let playoffLosses = 0;

      for (const league of allLeagues) {
        const transactions = await getAllLeagueTransactions(league.league_id);

        // Trades
        trades.push(...transactions.filter(tx => tx.type === 'trade').map(tx => ({
          ...tx,
          league_id: league.league_id
        })));

        // Players Added
        playersAdded.push(
          ...transactions.filter(
            tx =>
              tx.status === "complete" &&
              (tx.type === "waiver" || tx.type === "free_agent")
          )
        );

        // Draft picks (exclude 2024)
        const drafts = await getLeagueDrafts(league.league_id);
        for (const draft of drafts) {
          if (draft.season === "2024") continue;
          const picks = await getDraftPicks(draft.draft_id);
          rookiesDrafted.push(
            ...picks
              .filter(pick => pick.picked_by === session.user.sleeperId)
              .map(pick => ({
                ...pick,
                season: draft.season,
                round: pick.round,
                pick_no: pick.pick_no,
                player_id: pick.player_id,
                metadata: pick.metadata,
              }))
          );
        }

        // --- PEDIGREE CALCULATIONS ---
        // 1. Standings for all-time record and division titles
        const standings = await getLeagueStandings(league.league_id);
        const myRoster = (rostersMap[league.league_id] || []).find(r => r.owner_id === session.user.sleeperId);
        if (myRoster) {
          const myStanding = standings.find(s => s.roster_id === myRoster.roster_id);
          if (myStanding) {
            allTimeWins += myStanding.wins || 0;
            allTimeLosses += myStanding.losses || 0;
            if (myStanding.division_champ) divisionTitles += 1;
          }
        }

        // 2. Playoff results for championships, playoff appearances, playoff record
        const playoffResults = await getPlayoffResults(league.league_id);
        if (playoffResults && myRoster) {
          const myPlayoff = playoffResults.find(p => p.roster_id === myRoster.roster_id);
          if (myPlayoff) {
            playoffAppearances += myPlayoff.appearances || 0;
            playoffWins += myPlayoff.wins || 0;
            playoffLosses += myPlayoff.losses || 0;
            if (myPlayoff.champion) championships += 1;
          }
        }
      }

      // Calculate win percentages
      const allTimeGames = allTimeWins + allTimeLosses;
      const allTimeWinPct = allTimeGames > 0 ? ((allTimeWins / allTimeGames) * 100).toFixed(1) + "%" : "0.0%";
      const playoffGames = playoffWins + playoffLosses;
      const playoffWinPct = playoffGames > 0 ? ((playoffWins / playoffGames) * 100).toFixed(1) + "%" : "0.0%";

      setActivity({
        trades: trades.length,
        playersAdded: playersAdded.length,
        rookiesDrafted: rookiesDrafted.length,
      });

      setPedigree({
        championships,
        divisionTitles,
        allTimeRecord: `${allTimeWins}-${allTimeLosses}`,
        allTimeWinPct,
        playoffAppearances,
        playoffRecord: `${playoffWins}-${playoffLosses}`,
        playoffWinPct,
      });

      setLoading(false);
    }
    fetchActivityAndPedigree();
  }, [session, status]);

  // Drag handlers
  function handleDragStart(idx) {
    setDraggingIdx(idx);
  }
  function handleDrop(idx) {
    if (draggingIdx === null || draggingIdx === idx) return;
    const newOrder = [...assetPriority];
    const [removed] = newOrder.splice(draggingIdx, 1);
    newOrder.splice(idx, 0, removed);
    setAssetPriority(newOrder);
    setDraggingIdx(null);
  }

  async function handleSaveAssistantGM() {
    setSaving(true);
    setSaveMsg("");
    setSaveError("");
    try {
      const res = await fetch("/api/user/update-assistant-gm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamState,
          assetPriority,
          strategyNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaveMsg("Settings saved!");
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "Assistant GM" || status !== "authenticated") return;
    // Only fetch once per session
    let cancelled = false;
    setSaving(true);
    fetch("/api/user/get-assistant-gm")
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setTeamState(data.teamState ?? "Compete");
        setAssetPriority(Array.isArray(data.assetPriority) && data.assetPriority.length === 5
          ? data.assetPriority
          : ["QB", "RB", "WR", "TE", "Picks"]);
        setStrategyNotes(data.strategyNotes ?? "");
      })
      .catch(err => {
        setSaveError("Failed to load Assistant GM settings: " + err.message);
      })
      .finally(() => {
        if (!cancelled) setSaving(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, status]);

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      {/* Header Banner */}
      <div className="bg-black/30 p-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className="h-16 w-16 transition-transform hover:scale-105"
            />
            <h1 className="text-3xl font-bold text-[#FF4B1F]">My Team</h1>
          </div>
          <div className="hidden md:block">
            <div className="text-white/70">
              {session?.user?.name || ''}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex flex-wrap gap-2 border-b border-white/10">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-semibold rounded-t-lg transition-colors duration-200 focus:outline-none ${activeTab === tab ? 'bg-[#FF4B1F] text-white shadow' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto p-6">
        {activeTab === 'Badges' && (
          <>
            <h2 className="text-2xl font-bold mb-4 text-white">Team Pedigree</h2>
            {loading ? (
              <div className="text-white/60">Loading activity...</div>
            ) : (
              <>
                <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                  <div className="backdrop-blur-md bg-white/10 border border-gradient-to-br from-[#FF4B1F] to-[#1FDDFF] rounded-2xl shadow-2xl p-8 flex flex-col items-center transition-transform hover:scale-[1.03] hover:bg-white/20 duration-200">
                    <TeamPedigreeBadges
                      championships={pedigree.championships}
                      divisionTitles={pedigree.divisionTitles}
                      allTimeRecord={pedigree.allTimeRecord}
                      allTimeWinPct={pedigree.allTimeWinPct}
                      playoffAppearances={pedigree.playoffAppearances}
                      playoffRecord={pedigree.playoffRecord}
                      playoffWinPct={pedigree.playoffWinPct}
                    />
                  </div>
                </div>
                <div className="my-12 border-t border-white/10"></div>
                <div>
                  <h2 className="text-2xl font-bold mb-4 text-white">Team Activity</h2>
                  <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                    <div className="backdrop-blur-md bg-white/10 border border-gradient-to-br from-[#FF4B1F] to-[#1FDDFF] rounded-2xl shadow-2xl p-8 flex flex-col items-center transition-transform hover:scale-[1.03] hover:bg-white/20 duration-200">
                      <ActivityBadges
                        trades={activity.trades}
                        playersAdded={activity.playersAdded}
                        draftPicks={activity.rookiesDrafted}
                        draftLabel="Rookies Drafted"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
        {activeTab === 'Roster' && (
          (() => {
            // Only use BBB_Contracts for all teams
            // Group all active contracts by team name
            const activeContracts = playerContracts.filter(p => p.status === 'Active' && p.team);
            // Get all unique team names
            const allTeamNames = Array.from(new Set(activeContracts.map(p => p.team.trim())));
            // Find user's team name by matching session user name to team name (case-insensitive)
            let myTeamName = '';
            if (session?.user?.name) {
              const nameLower = session.user.name.trim().toLowerCase();
              // Try to find a team whose name matches the session user name
              myTeamName = allTeamNames.find(team => team.trim().toLowerCase() === nameLower) || '';
            }
            // If not found, default to team with most contracts
            if (!myTeamName) {
              const teamCounts = {};
              activeContracts.forEach(p => {
                const t = p.team.trim();
                teamCounts[t] = (teamCounts[t] || 0) + 1;
              });
              myTeamName = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
            }
            // For roster table, use only contracts for user's team
            let myContracts = activeContracts.filter(p => p.team === myTeamName);
            // Deduplicate by playerId, keeping the contract with the highest salary (curYear)
            const seen = new Set();
            myContracts = myContracts
              .sort((a, b) => (b.curYear || 0) - (a.curYear || 0))
              .filter(player => {
                if (seen.has(player.playerId)) return false;
                seen.add(player.playerId);
                return true;
              });
            // Sort by sortConfig
            myContracts = [...myContracts].sort((a, b) => {
              const aVal = a[sortConfig.key];
              const bVal = b[sortConfig.key];
              if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
              }
              if (sortConfig.direction === 'asc') {
                return aVal > bVal ? 1 : -1;
              }
              return aVal < bVal ? 1 : -1;
            });
            // Summary stats
            const totalKTC = myContracts.reduce((sum, p) => sum + (p.ktcValue || 0), 0);
            const avgAge = myContracts.length > 0 ? (myContracts.reduce((sum, p) => sum + (parseFloat(p.age) || 0), 0) / myContracts.length).toFixed(1) : '-';
            // Table headers config
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
                {/* Roster Summary Section */}
                <div className="bg-black/30 rounded-xl border border-white/10 p-6 mb-8 shadow-lg">
                  <h3 className="text-xl font-bold text-[#FF4B1F] mb-4">Roster Overview</h3>
                  <div className="text-white/80 mb-2">A summary of your current roster, including KTC values, positional breakdown, and age profile.</div>
                  {/* Player Card Modal */}
                  {selectedPlayerId && (
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                      onClick={() => setSelectedPlayerId(null)}
                    >
                      <div
                        className="bg-transparent p-0 rounded-lg shadow-2xl relative"
                        onClick={e => e.stopPropagation()}
                      >
                        <PlayerProfileCard playerId={selectedPlayerId} expanded={true} className="w-56 h-80 sm:w-72 sm:h-[26rem] md:w-80 md:h-[30rem] max-w-full max-h-[90vh]" />
                        <button
                          className="absolute top-2 right-2 text-white bg-black/60 rounded-full px-3 py-1 hover:bg-black"
                          onClick={() => setSelectedPlayerId(null)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )}
                  {/* Roster Table for the logged-in manager */}
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
                            {myContracts.map((player, idx) => (
                              <tr key={player.playerId + '-' + idx} className="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                                {/* PlayerProfileCard column */}
                                <td className="p-3">
                                  {/* Force small avatar size for table, matching Player Contracts page */}
                                  <div style={{ width: 32, height: 32 }} className="flex items-center justify-center">
                                    <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-8 h-8 rounded-full overflow-hidden shadow" />
                                  </div>
                                </td>
                                {/* Player Name column */}
                                <td
                                  className="p-3 font-medium text-white/90 cursor-pointer underline"
                                  onClick={() => setSelectedPlayerId(player.playerId)}
                                >
                                  {player.playerName}
                                </td>
                                <td className="p-3">{player.team}</td>
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
                    // Define starter counts
                    const starterCounts = { QB: 2, RB: 3, WR: 3, TE: 1 };
                    // Group players by position
                    const grouped = {};
                    myContracts.forEach(p => {
                      const pos = p.position;
                      if (!grouped[pos]) grouped[pos] = [];
                      grouped[pos].push(p);
                    });
                    // For each position, sort by KTC and split into starters/bench
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
                            plugins: {
                              legend: { display: true },
                              chartAreaBackground: { color: '#0a2236' }
                            },
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
                            plugins: {
                              legend: { display: true },
                              chartAreaBackground: { color: '#0a2236' }
                            },
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
                {/* Age & KTC Comparison to League */}
                <div className="bg-black/30 rounded-xl border border-white/10 p-6 mb-16 shadow-lg">
                  <h3 className="text-xl font-bold text-[#FF4B1F] mb-4">Team Age & KTC vs League</h3>
                  <div className="text-white/80 mb-2">Compare your team's average age and total KTC value to the rest of the league (using contract data only).</div>
                  {(() => {
                    // For each team, use contract data for calculation
                    const teamStats = allTeamNames.map(teamName => {
                      const contracts = activeContracts.filter(p => p.team === teamName);
                      const avgAge = contracts.length > 0 ? (contracts.reduce((sum, p) => sum + (parseFloat(p.age) || 0), 0) / contracts.length).toFixed(1) : 0;
                      const totalKTC = contracts.reduce((sum, p) => sum + (p.ktcValue || 0), 0);
                      return {
                        teamName,
                        avgAge: parseFloat(avgAge),
                        totalKTC,
                        isUser: teamName === myTeamName
                      };
                    });
                    if (!teamStats.length) return <div className="text-white/60 italic">No league data available.</div>;
                    // League stats
                    const leagueAvgAge = (teamStats.reduce((sum, t) => sum + t.avgAge, 0) / teamStats.length).toFixed(1);
                    const leagueMinAge = Math.min(...teamStats.map(t => t.avgAge));
                    const leagueMaxAge = Math.max(...teamStats.map(t => t.avgAge));
                    const leagueAvgKTC = (teamStats.reduce((sum, t) => sum + t.totalKTC, 0) / teamStats.length).toFixed(0);
                    const leagueMinKTC = Math.min(...teamStats.map(t => t.totalKTC));
                    const leagueMaxKTC = Math.max(...teamStats.map(t => t.totalKTC));
                    // Sort by KTC for chart order
                    const sortedByKTC = [...teamStats].sort((a, b) => b.totalKTC - a.totalKTC);
                    // Bar colors: highlight user's team, min, and max
                    const minAge = Math.min(...sortedByKTC.map(t => t.avgAge));
                    const maxAge = Math.max(...sortedByKTC.map(t => t.avgAge));
                    const minKTC = Math.min(...sortedByKTC.map(t => t.totalKTC));
                    const maxKTC = Math.max(...sortedByKTC.map(t => t.totalKTC));
                    // For age chart
                    const ageBarColors = sortedByKTC.map(t =>
                      t.isUser ? '#FF4B1F' :
                      t.avgAge === minAge ? '#00FF99' :
                      t.avgAge === maxAge ? '#B266FF' :
                      '#1FDDFF'
                    );
                    // For KTC chart
                    const ktcBarColors = sortedByKTC.map(t =>
                      t.isUser ? '#FF4B1F' :
                      t.totalKTC === minKTC ? '#00FF99' :
                      t.totalKTC === maxKTC ? '#B266FF' :
                      '#1FDDFF'
                    );
                    // --- Average Age Chart ---
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-12">
                        <div className="h-64">
                          <h4 className="text-lg font-semibold mb-2 text-white">Average Age by Team</h4>
                          <Bar
                            data={{
                              labels: sortedByKTC.map(t => t.teamName),
                              datasets: [
                                {
                                  label: 'Avg Age',
                                  data: sortedByKTC.map(t => t.avgAge),
                                  backgroundColor: ageBarColors
                                },
                                {
                                  label: 'League Avg',
                                  data: Array(sortedByKTC.length).fill(parseFloat(leagueAvgAge)),
                                  backgroundColor: 'rgba(255,75,31,0.2)',
                                  type: 'line',
                                  borderColor: '#FF4B1F',
                                  borderWidth: 2,
                                  pointRadius: 0,
                                  fill: false,
                                  order: 2
                                }
                              ]
                            }}
                            options={{
                              plugins: {
                                legend: { display: true },
                                chartAreaBackground: { color: '#0a2236' }
                              },
                              layout: { padding: { bottom: 0 } },
                              scales: {
                                x: { grid: { color: '#222' } },
                                y: {
                                  grid: { color: '#222' },
                                  min: Math.floor(leagueMinAge)
                                }
                              },
                              responsive: true,
                              maintainAspectRatio: false,
                            }}
                          />
                          <div className="mt-2 text-center font-bold" style={{ color: '#FF4B1F' }}>
                            League Avg: {leagueAvgAge}
                          </div>
                        </div>
                        {/* KTC Chart */}
                        <div className="h-64">
                          <h4 className="text-lg font-semibold mb-2 text-white">Total KTC Value by Team</h4>
                          <Bar
                            data={{
                              labels: sortedByKTC.map(t => t.teamName),
                              datasets: [
                                {
                                  label: 'Total KTC',
                                  data: sortedByKTC.map(t => t.totalKTC),
                                  backgroundColor: ktcBarColors
                                },
                                {
                                  label: 'League Avg',
                                  data: Array(sortedByKTC.length).fill(parseFloat(leagueAvgKTC)),
                                  type: 'line',
                                  borderColor: '#FF4B1F', // orange
                                  borderWidth: 2,
                                  pointRadius: 0,
                                  fill: false,
                                  order: 2
                                }
                              ]
                            }}
                            options={{
                              plugins: {
                                legend: { display: true },
                                chartAreaBackground: { color: '#0a2236' }
                              },
                              layout: { padding: { bottom: 0 } },
                              scales: {
                                x: { grid: { color: '#222' } },
                                y: {
                                  grid: { color: '#222' },
                                  min: Math.floor(leagueMinKTC / 10000) * 10000
                                }
                              },
                              responsive: true,
                              maintainAspectRatio: false,
                            }}
                          />
                          <div className="mt-2 text-center font-bold" style={{ color: '#FF4B1F' }}>
                            League Avg: {leagueAvgKTC}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()
        )}
        {activeTab === 'Finance' && (
          (() => {
            // Only use BBB_Contracts for all teams
            const activeContracts = playerContracts.filter(p => p.status === 'Active' && p.team);
            // Find user's team name by matching session user name to team name (case-insensitive)
            const allTeamNames = Array.from(new Set(activeContracts.map(p => p.team.trim())));
            let myTeamName = '';
            if (session?.user?.name) {
              const nameLower = session.user.name.trim().toLowerCase();
              myTeamName = allTeamNames.find(team => team.trim().toLowerCase() === nameLower) || '';
            }
            if (!myTeamName) {
              const teamCounts = {};
              activeContracts.forEach(p => {
                const t = p.team.trim();
                teamCounts[t] = (teamCounts[t] || 0) + 1;
              });
              myTeamName = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
            }
            // User's contracts
            let myContracts = activeContracts.filter(p => p.team === myTeamName);
            // Deduplicate by playerId, keeping the contract with the highest salary (curYear)
            const seen = new Set();
            myContracts = myContracts
              .sort((a, b) => (b.curYear || 0) - (a.curYear || 0))
              .filter(player => {
                if (seen.has(player.playerId)) return false;
                seen.add(player.playerId);
                return true;
              });
            // --- Chart 1: Scatter chart (Salary vs KTC) ---
            const scatterData = myContracts
              .filter(p => !isNaN(parseFloat(p.curYear)) && !isNaN(parseFloat(p.ktcValue)))
              .map(p => ({
                playerName: p.playerName,
                position: p.position,
                curYear: parseFloat(p.curYear),
                ktcValue: parseFloat(p.ktcValue)
              }));
            // --- Chart 2: Stacked bar chart by year and position ---
            const years = ['curYear', 'year2', 'year3', 'year4'];
            const yearLabels = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
            const positions = ['QB', 'RB', 'WR', 'TE'];
            // Build data for each year
            const barData = years.map((yearKey, i) => {
              const yearObj = { year: yearLabels[i] };
              positions.forEach(pos => {
                yearObj[pos] = myContracts.filter(p => p.position === pos).reduce((sum, p) => sum + (parseFloat(p[yearKey]) || 0), 0);
              });
              // Dead cap: sum for this year for all non-active contracts
              yearObj['DeadCap'] = playerContracts.filter(p => p.status !== 'Active' && p.team === myTeamName).reduce((sum, p) => sum + (parseFloat(p[yearKey]) || 0), 0);
              return yearObj;
            });
            // Colors for positions
            const posColors = {
              QB: '#ef4444',
              RB: '#3b82f6',
              WR: '#22c55e',
              TE: '#a855f7',
              DeadCap: '#6b7280'
            };
            // --- Render ---
            return (
              <div>
                <h2 className="text-2xl font-bold mb-6 text-white text-center">Finance & Salary Cap Management</h2>
                {/* Chart 1: Scatter chart */}
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
                          x: {
                            type: 'linear',
                            title: { display: true, text: 'KTC Value', color: '#fff' },
                            min: 0,
                            max: 10000,
                            grid: { color: '#222' },
                            ticks: { color: '#fff' }
                          },
                          y: {
                            title: { display: true, text: 'Salary ($)', color: '#fff' },
                            min: 0,
                            max: 100,
                            grid: { color: '#222' },
                            ticks: { color: '#fff' }
                          }
                        },
                        responsive: true,
                        maintainAspectRatio: false,
                      }}
                    />
                  </div>
                </div>
                {/* Chart 2: Stacked bar chart by year/position/dead cap */}
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
                          chartAreaBackground: { color: '#0a2236' },
                          annotation: {
                            annotations: {
                              capLine: {
                                type: 'line',
                                yMin: 300,
                                yMax: 300,
                                borderColor: '#FF4B1F',
                                borderWidth: 3,
                                label: {
                                  content: 'Salary Cap ($300)',
                                  enabled: true,
                                  position: 'end',
                                  color: '#FF4B1F',
                                  backgroundColor: 'rgba(0,0,0,0.7)',
                                  font: { weight: 'bold' }
                                }
                              }
                            }
                          }
                        },
                        scales: {
                          x: {
                            stacked: true,
                            grid: { color: '#222' },
                            ticks: { color: '#fff' }
                          },
                          y: {
                            stacked: true,
                            min: 0,
                            max: 400,
                            grid: { color: '#222' },
                            ticks: { color: '#fff' }
                          }
                        },
                        responsive: true,
                        maintainAspectRatio: false,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })()
        )}
        {activeTab === 'Draft' && (
          <div className="text-white/80 text-lg p-8 text-center">Draft content coming soon.</div>
        )}
        {activeTab === 'Free Agency' && (
          <div className="text-white/80 text-lg p-8 text-center">Free Agency content coming soon.</div>
        )}
        {activeTab === 'Assistant GM' && (
          <div className="max-w-xl mx-auto bg-black/30 rounded-xl border border-white/10 p-8 shadow-lg">
            <h2 className="text-2xl font-bold mb-6 text-white text-center">Assistant GM Settings</h2>
            {/* Team State Dropdown */}
            <div className="mb-6">
              <label className="block text-white/80 mb-2 font-semibold">Team State</label>
              <select
                className="w-full p-3 rounded bg-white/5 border border-white/10 text-white"
                value={teamState}
                onChange={e => setTeamState(e.target.value)}
              >
                <option value="Compete">Compete</option>
                <option value="Rebuild">Rebuild</option>
              </select>
            </div>
            {/* Asset Priority Draggable */}
            <div className="mb-6">
              <label className="block text-white/80 mb-2 font-semibold">Asset Priority (drag to reorder)</label>
              <div className="text-white/60 text-sm mb-2">
                <span>
                  <strong>Left</strong> = Most Important, <strong>Right</strong> = Least Important
                </span>
              </div>
              <div className="flex gap-2">
                {assetPriority.map((asset, idx) => {
                  // Color map for positions
                  const colorMap = {
                    QB: '#ef4444',
                    RB: '#3b82f6',
                    WR: '#22c55e',
                    TE: '#a855f7',
                    Picks: '#fbbf24',
                  };
                  return (
                    <div
                      key={asset}
                      draggable
                      onDragStart={e => handleDragStart(idx)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => handleDrop(idx)}
                      className="font-bold px-4 py-2 rounded shadow cursor-move select-none border border-white/20"
                      style={{
                        opacity: draggingIdx === idx ? 0.5 : 1,
                        background: colorMap[asset] || '#1FDDFF',
                        color: asset === 'Picks' ? '#222' : '#fff', // dark text for yellow
                      }}
                    >
                      {asset}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Strategy Notes */}
            <div className="mb-6">
              <label className="block text-white/80 mb-2 font-semibold">Strategy Notes</label>
              <textarea
                className="w-full p-3 rounded bg-white/5 border border-white/10 text-white"
                rows={4}
                value={strategyNotes}
                onChange={e => setStrategyNotes(e.target.value)}
                placeholder="Describe your team's strategy for your assistant GM..."
                maxLength={300}
              />
              <div className="text-right text-white/60 text-sm mt-1">
                {strategyNotes.length} / 300 characters
              </div>
            </div>
            {/* Save Button */}
            <button
              className="w-full p-3 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors font-bold text-white"
              onClick={handleSaveAssistantGM}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Assistant GM Settings"}
            </button>
            {saveMsg && <div className="mt-4 text-center text-green-400">{saveMsg}</div>}
            {saveError && <div className="mt-4 text-center text-red-400">{saveError}</div>}
          </div>
        )}
        {activeTab === 'Media' && (
          <div className="text-white/80 text-lg p-8 text-center">Media content coming soon.</div>
        )}
      </div>
    </main>
  );
}