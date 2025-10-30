'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import PlayerProfileCard from '../my-team/components/PlayerProfileCard';
import EscapeKeyListener from '../player-contracts/EscapeKeyListener';
import SwipeDownListener from '../player-contracts/SwipeDownListener';

const USER_ID = '456973480269705216';

function toNumber(n, d = 0) {
  const v = typeof n === 'number' ? n : parseFloat(n);
  return Number.isFinite(v) ? v : d;
}

function formatMoney(v) {
  return Number.isFinite(v) ? `$${v.toFixed(1)}` : '-';
}

export default function HoldoutsPage() {
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [leagueId, setLeagueId] = useState(null);
  const [currentSeason, setCurrentSeason] = useState(null);

  // Sleeper-derived scoring
  const [playerTotals, setPlayerTotals] = useState({}); // { playerId: totalPoints }
  const [playerWeeks, setPlayerWeeks] = useState({});  // { playerId: countedWeeks }
  const [playerNonPositiveWeeks, setPlayerNonPositiveWeeks] = useState({}); // { playerId: weeks with <= 0 pts }

  // Contracts CSV
  const [contracts, setContracts] = useState([]); // raw rows with fields we need

  // Team display/avatar
  const [teamAvatars, setTeamAvatars] = useState({}); // display_name -> avatar id
  const [teamNameMap, setTeamNameMap] = useState({}); // playerId -> display_name
  const [owners, setOwners] = useState([]); // [{ owner_id, display_name, avatar }]
  const [rostersData, setRostersData] = useState([]); // raw rosters
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedDisplayName, setSelectedDisplayName] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]); // array of playerIds for selected team

  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'ppg', direction: 'desc' });
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState('ALL');
  // Lookup UI
  const [lookupInput, setLookupInput] = useState('');
  const [lookupResult, setLookupResult] = useState(null);

  // Responsive
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Discover BBB league id and current season
  useEffect(() => {
    async function initLeague() {
      try {
        const stateResp = await fetch('https://api.sleeper.app/v1/state/nfl');
        const state = await stateResp.json();
        const season = String(state?.season || '');
        setCurrentSeason(season);
        const leaguesResp = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${season}`);
        const leagues = await leaguesResp.json();
        let bbb = Array.isArray(leagues) ? leagues.filter(l => l?.name && (
          l.name.includes('Budget Blitz Bowl') ||
          l.name.includes('budget blitz bowl') ||
          l.name.includes('BBB') ||
          (String(l.name).toLowerCase().includes('budget') && String(l.name).toLowerCase().includes('blitz'))
        )) : [];
        if (bbb.length === 0) {
          const prev = (toNumber(season) - 1).toString();
          const prevResp = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${prev}`);
          if (prevResp.ok) {
            const prevLeagues = await prevResp.json();
            const prevBBB = Array.isArray(prevLeagues) ? prevLeagues.filter(l => l?.name && (
              l.name.includes('Budget Blitz Bowl') || l.name.includes('budget blitz bowl') || l.name.includes('BBB') ||
              (String(l.name).toLowerCase().includes('budget') && String(l.name).toLowerCase().includes('blitz'))
            )) : [];
            bbb = prevBBB.length ? prevBBB : (Array.isArray(leagues) && leagues.length ? [leagues[0]] : (Array.isArray(prevLeagues) && prevLeagues.length ? [prevLeagues[0]] : []));
          } else if (Array.isArray(leagues) && leagues.length) {
            bbb = [leagues[0]];
          }
        }
        const mostRecent = bbb.sort((a,b) => toNumber(b.season) - toNumber(a.season))[0];
        setLeagueId(mostRecent?.league_id || null);
      } catch {
        setLeagueId(null);
      }
    }
    initLeague();
  }, []);

  // Fetch contracts CSV
  useEffect(() => {
    async function fetchContracts() {
      try {
        const res = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
        const text = await res.text();
        const rows = text.split('\n').slice(1).filter(r => r.trim());
        const parsed = rows.map((row, index) => {
          const v = row.split(',');
          const status = v[14];
          const isActive = status === 'Active';
          return {
            uniqueKey: `${v[0]}-${v[5]}-${v[2]}-${v[14]}-${index}`,
            playerId: v[0],
            playerName: v[1],
            contractType: v[2],
            status,
            position: v[21],
            team: v[33],
            curYear: isActive ? toNumber(v[15]) : toNumber(v[24]),
            contractFinalYear: v[5],
            age: toNumber(v[32]),
          };
        });
        setContracts(parsed);
      } catch {
        setContracts([]);
      }
    }
    fetchContracts();
  }, []);

  // Sleeper points -> totals and weeks
  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    async function fetchPoints() {
      setLoading(true);
      try {
        const stateResp = await fetch('https://api.sleeper.app/v1/state/nfl');
        const state = await stateResp.json();
        const rawWeek = state?.week ?? state?.display_week;
        const currentWeek = Number.isFinite(toNumber(rawWeek)) ? toNumber(rawWeek) : 18;
        const totals = {}; const weeks = {}; // weeks excludes 0-pt games
        const nonPosWeeks = {}; // weeks with <= 0 pts
        for (let w = 1; w <= currentWeek; w++) {
          const muResp = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${w}`);
          if (!muResp.ok) continue;
          const matchups = await muResp.json();
          matchups.forEach(m => {
            const pts = m?.players_points || {};
            Object.entries(pts).forEach(([pid, val]) => {
              const v = toNumber(val);
              totals[pid] = (totals[pid] || 0) + v;
              if (v > 0) {
                weeks[pid] = (weeks[pid] || 0) + 1; // exclude zero-point weeks from PPG
              }
              if (v <= 0) {
                nonPosWeeks[pid] = (nonPosWeeks[pid] || 0) + 1;
              }
            });
          });
        }
        if (!cancelled) { setPlayerTotals(totals); setPlayerWeeks(weeks); setPlayerNonPositiveWeeks(nonPosWeeks); }
      } catch {
        if (!cancelled) { setPlayerTotals({}); setPlayerWeeks({}); setPlayerNonPositiveWeeks({}); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchPoints();
    return () => { cancelled = true; };
  }, [leagueId]);

  // Teams (avatars and player->owner)
  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    async function fetchTeams() {
      try {
        const [usersResp, rostersResp] = await Promise.all([
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
        ]);
        if (!usersResp.ok || !rostersResp.ok) return;
        const users = await usersResp.json();
        const rosters = await rostersResp.json();
        const avatarMap = {}; const userNameById = {};
        users.forEach(u => { const d = u?.display_name || ''; avatarMap[d] = u?.avatar || null; userNameById[u?.user_id] = d; });
        const pToTeam = {};
        rosters.forEach(r => {
          const owner = userNameById[r?.owner_id] || '';
          (r?.players || []).forEach(pid => { pToTeam[String(pid)] = owner; });
        });

        const ownerList = rosters.map(r => ({
          owner_id: String(r?.owner_id || ''),
          display_name: userNameById[r?.owner_id] || 'Unknown',
          avatar: users.find(u => String(u?.user_id) === String(r?.owner_id))?.avatar || null,
        }))
        // de-duplicate by owner_id (in case of multiple rosters edges)
        .filter((v, i, a) => a.findIndex(x => x.owner_id === v.owner_id) === i)
        .sort((a,b) => String(a.display_name).localeCompare(String(b.display_name)));

        // pick default selection if none
        let defaultOwnerId = selectedOwnerId;
        if (!defaultOwnerId && ownerList.length) defaultOwnerId = ownerList[0].owner_id;
        const defaultDisplay = ownerList.find(o => o.owner_id === defaultOwnerId)?.display_name || '';

        if (!cancelled) {
          setTeamAvatars(avatarMap);
          setTeamNameMap(pToTeam);
          setOwners(ownerList);
          setRostersData(rosters);
          setSelectedOwnerId(defaultOwnerId || '');
          setSelectedDisplayName(defaultDisplay);
        }
      } catch { if (!cancelled) { setTeamAvatars({}); setTeamNameMap({}); setOwners([]); setRostersData([]); } }
    }
    fetchTeams();
    return () => { cancelled = true; };
  }, [leagueId]);

  // Update selected player's list when selection or rosters change
  useEffect(() => {
    if (!selectedOwnerId || !rostersData?.length) { setSelectedPlayerIds([]); return; }
    const roster = rostersData.find(r => String(r?.owner_id) === String(selectedOwnerId));
    const ids = Array.isArray(roster?.players) ? roster.players.map(p => String(p)) : [];
    setSelectedPlayerIds(ids);
    const dn = owners.find(o => o.owner_id === String(selectedOwnerId))?.display_name || '';
    setSelectedDisplayName(dn);
  }, [selectedOwnerId, rostersData, owners]);

  // Build holdouts list
  const rows = useMemo(() => {
    if (!currentSeason) return [];
  const season = toNumber(currentSeason);
  const finalYearTarget = String(season + 1);

    // Build PPG map and position grouping by contract pos
    const contractById = new Map(contracts.map(c => [String(c.playerId), c]));

    // Compute PPG values per player that exists in contracts with a known position
    const ppgById = new Map();
    const posGroups = new Map(); // position -> [{id, ppg}]
    Object.entries(playerTotals).forEach(([pid, total]) => {
      const c = contractById.get(String(pid));
      const points = toNumber(total);
      const games = toNumber(playerWeeks[String(pid)], 0);
      const ppg = games > 0 ? points / games : 0;
      ppgById.set(String(pid), ppg);
      const pos = String(c?.position || '-').toUpperCase();
      if (!posGroups.has(pos)) posGroups.set(pos, []);
      posGroups.get(pos).push({ id: String(pid), ppg });
    });

    // Determine top-20 PPG set per position
    const top20Set = new Set();
    for (const [pos, list] of posGroups.entries()) {
      list.sort((a,b) => b.ppg - a.ppg);
      list.slice(0, 20).forEach(({id}) => top20Set.add(`${pos}:${id}`));
    }

    // Salary thresholds: 20th highest active salary per position (any contract type, status Active)
    const activeByPos = new Map();
    contracts.forEach(c => {
      if (String(c.status).toLowerCase() !== 'active') return;
      const pos = String(c.position || '-').toUpperCase();
      if (!activeByPos.has(pos)) activeByPos.set(pos, []);
      const sal = toNumber(c.curYear);
      if (sal > 0) activeByPos.get(pos).push(sal);
    });
    const salary20thThresh = new Map(); // pos -> value
    for (const [pos, list] of activeByPos.entries()) {
      list.sort((a,b) => b - a);
      const t = list.length >= 20 ? list[19] : Infinity;
      salary20thThresh.set(pos, t);
    }

    // Filter contracts by specified criteria first
    const filtered = contracts.filter(c => {
      const isBase = String(c.contractType).toLowerCase() === 'base';
      const isActive = String(c.status).toLowerCase() === 'active';
      const expiresIn2 = String(c.contractFinalYear) === finalYearTarget;
      const young = toNumber(c.age) < 29;
      return isBase && isActive && expiresIn2 && young;
    });

    // Enrich with PPG and apply top-20 and salary constraint
    const result = filtered.map(c => {
      const pid = String(c.playerId);
      const pos = String(c.position || '-').toUpperCase();
      const ppg = ppgById.get(pid) || 0;
      const team = teamNameMap[pid] || '-';
      const salary = toNumber(c.curYear);
      const nonPos = toNumber(playerNonPositiveWeeks[pid], 0);
      return {
        ...c,
        team,
        ppg,
        salary,
        nonPosWeeks: nonPos,
        posKey: pos,
      };
    }).filter(r => {
      const top20 = top20Set.has(`${r.posKey}:${String(r.playerId)}`);
      const thresh = salary20thThresh.get(r.posKey) ?? Infinity;
      return top20 && r.salary < thresh && r.nonPosWeeks < 8; // disqualify if <=0 points in 8+ games
    });

    // Compute position PPG ranks among all players (for display)
    const rankMap = new Map(); // pos:pid -> rank
    for (const [pos, list] of posGroups.entries()) {
      list.sort((a,b) => b.ppg - a.ppg);
      list.forEach((row, i) => rankMap.set(`${pos}:${row.id}`, i + 1));
    }

    // Final rows with rank
    const rows = result.map(r => ({
      ...r,
      ppgRank: rankMap.get(`${r.posKey}:${String(r.playerId)}`) || null,
      salaryThreshold20th: salary20thThresh.get(r.posKey) ?? null,
    }));

    // Sorting
    const key = sortConfig.key; const dir = sortConfig.direction === 'asc' ? 1 : -1;
    rows.sort((a,b) => {
      const av = a[key]; const bv = b[key];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });

    // Search and position filter
    const term = searchTerm.trim().toLowerCase();
    return rows.filter(r => {
      const nameOk = !term || String(r.playerName).toLowerCase().includes(term);
      const posOk = positionFilter === 'ALL' || r.posKey === positionFilter;
      return nameOk && posOk;
    });
  }, [contracts, playerTotals, playerWeeks, playerNonPositiveWeeks, teamNameMap, sortConfig, searchTerm, positionFilter, currentSeason]);

  // Build "Your Team" matrix rows (all players on selected roster)
  const myMatrixRows = useMemo(() => {
    if (!selectedPlayerIds?.length) return [];
    const season = toNumber(currentSeason);
    const finalYearTarget = String(season + 1);

    // Helper maps
    const contractByPid = contracts.reduce((acc, c) => {
      const pid = String(c.playerId);
      if (!acc[pid]) acc[pid] = [];
      acc[pid].push(c);
      return acc;
    }, {});

    // Build PPG and position groups for ranks
    const ppgById = new Map();
    const posGroups = new Map();
    Object.entries(playerTotals).forEach(([pid, total]) => {
      const points = toNumber(total);
      const games = toNumber(playerWeeks[String(pid)], 0);
      const ppg = games > 0 ? points / games : 0;
      ppgById.set(String(pid), ppg);
      const c = (contractByPid[String(pid)] || [])[0];
      const pos = String(c?.position || '-').toUpperCase();
      if (!posGroups.has(pos)) posGroups.set(pos, []);
      posGroups.get(pos).push({ id: String(pid), ppg });
    });
    const rankMap = new Map();
    for (const [pos, list] of posGroups.entries()) {
      list.sort((a,b) => b.ppg - a.ppg);
      list.forEach((row, i) => rankMap.set(`${pos}:${row.id}`, i + 1));
    }

    // Salary 20th thresholds per position (Active contracts only)
    const activeByPos = new Map();
    contracts.forEach(c => {
      if (String(c.status).toLowerCase() !== 'active') return;
      const pos = String(c.position || '-').toUpperCase();
      if (!activeByPos.has(pos)) activeByPos.set(pos, []);
      const sal = toNumber(c.curYear);
      if (sal > 0) activeByPos.get(pos).push(sal);
    });
    const salary20thThresh = new Map();
    for (const [pos, list] of activeByPos.entries()) {
      list.sort((a,b) => b - a);
      salary20thThresh.set(pos, list.length >= 20 ? list[19] : Infinity);
    }

    // Select a representative contract row per player (prefer Active Base)
    function pickContractRows(pid) {
      const rows = contractByPid[String(pid)] || [];
      const lower = rows.map(r => ({ r, t: {
        status: String(r.status).toLowerCase(),
        type: String(r.contractType).toLowerCase()
      }}));
      const baseActive = lower.find(x => x.t.status === 'active' && x.t.type === 'base');
      if (baseActive) return baseActive.r;
      const anyActive = lower.find(x => x.t.status === 'active');
      if (anyActive) return anyActive.r;
      return rows[0] || null;
    }

    // Build matrix rows
    const out = selectedPlayerIds.map(pid => {
      const c = pickContractRows(pid);
      const posKey = String(c?.position || '-').toUpperCase();
      const playerName = c?.playerName || String(pid);
      const ppg = ppgById.get(String(pid)) || 0;
      const ppgRank = rankMap.get(`${posKey}:${String(pid)}`) || null;
      const salary = toNumber(c?.curYear);
      const threshold = salary20thThresh.get(posKey) ?? Infinity;
      const nonPosWeeks = toNumber(playerNonPositiveWeeks[String(pid)], 0);
      const checks = {
        baseContract: String(c?.contractType || '').toLowerCase() === 'base',
        activeStatus: String(c?.status || '').toLowerCase() === 'active',
        expiresNextSeason: String(c?.contractFinalYear || '') === finalYearTarget,
        ageUnder29: toNumber(c?.age) < 29,
        top20PPG: typeof ppgRank === 'number' ? ppgRank <= 20 : false,
        salaryBelow20th: salary < threshold,
        nonPosWeekLimit: nonPosWeeks < 8,
      };
      return {
        playerId: String(pid),
        playerName,
        position: posKey,
        team: teamNameMap[String(pid)] || selectedDisplayName || '-',
        ppg,
        ppgRank,
        salary,
        threshold,
        contractFinalYear: c?.contractFinalYear ?? '-',
        age: c?.age ?? '-',
        nonPosWeeks,
        checks,
      };
    });

    // sort by position then name for readability
    out.sort((a,b) => (String(a.position).localeCompare(String(b.position)) || String(a.playerName).localeCompare(String(b.playerName))));
    return out;
  }, [selectedPlayerIds, contracts, playerTotals, playerWeeks, playerNonPositiveWeeks, teamNameMap, selectedDisplayName, currentSeason]);

  // Helper: Evaluate criteria for a specific player name
  function evaluatePlayerByName(name) {
    if (!name) return null;
    const season = toNumber(currentSeason);
    const finalYearTarget = String(season + 1);
    // Choose the most relevant contract row for this name (prefer Active Base, else any Active, else first)
    const matches = contracts.filter(c => String(c.playerName).toLowerCase() === String(name).toLowerCase());
    if (!matches.length) return { error: 'Player not found in contracts CSV' };
    const c = matches.find(x => String(x.status).toLowerCase() === 'active' && String(x.contractType).toLowerCase() === 'base')
      || matches.find(x => String(x.status).toLowerCase() === 'active')
      || matches[0];

    // Build PPG per position map and ranks (like rows memo)
    const contractById = new Map(contracts.map(cc => [String(cc.playerId), cc]));
    const ppgById = new Map();
    const posGroups = new Map();
    Object.entries(playerTotals).forEach(([pid, total]) => {
      const cc = contractById.get(String(pid));
      const points = toNumber(total);
      const games = toNumber(playerWeeks[String(pid)], 0);
      const ppg = games > 0 ? points / games : 0;
      ppgById.set(String(pid), ppg);
      const pos = String(cc?.position || '-').toUpperCase();
      if (!posGroups.has(pos)) posGroups.set(pos, []);
      posGroups.get(pos).push({ id: String(pid), ppg });
    });
    const rankMap = new Map();
    for (const [pos, list] of posGroups.entries()) {
      list.sort((a,b) => b.ppg - a.ppg);
      list.forEach((row, i) => rankMap.set(`${pos}:${row.id}`, i + 1));
    }
    // Salary 20th thresholds per position
    const activeByPos = new Map();
    contracts.forEach(cc => {
      if (String(cc.status).toLowerCase() !== 'active') return;
      const pos = String(cc.position || '-').toUpperCase();
      if (!activeByPos.has(pos)) activeByPos.set(pos, []);
      const sal = toNumber(cc.curYear);
      if (sal > 0) activeByPos.get(pos).push(sal);
    });
    const salary20thThresh = new Map();
    for (const [pos, list] of activeByPos.entries()) {
      list.sort((a,b) => b - a);
      salary20thThresh.set(pos, list.length >= 20 ? list[19] : Infinity);
    }

    const pid = String(c.playerId);
    const posKey = String(c.position || '-').toUpperCase();
  const ppg = ppgById.get(pid) || 0;
    const ppgRank = rankMap.get(`${posKey}:${pid}`) || null;
    const salary = toNumber(c.curYear);
    const threshold = salary20thThresh.get(posKey) ?? Infinity;
  const nonPosWeeks = toNumber(playerNonPositiveWeeks[pid], 0);

    const checks = {
      baseContract: String(c.contractType).toLowerCase() === 'base',
      activeStatus: String(c.status).toLowerCase() === 'active',
      expiresNextSeason: String(c.contractFinalYear) === finalYearTarget,
      ageUnder29: toNumber(c.age) < 29,
      top20PPG: typeof ppgRank === 'number' ? ppgRank <= 20 : false,
      salaryBelow20th: salary < threshold,
      nonPosWeekLimit: nonPosWeeks < 8,
    };
    return {
      playerId: pid,
      playerName: c.playerName,
      position: posKey,
      team: teamNameMap[pid] || '-',
      ppg,
      ppgRank,
      salary,
      threshold,
      contractFinalYear: c.contractFinalYear,
      age: c.age,
      nonPosWeeks,
      checks,
    };
  }

  function handleLookupSubmit(e) {
    e?.preventDefault?.();
    const res = evaluatePlayerByName(lookupInput.trim());
    setLookupResult(res);
  }

  function handleSort(key) {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  }

  if (loading && !leagueId) {
    return (
      <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      {/* Player Card Modal */}
      {selectedPlayerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setSelectedPlayerId(null)}>
          <div className="bg-transparent p-0 rounded-lg shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <PlayerProfileCard
              playerId={selectedPlayerId}
              expanded={true}
              className="w-56 h-80 sm:w-72 sm:h-[26rem] md:w-80 md:h-[30rem] max-w-full max-h-[90vh]"
              teamAvatars={teamAvatars}
              teamName={teamNameMap[String(selectedPlayerId)] || ''}
              onExpandClick={() => setSelectedPlayerId(null)}
            />
            <button className="absolute top-2 right-2 text-white bg-black/60 rounded-full px-3 py-1 hover:bg-black" onClick={() => setSelectedPlayerId(null)}>×</button>
          </div>
          <EscapeKeyListener onEscape={() => setSelectedPlayerId(null)} />
          <SwipeDownListener onSwipeDown={() => setSelectedPlayerId(null)} />
        </div>
      )}

      <div className={`${isMobile ? 'p-4' : 'p-6'} bg-black/30 border-b border-white/10`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <img src="/logo.png" alt="BBB League" className={`${isMobile ? 'h-12 w-12' : 'h-16 w-16'} transition-transform hover:scale-105`} />
            <h1 className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-[#FF4B1F]`}>Holdouts</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6 flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Search player..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="p-3 rounded bg-white/5 border border-white/10 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#FF4B1F] focus:border-transparent transition-all w-full md:w-64"
          />
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="p-3 rounded bg-white/5 border border-white/10 text-white w-full md:w-48"
          >
            <option value="ALL">All Positions</option>
            <option value="QB">QB</option>
            <option value="RB">RB</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
          </select>
        </div>

        {/* Player Criteria Checker */}
        <form onSubmit={handleLookupSubmit} className="mb-6 bg-black/30 rounded-lg border border-white/10 p-4">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm text-white/70 mb-1">Check player criteria</label>
              <input
                list="holdouts-player-list"
                type="text"
                placeholder="Start typing a player name..."
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                className="w-full p-3 rounded bg-white/5 border border-white/10 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#FF4B1F] focus:border-transparent"
              />
              <datalist id="holdouts-player-list">
                {Array.from(new Map(contracts.map(c => [c.playerName, c])).values())
                  .map(c => c.playerName)
                  .sort((a,b) => String(a).localeCompare(String(b)))
                  .map(name => (
                    <option key={name} value={name} />
                  ))}
              </datalist>
            </div>
            <button type="submit" className="px-4 py-2 rounded bg-[#FF4B1F] text-white font-semibold hover:bg-[#e03e0f] transition">Check</button>
          </div>

          {lookupResult && !lookupResult.error && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="col-span-1 md:col-span-2 text-white/90">
                <span className="font-semibold">{lookupResult.playerName}</span>
                <span className="ml-2 text-white/70">[{lookupResult.position}]</span>
                <span className="ml-3 text-white/70">Team: {lookupResult.team}</span>
              </div>
              {/* Criteria rows */}
              {[{
                label: 'Base contract', pass: lookupResult.checks.baseContract
              }, {
                label: 'Active status', pass: lookupResult.checks.activeStatus
              }, {
                label: 'Expires next season', pass: lookupResult.checks.expiresNextSeason, detail: `Final Year: ${lookupResult.contractFinalYear}`
              }, {
                label: 'Age under 29', pass: lookupResult.checks.ageUnder29, detail: `Age: ${lookupResult.age}`
              }, {
                label: 'Top-20 PPG for position', pass: lookupResult.checks.top20PPG, detail: `PPG: ${lookupResult.ppg.toFixed(2)} (Rank ${lookupResult.ppgRank ?? '-'})`
              }, {
                label: 'Salary below 20th at position', pass: lookupResult.checks.salaryBelow20th, detail: `Salary: ${formatMoney(lookupResult.salary)} | 20th: ${formatMoney(lookupResult.threshold)}`
              }, {
                label: '≤ 0 points in fewer than 8 games', pass: lookupResult.checks.nonPosWeekLimit, detail: `Non-positive weeks: ${lookupResult.nonPosWeeks}`
              }].map((row, idx) => (
                <div key={idx} className={`flex items-center justify-between rounded border px-3 py-2 ${row.pass ? 'border-green-500/40 bg-green-500/10' : 'border-red-500/40 bg-red-500/10'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${row.pass ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="text-white/90">{row.label}</span>
                  </div>
                  {row.detail && <div className="text-white/70 ml-3">{row.detail}</div>}
                </div>
              ))}
            </div>
          )}
          {lookupResult?.error && (
            <div className="mt-4 text-red-400">{lookupResult.error}</div>
          )}
        </form>

        <div className="text-[#FF4B1F] mb-3" style={{ fontSize: '0.9rem' }}>
          PPG excludes games with 0 points scored
        </div>

        {/* Mobile cards for Holdouts list */}
        <div className="block md:hidden space-y-3">
          {rows.map(r => (
            <div key={`holdout-card-${r.playerId}-${r.contractFinalYear}`} className="bg-black/20 border border-white/10 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div onClick={() => setSelectedPlayerId(r.playerId)} className="cursor-pointer">
                  <PlayerProfileCard playerId={r.playerId} expanded={false} className="w-10 h-10 rounded-full overflow-hidden" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button className="text-white font-semibold underline truncate" onClick={() => setSelectedPlayerId(r.playerId)}>{r.playerName}</button>
                    <span className="text-white/70 text-sm">[{r.position}]</span>
                    <span className="ml-auto text-green-400 text-xs bg-green-500/10 border border-green-500/30 rounded px-2 py-0.5">Qualifies</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/80 mt-1">
                    {teamAvatars[r.team] ? (
                      <img src={`https://sleepercdn.com/avatars/${teamAvatars[r.team]}`} alt={r.team} className="w-4 h-4 rounded-full" />
                    ) : <span className="w-4 h-4 rounded-full bg-white/10 inline-block" />}
                    <span className="truncate">{r.team}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">PPG:</span> <span className="font-semibold">{r.ppg.toFixed(2)}</span></div>
                <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">Salary:</span> <span className="font-semibold">{formatMoney(r.salary)}</span></div>
                <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">PPG Rank:</span> <span className="font-semibold">{r.ppgRank ?? '-'}</span></div>
                <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">20th (Pos):</span> <span className="font-semibold">{formatMoney(r.salaryThreshold20th)}</span></div>
                <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">Final Yr:</span> <span className="font-semibold">{r.contractFinalYear}</span></div>
                <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">Age:</span> <span className="font-semibold">{r.age}</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile section divider to clearly separate lists */}
        <div className="md:hidden my-6">
          <div className="flex items-center gap-3">
            <span className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <span className="text-white/60 text-xs uppercase tracking-wider">Player Check</span>
            <span className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </div>

        {/* Desktop table for Holdouts list */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-white/10 shadow-xl bg-black/20">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-black/40 border-b border-white/10">
                {[
                  { key: 'profile', label: '' },
                  { key: 'playerName', label: 'Player' },
                  { key: 'team', label: 'Team' },
                  { key: 'position', label: 'Pos' },
                  { key: 'ppg', label: 'PPG' },
                  { key: 'salary', label: 'Salary' },
                  { key: 'ppgRank', label: 'PPG (Pos Rank)' },
                  { key: 'salaryThreshold20th', label: '20th Salary (Pos)' },
                  { key: 'contractFinalYear', label: 'Final Year' },
                  { key: 'age', label: 'Age' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={key === 'profile' ? undefined : (e) => { e.stopPropagation(); handleSort(key); }}
                    className={`p-2 md:p-3 text-left transition-colors ${key === 'profile' ? '' : 'cursor-pointer hover:bg-white/5'} ${['team','ppgRank','salaryThreshold20th','contractFinalYear','age'].includes(key) ? 'hidden md:table-cell' : ''}`}
                    style={key === 'profile' ? {} : { userSelect: 'none' }}
                  >
                    <div className="flex items-center gap-2">
                      {label}
                      {key !== 'profile' && sortConfig.key === key && (
                        <span className="text-[#FF4B1F]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.playerId}-${r.contractFinalYear}`} className="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                  <td className="p-2 md:p-3 align-middle" style={{ width: '40px', minWidth: '40px', cursor: 'pointer' }} onClick={() => setSelectedPlayerId(r.playerId)} title="View Player Card">
                    <PlayerProfileCard playerId={r.playerId} expanded={false} className="w-8 h-8 rounded-full overflow-hidden shadow object-cover m-0 p-0" />
                  </td>
                  <td className="p-2 md:p-3 font-medium underline cursor-pointer" onClick={() => setSelectedPlayerId(r.playerId)}>{r.playerName}</td>
                  <td className="p-2 md:p-3 align-middle hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      {teamAvatars[r.team] ? (
                        <Image src={`https://sleepercdn.com/avatars/${teamAvatars[r.team]}`} alt={r.team} width={20} height={20} className="rounded-full mr-2" />
                      ) : (<span className="w-5 h-5 rounded-full bg-white/10 mr-2 inline-block"></span>)}
                      {r.team}
                    </div>
                  </td>
                  <td className="p-2 md:p-3">{r.position}</td>
                  <td className="p-2 md:p-3">{r.ppg.toFixed(2)}</td>
                  <td className="p-2 md:p-3">{formatMoney(r.salary)}</td>
                  <td className="p-2 md:p-3 hidden md:table-cell">{r.ppgRank ?? '-'}</td>
                  <td className="p-2 md:p-3 hidden md:table-cell">{formatMoney(r.salaryThreshold20th)}</td>
                  <td className="p-2 md:p-3 hidden md:table-cell">{r.contractFinalYear}</td>
                  <td className="p-2 md:p-3 hidden md:table-cell">{r.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Your Team Criteria Matrix */}
  <div className="mt-10 md:mt-8 bg-black/20 rounded-lg border border-white/10 p-4">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h3 className="text-[#FF4B1F] font-semibold">ALL PLAYER CHECK</h3>
            <div className="flex items-center gap-2">
              <label className="text-white/70 text-sm" htmlFor="owner-select">Select team:</label>
              <select
                id="owner-select"
                value={selectedOwnerId}
                onChange={(e) => setSelectedOwnerId(e.target.value)}
                className="p-2 rounded bg-white/5 border border-white/10 text-white text-sm"
              >
                {owners.map(o => (
                  <option key={o.owner_id} value={o.owner_id}>{o.display_name}</option>
                ))}
              </select>
            </div>
          </div>
          {selectedPlayerIds?.length ? (
            <div className="overflow-x-auto rounded border border-white/10">
              {/* Mobile cards for Matrix */}
              <div className="block md:hidden space-y-3 p-2">
                {myMatrixRows.map(r => {
                  const passList = [r.checks.baseContract, r.checks.activeStatus, r.checks.expiresNextSeason, r.checks.ageUnder29, r.checks.top20PPG, r.checks.salaryBelow20th, r.checks.nonPosWeekLimit];
                  const meetsAll = passList.every(Boolean);
                  return (
                    <div key={`matrix-card-${r.playerId}`} className={`border rounded-lg p-3 ${meetsAll ? 'border-green-500/40 bg-green-500/10' : 'border-white/10 bg-black/20'}`}>
                      <div className="flex items-center gap-3">
                        <div onClick={() => setSelectedPlayerId(r.playerId)} className="cursor-pointer">
                          <PlayerProfileCard playerId={r.playerId} expanded={false} className="w-10 h-10 rounded-full overflow-hidden" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <button className="text-white font-semibold underline truncate" onClick={() => setSelectedPlayerId(r.playerId)}>{r.playerName}</button>
                            <span className="text-white/70 text-sm">[{r.position}]</span>
                            {meetsAll && <span className="ml-auto text-green-400 text-xs bg-green-500/10 border border-green-500/30 rounded px-2 py-0.5">Meets All</span>}
                          </div>
                          <div className="text-sm text-white/80 mt-1">PPG: <span className="font-semibold">{r.ppg.toFixed(2)}</span> • Rank: <span className="font-semibold">{r.ppgRank ?? '-'}</span></div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">Salary:</span> <span className="font-semibold">{formatMoney(r.salary)}</span></div>
                        <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">20th (Pos):</span> <span className="font-semibold">{formatMoney(r.threshold)}</span></div>
                        <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">Final Yr:</span> <span className="font-semibold">{r.contractFinalYear}</span></div>
                        <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">Age:</span> <span className="font-semibold">{r.age}</span></div>
                        <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">≤0 wks:</span> <span className="font-semibold">{r.nonPosWeeks}</span></div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        {[{label:'Base', pass:r.checks.baseContract},{label:'Active', pass:r.checks.activeStatus},{label:'Expires +1', pass:r.checks.expiresNextSeason},{label:'Age <29', pass:r.checks.ageUnder29},{label:'Top-20 PPG', pass:r.checks.top20PPG},{label:'< 20th $', pass:r.checks.salaryBelow20th},{label:'NP < 8', pass:r.checks.nonPosWeekLimit}].map((c, idx) => (
                          <div key={idx} className={`flex items-center justify-between rounded border px-2 py-1 ${c.pass ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
                            <span>{c.label}</span>
                            <span className="font-semibold">{c.pass ? '✔️' : '✖️'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop matrix table */}
              <table className="hidden md:table w-full border-collapse">
                <thead>
                  <tr className="bg-black/40 border-b border-white/10">
                    {[{ key: 'profile', label: '' },
                      { key: 'player', label: 'Player' },
                      { key: 'pos', label: 'Pos' },
                      { key: 'ppg', label: 'PPG' },
                      { key: 'rank', label: 'Rank' },
                      { key: 'salary', label: 'Salary' },
                      { key: 'thresh', label: '20th (Pos)' },
                      { key: 'final', label: 'Final Yr' },
                      { key: 'age', label: 'Age' },
                      { key: 'npw', label: '≤0 wks' },
                      { key: 'c1', label: 'Base' },
                      { key: 'c2', label: 'Active' },
                      { key: 'c3', label: 'Expires +1' },
                      { key: 'c4', label: '<29' },
                      { key: 'c5', label: 'Top-20 PPG' },
                      { key: 'c6', label: '< 20th $' },
                      { key: 'c7', label: 'NP < 8' },
                    ].map(col => (
                      <th key={col.key} className={`p-2 text-left text-xs md:text-sm ${['rank','salary','thresh','final','age','npw'].includes(col.key) ? 'hidden md:table-cell' : ''}`}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myMatrixRows.map(r => {
                    const passList = [r.checks.baseContract, r.checks.activeStatus, r.checks.expiresNextSeason, r.checks.ageUnder29, r.checks.top20PPG, r.checks.salaryBelow20th, r.checks.nonPosWeekLimit];
                    const meetsAll = passList.every(Boolean);
                    return (
                    <tr key={r.playerId} className={`transition-colors border-b last:border-0 ${meetsAll ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/15' : 'hover:bg-white/5 border-white/5'}`}>
                      <td className="p-2 align-middle" style={{ width: '36px', minWidth: '36px', cursor: 'pointer' }} onClick={() => setSelectedPlayerId(r.playerId)}>
                        <PlayerProfileCard playerId={r.playerId} expanded={false} className="w-7 h-7 rounded-full overflow-hidden" />
                      </td>
                      <td className="p-2 font-medium underline cursor-pointer" onClick={() => setSelectedPlayerId(r.playerId)}>{r.playerName}</td>
                      <td className="p-2">{r.position}</td>
                      <td className="p-2">{r.ppg.toFixed(2)}</td>
                      <td className="p-2 hidden md:table-cell">{r.ppgRank ?? '-'}</td>
                      <td className="p-2 hidden md:table-cell">{formatMoney(r.salary)}</td>
                      <td className="p-2 hidden md:table-cell">{formatMoney(r.threshold)}</td>
                      <td className="p-2 hidden md:table-cell">{r.contractFinalYear}</td>
                      <td className="p-2 hidden md:table-cell">{r.age}</td>
                      <td className="p-2 hidden md:table-cell">{r.nonPosWeeks}</td>
                      {passList.map((pass, idx) => (
                          <td key={idx} className={`p-2 text-center font-semibold ${pass ? 'text-green-400' : 'text-red-400'}`}>{pass ? '✔️' : '✖️'}</td>
                        ))}
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-white/70">No roster found for the selected team.</div>
          )}
          <div className="text-[#FF4B1F] mt-2" style={{ fontSize: '0.85rem' }}>
            PPG excludes games with 0 points scored. NP = non-positive scoring weeks.
          </div>
        </div>

        {/* Criteria explanation list below the table for clarity */}
        <div className="mt-4 bg-black/20 rounded-lg border border-white/10 p-4">
          <h3 className="text-[#FF4B1F] font-semibold mb-2">Holdouts criteria</h3>
          <ul className="list-disc pl-6 space-y-1 text-white/90">
            <li>Contract type is Base</li>
            <li>Contract status is Active</li>
            <li>Contract expires next season (Final Year = current season + 1)</li>
            <li>Age is under 29</li>
            <li>Top-20 PPG at their position (PPG excludes games with 0 points)</li>
            <li>Current salary is below the 20th highest active salary at their position</li>
            <li>Disqualified if they score ≤ 0 points in 8 or more games</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
