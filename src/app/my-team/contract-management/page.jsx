'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PlayerProfileCard from '../components/PlayerProfileCard';
import EligiblePlayerCard from './EligiblePlayerCard';
import FranchiseTagCard from './FranchiseTagCard';
import RFATagCard from './RFATagCard';
import Image from 'next/image';

export default function ContractManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect unauthenticated users in an effect (do not early return before hooks)
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  // Declare all state hooks unconditionally before any returns
  const [playerContracts, setPlayerContracts] = useState([]);
  const [extensionChoices, setExtensionChoices] = useState({});
  const [pendingExtension, setPendingExtension] = useState(null);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeMsg, setFinalizeMsg] = useState('');
  const [finalizeError, setFinalizeError] = useState('');
  const [recentContractChanges, setRecentContractChanges] = useState([]);
  const [capModalInfo, setCapModalInfo] = useState(null);
  const [extensionsCollapsed, setExtensionsCollapsed] = useState(true);
  const [franchiseCollapsed, setFranchiseCollapsed] = useState(true);
  const [franchiseTagChoices, setFranchiseTagChoices] = useState({}); // { [playerId]: { apply: boolean } }
  const [pendingFranchiseTag, setPendingFranchiseTag] = useState(null);
  // RFA Tags
  const [rfaCollapsed, setRfaCollapsed] = useState(true);
  const [rfaTagChoices, setRfaTagChoices] = useState({}); // { [playerId]: { apply: boolean } }
  const [pendingRfaTag, setPendingRfaTag] = useState(null);
  // Holdouts
  const [holdoutsCollapsed, setHoldoutsCollapsed] = useState(true);
  const [leagueId, setLeagueId] = useState(null);
  const [currentSeason, setCurrentSeason] = useState(null);
  const [playerTotals, setPlayerTotals] = useState({}); // { playerId: totalPoints }
  const [playerWeeks, setPlayerWeeks] = useState({}); // { playerId: countedWeeks }
  const [playerNonPositiveWeeks, setPlayerNonPositiveWeeks] = useState({}); // { playerId: weeks with <= 0 pts }
  const [holdoutExtensionChoices, setHoldoutExtensionChoices] = useState({}); // { [playerId]: { years } }
  const [pendingHoldoutExtension, setPendingHoldoutExtension] = useState(null); // { player, years, salaries }
  const [holdoutRfaChoices, setHoldoutRfaChoices] = useState({}); // { [playerId]: { apply: boolean } }
  const [pendingHoldoutRfa, setPendingHoldoutRfa] = useState(null); // { player }

  // Admin
  const isAdmin = Boolean(
    session?.user?.isAdmin ||
      session?.user?.role === 'admin' ||
      (process.env.NEXT_PUBLIC_ADMIN_EMAIL &&
        session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)
  );
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [selectedTeamName, setSelectedTeamName] = useState('');

  // Load contracts
  useEffect(() => {
    async function fetchPlayerData() {
      const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
      const text = await response.text();
      const rows = text.split('\n').filter(Boolean);
      if (rows.length < 2) return setPlayerContracts([]);
      const header = rows[0].split(',').map(h => h.trim());
      const headerMap = {};
      header.forEach((col, idx) => {
        headerMap[col] = idx;
      });

      const contracts = [];
      rows.slice(1).forEach(row => {
        const values = row.split(',');
        if (values.length !== header.length) return;
        contracts.push({
          playerId: values[headerMap['Player ID']],
          playerName: values[headerMap['Player Name']],
          position: values[headerMap['Position']],
          contractType: values[headerMap['Contract Type']],
          status: values[headerMap['Status']],
          team: values[headerMap['TeamDisplayName']],
          curYear:
            values[headerMap['Status']] === 'Active' || values[headerMap['Status']] === 'Future'
              ? parseFloat(values[headerMap['Relative Year 1 Salary']]) || 0
              : parseFloat(values[headerMap['Relative Year 1 Dead']]) || 0,
          year2:
            values[headerMap['Status']] === 'Active' || values[headerMap['Status']] === 'Future'
              ? parseFloat(values[headerMap['Relative Year 2 Salary']]) || 0
              : parseFloat(values[headerMap['Relative Year 2 Dead']]) || 0,
          year3:
            values[headerMap['Status']] === 'Active' || values[headerMap['Status']] === 'Future'
              ? parseFloat(values[headerMap['Relative Year 3 Salary']]) || 0
              : parseFloat(values[headerMap['Relative Year 3 Dead']]) || 0,
          year4:
            values[headerMap['Status']] === 'Active' || values[headerMap['Status']] === 'Future'
              ? parseFloat(values[headerMap['Relative Year 4 Salary']]) || 0
              : parseFloat(values[headerMap['Relative Year 4 Dead']]) || 0,
          isDeadCap: !(values[headerMap['Status']] === 'Active' || values[headerMap['Status']] === 'Future'),
          contractFinalYear: values[headerMap['Contract Final Year']],
          age: values[headerMap['Age']],
          ktcValue: values[headerMap['Current KTC Value']] ? parseInt(values[headerMap['Current KTC Value']], 10) : null,
          rfaEligible: values[headerMap['Will Be RFA?']],
          franchiseTagEligible: values[headerMap['Franchise Tag Eligible?']],
        });
      });
      setPlayerContracts(contracts);
    }
    fetchPlayerData();
  }, []);

  // Recent changes
  useEffect(() => {
    async function fetchRecentContractChanges() {
      try {
        const res = await fetch('/api/admin/contract_changes');
        const data = await res.json();
        if (Array.isArray(data)) {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          const recent = data.filter(
            c =>
              (
                c.change_type === 'extension' ||
                c.change_type === 'franchise_tag' ||
                c.change_type === 'rfa_tag' ||
                c.change_type === 'holdout_extension' ||
                c.change_type === 'holdout_rfa_tag'
              ) &&
              c.playerId &&
              c.timestamp &&
              new Date(c.timestamp) > oneYearAgo
          );
          setRecentContractChanges(recent);
        } else {
          setRecentContractChanges([]);
        }
      } catch {
        setRecentContractChanges([]);
      }
    }
    fetchRecentContractChanges();
  }, [playerContracts]);

  // Note: Do not early-return before all hooks are declared to avoid breaking the Rules of Hooks.

  function isExtensionWindowOpen() {
    const now = new Date();
    const year = now.getFullYear();
    const may1 = new Date(year, 4, 1, 0, 0, 0, 0);
    const aug31 = new Date(year, 7, 31, 23, 59, 59, 999);
    return now >= may1 && now <= aug31;
  }
  function roundUp1(num) {
    return Math.ceil(num * 10) / 10;
  }
  function isFranchiseWindowOpen() {
    const now = new Date();
    const year = now.getFullYear();
    const feb1 = new Date(year, 1, 1, 0, 0, 0, 0); // Feb = 1
    const mar31 = new Date(year, 2, 31, 23, 59, 59, 999);
    return now >= feb1 && now <= mar31;
  }
  // Holdouts window: April 1 — April 30 (inclusive)
  function isHoldoutsWindowOpen() {
    const now = new Date();
    const year = now.getFullYear();
    const apr1 = new Date(year, 3, 1, 0, 0, 0, 0); // Apr = 3
    const apr30 = new Date(year, 3, 30, 23, 59, 59, 999);
    return now >= apr1 && now <= apr30;
  }
  function isInFranchiseWindowForYear(date, year) {
    const d = new Date(date);
    const start = new Date(year, 1, 1, 0, 0, 0, 0); // Feb 1
    const end = new Date(year, 2, 31, 23, 59, 59, 999); // Mar 31
    return d >= start && d <= end;
  }

  const curYear = new Date().getFullYear();
  const CAP = 300;

  // Window actives for header badges (respect Admin override where applicable)
  const extWindowActive = isExtensionWindowOpen() || (isAdmin && isAdminMode);
  const franchiseWindowActive = isFranchiseWindowOpen() || (isAdmin && isAdminMode);
  const rfaWindowActive = isFranchiseWindowOpen() || (isAdmin && isAdminMode);
  const extBadgeText = `${extWindowActive ? 'Open' : 'Closed'} • May 1 — Aug 31`;
  const franchiseBadgeText = `${franchiseWindowActive ? 'Open' : 'Closed'} • Feb 1 — Mar 31`;
  const rfaBadgeText = `${rfaWindowActive ? 'Open' : 'Closed'} • Feb 1 — Mar 31`;
  const holdoutsWindowActive = isHoldoutsWindowOpen() || (isAdmin && isAdminMode);
  const holdoutsBadgeText = `${holdoutsWindowActive ? 'Open' : 'Closed'} • Apr 1 — Apr 30`;

  const allTeamNames = Array.from(new Set(playerContracts.filter(p => p.team).map(p => p.team.trim())));

  // Determine the viewer's team
  const EMAIL_TO_TEAM = Object.freeze({});
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

  const teamNameForUI =
    isAdmin && isAdminMode && (selectedTeamName || myTeamName)
      ? selectedTeamName || myTeamName
      : myTeamName;

  const myContractsAll = playerContracts.filter(
    p => p.team && p.team.trim().toLowerCase() === teamNameForUI.trim().toLowerCase()
  );

  const yearSalaries = [0, 0, 0, 0];
  const yearDead = [0, 0, 0, 0];

  myContractsAll.forEach(p => {
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

  const playerIdsWithFuture = new Set(
    playerContracts
      .filter(p => p.status === 'Future' && p.team && p.team.trim().toLowerCase() === teamNameForUI.trim().toLowerCase())
      .map(p => p.playerId)
  );

  let eligiblePlayers = myContractsAll.filter(
    p =>
      p.status === 'Active' &&
      String(p.contractType).toLowerCase() === 'base' &&
      String(p.rfaEligible).toLowerCase() !== 'true' &&
      String(p.contractFinalYear) === String(curYear) &&
      !playerIdsWithFuture.has(p.playerId)
  );

  if (recentContractChanges.length > 0) {
    const recentlyExtendedIds = new Set(recentContractChanges.map(c => String(c.playerId).trim()));
    eligiblePlayers = eligiblePlayers.filter(p => !recentlyExtendedIds.has(String(p.playerId).trim()));
  }

  // Sort extension eligible players alphabetically by name for display
  const eligiblePlayersSorted = [...eligiblePlayers].sort((a, b) =>
    String(a.playerName).localeCompare(String(b.playerName), undefined, { sensitivity: 'base' })
  );

  // Franchise Tag eligibility (final year of active Base or Extension, franchise eligible true, RFA false, no Future deal)
  let franchiseEligiblePlayers = myContractsAll.filter(p => {
    const isActive = p.status === 'Active';
    const type = String(p.contractType).toLowerCase();
    const allowedTypes = ['base', 'extension', 'waiver', 'fa', 'free agent', 'freeagent'];
    const isAllowedType = allowedTypes.includes(type);
    const isFinalYr = String(p.contractFinalYear) === String(curYear);
    const isFT = String(p.franchiseTagEligible).toLowerCase() === 'true' || String(p.franchiseTagEligible).toLowerCase() === 'yes';
    const isRfa = String(p.rfaEligible).toLowerCase() === 'true';
    const noFuture = !playerIdsWithFuture.has(p.playerId);
    return isActive && isAllowedType && isFinalYr && isFT && !isRfa && noFuture;
  });
  if (recentContractChanges.length > 0) {
    const recentlyTaggedOrExtended = new Set(recentContractChanges.map(c => String(c.playerId).trim()));
    franchiseEligiblePlayers = franchiseEligiblePlayers.filter(p => !recentlyTaggedOrExtended.has(String(p.playerId).trim()));
  }

  // Sort franchise eligible players alphabetically
  const franchiseEligiblePlayersSorted = [...franchiseEligiblePlayers].sort((a, b) =>
    String(a.playerName).localeCompare(String(b.playerName), undefined, { sensitivity: 'base' })
  );

  // Per-team per window Franchise Tag limit: 1
  // Practical application: treat all tags within the current calendar year as counting toward the current window,
  // so admin-applied tags outside the Feb–Mar window still enforce the single-tag limit for that year's window.
  const nowForWindow = new Date();
  const windowYearForLimit = nowForWindow.getFullYear();
  const hasFranchiseTagThisYearForTeam = recentContractChanges.some(c => {
    if (c.change_type !== 'franchise_tag') return false;
    if (String(c.team).trim().toLowerCase() !== String(teamNameForUI).trim().toLowerCase()) return false;
    if (!c.timestamp) return false;
    return new Date(c.timestamp).getFullYear() === windowYearForLimit;
  });

  // RFA Tag eligibility: Active Waiver/FA type contracts, not already RFA
  const rfaAllowedTypes = ['waiver', 'fa', 'free agent', 'freeagent'];
  let rfaEligiblePlayers = myContractsAll.filter(p => {
    const isActive = p.status === 'Active';
    const type = String(p.contractType).toLowerCase();
    const isAllowedType = rfaAllowedTypes.includes(type);
    const isRfa = String(p.rfaEligible).toLowerCase() === 'true';
    return isActive && isAllowedType && !isRfa;
  });
  if (recentContractChanges.length > 0) {
    const recentlyChanged = new Set(recentContractChanges.map(c => String(c.playerId).trim()));
    rfaEligiblePlayers = rfaEligiblePlayers.filter(p => !recentlyChanged.has(String(p.playerId).trim()));
  }
  const rfaEligiblePlayersSorted = [...rfaEligiblePlayers].sort((a, b) =>
    String(a.playerName).localeCompare(String(b.playerName), undefined, { sensitivity: 'base' })
  );

  // Per-team per window limit: 1 RFA tag (same treatment as above — count any tag in the current calendar year)
  const hasRfaTagThisYearForTeam = recentContractChanges.some(c => {
    if (c.change_type !== 'rfa_tag') return false;
    if (String(c.team).trim().toLowerCase() !== String(teamNameForUI).trim().toLowerCase()) return false;
    if (!c.timestamp) return false;
    return new Date(c.timestamp).getFullYear() === windowYearForLimit;
  });

  // --- Holdouts Data Acquisition (league + scoring) ---
  useEffect(() => {
    async function initLeague() {
      try {
        const stateResp = await fetch('https://api.sleeper.app/v1/state/nfl');
        const state = await stateResp.json();
        // Use previous season for holdout eligibility metrics
        const rawSeason = parseInt(state?.season);
        const prevSeason = Number.isFinite(rawSeason) ? String(rawSeason - 1) : String((new Date().getFullYear()) - 1);
        setCurrentSeason(prevSeason);
        const leaguesResp = await fetch(`/api/league_proxy?season=${prevSeason}`);
        // Fallback directly if proxy not available
        let leagues = [];
        if (leaguesResp.ok) {
          leagues = await leaguesResp.json();
        }
        // If proxy not configured, attempt direct user league fetch (USER_ID known from Holdouts page)
        if (!Array.isArray(leagues) || leagues.length === 0) {
          const USER_ID = '456973480269705216';
          const directResp = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${prevSeason}`);
          if (directResp.ok) leagues = await directResp.json();
        }
        let bbb = Array.isArray(leagues)
          ? leagues.filter(
              l =>
                l?.name && (
                  l.name.includes('Budget Blitz Bowl') ||
                  l.name.includes('budget blitz bowl') ||
                  l.name.includes('BBB') ||
                  (String(l.name).toLowerCase().includes('budget') && String(l.name).toLowerCase().includes('blitz'))
                )
            )
          : [];
        const mostRecent = bbb.sort((a, b) => (parseInt(b.season) || 0) - (parseInt(a.season) || 0))[0];
        setLeagueId(mostRecent?.league_id || null);
      } catch {
        setLeagueId(null);
      }
    }
    initLeague();
  }, []);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    async function fetchPoints() {
      try {
        const stateResp = await fetch('https://api.sleeper.app/v1/state/nfl');
        const state = await stateResp.json();
        const rawWeek = state?.week ?? state?.display_week;
        const currentWeek = Number.isFinite(parseInt(rawWeek)) ? parseInt(rawWeek) : 18;
        const totals = {}; const weeks = {}; const nonPosWeeks = {};
        for (let w = 1; w <= currentWeek; w++) {
          const muResp = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${w}`);
            if (!muResp.ok) continue;
            const matchups = await muResp.json();
            matchups.forEach(m => {
              const pts = m?.players_points || {};
              Object.entries(pts).forEach(([pid, val]) => {
                const v = parseFloat(val) || 0;
                totals[pid] = (totals[pid] || 0) + v;
                if (v > 0) weeks[pid] = (weeks[pid] || 0) + 1; // exclude zero pts
                if (v <= 0) nonPosWeeks[pid] = (nonPosWeeks[pid] || 0) + 1;
              });
            });
        }
        if (!cancelled) {
          setPlayerTotals(totals);
          setPlayerWeeks(weeks);
          setPlayerNonPositiveWeeks(nonPosWeeks);
        }
      } catch {
        if (!cancelled) {
          setPlayerTotals({});
          setPlayerWeeks({});
          setPlayerNonPositiveWeeks({});
        }
      }
    }
    fetchPoints();
    return () => { cancelled = true; };
  }, [leagueId]);

  // --- Holdout Eligibility ---
  let holdoutEligiblePlayers = [];
  if (currentSeason) {
    const seasonNum = parseInt(currentSeason) || (curYear - 1); // fallback to previous year
    const finalYearTarget = String(seasonNum + 1);
    // Build salary 20th thresholds
    const activeByPos = {};
    playerContracts.forEach(c => {
      if (String(c.status).toLowerCase() !== 'active') return;
      const pos = String(c.position || 'ALL').toUpperCase();
      const sal = parseFloat(c.curYear) || 0;
      if (sal > 0) {
        if (!activeByPos[pos]) activeByPos[pos] = [];
        activeByPos[pos].push(sal);
      }
    });
    const salary20thThresh = {};
    Object.keys(activeByPos).forEach(pos => {
      const list = activeByPos[pos].sort((a, b) => b - a);
      salary20thThresh[pos] = list.length >= 20 ? list[19] : Infinity;
    });
    // Build PPG groups for ranks
    const contractById = new Map(playerContracts.map(c => [String(c.playerId), c]));
    const posGroups = {};
    Object.entries(playerTotals).forEach(([pid, total]) => {
      const cc = contractById.get(String(pid));
      if (!cc) return;
      const pos = String(cc.position || 'ALL').toUpperCase();
      const games = parseFloat(playerWeeks[String(pid)]) || 0;
      const ppg = games > 0 ? (parseFloat(total) || 0) / games : 0;
      if (!posGroups[pos]) posGroups[pos] = [];
      posGroups[pos].push({ pid: String(pid), ppg });
    });
    const rankMap = new Map();
    Object.keys(posGroups).forEach(pos => {
      posGroups[pos].sort((a, b) => b.ppg - a.ppg);
      posGroups[pos].forEach((row, i) => rankMap.set(`${pos}:${row.pid}`, i + 1));
    });
    const top20Set = new Set();
    Object.keys(posGroups).forEach(pos => {
      posGroups[pos].slice(0, 20).forEach(row => top20Set.add(`${pos}:${row.pid}`));
    });
    const recentlyChangedIds = new Set(
      recentContractChanges.map(c => String(c.playerId).trim())
    );
    holdoutEligiblePlayers = myContractsAll.filter(c => {
      const base = String(c.contractType).toLowerCase() === 'base';
      const active = String(c.status).toLowerCase() === 'active';
      const expiresNextSeason = String(c.contractFinalYear) === finalYearTarget;
      const ageUnder29 = (parseInt(c.age) || 0) < 29;
      const pos = String(c.position || 'ALL').toUpperCase();
      const pid = String(c.playerId);
      const ppgRank = rankMap.get(`${pos}:${pid}`) || null;
  const gamesPlayed = parseFloat(playerWeeks[pid]) || 0;
      const totalPoints = parseFloat(playerTotals[pid]) || 0;
      const ppg = gamesPlayed > 0 ? totalPoints / gamesPlayed : 0;
      const nonPosWeeks = parseFloat(playerNonPositiveWeeks[pid]) || 0;
      const top20 = top20Set.has(`${pos}:${pid}`);
      const thresh = salary20thThresh[pos] ?? Infinity;
      const salaryBelow20th = (parseFloat(c.curYear) || 0) < thresh;
      const nonPosWeekLimit = nonPosWeeks < 8;
      const meets = base && active && expiresNextSeason && ageUnder29 && top20 && salaryBelow20th && nonPosWeekLimit;
      return meets && !recentlyChangedIds.has(pid);
    }).map(c => {
      const pos = String(c.position || 'ALL').toUpperCase();
      const pid = String(c.playerId);
  const gamesPlayed = parseFloat(playerWeeks[pid]) || 0;
      const totalPoints = parseFloat(playerTotals[pid]) || 0;
      const ppg = gamesPlayed > 0 ? totalPoints / gamesPlayed : 0;
      const ppgRank = rankMap.get(`${pos}:${pid}`) || null;
      const nonPosWeeks = parseFloat(playerNonPositiveWeeks[pid]) || 0;
      return {
        ...c,
        posKey: pos,
        ppg,
        ppgRank,
        nonPosWeeks,
        salaryThreshold20th: salary20thThresh[pos] ?? null,
      };
    });
  }
  const holdoutEligiblePlayersSorted = [...holdoutEligiblePlayers].sort((a, b) =>
    String(a.playerName).localeCompare(String(b.playerName), undefined, { sensitivity: 'base' })
  );

  // Average of top 20 active contracts per position for Holdout Extension Year 1
  const holdoutAvgTop20ByPos = (() => {
    const byPos = {};
    playerContracts.filter(p => p.status === 'Active').forEach(p => {
      const pos = String(p.position || 'ALL').toUpperCase();
      if (!byPos[pos]) byPos[pos] = [];
      const sal = parseFloat(p.curYear) || 0;
      if (sal > 0) byPos[pos].push(sal);
    });
    const out = {};
    Object.keys(byPos).forEach(pos => {
      const arr = byPos[pos].sort((a, b) => b - a).slice(0, 20);
      const avg = arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
      out[pos] = Math.ceil(avg * 10) / 10; // round up to 0.1
    });
    return out;
  })();

  function getHoldoutExtensionYear1(player) {
    const pos = String(player.position || 'ALL').toUpperCase();
    return holdoutAvgTop20ByPos[pos] ?? 0;
  }

  // Simulated cap impact for Holdout Extensions (start after final year -> starts at Year 2 if finalYear == curYear, else Year 3)
  // Based on eligibility: final year = currentSeason + 1, which likely maps to year2 relative to current year -> extension starts at year3 (index 2)
  holdoutEligiblePlayersSorted.forEach(p => {
    const choice = holdoutExtensionChoices[p.playerId] || { years: 0 };
    if (!choice.years) return;
    const year1 = getHoldoutExtensionYear1(p);
    let sal = year1;
    for (let i = 1; i <= choice.years; i++) {
      // escalate 10% annually (assumption) rounding up to tenth
      if (i > 1) sal = Math.ceil(sal * 1.10 * 10) / 10;
      const yearIndex = 2 + (i - 1); // start at Year 3 relative to current
      if (yearIndex < 4) yearSalaries[yearIndex] += sal;
    }
  });

  // Compute Franchise Tag values per position: avg top 10 active Base curYear
  const tagValueByPos = (() => {
    const map = {};
    const byPos = {};
    playerContracts
      .filter(p => p.status === 'Active')
      .forEach(p => {
        const pos = p.position || 'ALL';
        if (!byPos[pos]) byPos[pos] = [];
        const sal = parseFloat(p.curYear) || 0;
        byPos[pos].push(sal);
      });
    Object.keys(byPos).forEach(pos => {
      const arr = byPos[pos].sort((a, b) => b - a).slice(0, 10);
      const avg = arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
      map[pos] = Math.ceil(avg * 10) / 10; // round up to 0.1
    });
    return map;
  })();

  function getTagValueForPlayer(p) {
    const pos = p.position || 'ALL';
    const positionAvg = tagValueByPos[pos] ?? 0;
    const currentPlusTen = Math.ceil(((parseFloat(p.curYear) || 0) * 1.10) * 10) / 10; // round up to 0.1
    return Math.max(positionAvg, currentPlusTen);
  }

  const extensionMap = {};
  eligiblePlayers.forEach(p => {
    const choice = extensionChoices[p.playerId] || { years: 0, deny: false };
    extensionMap[p.playerId] = choice;
  });

  // Simulate cap with current extension choices
  eligiblePlayers.forEach(p => {
    const ext = extensionMap[p.playerId] || { years: 0, deny: false };
    if (ext.deny || !ext.years) return;
    let base = parseFloat(p.curYear) || 0;
    for (let i = 1; i <= ext.years; ++i) {
      base = roundUp1(base * 1.10);
      if (i < 4) {
        yearSalaries[i] += base;
      }
    }
  });

  function openCapModal(yearIdx) {
    const yearMap = [
      { salary: 'curYear', label: 'Current Year' },
      { salary: 'year2', label: 'Year 2' },
      { salary: 'year3', label: 'Year 3' },
      { salary: 'year4', label: 'Year 4' },
    ];
    const { salary, label } = yearMap[yearIdx];

    const players = myContractsAll
      .map(c => {
        const contractSalary = parseFloat(c[salary]) || 0;
        const isDead = !(c.status === 'Active' || c.status === 'Future');
        return { playerName: c.playerName, contractType: c.contractType, salary: contractSalary, status: c.status, isDead };
      })
      .filter(c => c.salary > 0)
      .sort((a, b) => b.salary - a.salary);

    const grouped = players.reduce((acc, p) => {
      if (!acc[p.status]) acc[p.status] = [];
      acc[p.status].push(p);
      return acc;
    }, {});

    const statusOrder = ['Active', 'Future', 'Expired', 'Cut'];
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

    setCapModalInfo({ yearIdx, label, groups: orderedGroups, teamNameForUI });
  }

  // Safe gating after all hooks are declared
  if (status === 'loading' || status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="w-full flex flex-col items-center px-3 sm:px-0">
      <h2 className="text-2xl font-bold mb-6 text-white text-center">Contract Management</h2>

      {/* Admin Controls */}
      {isAdmin && (
        <div className="w-full max-w-3xl bg-black/30 rounded-xl border border-white/10 p-4 mb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-white/80">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#FF4B1F]"
                checked={isAdminMode}
                onChange={e => setIsAdminMode(e.target.checked)}
              />
              <span className="font-semibold">Admin Mode</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-white/60">Acting as team:</span>
              <select
                className="bg-white/10 text-white rounded px-2 py-1 min-w-[200px] disabled:opacity-50"
                disabled={!isAdminMode}
                value={isAdminMode ? (selectedTeamName || myTeamName) : myTeamName}
                onChange={e => setSelectedTeamName(e.target.value)}
              >
                {allTeamNames.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2 text-xs text-white/60">
            When Admin Mode is enabled, you can select any team and finalize extensions on their behalf.
          </div>
        </div>
      )}

      {/* Contract Extensions (collapsible) */}
      <div className="w-full max-w-3xl bg-black/30 rounded-xl border border-white/10 shadow-lg mb-10">
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 rounded-t-xl"
          aria-expanded={!extensionsCollapsed}
          onClick={() => setExtensionsCollapsed(v => !v)}
        >
          <h3 className="text-xl font-bold text-[#FF4B1F]">Contract Extensions</h3>
          <div className="flex items-center gap-3">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                extWindowActive
                  ? 'bg-green-500/20 text-green-300 border-green-500/30'
                  : 'bg-red-500/20 text-red-300 border-red-500/30'
              } whitespace-nowrap`}
              title={extBadgeText}
            >
              {extBadgeText}
            </span>
            <span className={`text-white transition-transform ${extensionsCollapsed ? '' : 'rotate-90'}`} aria-hidden>
              ▸
            </span>
          </div>
        </button>

        {!extensionsCollapsed && (
          <div className="px-5 pb-5 pt-1">
            <div className="mb-6 text-white/80 text-base">
              Extend players on expiring base contracts (not entering RFA). Simulate different extension scenarios and see the impact on your cap space.
            </div>
            <div className="mb-4 text-white/70 font-semibold">
              Team: <span className="text-[#1FDDFF]">{teamNameForUI || 'Unknown'}</span>
            </div>

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
                  {[0, 1, 2, 3].map(i => {
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
                      <tr key={i} className="cursor-pointer hover:bg-white/10" onClick={() => openCapModal(i)}>
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

            {/* Eligible list */}
            <div>
              <h4 className="font-semibold text-white mb-2">Eligible Players</h4>
              {!isExtensionWindowOpen() && !(isAdmin && isAdminMode) && (
                <div className="text-yellow-400 text-xs mb-3">
                  Extensions can only be finalized between May 1st and August 31st.
                </div>
              )}
              {eligiblePlayers.length === 0 ? (
                <div className="text-white/60 italic">No players eligible for extension this year.</div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-3">
                    {eligiblePlayersSorted.map(player => {
                      const ext = extensionMap[player.playerId] || { years: 0, deny: false };
                      let base = parseFloat(player.curYear) || 0;
                      const simYears = [];
                      let extensionSalaries = [];
                      for (let i = 1; i <= ext.years; ++i) {
                        base = roundUp1(base * 1.10);
                        simYears.push(`Year ${i + 1}: $${base.toFixed(1)}`);
                        extensionSalaries.push(base);
                      }
                      const showFinalize = !ext.deny && ext.years > 0 && extWindowActive;
                      return (
                        <div key={player.playerId} className="bg-[#0C1B26] border border-white/10 rounded-3xl shadow-xl overflow-hidden">
                          <div className="flex items-center gap-3 px-5 py-4 bg-[#0E2233] border-b border-white/10">
                            <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-10 h-10 rounded-md overflow-hidden shadow" />
                            <div className="min-w-0">
                              <div className="text-white font-bold text-2xl leading-7 truncate">{player.playerName}</div>
                              <div className="text-white/70 text-sm">Age: {player.age ?? '-'}</div>
                            </div>
                          </div>

                          <div className="px-5 py-4 bg-[#0C1B26] border-b border-white/10 grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-white/70 text-sm">Current Salary</div>
                              <div className="text-white font-semibold text-3xl mt-1">${parseFloat(player.curYear).toFixed(1)}</div>
                            </div>
                            <div>
                              <div className="text-white/70 text-sm">Extension</div>
                              <select
                                className="mt-1 w-full bg-white text-[#0B1722] rounded-xl px-3 py-2 border-2 border-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF4B1F] focus:border-[#FF4B1F]"
                                value={ext.years}
                                onChange={e => {
                                  const val = e.target.value;
                                  setExtensionChoices(prev => ({
                                    ...prev,
                                    [player.playerId]: { years: Number(val), deny: false },
                                  }));
                                  if (val !== '0') {
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

                          <div className="px-5 py-4 bg-[#0C1B26]">
                            <div className="text-white/70 text-sm">Simulated Years</div>
                            <div className="mt-2 text-lg">
                              {ext.deny || !ext.years ? (
                                <span className="text-white/60 italic">No extension</span>
                              ) : (
                                <div className="flex flex-col items-start space-y-2">
                                  {simYears.map((s, i) => (
                                    <span key={i} className="text-white">
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="px-5 pb-5 bg-[#0C1B26]">
                            {showFinalize && pendingExtension && pendingExtension.player.playerId === player.playerId && (
                              <button
                                className="w-full px-4 py-3 bg-[#FF4B1F] text-white rounded-xl hover:bg-orange-600 font-semibold text-lg shadow"
                                disabled={finalizeLoading || (!isExtensionWindowOpen() && !(isAdmin && isAdminMode))}
                                onClick={async () => {
                                  // Build value list for confirmation
                                  let baseC = parseFloat(player.curYear);
                                  const extVals = [];
                                  for (let i = 1; i <= pendingExtension.years; ++i) {
                                    baseC = Math.ceil(baseC * 1.10 * 10) / 10;
                                    extVals.push(baseC.toFixed(1));
                                  }
                                  const lengthText = pendingExtension.years === 1 ? '1 year' : `${pendingExtension.years} years`;
                                  const valueText = `$${extVals.join(', $')}`;
                                  const confirmMsg = `Are you sure you want to extend ${player.playerName} at ${valueText} for ${lengthText}? This cannot be undone.`;
                                  if (!window.confirm(confirmMsg)) return;

                                  setFinalizeLoading(true);
                                  setFinalizeMsg('');
                                  setFinalizeError('');
                                  try {
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
                                      ai_notes: '',
                                      playerId: player.playerId,
                                      playerName: player.playerName,
                                      years: pendingExtension.years,
                                      extensionSalaries,
                                      team: teamNameForUI,
                                    };

                                    try {
                                      const aiRes = await fetch('/api/ai/transaction_notes', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ contractChange }),
                                      });
                                      const aiData = await aiRes.json();
                                      contractChange.ai_notes = aiData.ai_notes || 'AI summary unavailable.';
                                    } catch {
                                      contractChange.ai_notes = 'AI summary unavailable.';
                                    }

                                    const res = await fetch('/api/admin/contract_changes', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(contractChange),
                                    });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error || 'Failed to save extension');
                                    setFinalizeMsg('Extension finalized and saved!');

                                    const refreshRes = await fetch('/api/admin/contract_changes');
                                    const refreshData = await refreshRes.json();
                                    if (Array.isArray(refreshData)) {
                                      const oneYearAgo = new Date();
                                      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                                      const recent = refreshData.filter(
                                        c => c.change_type === 'extension' && c.playerId && c.timestamp && new Date(c.timestamp) > oneYearAgo
                                      );
                                      setRecentContractChanges(recent);
                                    }

                                    setExtensionChoices(prev => {
                                      const updated = { ...prev };
                                      delete updated[player.playerId];
                                      return updated;
                                    });

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
                            {!isExtensionWindowOpen() && !(isAdmin && isAdminMode) && (
                              <div className="mt-2 text-yellow-400 text-xs">Extensions can only be finalized between May 1st and August 31st.</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Modern desktop card list */}
                  <div className="hidden sm:block">
                {eligiblePlayersSorted.map(player => {
                  const ext = extensionMap[player.playerId] || { years: 0, deny: false };
                  let base = parseFloat(player.curYear) || 0;
                  const simYears = [];
                  let extensionSalaries = [];
                  for (let i = 1; i <= ext.years; ++i) {
                    base = roundUp1(base * 1.10);
                    simYears.push(`Year ${i + 1}: $${base}`);
                    extensionSalaries.push(base);
                  }
                  const showFinalize = !ext.deny && ext.years > 0 && extWindowActive;
                  return (
                    <EligiblePlayerCard
                      key={player.playerId}
                      player={player}
                      ext={ext}
                      simYears={simYears}
                      showFinalize={showFinalize}
                      pendingExtension={pendingExtension}
                      finalizeLoading={finalizeLoading}
                      isExtensionWindowOpen={isExtensionWindowOpen() || (isAdmin && isAdminMode)}
                      onExtensionChange={e => {
                        const val = e.target.value;
                        setExtensionChoices(prev => ({
                          ...prev,
                          [player.playerId]: { years: Number(val), deny: false },
                        }));
                        if (val !== '0') {
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
                      onFinalize={async () => {
                        let baseC = parseFloat(player.curYear);
                        const extVals = [];
                        for (let i = 1; i <= pendingExtension.years; ++i) {
                          baseC = Math.ceil(baseC * 1.10 * 10) / 10;
                          extVals.push(baseC.toFixed(1));
                        }
                        const lengthText = pendingExtension.years === 1 ? '1 year' : `${pendingExtension.years} years`;
                        const valueText = `$${extVals.join(', $')}`;
                        const confirmMsg = `Are you sure you want to extend ${player.playerName} at ${valueText} for ${lengthText}? This cannot be undone.`;
                        if (!window.confirm(confirmMsg)) return;

                        setFinalizeLoading(true);
                        setFinalizeMsg('');
                        setFinalizeError('');
                        try {
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
                            ai_notes: '',
                            playerId: player.playerId,
                            playerName: player.playerName,
                            years: pendingExtension.years,
                            extensionSalaries,
                            team: teamNameForUI,
                          };

                          try {
                            const aiRes = await fetch('/api/ai/transaction_notes', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ contractChange }),
                            });
                            const aiData = await aiRes.json();
                            contractChange.ai_notes = aiData.ai_notes || 'AI summary unavailable.';
                          } catch {
                            contractChange.ai_notes = 'AI summary unavailable.';
                          }

                          const res = await fetch('/api/admin/contract_changes', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(contractChange),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || 'Failed to save extension');
                          setFinalizeMsg('Extension finalized and saved!');

                          const refreshRes = await fetch('/api/admin/contract_changes');
                          const refreshData = await refreshRes.json();
                          if (Array.isArray(refreshData)) {
                            const oneYearAgo = new Date();
                            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                            const recent = refreshData.filter(
                              c => c.change_type === 'extension' && c.playerId && c.timestamp && new Date(c.timestamp) > oneYearAgo
                            );
                            setRecentContractChanges(recent);
                          }

                          setExtensionChoices(prev => {
                            const updated = { ...prev };
                            delete updated[player.playerId];
                            return updated;
                          });

                          setPendingExtension(null);
                        } catch (err) {
                          setFinalizeError(err.message);
                        } finally {
                          setFinalizeLoading(false);
                        }
                      }}
                    />
                  );
                })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cap modal */}
      {capModalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#1a2233] rounded-lg shadow-2xl p-6 w-full max-w-md relative max-h-[90vh] overflow-y-auto" tabIndex={-1} role="dialog" aria-modal="true">
            <button
              className="absolute top-2 right-2 text-white hover:text-[#FF4B1F] text-2xl font-bold focus:outline-none"
              onClick={() => setCapModalInfo(null)}
              aria-label="Close"
              tabIndex={0}
            >
              ×
            </button>
            <h2 className="text-xl font-bold mb-2 text-[#FF4B1F]">
              {(capModalInfo.teamNameForUI || teamNameForUI)} – {capModalInfo.label} Contracts
            </h2>
            {!capModalInfo.groups || capModalInfo.groups.length === 0 ? (
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
                          <td className={(p.status === 'Active' || p.status === 'Future') ? 'text-green-300' : 'text-red-300'}>{p.playerName}</td>
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
              <button className="px-4 py-2 bg-[#FF4B1F] text-white rounded hover:bg-[#ff6a3c] font-semibold" onClick={() => setCapModalInfo(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Franchise Tags (collapsible) */}
      <div className="w-full max-w-3xl bg-black/30 rounded-xl border border-white/10 shadow-lg mb-10">
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 rounded-t-xl"
          aria-expanded={!franchiseCollapsed}
          onClick={() => setFranchiseCollapsed(v => !v)}
        >
          <h3 className="text-xl font-bold text-[#1FDDFF]">Franchise Tags</h3>
          <div className="flex items-center gap-3">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                franchiseWindowActive
                  ? 'bg-green-500/20 text-green-300 border-green-500/30'
                  : 'bg-red-500/20 text-red-300 border-red-500/30'
              } whitespace-nowrap`}
              title={franchiseBadgeText}
            >
              {franchiseBadgeText}
            </span>
            <span className={`text-white transition-transform ${franchiseCollapsed ? '' : 'rotate-90'}`} aria-hidden>
              ▸
            </span>
          </div>
        </button>

        {!franchiseCollapsed && (
          <div className="px-5 pb-5 pt-1">
            <div className="mb-6 text-white/80 text-base">
              Apply one-year franchise tags during the tag window. Tag value is the higher of: (a) the average of the top 10 active contracts at the player's position (any contract type), or (b) the player's current salary + 10%.
            </div>
            <div className="mb-2 text-white/70 text-sm">
              Window: Feb 1 — Mar 31. Team: <span className="text-[#1FDDFF]">{teamNameForUI || 'Unknown'}</span>
            </div>

            <div className="mb-8">
              <h4 className="font-semibold text-white mb-2">Simulated Cap Usage</h4>
              <table className="w-full text-center border border-white/10 rounded bg-white/5 mb-2">
                <thead>
                  <tr>
                    <th className="p-2 text-white/80">Year</th>
                    <th className="p-2 text-white/80 border-l border-white/10">Cap Used</th>
                    <th className="p-2 text-white/80 border-l border-white/10">Tag Cost</th>
                    <th className="p-2 text-white/80 border-l border-white/10">Cap Space</th>
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3].map(i => {
                    // Compute tag cost only in Year 1 (i === 1), limit 1 tag per team
                    let tagCost = 0;
                    if (i === 1) {
                      if (!hasFranchiseTagThisYearForTeam) {
                        if (pendingFranchiseTag?.player) {
                          tagCost = getTagValueForPlayer(pendingFranchiseTag.player) || 0;
                        } else {
                          for (const p of franchiseEligiblePlayers) {
                            const choice = franchiseTagChoices[p.playerId] || { apply: false };
                            if (choice.apply) {
                              tagCost = getTagValueForPlayer(p) || 0;
                              break;
                            }
                          }
                        }
                      }
                    }
                    const baseCap = yearSalaries[i] + yearDead[i];
                    const capSpace = CAP - (baseCap + tagCost);
                    return (
                      <tr key={i}>
                        <td className="p-2">{curYear + i}</td>
                        <td className="p-2 border-l border-white/10">${baseCap.toFixed(1)}</td>
                        <td className="p-2 border-l border-white/10 text-blue-300 font-semibold">{tagCost === 0 ? '-' : `$${tagCost.toFixed(1)}`}</td>
                        <td className={`p-2 border-l border-white/10 font-bold ${capSpace < 0 ? 'text-red-400' : 'text-green-400'}`}>{capSpace.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="text-xs text-white/60">Cap limit: ${CAP} per year</div>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-2">Eligible Players</h4>
              {!isFranchiseWindowOpen() && !(isAdmin && isAdminMode) && (
                <div className="text-yellow-400 text-xs mb-3">Tags can only be applied between Feb 1st and March 31st.</div>
              )}
              {hasFranchiseTagThisYearForTeam && (
                <div className="text-yellow-400 text-xs mb-3">This team has already applied a Franchise Tag this year. You cannot apply another.</div>
              )}
              {franchiseEligiblePlayers.length === 0 ? (
                <div className="text-white/60 italic">No players eligible for a franchise tag.</div>
              ) : (
                <>
                  {/* Mobile */}
                  <div className="sm:hidden space-y-3">
                    {franchiseEligiblePlayersSorted.map(player => {
                      const tagValue = getTagValueForPlayer(player) || 0;
                      const choice = franchiseTagChoices[player.playerId] || { apply: false };
                      const showFinalize = choice.apply && !hasFranchiseTagThisYearForTeam && franchiseWindowActive;
                      return (
                        <div key={player.playerId} className="bg-[#0C1B26] border border-white/10 rounded-3xl shadow-xl overflow-hidden">
                          <div className="flex items-center gap-3 px-5 py-4 bg-[#0E2233] border-b border-white/10">
                            <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-10 h-10 rounded-md overflow-hidden shadow" />
                            <div className="min-w-0">
                              <div className="text-white font-bold text-2xl leading-7 break-words whitespace-normal">{player.playerName}</div>
                              <div className="text-white/70 text-sm">Age: {player.age ?? '-'}</div>
                            </div>
                          </div>
                          <div className="px-5 py-4 bg-[#0C1B26] border-b border-white/10 grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-white/70 text-sm">Tag Value</div>
                              <div className="text-white font-semibold text-3xl mt-1">${tagValue.toFixed(1)}</div>
                              <div className="text-white/60 text-xs">1-year contract</div>
                            </div>
                            <div>
                              <div className="text-white/70 text-sm">Apply Tag</div>
                              <select
                                className="mt-1 w-full bg-white text-[#0B1722] rounded-xl px-3 py-2 border-2 border-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF4B1F] focus:border-[#FF4B1F]"
                                value={choice.apply ? 'apply' : 'none'}
                                onChange={e => {
                                  const apply = e.target.value === 'apply';
                                  setFranchiseTagChoices(prev => ({ ...prev, [player.playerId]: { apply } }));
                                  if (apply) setPendingFranchiseTag({ player, tagValue });
                                  else if (pendingFranchiseTag && pendingFranchiseTag.player.playerId === player.playerId) setPendingFranchiseTag(null);
                                }}
                                disabled={hasFranchiseTagThisYearForTeam}
                              >
                                <option value="none">No Tag</option>
                                <option value="apply">Apply Tag</option>
                              </select>
                            </div>
                          </div>
                          <div className="px-5 pb-5 bg-[#0C1B26]">
                            {showFinalize && pendingFranchiseTag && pendingFranchiseTag.player.playerId === player.playerId && (
                              <button
                                className="w-full px-4 py-3 bg-[#FF4B1F] text-white rounded-xl hover:bg-orange-600 font-semibold text-lg shadow"
                                disabled={finalizeLoading || hasFranchiseTagThisYearForTeam || (!isFranchiseWindowOpen() && !(isAdmin && isAdminMode))}
                                onClick={async () => {
                                  const confirmMsg = `Are you sure you want to apply your Franchise Tag to ${player.playerName} at $${tagValue.toFixed(1)}? This will be your only use of the Franchise Tag this offseason, and cannot be undone.`;
                                  if (!window.confirm(confirmMsg)) return;

                                  setFinalizeLoading(true);
                                  setFinalizeMsg('');
                                  setFinalizeError('');
                                  try {
                                    const contractChange = {
                                      change_type: 'franchise_tag',
                                      user: session?.user?.name || '',
                                      timestamp: new Date().toISOString(),
                                      notes: `Applied franchise tag to ${player.playerName} (${player.position}) for 1 year at $${tagValue.toFixed(1)}.`,
                                      ai_notes: '',
                                      playerId: player.playerId,
                                      playerName: player.playerName,
                                      years: 1,
                                      tagSalary: Number(tagValue.toFixed(1)),
                                      team: teamNameForUI,
                                      position: player.position,
                                    };

                                    try {
                                      const aiRes = await fetch('/api/ai/transaction_notes', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ contractChange }),
                                      });
                                      const aiData = await aiRes.json();
                                      contractChange.ai_notes = aiData.ai_notes || 'AI summary unavailable.';
                                    } catch {
                                      contractChange.ai_notes = 'AI summary unavailable.';
                                    }

                                    const res = await fetch('/api/admin/contract_changes', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(contractChange),
                                    });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error || 'Failed to save franchise tag');
                                    setFinalizeMsg('Franchise tag applied and saved!');

                                    const refreshRes = await fetch('/api/admin/contract_changes');
                                    const refreshData = await refreshRes.json();
                                    if (Array.isArray(refreshData)) {
                                      const oneYearAgo = new Date();
                                      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                                      const recent = refreshData.filter(
                                        c => (c.change_type === 'extension' || c.change_type === 'franchise_tag') && c.playerId && c.timestamp && new Date(c.timestamp) > oneYearAgo
                                      );
                                      setRecentContractChanges(recent);
                                    }

                                    setFranchiseTagChoices(prev => {
                                      const updated = { ...prev };
                                      delete updated[player.playerId];
                                      return updated;
                                    });
                                    setPendingFranchiseTag(null);
                                  } catch (err) {
                                    setFinalizeError(err.message);
                                  } finally {
                                    setFinalizeLoading(false);
                                  }
                                }}
                              >
                                {finalizeLoading ? 'Saving...' : 'Finalize Tag'}
                              </button>
                            )}
                            {hasFranchiseTagThisYearForTeam && (
                              <div className="mt-2 text-yellow-400 text-xs">Limit reached: 1 Franchise Tag per team per year.</div>
                            )}
                            {!isFranchiseWindowOpen() && !(isAdmin && isAdminMode) && (
                              <div className="mt-2 text-yellow-400 text-xs">Tags can only be applied between Feb 1st and March 31st.</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop cards */}
                  <div className="hidden sm:block">
                    {franchiseEligiblePlayersSorted.map(player => {
                      const tagValue = getTagValueForPlayer(player) || 0;
                      const choice = franchiseTagChoices[player.playerId] || { apply: false };
                      const showFinalize = choice.apply && !hasFranchiseTagThisYearForTeam && franchiseWindowActive;
                      return (
                        <FranchiseTagCard
                          key={player.playerId}
                          player={player}
                          tagValue={tagValue}
                          choice={choice}
                          showFinalize={showFinalize}
                          pendingTag={pendingFranchiseTag}
                          finalizeLoading={finalizeLoading}
                          isFranchiseWindowOpen={isFranchiseWindowOpen() || (isAdmin && isAdminMode)}
                          hasFranchiseLimitReached={hasFranchiseTagThisYearForTeam}
                          onChoiceChange={apply => {
                            setFranchiseTagChoices(prev => ({ ...prev, [player.playerId]: { apply } }));
                            if (apply) setPendingFranchiseTag({ player, tagValue });
                            else if (pendingFranchiseTag && pendingFranchiseTag.player.playerId === player.playerId) setPendingFranchiseTag(null);
                          }}
                          onFinalize={async () => {
                            const confirmMsg = `Are you sure you want to apply your Franchise Tag to ${player.playerName} at $${tagValue.toFixed(1)}? This will be your only use of the Franchise Tag this offseason, and cannot be undone.`;
                            if (!window.confirm(confirmMsg)) return;

                            setFinalizeLoading(true);
                            setFinalizeMsg('');
                            setFinalizeError('');
                            try {
                              const contractChange = {
                                change_type: 'franchise_tag',
                                user: session?.user?.name || '',
                                timestamp: new Date().toISOString(),
                                notes: `Applied franchise tag to ${player.playerName} (${player.position}) for 1 year at $${tagValue.toFixed(1)}.`,
                                ai_notes: '',
                                playerId: player.playerId,
                                playerName: player.playerName,
                                years: 1,
                                tagSalary: Number(tagValue.toFixed(1)),
                                team: teamNameForUI,
                                position: player.position,
                              };

                              try {
                                const aiRes = await fetch('/api/ai/transaction_notes', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ contractChange }),
                                });
                                const aiData = await aiRes.json();
                                contractChange.ai_notes = aiData.ai_notes || 'AI summary unavailable.';
                              } catch {
                                contractChange.ai_notes = 'AI summary unavailable.';
                              }

                              const res = await fetch('/api/admin/contract_changes', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(contractChange),
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error || 'Failed to save franchise tag');
                              setFinalizeMsg('Franchise tag applied and saved!');

                              const refreshRes = await fetch('/api/admin/contract_changes');
                              const refreshData = await refreshRes.json();
                              if (Array.isArray(refreshData)) {
                                const oneYearAgo = new Date();
                                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                                const recent = refreshData.filter(
                                  c => (c.change_type === 'extension' || c.change_type === 'franchise_tag') && c.playerId && c.timestamp && new Date(c.timestamp) > oneYearAgo
                                );
                                setRecentContractChanges(recent);
                              }

                              setFranchiseTagChoices(prev => {
                                const updated = { ...prev };
                                delete updated[player.playerId];
                                return updated;
                              });
                              setPendingFranchiseTag(null);
                            } catch (err) {
                              setFinalizeError(err.message);
                            } finally {
                              setFinalizeLoading(false);
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RFA Tags (collapsible) */}
      <div className="w-full max-w-3xl bg-black/30 rounded-xl border border-white/10 shadow-lg mb-10">
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 rounded-t-xl"
          aria-expanded={!rfaCollapsed}
          onClick={() => setRfaCollapsed(v => !v)}
        >
          <h3 className="text-xl font-bold text-[#9bffb7]">RFA Tags</h3>
          <div className="flex items-center gap-3">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                rfaWindowActive
                  ? 'bg-green-500/20 text-green-300 border-green-500/30'
                  : 'bg-red-500/20 text-red-300 border-red-500/30'
              } whitespace-nowrap`}
              title={rfaBadgeText}
            >
              {rfaBadgeText}
            </span>
            <span className={`text-white transition-transform ${rfaCollapsed ? '' : 'rotate-90'}`} aria-hidden>
              ▸
            </span>
          </div>
        </button>

        {!rfaCollapsed && (
          <div className="px-5 pb-5 pt-1">
            <div className="mb-6 text-white/80 text-base">
              Convert a player's current contract to RFA status. Eligible players are on active Waiver/FA contracts and not already RFA. Limit: 1 player per team per year.
            </div>
            <div className="mb-2 text-white/70 text-sm">
              Window: Feb 1 — Mar 31. Team: <span className="text-[#1FDDFF]">{teamNameForUI || 'Unknown'}</span>
            </div>

            {hasRfaTagThisYearForTeam && (
              <div className="mb-4 text-yellow-400 text-xs">This team has already applied an RFA tag this year. You cannot apply another.</div>
            )}

            <div>
              <h4 className="font-semibold text-white mb-2">Eligible Players</h4>
              {!isFranchiseWindowOpen() && !(isAdmin && isAdminMode) && (
                <div className="text-yellow-400 text-xs mb-3">RFA tags can only be applied between Feb 1st and March 31st.</div>
              )}
              {rfaEligiblePlayersSorted.length === 0 ? (
                <div className="text-white/60 italic">No players eligible for an RFA tag.</div>
              ) : (
                <>
                  {/* Mobile */}
                  <div className="sm:hidden space-y-3">
                    {rfaEligiblePlayersSorted.map(player => {
                      const choice = rfaTagChoices[player.playerId] || { apply: false };
                      const showFinalize = choice.apply && !hasRfaTagThisYearForTeam && rfaWindowActive;
                      return (
                        <div key={player.playerId} className="bg-[#0C1B26] border border-white/10 rounded-3xl shadow-xl overflow-hidden">
                          <div className="flex items-center gap-3 px-5 py-4 bg-[#0E2233] border-b border-white/10">
                            <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-10 h-10 rounded-md overflow-hidden shadow" />
                            <div className="min-w-0">
                              <div className="text-white font-bold text-2xl leading-7 break-words whitespace-normal">{player.playerName}</div>
                              <div className="text-white/70 text-sm">Age: {player.age ?? '-'}</div>
                            </div>
                          </div>
                          <div className="px-5 py-4 bg-[#0C1B26] border-b border-white/10 grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-white/70 text-sm">Current Contract</div>
                              <div className="text-white font-semibold text-3xl mt-1">{player.contractType}</div>
                              <div className="text-white/60 text-xs">RFA Tag sets RFA? to TRUE</div>
                            </div>
                            <div>
                              <div className="text-white/70 text-sm">Apply RFA Tag</div>
                              <select
                                className="mt-1 w-full bg-white text-[#0B1722] rounded-xl px-3 py-2 border-2 border-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF4B1F] focus:border-[#FF4B1F]"
                                value={choice.apply ? 'apply' : 'none'}
                                onChange={e => {
                                  const apply = e.target.value === 'apply';
                                  setRfaTagChoices(prev => ({ ...prev, [player.playerId]: { apply } }));
                                  if (apply) setPendingRfaTag({ player });
                                  else if (pendingRfaTag && pendingRfaTag.player.playerId === player.playerId) setPendingRfaTag(null);
                                }}
                              >
                                <option value="none">No Tag</option>
                                <option value="apply">Apply Tag</option>
                              </select>
                            </div>
                          </div>
                          <div className="px-5 pb-5 bg-[#0C1B26]">
                            {showFinalize && pendingRfaTag && pendingRfaTag.player.playerId === player.playerId && (
                              <button
                                className="w-full px-4 py-3 bg-[#FF4B1F] text-white rounded-xl hover:bg-orange-600 font-semibold text-lg shadow disabled:opacity-50"
                                disabled={finalizeLoading || hasRfaTagThisYearForTeam || (!isFranchiseWindowOpen() && !(isAdmin && isAdminMode))}
                                onClick={async () => {
                                  const confirmMsg = `Are you sure you want to apply your RFA Tag to ${player.playerName}? This will be your only use of the RFA tag this offseason, and cannot be undone.`;
                                  if (!window.confirm(confirmMsg)) return;

                                  setFinalizeLoading(true);
                                  setFinalizeMsg('');
                                  setFinalizeError('');
                                  try {
                                    const contractChange = {
                                      change_type: 'rfa_tag',
                                      user: session?.user?.name || '',
                                      timestamp: new Date().toISOString(),
                                      notes: `Applied RFA tag to ${player.playerName}.`,
                                      ai_notes: '',
                                      playerId: player.playerId,
                                      playerName: player.playerName,
                                      years: 0,
                                      team: teamNameForUI,
                                      position: player.position,
                                    };

                                    try {
                                      const aiRes = await fetch('/api/ai/transaction_notes', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ contractChange }),
                                      });
                                      const aiData = await aiRes.json();
                                      contractChange.ai_notes = aiData.ai_notes || 'AI summary unavailable.';
                                    } catch {
                                      contractChange.ai_notes = 'AI summary unavailable.';
                                    }

                                    const res = await fetch('/api/admin/contract_changes', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(contractChange),
                                    });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error || 'Failed to save RFA tag');
                                    setFinalizeMsg('RFA tag applied and saved!');

                                    const refreshRes = await fetch('/api/admin/contract_changes');
                                    const refreshData = await refreshRes.json();
                                    if (Array.isArray(refreshData)) {
                                      const oneYearAgo = new Date();
                                      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                                      const recent = refreshData.filter(
                                        c => (c.change_type === 'extension' || c.change_type === 'franchise_tag' || c.change_type === 'rfa_tag') && c.playerId && c.timestamp && new Date(c.timestamp) > oneYearAgo
                                      );
                                      setRecentContractChanges(recent);
                                    }

                                    setRfaTagChoices(prev => {
                                      const updated = { ...prev };
                                      delete updated[player.playerId];
                                      return updated;
                                    });
                                    setPendingRfaTag(null);
                                  } catch (err) {
                                    setFinalizeError(err.message);
                                  } finally {
                                    setFinalizeLoading(false);
                                  }
                                }}
                              >
                                {finalizeLoading ? 'Saving...' : 'Finalize RFA Tag'}
                              </button>
                            )}
                            {hasRfaTagThisYearForTeam && (
                              <div className="mt-2 text-yellow-400 text-xs">Limit reached: 1 RFA tag per team per year.</div>
                            )}
                            {!isFranchiseWindowOpen() && !(isAdmin && isAdminMode) && (
                              <div className="mt-2 text-yellow-400 text-xs">RFA tags can only be applied between Feb 1st and March 31st.</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop */}
                  <div className="hidden sm:block">
                    {rfaEligiblePlayersSorted.map(player => {
                      const choice = rfaTagChoices[player.playerId] || { apply: false };
                      const showFinalize = choice.apply && !hasRfaTagThisYearForTeam && rfaWindowActive;
                      return (
                        <RFATagCard
                          key={player.playerId}
                          player={player}
                          choice={choice}
                          showFinalize={showFinalize}
                          pendingTag={pendingRfaTag}
                          finalizeLoading={finalizeLoading}
                          hasRfaLimitReached={hasRfaTagThisYearForTeam}
                          isRfaWindowOpen={isFranchiseWindowOpen() || (isAdmin && isAdminMode)}
                          onChoiceChange={apply => {
                            setRfaTagChoices(prev => ({ ...prev, [player.playerId]: { apply } }));
                            if (apply) setPendingRfaTag({ player });
                            else if (pendingRfaTag && pendingRfaTag.player.playerId === player.playerId) setPendingRfaTag(null);
                          }}
                          onFinalize={async () => {
                            const confirmMsg = `Are you sure you want to apply your RFA Tag to ${player.playerName}? This will be your only use of the RFA tag this offseason, and cannot be undone.`;
                            if (!window.confirm(confirmMsg)) return;

                            setFinalizeLoading(true);
                            setFinalizeMsg('');
                            setFinalizeError('');
                            try {
                              const contractChange = {
                                change_type: 'rfa_tag',
                                user: session?.user?.name || '',
                                timestamp: new Date().toISOString(),
                                notes: `Applied RFA tag to ${player.playerName}.`,
                                ai_notes: '',
                                playerId: player.playerId,
                                playerName: player.playerName,
                                years: 0,
                                team: teamNameForUI,
                                position: player.position,
                              };

                              try {
                                const aiRes = await fetch('/api/ai/transaction_notes', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ contractChange }),
                                });
                                const aiData = await aiRes.json();
                                contractChange.ai_notes = aiData.ai_notes || 'AI summary unavailable.';
                              } catch {
                                contractChange.ai_notes = 'AI summary unavailable.';
                              }

                              const res = await fetch('/api/admin/contract_changes', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(contractChange),
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error || 'Failed to save RFA tag');
                              setFinalizeMsg('RFA tag applied and saved!');

                              const refreshRes = await fetch('/api/admin/contract_changes');
                              const refreshData = await refreshRes.json();
                              if (Array.isArray(refreshData)) {
                                const oneYearAgo = new Date();
                                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                                const recent = refreshData.filter(
                                  c => (c.change_type === 'extension' || c.change_type === 'franchise_tag' || c.change_type === 'rfa_tag') && c.playerId && c.timestamp && new Date(c.timestamp) > oneYearAgo
                                );
                                setRecentContractChanges(recent);
                              }

                              setRfaTagChoices(prev => {
                                const updated = { ...prev };
                                delete updated[player.playerId];
                                return updated;
                              });
                              setPendingRfaTag(null);
                            } catch (err) {
                              setFinalizeError(err.message);
                            } finally {
                              setFinalizeLoading(false);
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Holdouts (collapsible) */}
      <div className="w-full max-w-3xl bg-black/30 rounded-xl border border-white/10 shadow-lg mb-10">
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 rounded-t-xl"
          aria-expanded={!holdoutsCollapsed}
          onClick={() => setHoldoutsCollapsed(v => !v)}
        >
          <h3 className="text-xl font-bold text-[#FFA726]">Holdouts</h3>
          <div className="flex items-center gap-3">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                holdoutsWindowActive
                  ? 'bg-green-500/20 text-green-300 border-green-500/30'
                  : 'bg-red-500/20 text-red-300 border-red-500/30'
              } whitespace-nowrap`}
              title={holdoutsBadgeText}
            >
              {holdoutsBadgeText}
            </span>
            <span className={`text-white transition-transform ${holdoutsCollapsed ? '' : 'rotate-90'}`} aria-hidden>
              ▸
            </span>
          </div>
        </button>

        {!holdoutsCollapsed && (
          <div className="px-5 pb-5 pt-1">
            <div className="mb-6 text-white/80 text-base">
              Manage eligible holdout players based on <span className="font-semibold">previous season</span> performance (see Holdouts page for criteria). Options: Apply a Holdout RFA Tag (does not count against normal RFA tag limit) or grant a Holdout Extension starting the year after their current contract's final season. Year 1 of a Holdout Extension is the average of the top 20 active contracts at the player's position from the previous season; later years escalate +10% (rounded up to $0.1). <span className="text-white/60 text-xs">(Assumption: annual 10% escalation for years 2-3. Metrics shown reflect {currentSeason}).</span>
            </div>
            <div className="mb-2 text-white/70 text-sm">
              Window: Apr 1 — Apr 30. Team: <span className="text-[#1FDDFF]">{teamNameForUI || 'Unknown'}</span>
            </div>
            {!holdoutsWindowActive && (
              <div className="text-yellow-400 text-xs mb-4">Holdout actions can only be finalized between April 1st and April 30th.</div>
            )}
            <div>
              <h4 className="font-semibold text-white mb-2">Eligible Players</h4>
              {holdoutEligiblePlayersSorted.length === 0 ? (
                <div className="text-white/60 italic">No players eligible as holdouts for your team.</div>
              ) : (
                <>
                  {/* Mobile */}
                  <div className="sm:hidden space-y-3">
                    {holdoutEligiblePlayersSorted.map(player => {
                      const extChoice = holdoutExtensionChoices[player.playerId] || { years: 0 };
                      const rfaChoice = holdoutRfaChoices[player.playerId] || { apply: false };
                      const year1 = getHoldoutExtensionYear1(player);
                      let salaries = [];
                      let sal = year1;
                      for (let y = 1; y <= extChoice.years; y++) {
                        if (y > 1) sal = Math.ceil(sal * 1.10 * 10) / 10;
                        salaries.push(sal);
                      }
                      const showFinalizeExtension = extChoice.years > 0 && pendingHoldoutExtension?.player?.playerId === player.playerId && holdoutsWindowActive;
                      const showFinalizeRfa = rfaChoice.apply && pendingHoldoutRfa?.player?.playerId === player.playerId && holdoutsWindowActive;
                      return (
                        <div key={player.playerId} className="bg-[#0C1B26] border border-white/10 rounded-3xl shadow-xl overflow-hidden">
                          <div className="flex items-center gap-3 px-5 py-4 bg-[#0E2233] border-b border-white/10">
                            <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-10 h-10 rounded-md overflow-hidden shadow" />
                            <div className="min-w-0">
                              <div className="text-white font-bold text-2xl leading-7 break-words whitespace-normal">{player.playerName}</div>
                              <div className="text-white/70 text-sm">Age: {player.age ?? '-'}</div>
                            </div>
                          </div>
                          <div className="px-5 py-4 bg-[#0C1B26] border-b border-white/10 grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-white/70 text-sm">Holdout Ext Yr1</div>
                              <div className="text-white font-semibold text-3xl mt-1">${year1.toFixed(1)}</div>
                              <div className="text-white/60 text-xs">Avg top 20 at position</div>
                            </div>
                            <div>
                              <div className="text-white/70 text-sm">Extension Years</div>
                              <select
                                className="mt-1 w-full bg-white text-[#0B1722] rounded-xl px-3 py-2 border-2 border-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF4B1F]"
                                value={extChoice.years}
                                onChange={e => {
                                  const years = Number(e.target.value);
                                  setHoldoutExtensionChoices(prev => ({ ...prev, [player.playerId]: { years } }));
                                  if (years > 0) {
                                    setPendingHoldoutExtension({ player, years, salaries });
                                    // Clear RFA choice if set
                                    setHoldoutRfaChoices(prev => ({ ...prev, [player.playerId]: { apply: false } }));
                                    if (pendingHoldoutRfa && pendingHoldoutRfa.player.playerId === player.playerId) setPendingHoldoutRfa(null);
                                  } else if (pendingHoldoutExtension && pendingHoldoutExtension.player.playerId === player.playerId) {
                                    setPendingHoldoutExtension(null);
                                  }
                                }}
                              >
                                <option value={0}>No Extension</option>
                                <option value={1}>1 Year</option>
                                <option value={2}>2 Years</option>
                                <option value={3}>3 Years</option>
                              </select>
                            </div>
                            <div>
                              <div className="text-white/70 text-sm">Holdout RFA Tag</div>
                              <select
                                className="mt-1 w-full bg-white text-[#0B1722] rounded-xl px-3 py-2 border-2 border-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF4B1F]"
                                value={rfaChoice.apply ? 'apply' : 'none'}
                                onChange={e => {
                                  const apply = e.target.value === 'apply';
                                  setHoldoutRfaChoices(prev => ({ ...prev, [player.playerId]: { apply } }));
                                  if (apply) {
                                    setPendingHoldoutRfa({ player });
                                    // Clear extension choice
                                    setHoldoutExtensionChoices(prev => ({ ...prev, [player.playerId]: { years: 0 } }));
                                    if (pendingHoldoutExtension && pendingHoldoutExtension.player.playerId === player.playerId) setPendingHoldoutExtension(null);
                                  } else if (pendingHoldoutRfa && pendingHoldoutRfa.player.playerId === player.playerId) {
                                    setPendingHoldoutRfa(null);
                                  }
                                }}
                              >
                                <option value="none">No Tag</option>
                                <option value="apply">Apply Tag</option>
                              </select>
                              <div className="text-white/60 text-xs mt-1">Does not count vs normal RFA limit</div>
                            </div>
                            <div className="text-white/70 text-xs">PPG: {player.ppg.toFixed(2)} (Rank {player.ppgRank ?? '-'})</div>
                          </div>
                          <div className="px-5 pb-5 bg-[#0C1B26] space-y-3">
                            {showFinalizeExtension && (
                              <button
                                className="w-full px-4 py-3 bg-[#FF4B1F] text-white rounded-xl hover:bg-orange-600 font-semibold text-lg shadow"
                                disabled={finalizeLoading || (!holdoutsWindowActive)}
                                onClick={async () => {
                                  const extVals = [];
                                  let s = year1;
                                  for (let i = 1; i <= pendingHoldoutExtension.years; i++) {
                                    if (i > 1) s = Math.ceil(s * 1.10 * 10) / 10;
                                    extVals.push(s.toFixed(1));
                                  }
                                  const lengthText = pendingHoldoutExtension.years === 1 ? '1 year' : `${pendingHoldoutExtension.years} years`;
                                  const confirmMsg = `Are you sure you want to grant a Holdout Extension to ${player.playerName} for ${lengthText} at $${extVals.join(', $')}? This cannot be undone.`;
                                  if (!window.confirm(confirmMsg)) return;
                                  setFinalizeLoading(true); setFinalizeMsg(''); setFinalizeError('');
                                  try {
                                    const contractChange = {
                                      change_type: 'holdout_extension',
                                      user: session?.user?.name || '',
                                      timestamp: new Date().toISOString(),
                                      notes: `Holdout extension for ${player.playerName} (${player.position}) ${lengthText} at $${extVals.join(', $')}.`,
                                      ai_notes: '',
                                      playerId: player.playerId,
                                      playerName: player.playerName,
                                      years: pendingHoldoutExtension.years,
                                      extensionSalaries: extVals.map(v => parseFloat(v)),
                                      team: teamNameForUI,
                                      position: player.position,
                                    };
                                    try {
                                      const aiRes = await fetch('/api/ai/transaction_notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractChange }) });
                                      const aiData = await aiRes.json();
                                      contractChange.ai_notes = aiData.ai_notes || 'AI summary unavailable.';
                                    } catch { contractChange.ai_notes = 'AI summary unavailable.'; }
                                    const res = await fetch('/api/admin/contract_changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contractChange) });
                                    const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Failed to save holdout extension');
                                    setFinalizeMsg('Holdout extension saved!');
                                    const refreshRes = await fetch('/api/admin/contract_changes');
                                    const refreshData = await refreshRes.json();
                                    if (Array.isArray(refreshData)) {
                                      const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                                      const recent = refreshData.filter(c => c.playerId && c.timestamp && new Date(c.timestamp) > oneYearAgo);
                                      setRecentContractChanges(recent);
                                    }
                                    setHoldoutExtensionChoices(prev => { const u = { ...prev }; delete u[player.playerId]; return u; });
                                    setPendingHoldoutExtension(null);
                                  } catch (err) { setFinalizeError(err.message); } finally { setFinalizeLoading(false); }
                                }}
                              >
                                {finalizeLoading ? 'Saving...' : 'Finalize Holdout Extension'}
                              </button>
                            )}
                            {showFinalizeRfa && (
                              <button
                                className="w-full px-4 py-3 bg-[#1FDDFF] text-[#0B1722] rounded-xl hover:bg-[#37e8ff] font-semibold text-lg shadow"
                                disabled={finalizeLoading || (!holdoutsWindowActive)}
                                onClick={async () => {
                                  const confirmMsg = `Are you sure you want to apply a Holdout RFA Tag to ${player.playerName}? This cannot be undone.`;
                                  if (!window.confirm(confirmMsg)) return;
                                  setFinalizeLoading(true); setFinalizeMsg(''); setFinalizeError('');
                                  try {
                                    const contractChange = {
                                      change_type: 'holdout_rfa_tag',
                                      user: session?.user?.name || '',
                                      timestamp: new Date().toISOString(),
                                      notes: `Applied Holdout RFA tag to ${player.playerName}.`,
                                      ai_notes: '',
                                      playerId: player.playerId,
                                      playerName: player.playerName,
                                      years: 0,
                                      team: teamNameForUI,
                                      position: player.position,
                                    };
                                    try {
                                      const aiRes = await fetch('/api/ai/transaction_notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractChange }) });
                                      const aiData = await aiRes.json();
                                      contractChange.ai_notes = aiData.ai_notes || 'AI summary unavailable.';
                                    } catch { contractChange.ai_notes = 'AI summary unavailable.'; }
                                    const res = await fetch('/api/admin/contract_changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contractChange) });
                                    const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Failed to save holdout RFA tag');
                                    setFinalizeMsg('Holdout RFA tag saved!');
                                    const refreshRes = await fetch('/api/admin/contract_changes');
                                    const refreshData = await refreshRes.json();
                                    if (Array.isArray(refreshData)) {
                                      const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                                      const recent = refreshData.filter(c => c.playerId && c.timestamp && new Date(c.timestamp) > oneYearAgo);
                                      setRecentContractChanges(recent);
                                    }
                                    setHoldoutRfaChoices(prev => { const u = { ...prev }; delete u[player.playerId]; return u; });
                                    setPendingHoldoutRfa(null);
                                  } catch (err) { setFinalizeError(err.message); } finally { setFinalizeLoading(false); }
                                }}
                              >
                                {finalizeLoading ? 'Saving...' : 'Finalize Holdout RFA Tag'}
                              </button>
                            )}
                            <div className="text-white/60 text-xs">PPG excludes zero-point games. Non-pos weeks: {player.nonPosWeeks}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop */}
                  <div className="hidden sm:block">
                    {holdoutEligiblePlayersSorted.map(player => {
                      const extChoice = holdoutExtensionChoices[player.playerId] || { years: 0 };
                      const rfaChoice = holdoutRfaChoices[player.playerId] || { apply: false };
                      const year1 = getHoldoutExtensionYear1(player);
                      let salaries = [];
                      let sal = year1;
                      for (let y = 1; y <= extChoice.years; y++) {
                        if (y > 1) sal = Math.ceil(sal * 1.10 * 10) / 10;
                        salaries.push(sal);
                      }
                      const showFinalizeExtension = extChoice.years > 0 && pendingHoldoutExtension?.player?.playerId === player.playerId && holdoutsWindowActive;
                      const showFinalizeRfa = rfaChoice.apply && pendingHoldoutRfa?.player?.playerId === player.playerId && holdoutsWindowActive;
                      return (
                        <div key={player.playerId} className="mb-4 bg-[#0C1B26] border border-white/10 rounded-xl p-4 shadow-lg">
                          <div className="flex items-center gap-4 mb-3">
                            <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-12 h-12 rounded-lg overflow-hidden shadow" />
                            <div className="min-w-0">
                              <div className="text-white font-bold text-xl truncate">{player.playerName}</div>
                              <div className="text-white/60 text-xs">Age {player.age ?? '-'} • PPG {player.ppg.toFixed(2)} Rank {player.ppgRank ?? '-'} • Non-pos weeks {player.nonPosWeeks}</div>
                            </div>
                          </div>
                          <div className="grid grid-cols-5 gap-3 items-end">
                            <div>
                              <div className="text-white/70 text-xs">Ext Yr1 (Avg Top20)</div>
                              <div className="text-white font-semibold text-lg">${year1.toFixed(1)}</div>
                            </div>
                            <div>
                              <label className="text-white/70 text-xs">Extension</label>
                              <select
                                className="mt-1 w-full bg-white text-[#0B1722] rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4B1F]"
                                value={extChoice.years}
                                onChange={e => {
                                  const years = Number(e.target.value);
                                  setHoldoutExtensionChoices(prev => ({ ...prev, [player.playerId]: { years } }));
                                  if (years > 0) {
                                    setPendingHoldoutExtension({ player, years, salaries });
                                    setHoldoutRfaChoices(prev => ({ ...prev, [player.playerId]: { apply: false } }));
                                    if (pendingHoldoutRfa && pendingHoldoutRfa.player.playerId === player.playerId) setPendingHoldoutRfa(null);
                                  } else if (pendingHoldoutExtension && pendingHoldoutExtension.player.playerId === player.playerId) {
                                    setPendingHoldoutExtension(null);
                                  }
                                }}
                              >
                                <option value={0}>None</option>
                                <option value={1}>1 Yr</option>
                                <option value={2}>2 Yrs</option>
                                <option value={3}>3 Yrs</option>
                              </select>
                            </div>
                            <div className="col-span-2 text-white/60 text-xs">
                              {extChoice.years > 0 ? (
                                <div>
                                  {salaries.map((v, i) => (
                                    <span key={i} className="inline-block mr-2">Y{3 + i}: ${v.toFixed(1)}</span>
                                  ))}
                                </div>
                              ) : <span className="italic">No extension selected</span>}
                            </div>
                            <div>
                              <label className="text-white/70 text-xs">Holdout RFA Tag</label>
                              <select
                                className="mt-1 w-full bg-white text-[#0B1722] rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1FDDFF]"
                                value={rfaChoice.apply ? 'apply' : 'none'}
                                onChange={e => {
                                  const apply = e.target.value === 'apply';
                                  setHoldoutRfaChoices(prev => ({ ...prev, [player.playerId]: { apply } }));
                                  if (apply) {
                                    setPendingHoldoutRfa({ player });
                                    setHoldoutExtensionChoices(prev => ({ ...prev, [player.playerId]: { years: 0 } }));
                                    if (pendingHoldoutExtension && pendingHoldoutExtension.player.playerId === player.playerId) setPendingHoldoutExtension(null);
                                  } else if (pendingHoldoutRfa && pendingHoldoutRfa.player.playerId === player.playerId) {
                                    setPendingHoldoutRfa(null);
                                  }
                                }}
                              >
                                <option value="none">None</option>
                                <option value="apply">Apply</option>
                              </select>
                              <div className="text-white/50 text-[10px]">Not counted vs RFA limit</div>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3">
                            {showFinalizeExtension && (
                              <button
                                className="px-3 py-2 bg-[#FF4B1F] text-white rounded text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
                                disabled={finalizeLoading || !holdoutsWindowActive}
                                onClick={async () => {
                                  const extVals = [];
                                  let s = year1;
                                  for (let i = 1; i <= pendingHoldoutExtension.years; i++) {
                                    if (i > 1) s = Math.ceil(s * 1.10 * 10) / 10;
                                    extVals.push(s.toFixed(1));
                                  }
                                  const lengthText = pendingHoldoutExtension.years === 1 ? '1 year' : `${pendingHoldoutExtension.years} years`;
                                  const confirmMsg = `Are you sure you want to grant a Holdout Extension to ${player.playerName} for ${lengthText} at $${extVals.join(', $')}? This cannot be undone.`;
                                  if (!window.confirm(confirmMsg)) return;
                                  setFinalizeLoading(true); setFinalizeMsg(''); setFinalizeError('');
                                  try {
                                    const contractChange = {
                                      change_type: 'holdout_extension', user: session?.user?.name || '', timestamp: new Date().toISOString(),
                                      notes: `Holdout extension for ${player.playerName} (${player.position}) ${lengthText} at $${extVals.join(', $')}.`, ai_notes: '', playerId: player.playerId, playerName: player.playerName, years: pendingHoldoutExtension.years, extensionSalaries: extVals.map(v => parseFloat(v)), team: teamNameForUI, position: player.position,
                                    };
                                    try { const aiRes = await fetch('/api/ai/transaction_notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractChange }) }); const aiData = await aiRes.json(); contractChange.ai_notes = aiData.ai_notes || 'AI summary unavailable.'; } catch { contractChange.ai_notes = 'AI summary unavailable.'; }
                                    const res = await fetch('/api/admin/contract_changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contractChange) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Failed to save holdout extension'); setFinalizeMsg('Holdout extension saved!');
                                    const refreshRes = await fetch('/api/admin/contract_changes'); const refreshData = await refreshRes.json(); if (Array.isArray(refreshData)) { const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1); const recent = refreshData.filter(c => c.playerId && c.timestamp && new Date(c.timestamp) > oneYearAgo); setRecentContractChanges(recent); }
                                    setHoldoutExtensionChoices(prev => { const u = { ...prev }; delete u[player.playerId]; return u; }); setPendingHoldoutExtension(null);
                                  } catch (err) { setFinalizeError(err.message); } finally { setFinalizeLoading(false); }
                                }}
                              >
                                {finalizeLoading ? 'Saving...' : 'Finalize Holdout Extension'}
                              </button>
                            )}
                            {showFinalizeRfa && (
                              <button
                                className="px-3 py-2 bg-[#1FDDFF] text-[#0B1722] rounded text-sm font-semibold hover:bg-[#37e8ff] disabled:opacity-50"
                                disabled={finalizeLoading || !holdoutsWindowActive}
                                onClick={async () => {
                                  const confirmMsg = `Are you sure you want to apply a Holdout RFA Tag to ${player.playerName}? This cannot be undone.`;
                                  if (!window.confirm(confirmMsg)) return;
                                  setFinalizeLoading(true); setFinalizeMsg(''); setFinalizeError('');
                                  try {
                                    const contractChange = { change_type: 'holdout_rfa_tag', user: session?.user?.name || '', timestamp: new Date().toISOString(), notes: `Applied Holdout RFA tag to ${player.playerName}.`, ai_notes: '', playerId: player.playerId, playerName: player.playerName, years: 0, team: teamNameForUI, position: player.position };
                                    try { const aiRes = await fetch('/api/ai/transaction_notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractChange }) }); const aiData = await aiRes.json(); contractChange.ai_notes = aiData.ai_notes || 'AI summary unavailable.'; } catch { contractChange.ai_notes = 'AI summary unavailable.'; }
                                    const res = await fetch('/api/admin/contract_changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contractChange) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Failed to save holdout RFA tag'); setFinalizeMsg('Holdout RFA tag saved!');
                                    const refreshRes = await fetch('/api/admin/contract_changes'); const refreshData = await refreshRes.json(); if (Array.isArray(refreshData)) { const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1); const recent = refreshData.filter(c => c.playerId && c.timestamp && new Date(c.timestamp) > oneYearAgo); setRecentContractChanges(recent); }
                                    setHoldoutRfaChoices(prev => { const u = { ...prev }; delete u[player.playerId]; return u; }); setPendingHoldoutRfa(null);
                                  } catch (err) { setFinalizeError(err.message); } finally { setFinalizeLoading(false); }
                                }}
                              >
                                {finalizeLoading ? 'Saving...' : 'Finalize Holdout RFA Tag'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
