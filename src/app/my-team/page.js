'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ActivityBadges from './components/ActivityBadges';
import TeamPedigreeBadges from './components/TeamPedigreeBadges';
import PlayerProfileCard from './components/PlayerProfileCard';
import AssistantGMChat from './components/AssistantGMChat';
import { getSleeperLeagueWeekAndYear } from '../../utils/sleeperUtils';
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
  LineController,
  ScatterController
} from 'chart.js';
import DraftPicksFetcher from '../../components/draft/DraftPicksFetcher';

Chart.register(
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  LineController,
  ScatterController
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

// Remove the duplicate export default function MyTeam() above
export default function MyTeam() {
  const { data: session, status } = useSession();
  const router = useRouter();
  // --- Team Avatars and League ID (must be declared before any useEffect that uses them) ---
  const [teamAvatars, setTeamAvatars] = useState({});
  const [leagueId, setLeagueId] = useState(null);
  // State for current league week and year
  const [leagueWeek, setLeagueWeek] = useState(null);
  const [leagueYear, setLeagueYear] = useState(null);
  // Fetch current week and year from Sleeper API when leagueId changes
  useEffect(() => {
    if (!leagueId) return;
    getSleeperLeagueWeekAndYear(leagueId).then(({ week, year }) => {
      setLeagueWeek(week);
      setLeagueYear(year);
    });
  }, [leagueId]);
  // --- Player map and contracts (must be declared before any useEffect that uses them) ---
  const [playerMap, setPlayerMap] = useState({});
  const [playerContracts, setPlayerContracts] = useState([]);
  // --- Free Agency Tab State (must be top-level for React hooks rules) ---
  // (Free Agency tab state removed, placeholder only)

  // Contract Management Tab State (must be top-level for React hooks rules)
  const [extensionChoices, setExtensionChoices] = useState({});
  const [pendingExtension, setPendingExtension] = useState(null);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeMsg, setFinalizeMsg] = useState('');
  const [finalizeError, setFinalizeError] = useState('');
  // Add state for contract changes
  const [recentContractChanges, setRecentContractChanges] = useState([]);

  // Fetch recent contract changes for all players (any team, last 1 year)
  useEffect(() => {
    async function fetchRecentContractChanges() {
      try {
        const res = await fetch('/api/admin/contract_changes');
        const data = await res.json();
        console.log('[CONTRACT MGMT] Raw API response:', data); // <-- Add this line
        if (Array.isArray(data)) {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          const recent = data.filter(
            c =>
              c.change_type === 'extension' &&
              c.playerId &&
              c.timestamp &&
              new Date(c.timestamp) > oneYearAgo
          );
          setRecentContractChanges(recent);
        } else {
          setRecentContractChanges([]);
        }
      } catch (err) {
        console.error('[CONTRACT MGMT] Error fetching contract changes:', err); // <-- Add this line
        setRecentContractChanges([]);
      }
    }
    fetchRecentContractChanges();
  }, [playerContracts]);

  // More robust fix: Only redirect if unauthenticated AND not loading
  useEffect(() => {
    if (status === 'unauthenticated' && status !== 'loading') {
      router.push('/login');
    }
  }, [status, router]);

  // Debug: print current username on every render
  /*
  useEffect(() => {
    if (session?.user?.name) {
      console.log('[MY TEAM PAGE] Logged-in username:', session.user.name);
    } else {
      console.log('[MY TEAM PAGE] No user logged in');
    }
  }, [session?.user?.name]);
  */

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
  const assistantGMChatRef = useRef(null);

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
    'Contract Management', // <-- Add new tab here
  ];

  // Add at the top of your component (inside MyTeam)
  const [capModalInfo, setCapModalInfo] = useState(null);

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
      setPlayerMap(map);
      setPlayerContracts(contracts);
    }
    fetchPlayerData();
  }, []);

  function getPlayerName(id) {
    return playerMap[String(id)] || id;
  }

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

  useEffect(() => {
    if (activeTab !== 'Roster' || !session?.user?.name || !playerContracts.length) return;
    const activeContracts = playerContracts.filter(p => p.status === 'Active' && p.team);
    const allTeamNames = Array.from(new Set(activeContracts.map(p => p.team.trim())));
    const nameLower = session.user.name.trim().toLowerCase();
    console.log('[ROSTER TAB] Logged-in username:', session.user.name, '| Lowercase:', nameLower);
    console.log('[ROSTER TAB] All team names:', allTeamNames);
    let myTeamName = allTeamNames.find(team => team.trim().toLowerCase() === nameLower) || '';
    if (!myTeamName) {
      myTeamName = allTeamNames.find(team => team.trim().toLowerCase().includes(nameLower)) || '';
    }
    console.log('[ROSTER TAB] Matched team name:', myTeamName);
  }, [activeTab, session, playerContracts]);

  // --- Team Avatars and League ID ---
  // (moved to top of component)

  // Find the user's BBB leagueId using Sleeper API (same logic as Player Contracts page)
  useEffect(() => {
    async function findBBBLeague() {
      if (!session?.user?.sleeperId) return;
      try {
        // Get current NFL season
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;

        // Get user's leagues for the current season
        const userLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${session.user.sleeperId}/leagues/nfl/${currentSeason}`);
        const userLeagues = await userLeaguesResponse.json();

        // Try flexible matching for "Budget Blitz Bowl"
        let bbbLeagues = userLeagues.filter(league =>
          league.name && (
            league.name.includes('Budget Blitz Bowl') ||
            league.name.includes('budget blitz bowl') ||
            league.name.includes('BBB') ||
            (league.name.toLowerCase().includes('budget') && league.name.toLowerCase().includes('blitz'))
          )
        );

        // If not found, try previous season
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

        // Sort by season and take the most recent
        const mostRecentLeague = bbbLeagues.sort((a, b) => b.season - a.season)[0];
        setLeagueId(mostRecentLeague.league_id);
      } catch (err) {
        setLeagueId(null);
      }
    }
    findBBBLeague();
  }, [session?.user?.sleeperId]);

  // Fetch team avatars using detected leagueId
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
      } catch (e) {
        // Optionally handle error
      }
    }
    fetchAvatars();
  }, [leagueId]);

  // Helper to get myTeamName for Assistant GM Chat
  function getMyTeamName() {
    const activeContracts = playerContracts.filter(p => (p.status === 'Active' || p.status === 'Future') && p.team);
    const allTeamNames = Array.from(new Set(activeContracts.map(p => p.team.trim())));
    let myTeamName = '';
    if (session?.user?.name) {
      const nameLower = session.user.name.trim().toLowerCase();
      myTeamName = allTeamNames.find(team => team.trim().toLowerCase() === nameLower) || '';
      if (!myTeamName) {
        myTeamName = allTeamNames.find(team => team.trim().toLowerCase().includes(nameLower)) || '';
      }
    }
    if (!myTeamName) {
      const teamCounts = {};
      activeContracts.forEach(p => {
        const t = p.team.trim();
        teamCounts[t] = (teamCounts[t] || 0) + 1;
      });
      myTeamName = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    }
    return myTeamName;
  }

  // Helper to get myContracts for Assistant GM Chat
  function getMyContractsForAssistantGM() {
    const myTeamName = getMyTeamName();
    // Only Active or Future contracts for user's team
    let myContracts = playerContracts.filter(
      p => (p.status === 'Active' || p.status === 'Future') && p.team && p.team.trim().toLowerCase() === myTeamName.trim().toLowerCase()
    );
    // Deduplicate by playerId, keeping the contract with the highest salary (curYear)
    const seen = new Set();
    myContracts = myContracts
      .sort((a, b) => (b.curYear || 0) - (a.curYear || 0))
      .filter(player => {
        if (seen.has(player.playerId)) return false;
        seen.add(player.playerId);
        return true;
      });
    return myContracts;
  }

  // Updated conditional rendering: show nothing (or spinner) while loading
  if (status === 'loading') {
    return null; // Or a spinner if you prefer
  }

  // Check if the extension window is open (between May 1st and August 31st)
  function isExtensionWindowOpen() {
    const now = new Date();
    const year = now.getFullYear();
    const may1 = new Date(year, 4, 1); // May 1st (month is 0-indexed)
    const aug31 = new Date(year, 7, 31); // August 31st
    return now >= may1 && now <= aug31;
  }

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
              console.log('Logged-in username:', session.user.name, '| Lowercase:', nameLower);
              console.log('All team names:', allTeamNames);
              // Try exact match first
              myTeamName = allTeamNames.find(team => team.trim().toLowerCase() === nameLower) || '';
              // If not found, try partial match (user name included in team name)
              if (!myTeamName) {
                myTeamName = allTeamNames.find(team => team.trim().toLowerCase().includes(nameLower)) || '';
              }
              console.log('Matched team name:', myTeamName);
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
            let myContracts = activeContracts.filter(p => p.team && p.team.trim().toLowerCase() === myTeamName.trim().toLowerCase());
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
                  {(typeof selectedPlayerId === 'string' || typeof selectedPlayerId === 'number') && (
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                      onClick={() => setSelectedPlayerId(null)}
                    >
                      <div
                        className="bg-transparent p-0 rounded-lg shadow-2xl relative"
                        onClick={e => e.stopPropagation()}
                      >
                        <PlayerProfileCard
                          playerId={selectedPlayerId}
                          expanded={true}
                          className="w-56 h-80 sm:w-72 sm:h-[26rem] md:w-80 md:h-[30rem] max-w-full max-h-[90vh]"
                          teamName={myTeamName}
                          teamAvatars={teamAvatars}
                        />
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
                            {myContracts.map((player) => (
                              <tr key={player.contractId || `${player.playerId}-${player.contractFinalYear || ''}`} className="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
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
                                {/* Team column with avatar */}
                                <td className="p-3 flex items-center gap-2">
                                  {teamAvatars[player.team] ? (
                                    <img
                                      src={`https://sleepercdn.com/avatars/${teamAvatars[player.team]}`}
                                      alt={player.team}
                                      className="w-5 h-5 rounded-full mr-2"
                                    />
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
          <DraftPicksFetcher
            leagueId={leagueId}
            rosters={leagueRosters[leagueId] || []}
            render={(picksByOwner, loading, error, rosterIdToDisplayName) => {
              // Flatten all picks from all owners into a single array
              const allPicks = Object.values(picksByOwner).flat();

              // Group picks by year, then by round
              const picksByYear = {};
              allPicks.forEach(pick => {
                const year = pick.season || pick.year || pick.draftYear || 'Unknown';
                const round = pick.round || 'Unknown';
                if (!picksByYear[year]) picksByYear[year] = {};
                if (!picksByYear[year][round]) picksByYear[year][round] = [];
                picksByYear[year][round].push(pick);
              });
              const sortedYears = Object.keys(picksByYear).sort();

              // Find the active user's roster_id (if available)
              let myRosterId = null;
              if (session?.user?.sleeperId && Array.isArray(leagueRosters[leagueId])) {
                const myRoster = leagueRosters[leagueId].find(
                  r => r.owner_id === session.user.sleeperId
                );
                if (myRoster) myRosterId = myRoster.roster_id;
              }

              // --- Toggle state ---
              const [showMineOnly, setShowMineOnly] = React.useState(false);

              return (
                <div>
                  <h2 className="text-2xl font-bold mb-6 text-white text-center">All League Draft Picks</h2>
                  <div className="flex items-center gap-3 mb-4">
                    <label className="flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showMineOnly}
                        onChange={e => setShowMineOnly(e.target.checked)}
                        className="form-checkbox h-5 w-5 text-[#FF4B1F] rounded focus:ring-[#FF4B1F] border-white/20"
                      />
                      <span className="ml-2 text-white/80 font-semibold">Show Only My Picks</span>
                    </label>
                  </div>
                  {loading && (
                    <div className="text-white/60 italic text-center">Loading draft picks...</div>
                  )}
                  {error && (
                    <div className="text-red-400 text-center mb-4">Error: {error}</div>
                  )}
                  {!loading && allPicks.length === 0 && (
                    <div className="text-white/60 italic text-center">No draft picks found for this league.</div>
                  )}
                  {!loading && allPicks.length > 0 && (
                    <div className="space-y-8">
                      {sortedYears.map(year => (
                        <div key={year} className="bg-black/30 rounded-xl border border-white/10 p-6 shadow-lg">
                          <h3 className="text-xl font-bold text-[#FF4B1F] mb-4">{year} Draft Picks</h3>
                          <div className="flex flex-wrap gap-6">
                            {Object.keys(picksByYear[year])
                              .sort((a, b) => parseInt(a) - parseInt(b))
                              .map(round => (
                                <div key={round} className="bg-white/10 rounded px-4 py-2 text-white/90 font-semibold min-w-[120px]">
                                  <div className="text-[#1FDDFF] font-bold mb-1">Round {round}</div>
                                  <ul className="list-disc list-inside text-left mx-auto" style={{ maxWidth: 400 }}>
                                    {picksByYear[year][round]
                                      .filter(pick => !showMineOnly || (myRosterId && pick.owner_id === myRosterId))
                                      .map((pick, idx) => {
                                        const isMine = myRosterId && pick.owner_id === myRosterId;
                                        return (
                                          <li
                                            key={idx}
                                            style={isMine ? { color: '#FF4B1F', fontWeight: 'bold' } : {}}
                                          >
                                            Pick {pick.pick_no || pick.pick_id || '-'}

                                            {pick.owner_id ? (
                                              <span className="ml-2" style={isMine ? { color: '#FF4B1F' } : { color: 'rgba(255,255,255,0.6)' }}>
                                                Owner: {rosterIdToDisplayName[pick.owner_id] || pick.owner_id}
                                              </span>
                                            ) : null}
                                            {pick.original_owner_id && pick.owner_id !== pick.original_owner_id ? (
                                              <span className="ml-2 text-white/60 text-xs">
                                                (Originally from {rosterIdToDisplayName[pick.original_owner_id] || pick.original_owner_id})
                                              </span>
                                            ) : null}
                                          </li>
                                        );
                                      })}
                                  </ul>
                                </div>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }}
          />
        )}
        {activeTab === 'Free Agency' && (
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

            // For each player, find the max contractFinalYear among all contracts (any team) with status Active or Future
            const playerIdToMaxFinalYear = {};
            playerContracts.forEach(p => {
              if ((p.status === 'Active' || p.status === 'Future') && p.playerId) {
                const year = parseInt(p.contractFinalYear);
                if (!isNaN(year)) {
                  if (!playerIdToMaxFinalYear[p.playerId] || year > playerIdToMaxFinalYear[p.playerId]) {
                    playerIdToMaxFinalYear[p.playerId] = year;
                  }
                }
              }
            });

            // For each player on user's team, assign their free agency year as maxFinalYear
            const playerIdToPlayer = {};
            myContracts.forEach(p => {
              playerIdToPlayer[p.playerId] = p;
            });

            // Build free agents by year using max contractFinalYear
            const currentYear = new Date().getFullYear();
            const years = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3];
            const freeAgentsByYear = years.map(year => {
              // For each player, if their maxFinalYear === year, include them
              const players = myContracts.filter(p => playerIdToMaxFinalYear[p.playerId] === year);
              // For display, update contractFinalYear to maxFinalYear for each player
              const playersWithMaxYear = players.map(p => ({ ...p, contractFinalYear: playerIdToMaxFinalYear[p.playerId] }));
              return {
                year,
                players: playersWithMaxYear
              };
            });

            // --- Player Card Modal for Free Agency tab ---
            // Only show if Free Agency tab is active and selectedPlayerId is set
            return (
              <div>
                <h2 className="text-2xl font-bold mb-6 text-white text-center">Upcoming Free Agents By Year</h2>
                {/* Player Card Modal (Free Agency tab) */}
                {(typeof selectedPlayerId === 'string' || typeof selectedPlayerId === 'number') && activeTab === 'Free Agency' && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                    onClick={() => setSelectedPlayerId(null)}
                  >
                    <div
                      className="bg-transparent p-0 rounded-lg shadow-2xl relative"
                      onClick={e => e.stopPropagation()}
                    >
                      <PlayerProfileCard
                        playerId={selectedPlayerId}
                        expanded={true}
                        className="w-56 h-80 sm:w-72 sm:h-[26rem] md:w-80 md:h-[30rem] max-w-full max-h-[90vh]"
                        teamName={myTeamName}
                        teamAvatars={teamAvatars}
                      />
                      <button
                        className="absolute top-2 right-2 text-white bg-black/60 rounded-full px-3 py-1 hover:bg-black"
                        onClick={() => setSelectedPlayerId(null)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
                <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                  {freeAgentsByYear.map(({ year, players }) => (
                    <div key={year} className="bg-black/30 rounded-xl border border-white/10 p-6 shadow-lg">
                      <h3 className="text-xl font-bold text-[#FF4B1F] mb-4">{year + 1} Free Agents</h3>
                      {players.length > 0 ? (
                        <ul className="divide-y divide-white/10">
                          {players.map(player => (
                            <li key={player.playerId} className="py-2 flex items-center gap-2">
                              <div className="w-8 h-8 flex-shrink-0">
                                <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-8 h-8 rounded-full overflow-hidden shadow" />
                              </div>
                              <span
                                className="font-semibold text-white/90 text-sm cursor-pointer underline"
                                onClick={() => setSelectedPlayerId(player.playerId)}
                              >
                                {player.playerName}
                              </span>
                              <span className="text-white/60 text-xs">({player.position})</span>
                              <span className="ml-auto text-white/70 text-xs">${player.curYear?.toFixed(1) ?? '-'}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-white/60 italic">No free agents for {year + 1}.</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()
        )}
        {activeTab === 'Assistant GM' && (
          <DraftPicksFetcher
            leagueId={leagueId}
            rosters={leagueRosters[leagueId] || []}
            render={(picksByOwner, loading, error, rosterIdToDisplayName) => {
              // Find the active user's roster_id (if available)
              let myRosterId = null;
              if (session?.user?.sleeperId && Array.isArray(leagueRosters[leagueId])) {
                const myRoster = leagueRosters[leagueId].find(
                  r => r.owner_id === session.user.sleeperId
                );
                if (myRoster) myRosterId = myRoster.roster_id;
              }

              // Flatten all picks from all owners into a single array
              const allPicks = Object.values(picksByOwner).flat();
              // Filter picks owned by the user
              const myRawDraftPicks = myRosterId
                ? allPicks.filter(pick => pick.owner_id === myRosterId)
                : [];

              // Format picks for display in the system prompt
              const myDraftPicksList = myRawDraftPicks.map(pick => {
                const year = pick.season || pick.year || pick.draftYear || 'Unknown';
                const round = pick.round || '?';
                let str = `${year} Round ${round}`;
                if (pick.original_owner_id && pick.owner_id !== pick.original_owner_id) {
                  str += ` (original: ${rosterIdToDisplayName[pick.original_owner_id] || pick.original_owner_id})`;
                }
                return str;
              });

              return (
                <div className="flex flex-col md:flex-row gap-8 max-w-4xl mx-auto">
                  {/* Assistant GM Settings */}
                  <div className="bg-black/30 rounded-xl border border-white/10 p-8 shadow-lg w-full md:w-1/2">
                    <h2 className="text-2xl font-bold mb-6 text-white text-center">Assistant GM Settings</h2>
                    <div className="mb-6 text-white/80 text-base text-center">
                      The Assistant GM settings control the aggressiveness, direction, and overall team building strategy of your Assistant GM. Change these settings to match your own strategy to put you and your assistant GM on the same page.
                    </div>
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
                                color: asset === 'Picks' ? '#222' : '#fff',
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
                        className="w-full p-3 rounded bg-white/5 border border-white/10 text-white resize-none h-24"
                        value={strategyNotes}
                        onChange={e => setStrategyNotes(e.target.value)}
                        placeholder="Enter your strategy notes here..."
                      />
                    </div>
                                                                                                                                                                                                                                                                                                                               {/* Save Button and Messages */}
                    <div className="flex flex-col items-center">
                      <button
                        className="px-4 py-2 bg-[#FF4B1F] text-white rounded hover:bg-orange-600 font-semibold"
                        onClick={async () => {
                          await handleSaveAssistantGM();
                          // Reset Assistant GM Chat after saving settings
                          const chatFrame = document.getElementById('assistant-gm-chat-frame');
                          if (chatFrame && chatFrame.resetChat) {
                            chatFrame.resetChat();
                          }
                        }}
                        disabled={saving}
                      >
                        {saving ? "Saving..." : "Save Assistant GM Settings"}
                      </button>
                      {saveMsg && <div className="mt-4 text-center text-green-400">{saveMsg}</div>}
                      {saveError && <div className="mt-4 text-center text-red-400">{saveError}</div>}
                    </div>
                  </div>
                  {/* Assistant GM Chat */}
                  <div className="bg-black/30 rounded-xl border border-white/10 p-8 shadow-lg w-full md:w-1/2 flex flex-col">
                    <h2 className="text-xl font-bold mb-4 text-white text-center">Assistant GM Chat</h2>
                    <AssistantGMChat
                      ref={assistantGMChatRef}
                      id="assistant-gm-chat-frame"
                      teamState={teamState}
                      assetPriority={assetPriority}
                      strategyNotes={strategyNotes}
                      myContracts={getMyContractsForAssistantGM()}
                      playerContracts={ playerContracts}
                      session={session}
                      tradedPicks={leagueTradedPicks.tradedPicks || []}
                      rosters={leagueRosters[leagueId] || []}
                      users={[]}
                      myDraftPicksList={myDraftPicksList}
                      leagueWeek={leagueWeek}
                      leagueYear={leagueYear}
                      activeTab={activeTab} // <-- add this line
                    />
                  </div>
                </div>
              );
            }}
          />
        )}
        {activeTab === 'Contract Management' && (
          (() => {
            // Helper: round up to 1 decimal
            function roundUp1(num) {
              return Math.ceil(num * 10) / 10;
            }
            // Get current league year (from state or fallback to current year)
            const curYear = Number(leagueYear) || new Date().getFullYear();
            // Calculate cap space for years 1-4
            const CAP = 300;

            // --- Use ALL contracts for user's team, regardless of status (to match Salary Cap page) ---
            // Find all unique team names from all contracts
            const allTeamNames = Array.from(new Set(playerContracts.filter(p => p.team).map(p => p.team.trim())));
            let myTeamName = '';
            if (session?.user?.name) {
              const nameLower = session.user.name.trim().toLowerCase();
              myTeamName = allTeamNames.find(team => team.trim().toLowerCase() === nameLower) || '';
              if (!myTeamName) {
                myTeamName = allTeamNames.find(team => team.trim().toLowerCase().includes(nameLower)) || '';
              }
            }
            if (!myTeamName) {
              const teamCounts = {};
              playerContracts.forEach(p => {
                if (!p.team) return;
                const t = p.team.trim();
                teamCounts[t] = (teamCounts[t] || 0) + 1;
              });
              myTeamName = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
            }

            // All contracts for user's team (all statuses)
            const myContractsAll = playerContracts.filter(
              p => p.team && p.team.trim().toLowerCase() === myTeamName.trim().toLowerCase()
            );

            // Build cap numbers for years 1-4
            const yearSalaries = [0, 0, 0, 0]; // index 0 = curYear, 1 = year2, etc.
            const yearDead = [0, 0, 0, 0];     // dead cap for each year

            // --- UPDATE: Include "Future" contracts in salary columns ---
            myContractsAll.forEach(p => {
              // Use salary columns for Active/Future, dead columns for all others
              if (p.status === 'Active' || p.status === 'Future') {
                yearSalaries[0] += parseFloat(p.curYear) || 0;
                yearSalaries[1] += parseFloat(p.year2) || 0;
                yearSalaries[2] += parseFloat(p.year3) || 0;
                yearSalaries[3] += parseFloat(p.year4) || 0;
              } else {
                yearDead[0] += parseFloat(p.curYear) || 0;
                yearDead[1] += parseFloat(p.year2) || 0;
                yearDead[2] += parseFloat(p.year3) || 0;
                yearDead[3] += parseFloat(p.year4) || 0;
              }
            });

            // For display, total cap used = yearSalaries[i] + yearDead[i]

            // --- Find eligible players for extension (same as before) ---
            // Filter out any player who has any contract with status "Future"
            const playerIdsWithFuture = new Set(
              playerContracts.filter(
                p => p.status === 'Future' && p.team && p.team.trim().toLowerCase() === myTeamName.trim().toLowerCase()
              ).map(p => p.playerId)
            );
            // Only consider "Active" contracts for extension eligibility
            let eligiblePlayers = myContractsAll.filter(
              p =>
                p.status === 'Active' &&
                String(p.contractType).toLowerCase() === 'base' &&
                String(p.rfaEligible).toLowerCase() !== 'true' &&
                String(p.contractFinalYear) === String(curYear) &&
                !playerIdsWithFuture.has(p.playerId)
            );

            // --- Remove players with a recent extension (within last year, ANY team) ---
            if (recentContractChanges.length > 0) {
              // Debug: Show which playerIds are being filtered
              console.log('[CONTRACT MGMT] recentContractChanges:', recentContractChanges.map(c => ({
                playerId: String(c.playerId).trim(),
                playerName: c.playerName || '(no name)'
              })));
              const recentlyExtendedIds = new Set(
                recentContractChanges.map(c => String(c.playerId).trim())
              );
              eligiblePlayers = eligiblePlayers.filter(
                p => {
                  const isFiltered = recentlyExtendedIds.has(String(p.playerId).trim());
                  if (isFiltered) {
                    console.log(`[CONTRACT MGMT] Filtering out playerId: ${p.playerId} (${p.playerName})`);
                  }
                  return !isFiltered;
                }
              );
            }

            // Always log the full recentContractChanges array for inspection
            console.log('[CONTRACT MGMT] recentContractChanges FULL:', recentContractChanges);

            // Log just the playerId and playerName for comparison
            console.log('[CONTRACT MGMT] recentContractChanges (playerId, playerName):', recentContractChanges.map(c => ({
              playerId: String(c.playerId).trim(),
              playerName: c.playerName || '(no name)'
            })));

            // Log the eligible players after filtering
            console.log('[CONTRACT MGMT] recentContractChanges (playerId, playerName):', eligiblePlayers.map(p => ({
              playerId: String(p.playerId).trim(),
              playerName: p.playerName
            })));

            // --- Simulate extensions ---
            const extensionMap = {};
            eligiblePlayers.forEach(p => {
              const choice = extensionChoices[p.playerId] || { years: 0, deny: false };
              extensionMap[p.playerId] = choice;
            });

            // Add extension costs to future years
            eligiblePlayers.forEach(p => {
              const ext = extensionMap[p.playerId] || { years: 0, deny: false };
              if (ext.deny || !ext.years) return;
              let base = parseFloat(p.curYear) || 0;
              for (let i = 1; i <= ext.years; ++i) {
                base = roundUp1(base * 1.10);
                if (i < 4) yearSalaries[i] += base; // i=1: year2, i=2: year3, i=3: year4
              }
            });

            // --- Modal openCapModal function ---
            function openCapModal(yearIdx) {
              // Map yearIdx to contract year keys
              const yearMap = [
                { salary: 'curYear', label: 'Current Year' },
                { salary: 'year2', label: 'Year 2' },
                { salary: 'year3', label: 'Year 3' },
                { salary: 'year4', label: 'Year 4' },
              ];
              const { salary, label } = yearMap[yearIdx];

              // Collect all contracts for this team for this year, using correct salary logic
              const players = myContractsAll
                .map(c => {
                  let contractSalary = 0;
                  let isDead = !(c.status === "Active" || c.status === "Future");
                  contractSalary = parseFloat(c[salary]) || 0;
                  return {
                    playerName: c.playerName,
                    contractType: c.contractType,
                    salary: contractSalary,
                    status: c.status,
                    isDead,
                  };
                })
                .filter(c => c.salary > 0)
                .sort((a, b) => b.salary - a.salary);

              // Group by status
              const grouped = players.reduce((acc, p) => {
                if (!acc[p.status]) acc[p.status] = [];
                acc[p.status].push(p);
                return acc;
              }, {});

              // Sort groups: Active, Future, Expired, Cut, etc.
              const statusOrder = ["Active", "Future", "Expired", "Cut"];
              const orderedGroups = Object.keys(grouped)
                .sort((a, b) => {
                  const ai = statusOrder.indexOf(a);
                  const bi = statusOrder.indexOf(b);
                  if (ai === -1 && bi === -1) return a.localeCompare(b);
                  if (ai === -1) return 1;
                  if (bi === -1) return -1;
                  return ai - bi;
                })
                .map(status => ({ status, players: grouped[status] }));

              setCapModalInfo({ yearIdx, label, groups: orderedGroups });
            }

            // --- UI ---
            return (
              <div className="w-full flex flex-col items-center">
                <h2 className="text-2xl font-bold mb-6 text-white text-center">Contract Management</h2>
                {/* --- Contract Extensions Section --- */}
                <div className="w-full max-w-3xl bg-black/30 rounded-xl border border-white/10 p-8 shadow-lg mb-10">
                  <h3 className="text-xl font-bold text-[#FF4B1F] mb-4">Contract Extensions</h3>
                  <div className="mb-6 text-white/80 text-base">
                    Extend players on expiring base contracts (not entering RFA). Simulate different extension scenarios and see the impact on your cap space.
                  </div>
                  {/* Cap Space Table */}
                  <div className="mb-8">
                    <h4 className="font-semibold text-white mb-2">Simulated Cap Usage</h4>
                    <table className="w-full text-center border border-white/10 rounded bg-white/5 mb-2">
                      <thead>
                        <tr>
                          <th className="p-2 text-white/80">Year</th>
                          <th className="p-2 text-white/80 border-l border-white/10">Cap Used</th>
                          <th className="p-2 text-white/80 border-l border-white/10">Extension Cost</th>
                          <th className="p-2 text-white/80 border-l border-white/10">Cap Space</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[0,1,2,3].map(i => {
                          // Calculate extension cost for this year (i=1: year2, i=2: year3, i=3: year4)
                          let extensionCost = 0;
                          eligiblePlayers.forEach(p => {
                            const ext = extensionMap[p.playerId] || { years: 0, deny: false };
                            if (ext.deny || !ext.years) return;
                            let base = parseFloat(p.curYear) || 0;
                            for (let y = 1; y <= ext.years; ++y) {
                              base = roundUp1(base * 1.10);
                              if (i === y) extensionCost += base;
                            }
                          });
                          const capUsed = yearSalaries[i] + yearDead[i];
                          return (
                            <tr key={i} className="cursor-pointer hover:bg-white/10"
                              onClick={() => openCapModal(i)}>
                              <td className="p-2">{curYear + i}</td>
                              <td className="p-2 border-l border-white/10">${capUsed.toFixed(1)}</td>
                              <td className="p-2 border-l border-white/10 text-blue-300 font-semibold">
                                {i === 0 ? '-' : `$${extensionCost.toFixed(1)}`}
                              </td>
                              <td className={`p-2 border-l border-white/10 font-bold ${capUsed > CAP ? 'text-red-400' : 'text-green-400'}`}>
                                {(CAP - capUsed).toFixed(1)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="text-xs text-white/60">Cap limit: ${CAP} per year</div>
                  </div>
                  {/* Eligible Players List */}
                  <div>
                    <h4 className="font-semibold text-white mb-2">Eligible Players</h4>
                    {eligiblePlayers.length === 0 ? (
                      <div className="text-white/60 italic">No players eligible for extension this year.</div>
                    ) : (
                      <>
                        {/* Desktop Table */}
                        <div className="overflow-x-auto rounded hidden md:block">
                          <table className="min-w-[600px] w-full text-sm border border-white/10 rounded bg-white/5">
                            <thead>
                              <tr>
                                <th className="p-2 text-white/80">Player</th>
                                <th className="p-2 text-white/80">Current Salary</th>
                                <th className="p-2 text-white/80">Extension</th>
                                <th className="p-2 text-white/80">Simulated Years</th>
                                <th className="p-2 text-white/80"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {eligiblePlayers.map(player => {
                                const ext = extensionMap[player.playerId] || { years: 0, deny: false };
                                let base = parseFloat(player.curYear) || 0;
                                const simYears = [];
                                let extensionSalaries = [];
                                for (let i = 1; i <= ext.years; ++i) {
                                  base = roundUp1(base * 1.10);
                                  simYears.push(`Year ${i+1}: $${base}`);
                                  extensionSalaries.push(base);
                                }
                                const showFinalize = !ext.deny && ext.years > 0;
                                return (
                                  <tr key={player.playerId}>
                                    <td className="p-2 font-semibold text-white flex items-center gap-2">
                                      <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-8 h-8 rounded-full overflow-hidden shadow" />
                                      {player.playerName}
                                    </td>
                                    <td className="p-2">${parseFloat(player.curYear).toFixed(1)}</td>
                                    <td className="p-2">
                                      <select
                                        className="bg-white/10 text-white rounded px-2 py-1"
                                        value={ext.deny ? 'deny' : ext.years}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setExtensionChoices(prev => ({
                                            ...prev,
                                            [player.playerId]: val === 'deny'
                                              ? { years: 0, deny: true }
                                              : { years: Number(val), deny: false }
                                          }));
                                          // Show finalize button if extension selected
                                          if (val !== '0' && val !== 'deny') {
                                            setPendingExtension({
                                              player,
                                              years: Number(val),
                                              baseSalary: parseFloat(player.curYear),
                                              extensionSalaries,
                                            });
                                          } else if (pendingExtension && pendingExtension.player.playerId === player.playerId) {
                                            setPendingExtension(null);
                                          }
                                        }}
                                      >
                                        <option value={0}>No Extension</option>
                                        <option value={1}>1 Year</option>
                                        <option value={2}>2 Years</option>
                                        <option value={3}>3 Years</option>
                                      </select>
                                    </td>
                                    <td className="p-2">
                                      {ext.deny || !ext.years ? (
                                        <span className="text-white/60 italic">No extension</span>
                                      ) : (
                                        <div className="flex flex-col items-start">
                                          {simYears.map((s, i) => (
                                            <span key={i}>{s}</span>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-2">
                                      {showFinalize && pendingExtension && pendingExtension.player.playerId === player.playerId && (
                                        <button
                                          className="px-3 py-1 bg-[#FF4B1F] text-white rounded hover:bg-orange-600 font-semibold"
                                          disabled={finalizeLoading}
                                          onClick={async () => {
                                            const confirmMsg = `Are you sure you want to finalize a ${pendingExtension.years} year contract extension for ${player.playerName}? This cannot be undone or changed later.`;
                                            if (!window.confirm(confirmMsg)) return;

                                            setFinalizeLoading(true);
                                            setFinalizeMsg('');
                                            setFinalizeError('');
                                            try {
                                              // Prepare contract change object
                                              let base = parseFloat(player.curYear);
                                              const extensionSalaries = [];
                                              for (let i = 1; i <= pendingExtension.years; ++i) {
                                                base = Math.ceil(base * 1.10 * 10) / 10;
                                                extensionSalaries.push(base);
                                              }
                                              const contractChange = {
                                                change_type: 'extension',
                                                user: session?.user?.name || '',
                                                timestamp: new Date().toISOString(),
                                                notes: `Extended ${player.playerName} for ${pendingExtension.years} year(s) at $${extensionSalaries.join(', $')}`,
                                                ai_notes: '', // will be filled below
                                                playerId: player.playerId,
                                                playerName: player.playerName,
                                                years: pendingExtension.years,
                                                extensionSalaries,
                                                team: myTeamName,
                                              };

                                              // --- Call your serverless API route for ai_notes ---
                                              try {
                                                const aiRes = await fetch('/api/ai/transaction_notes', {
                                                  method: 'POST',
                                                  headers: { 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({ contractChange }),
                                                });
                                                const aiData = await aiRes.json();
                                                contractChange.ai_notes = aiData.ai_notes || "AI summary unavailable.";
                                              } catch (err) {
                                                contractChange.ai_notes = "AI summary unavailable.";
                                              }

                                              // Save to API
                                              const res = await fetch('/api/admin/contract_changes', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify(contractChange),
                                              });
                                              const data = await res.json();
                                              if (!res.ok) throw new Error(data.error || 'Failed to save extension');
                                              setFinalizeMsg('Extension finalized and saved!');
                                              setPendingExtension(null);

                                              // --- Refresh eligible players by refetching contract changes ---
                                              const refreshRes = await fetch('/api/admin/contract_changes');
                                              const refreshData = await refreshRes.json();
                                              if (Array.isArray(refreshData)) {
                                                const oneYearAgo = new Date();
                                                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                                                const recent = refreshData.filter(
                                                  c =>
                                                    c.change_type === 'extension' &&
                                                    c.playerId &&
                                                    c.timestamp &&
                                                    new Date(c.timestamp) > oneYearAgo
                                                );
                                                setRecentContractChanges(recent);
                                              }
                                            } catch (err) {
                                              setFinalizeError(err.message);
                                            } finally {
                                              setFinalizeLoading(false);
                                            }
                                          }}
                                        >
                                          {finalizeLoading ? 'Saving...' : 'Finalize Extension'}
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {/* Add window closed message for desktop */}
                          {!isExtensionWindowOpen() && (
                            <div className="mt-2 text-yellow-400 text-sm">
                              Extensions can only be finalized between May 1st and August 31st.
                            </div>
                          )}
                        </div>
                        {/* Mobile Cards */}
                        <div className="flex flex-col gap-4 md:hidden">
                          {eligiblePlayers.map(player => {
                            const ext = extensionMap[player.playerId] || { years: 0, deny: false };
                            let base = parseFloat(player.curYear) || 0;
                            const simYears = [];
                            let extensionSalaries = [];
                            for (let i = 1; i <= ext.years; ++i) {
                              base = roundUp1(base * 1.10);
                              simYears.push(`Year ${i+1}: $${base}`);
                              extensionSalaries.push(base);
                            }
                            const showFinalize = !ext.deny && ext.years > 0;
                            return (
                              <div
                                key={player.playerId}
                                className="bg-white/5 border border-white/10 rounded-xl p-0 flex flex-col shadow overflow-hidden"
                              >
                                {/* Header Block */}
                                <div className="flex items-center gap-3 px-4 py-3 bg-black/20 border-b border-white/10">
                                  <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-10 h-10 rounded-full overflow-hidden shadow" />
                                  <span className="font-semibold text-white text-lg">{player.playerName}</span>
                                </div>
                                {/* Salary Block */}
                                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/10">
                                  <div>
                                    <div className="text-xs text-white/60">Current Salary</div>
                                    <div className="font-bold text-white text-base">${parseFloat(player.curYear).toFixed(1)}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-white/60">Extension</div>
                                    <select
                                      className="bg-white/10 text-white rounded px-2 py-1 mt-1"
                                      value={ext.deny ? 'deny' : ext.years}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setExtensionChoices(prev => ({
                                          ...prev,
                                          [player.playerId]: val === 'deny'
                                            ? { years: 0, deny: true }
                                            : { years: Number(val), deny: false }
                                        }));
                                        if (val !== '0' && val !== 'deny') {
                                          setPendingExtension({
                                            player,
                                            years: Number(val),
                                            baseSalary: parseFloat(player.curYear),
                                            extensionSalaries,
                                          });
                                        } else if (pendingExtension && pendingExtension.player.playerId === player.playerId) {
                                          setPendingExtension(null);
                                        }
                                      }}
                                    >
                                      <option value={0}>No Extension</option>
                                      <option value={1}>1 Year</option>
                                      <option value={2}>2 Years</option>
                                      <option value={3}>3 Years</option>
                                    </select>
                                  </div>
                                </div>
                                {/* Simulated Years Block */}
                                <div className="px-4 py-3 bg-black/10">
                                  <div className="text-xs text-white/60 mb-1">Simulated Years</div>
                                  {ext.deny || !ext.years ? (
                                    <span className="text-white/60 italic">No extension</span>
                                  ) : (
                                    <div className="flex flex-col items-start gap-1">
                                      {simYears.map((s, i) => (
                                        <span key={i} className="text-white">{s}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {/* Finalize Button */}
                                {showFinalize && pendingExtension && pendingExtension.player.playerId === player.playerId && (
                                  <button
                                    className="m-4 px-3 py-1 bg-[#FF4B1F] text-white rounded hover:bg-orange-600 font-semibold"
                                    disabled={finalizeLoading || !isExtensionWindowOpen()}
                                    onClick={async () => {
                                      // 1. Confirmation dialog
                                      const confirmMsg = `Are you sure you want to finalize a ${pendingExtension.years} year contract extension for ${player.playerName}? This cannot be undone or changed later.`;
                                      if (!window.confirm(confirmMsg)) return;

                                      setFinalizeLoading(true);
                                      setFinalizeMsg('');
                                      setFinalizeError('');
                                      try {
                                        // Prepare contract change object
                                        let base = parseFloat(player.curYear);
                                        const extensionSalaries = [];
                                        for (let i = 1; i <= pendingExtension.years; ++i) {
                                          base = Math.ceil(base * 1.10 * 10) / 10;
                                          extensionSalaries.push(base);
                                        }
                                        const contractChange = {
                                          change_type: 'extension',
                                          user: session?.user?.name || '',
                                          timestamp: new Date().toISOString(),
                                          notes: `Extended ${player.playerName} for ${pendingExtension.years} year(s) at $${extensionSalaries.join(', $')}`,
                                          ai_notes: '', // will be filled below
                                          playerId: player.playerId,
                                          playerName: player.playerName,
                                          years: pendingExtension.years,
                                          extensionSalaries,
                                          team: myTeamName,
                                        };

                                        // --- Call your serverless API route for ai_notes ---
                                        try {
                                          const aiRes = await fetch('/api/ai/transaction_notes', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ contractChange }),
                                          });
                                          const aiData = await aiRes.json();
                                          contractChange.ai_notes = aiData.ai_notes || "AI summary unavailable.";
                                        } catch (err) {
                                          contractChange.ai_notes = "AI summary unavailable.";
                                        }

                                        // Save to API
                                        const res = await fetch('/api/admin/contract_changes', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify(contractChange),
                                        });
                                        const data = await res.json();
                                        if (!res.ok) throw new Error(data.error || 'Failed to save extension');
                                        setFinalizeMsg('Extension finalized and saved!');
                                        setPendingExtension(null);
                                      } catch (err) {
                                        setFinalizeError(err.message);
                                      } finally {
                                        setFinalizeLoading(false);
                                      }
                                    }}
                                  >
                                    {finalizeLoading ? 'Saving...' : 'Finalize Extension'}
                                  </button>
                                )}
                                {/* Add window closed message for mobile */}
                                {!isExtensionWindowOpen() && (
                                  <div className="mb-2 text-yellow-400 text-sm text-center">
                                    Extensions can only be finalized between May 1st and August 31st.
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {/* Success/Error Messages */}
                        {finalizeMsg && <div className="mt-4 text-green-400">{finalizeMsg}</div>}
                        {finalizeError && <div className="mt-4 text-red-400">{finalizeError}</div>}
                      </>
                    )}
                  </div>
                  {/* Contract Details Modal (Cap Modal) */}
                  {capModalInfo && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                      <div
                        className="bg-[#1a2233] rounded-lg shadow-2xl p-6 w-full max-w-md relative max-h-[90vh] overflow-y-auto"
                        tabIndex={-1}
                        role="dialog"
                        aria-modal="true"
                      >
                        <button
                          className="absolute top-2 right-2 text-white hover:text-[#FF4B1F] text-2xl font-bold focus:outline-none"
                          onClick={() => setCapModalInfo(null)}
                          aria-label="Close"
                          tabIndex={0}
                        >×</button>
                        <h2 className="text-xl font-bold mb-2 text-[#FF4B1F]">
                          {myTeamName} – {capModalInfo.label} Contracts
                        </h2>
                        {(!capModalInfo.groups || capModalInfo.groups.length === 0) ? (
                          <div className="text-gray-300">No players under contract for this season.</div>
                        ) : (
                          capModalInfo.groups.map(group => (
                            <div key={group.status} className="mb-4">
                              <div className="font-semibold text-lg text-white mb-1">{group.status}</div>
                              <table className="w-full text-sm mb-2">
                                <thead>
                                  <tr>
                                    <th className="text-left pb-1">Player</th>
                                    <th className="text-left pb-1">Type</th>
                                    <th className="text-right pb-1">Salary</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.players.map((p, i) => (
                                    <tr key={i}>
                                      <td className={(p.status === "Active" || p.status === "Future") ? "text-green-300" : "text-red-300"}>
                                        {p.playerName}
                                      </td>
                                      <td>{p.contractType}</td>
                                      <td className="text-right">${p.salary.toFixed(1)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))
          )}
                        <div className="flex justify-end mt-4">
                          <button
                            className="px-4 py-2 bg-[#FF4B1F] text-white rounded hover:bg-[#ff6a3c] font-semibold"
                            onClick={() => setCapModalInfo(null)}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        )}
      </div>
    </main>
  );
}