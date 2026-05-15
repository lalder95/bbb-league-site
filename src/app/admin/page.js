'use client';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ContractAuditModal from './components/ContractAuditModal';
import { expandDraftOrderPreview } from '@/utils/mockDraftOrderPreview';

// Use the same name matching logic as PlayerProfileCard (Player Contracts page)
function getImageFilename(playerName) {
  // Remove punctuation, replace spaces with underscores, lowercase, remove apostrophes, periods, etc.
  return playerName
    .replace(/[.'’]/g, "") // Remove periods and apostrophes
    .replace(/\s+/g, "_")
    .toLowerCase();
}

function groupOrderPreviewByRound(orderPreview) {
  const groups = new Map();
  for (const entry of Array.isArray(orderPreview) ? orderPreview : []) {
    const round = Number(entry.round) || 1;
    if (!groups.has(round)) groups.set(round, []);
    groups.get(round).push(entry);
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([round, picks]) => ({
      round,
      picks: picks.slice().sort((a, b) => Number(a.slot) - Number(b.slot)),
    }));
}

function shuffleArray(values) {
  const copy = Array.isArray(values) ? values.slice() : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function edgeKey(a, b) {
  const left = Number(a);
  const right = Number(b);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function buildWeeklyCrossDivisionMatchings(teams) {
  const byRosterId = new Map((teams || []).map((team) => [Number(team.rosterId), team]));
  const rosterIds = Array.from(byRosterId.keys()).sort((a, b) => a - b);
  const results = [];

  function recurse(unpaired, currentPairs) {
    if (unpaired.length === 0) {
      const pairs = currentPairs
        .slice()
        .sort((left, right) => {
          const leftA = Math.min(left[0], left[1]);
          const rightA = Math.min(right[0], right[1]);
          if (leftA !== rightA) return leftA - rightA;
          return Math.max(left[0], left[1]) - Math.max(right[0], right[1]);
        })
        .map(([a, b]) => (a < b ? [a, b] : [b, a]));

      results.push({
        pairs,
        edgeKeys: pairs.map(([a, b]) => edgeKey(a, b)),
      });
      return;
    }

    const first = unpaired[0];
    const firstTeam = byRosterId.get(first);
    const remainder = unpaired.slice(1);

    for (const opponent of remainder) {
      const opponentTeam = byRosterId.get(opponent);
      if (!firstTeam || !opponentTeam) continue;
      if (Number(firstTeam.divisionId) === Number(opponentTeam.divisionId)) continue;

      const nextUnpaired = remainder.filter((id) => id !== opponent);
      recurse(nextUnpaired, [...currentPairs, [first, opponent]]);
    }
  }

  recurse(rosterIds, []);
  return results;
}

function findEdgeCoverWithWeeklyMatchups(weeklyMatchups, allEdgeKeys) {
  const edgeToMatchups = new Map();
  allEdgeKeys.forEach((key) => edgeToMatchups.set(key, []));

  weeklyMatchups.forEach((week, weekIndex) => {
    week.edgeKeys.forEach((key) => {
      const list = edgeToMatchups.get(key);
      if (list) list.push(weekIndex);
    });
  });

  const covered = new Set();
  const selected = [];

  function chooseNextEdge() {
    let bestEdge = null;
    let fewestChoices = Number.POSITIVE_INFINITY;

    for (const key of allEdgeKeys) {
      if (covered.has(key)) continue;
      const candidates = edgeToMatchups.get(key) || [];
      const usable = candidates.filter((index) => {
        const week = weeklyMatchups[index];
        return !week.edgeKeys.some((edge) => covered.has(edge));
      });
      if (usable.length < fewestChoices) {
        fewestChoices = usable.length;
        bestEdge = key;
      }
    }

    return { bestEdge, fewestChoices };
  }

  function dfs() {
    if (covered.size === allEdgeKeys.length) {
      return selected.length === 8;
    }
    if (selected.length >= 8) return false;

    const remainingEdges = allEdgeKeys.length - covered.size;
    const remainingWeeks = 8 - selected.length;
    if (Math.ceil(remainingEdges / 6) > remainingWeeks) return false;

    const { bestEdge, fewestChoices } = chooseNextEdge();
    if (!bestEdge || fewestChoices === 0) return false;

    const candidateIndexes = shuffleArray(edgeToMatchups.get(bestEdge) || []);
    for (const index of candidateIndexes) {
      const week = weeklyMatchups[index];
      if (week.edgeKeys.some((edge) => covered.has(edge))) continue;

      selected.push(index);
      week.edgeKeys.forEach((edge) => covered.add(edge));

      if (dfs()) return true;

      week.edgeKeys.forEach((edge) => covered.delete(edge));
      selected.pop();
    }

    return false;
  }

  if (!dfs()) return null;
  return selected.map((index) => weeklyMatchups[index]);
}

function buildDivisionalWeeks(divisionGroups) {
  const earlyWeeks = [[], [], []];

  for (const group of divisionGroups) {
    const randomizedTeams = shuffleArray(group.map((team) => Number(team.rosterId)));
    const [a, b, c, d] = randomizedTeams;
    const pattern = [
      [[a, b], [c, d]],
      [[a, c], [b, d]],
      [[a, d], [b, c]],
    ];
    const weekOrder = shuffleArray([0, 1, 2]);

    for (let weekIndex = 0; weekIndex < 3; weekIndex += 1) {
      const selectedPairs = pattern[weekOrder[weekIndex]];
      earlyWeeks[weekIndex].push(...selectedPairs);
    }
  }

  return earlyWeeks;
}

function getDivisionNameLookup(league) {
  const settings = league?.settings || {};
  const configuredDivisionCount = Number(settings?.divisions) || 0;
  const lookup = new Map();
  const fallbackNames = {
    1: 'Wall Street',
    2: 'Middle Class',
    3: 'Poor House',
  };

  for (let divisionId = 1; divisionId <= configuredDivisionCount; divisionId += 1) {
    const rawName = settings?.[`division_${divisionId}`];
    if (typeof rawName === 'string' && rawName.trim()) {
      lookup.set(divisionId, rawName.trim());
      continue;
    }

    if (fallbackNames[divisionId]) {
      lookup.set(divisionId, fallbackNames[divisionId]);
    }
  }

  if (lookup.size === 0) {
    Object.entries(fallbackNames).forEach(([divisionId, name]) => {
      lookup.set(Number(divisionId), name);
    });
  }

  return lookup;
}

function buildScheduleFromLeagueData({ users, rosters, league }) {
  const userById = new Map((Array.isArray(users) ? users : []).map((user) => [user.user_id, user]));
  const divisionMap = new Map();
  const divisionNameLookup = getDivisionNameLookup(league);

  const teams = (Array.isArray(rosters) ? rosters : []).map((roster) => {
    const rosterId = Number(roster?.roster_id);
    const divisionId = Number(roster?.settings?.division);
    const owner = userById.get(roster?.owner_id);
    const teamName = owner?.display_name || owner?.team_name || owner?.username || `Team ${rosterId}`;

    if (!divisionMap.has(divisionId)) divisionMap.set(divisionId, []);

    const team = {
      rosterId,
      teamName,
      ownerId: roster?.owner_id,
      divisionId,
      divisionName: divisionNameLookup.get(divisionId) || `Division ${divisionId}`,
    };
    divisionMap.get(divisionId).push(team);
    return team;
  });

  if (teams.length !== 12) {
    throw new Error(`Expected 12 teams, found ${teams.length}.`);
  }

  const divisionIds = Array.from(divisionMap.keys()).filter((id) => Number.isFinite(id) && id > 0).sort((a, b) => a - b);
  if (divisionIds.length !== 3) {
    throw new Error(`Expected 3 divisions, found ${divisionIds.length}.`);
  }

  const divisionGroups = divisionIds.map((id) => divisionMap.get(id) || []);
  for (const group of divisionGroups) {
    if (group.length !== 4) {
      throw new Error('Each division must contain exactly 4 teams to build this schedule.');
    }
  }

  const byRosterId = new Map(teams.map((team) => [Number(team.rosterId), team]));

  const allCrossDivisionEdges = [];
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      if (Number(teams[i].divisionId) === Number(teams[j].divisionId)) continue;
      allCrossDivisionEdges.push(edgeKey(teams[i].rosterId, teams[j].rosterId));
    }
  }

  const weeklyCrossDivisionMatchings = buildWeeklyCrossDivisionMatchings(teams);
  const selectedCrossDivisionWeeks = findEdgeCoverWithWeeklyMatchups(weeklyCrossDivisionMatchings, allCrossDivisionEdges);
  if (!selectedCrossDivisionWeeks || selectedCrossDivisionWeeks.length !== 8) {
    throw new Error('Unable to generate a valid inter-division schedule. Please try again.');
  }

  const randomizedCrossDivisionWeeks = shuffleArray(selectedCrossDivisionWeeks);
  const earlyDivisionalWeeks = buildDivisionalWeeks(divisionGroups);

  const weekMap = new Map();

  function addWeek(weekNumber, pairs, type) {
    const matchups = pairs.map(([leftId, rightId]) => {
      const left = byRosterId.get(Number(leftId));
      const right = byRosterId.get(Number(rightId));
      if (!left || !right) {
        throw new Error('Invalid matchup generated.');
      }
      return {
        teamA: {
          rosterId: left.rosterId,
          teamName: left.teamName,
          divisionId: left.divisionId,
          divisionName: left.divisionName,
        },
        teamB: {
          rosterId: right.rosterId,
          teamName: right.teamName,
          divisionId: right.divisionId,
          divisionName: right.divisionName,
        },
        type,
      };
    });

    weekMap.set(weekNumber, { week: weekNumber, matchups });
  }

  for (let weekOffset = 0; weekOffset < 3; weekOffset += 1) {
    addWeek(weekOffset + 1, earlyDivisionalWeeks[weekOffset], 'divisional');
  }

  for (let weekOffset = 0; weekOffset < 8; weekOffset += 1) {
    addWeek(weekOffset + 4, randomizedCrossDivisionWeeks[weekOffset].pairs, 'inter-division');
  }

  addWeek(12, earlyDivisionalWeeks[2], 'divisional');
  addWeek(13, earlyDivisionalWeeks[1], 'divisional');
  addWeek(14, earlyDivisionalWeeks[0], 'divisional');

  return {
    leagueId: league?.league_id || null,
    season: league?.season || null,
    generatedAt: new Date().toISOString(),
    weeks: Array.from(weekMap.values()).sort((a, b) => a.week - b.week),
  };
}

function escapeCsvCell(value) {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function toScheduleCsv(scheduleResult) {
  const header = [
    'week',
    'matchup_number',
    'matchup_type',
    'team_a_name',
    'team_a_roster_id',
    'team_a_division',
    'team_b_name',
    'team_b_roster_id',
    'team_b_division',
  ];

  const rows = [header.join(',')];
  const weeks = Array.isArray(scheduleResult?.weeks) ? scheduleResult.weeks : [];

  weeks.forEach((weekEntry) => {
    const matchups = Array.isArray(weekEntry?.matchups) ? weekEntry.matchups : [];
    matchups.forEach((matchup, index) => {
      const values = [
        weekEntry.week,
        index + 1,
        matchup.type,
        matchup.teamA?.teamName,
        matchup.teamA?.rosterId,
        matchup.teamA?.divisionName || matchup.teamA?.divisionId,
        matchup.teamB?.teamName,
        matchup.teamB?.rosterId,
        matchup.teamB?.divisionName || matchup.teamB?.divisionId,
      ];

      rows.push(values.map(escapeCsvCell).join(','));
    });
  });

  return rows.join('\n');
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect if not admin
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
    }
  }, [session, status, router]);

  const [missingImages, setMissingImages] = useState([]);
  const [loadingMissing, setLoadingMissing] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: "playerName", direction: "asc" });
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [genError, setGenError] = useState(null);
  const [progressText, setProgressText] = useState("");
  const [poolPreview, setPoolPreview] = useState(null);
  const [orderPreview, setOrderPreview] = useState(null);
  const [orderPreviewContext, setOrderPreviewContext] = useState(null);
  const [approvedPool, setApprovedPool] = useState(false);
  const [approvedOrder, setApprovedOrder] = useState(false);
  const [draftTitle, setDraftTitle] = useState('BBB AI Mock Draft');
  const [draftDescription, setDraftDescription] = useState('AI-generated multi-round mock draft with per-pick reasoning.');
  const [progressKey, setProgressKey] = useState(null);
  const [progressPollId, setProgressPollId] = useState(null);
  const [rounds, setRounds] = useState(7);
  const [isContractAuditOpen, setIsContractAuditOpen] = useState(false);
  const [contractAuditLoading, setContractAuditLoading] = useState(false);
  const [contractAuditError, setContractAuditError] = useState('');
  const [contractAuditData, setContractAuditData] = useState(null);
  const [scheduleGenerating, setScheduleGenerating] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleResult, setScheduleResult] = useState(null);
  // No external URL needed anymore; we scrape internally

  useEffect(() => {
    if (!orderPreviewContext) return;

    const nextOrderPreview = expandDraftOrderPreview({
      draftOrder: orderPreviewContext.draftOrder,
      rosters: orderPreviewContext.rosters,
      users: orderPreviewContext.users,
      tradedPicks: orderPreviewContext.tradedPicks,
      targetSeason: orderPreviewContext.targetSeason,
      rounds,
      maxPicks: rounds * 12,
    });

    setOrderPreview(nextOrderPreview);
    setApprovedOrder(false);
  }, [orderPreviewContext, rounds]);

  useEffect(() => {
    async function fetchMissing() {
      setLoadingMissing(true);

      // 1. Fetch contracts CSV from GitHub
      const csvUrl = "https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv";
      const csvRes = await fetch(csvUrl);
      const csvText = await csvRes.text();

      // 2. Fetch image index (array of objects with filename)
      const imgRes = await fetch("/players/cardimages/index.json");
      const imageFiles = await imgRes.json();

      // Build a Set of normalized player names from image filenames (before the last underscore)
      const imageNameSet = new Set(
        imageFiles.map(img => {
          // Remove the trailing unique hash after the last underscore
          // e.g. "josh_allen_qqfqyc" -> "josh_allen"
          const base = img.filename.replace(/_[^_]+$/, "");
          return base;
        })
      );

      // 3. Find active contracts missing an image
      const rows = csvText.split('\n');
      if (rows.length && !rows[rows.length - 1].trim()) rows.pop();

      const missing = rows.slice(1)
        .filter(row => row.trim())
        .map(row => row.split(','))
        .filter(values => values[1] && values[14] === "Active")
        .filter(values => {
          const imgBase = getImageFilename(values[1]);
          // Only compare the normalized name (no hash)
          return !imageNameSet.has(imgBase);
        })
        .map(values => ({
          playerName: values[1],
          team: values[33],
          position: values[21],
          salary: values[15] && !isNaN(values[15]) ? parseFloat(values[15]) : "",
          ktc: values[34] && !isNaN(values[34]) ? parseFloat(values[34]) : "",
        }));

      setMissingImages(missing);
      setLoadingMissing(false);
    }
    fetchMissing();
  }, []);

  // Sorting logic
  const sortedImages = [...missingImages].sort((a, b) => {
    const { key, direction } = sortConfig;
    let aValue = a[key] ?? "";
    let bValue = b[key] ?? "";
    if (key === "salary" || key === "ktc") { // <-- Add "ktc" here
      aValue = Number(aValue) || 0;
      bValue = Number(bValue) || 0;
    } else {
      aValue = aValue.toString().toLowerCase();
      bValue = bValue.toString().toLowerCase();
    }
    if (aValue < bValue) return direction === "asc" ? -1 : 1;
    if (aValue > bValue) return direction === "asc" ? 1 : -1;
    return 0;
  });

  function handleSort(key) {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  }

  async function loadContractAudit(forceRefresh = false) {
    if (contractAuditLoading) return;
    if (contractAuditData && !forceRefresh) {
      setIsContractAuditOpen(true);
      return;
    }

    setIsContractAuditOpen(true);
    setContractAuditLoading(true);
    setContractAuditError('');

    try {
      const response = await fetch('/api/admin/contract-audit', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Failed to load contract audit');
      }
      setContractAuditData(data);
    } catch (error) {
      setContractAuditError(error.message || 'Failed to load contract audit');
    } finally {
      setContractAuditLoading(false);
    }
  }

  async function handleApproveAndRun() {
    try {
      if (!approvedPool || !approvedOrder) {
        setGenError('Please approve both the player pool and the draft order to proceed.');
        return;
      }
      setGenError(null);
      setGenerating(true);
      // Create a progress key and start polling
      const key = Math.random().toString(36).slice(2);
      setProgressKey(key);
      setProgressText('Generating AI mock draft...');
      const pollId = setInterval(async () => {
        try {
          const res = await fetch(`/api/admin/mock-drafts/progress?key=${key}`, { cache: 'no-store' });
          const json = await res.json();
          if (json?.ok) {
            const msg = json.message || 'Generating AI mock draft...';
            const pickSuffix = json.currentPickNumber ? ` (Pick ${json.currentPickNumber})` : '';
            setProgressText(`${msg}${pickSuffix}`);
            if (json.status === 'done') {
              clearInterval(pollId);
              setProgressPollId(null);
            }
          }
        } catch {}
      }, 750);
      setProgressPollId(pollId);
      const res = await fetch('/api/admin/mock-drafts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rounds,
          maxPicks: rounds * 12,
          trace: true,
          dryRun: false,
          model: 'gpt-4o',
          title: draftTitle,
          description: draftDescription,
          progressKey: key,
          draftOrder: orderPreview
        })
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || 'Generation failed');
      }
      setGenResult(json);
      setProgressText('Mock draft generated and published.');
    } catch (e) {
      setGenError(e.message || String(e));
    } finally {
      setGenerating(false);
      if (progressPollId) {
        clearInterval(progressPollId);
        setProgressPollId(null);
      }
    }
  }

  async function handleGenerateSchedule() {
    setScheduleGenerating(true);
    setScheduleError('');

    try {
      const leagueId = await resolveBBBLeagueId();
      const [usersRes, rostersRes, leagueRes] = await Promise.all([
        fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`, { cache: 'no-store' }),
        fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { cache: 'no-store' }),
        fetch(`https://api.sleeper.app/v1/league/${leagueId}`, { cache: 'no-store' }),
      ]);

      const [users, rosters, league] = await Promise.all([
        usersRes.json(),
        rostersRes.json(),
        leagueRes.json(),
      ]);

      const generated = buildScheduleFromLeagueData({ users, rosters, league });
      setScheduleResult(generated);
    } catch (error) {
      setScheduleResult(null);
      setScheduleError(error?.message || 'Failed to generate schedule.');
    } finally {
      setScheduleGenerating(false);
    }
  }

  function handleDownloadScheduleCsv() {
    if (!scheduleResult?.weeks?.length) return;

    const csv = toScheduleCsv(scheduleResult);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const season = scheduleResult?.season || new Date().getFullYear();
    const filename = `bbb-league-schedule-${season}.csv`;

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }


  async function resolveBBBLeagueId() {
    // Same logic as DraftDataProvider and /api/admin/draft-order/preview
    const USER_ID = '456973480269705216';
    const stateRes = await fetch('https://api.sleeper.app/v1/state/nfl');
    const state = await stateRes.json();
    const currentSeason = state?.season;
    let leagues = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${currentSeason}`)
      .then(r => r.json());
    let bbb = leagues.filter(league => {
      const name = (league?.name || '').toLowerCase();
      return name.includes('budget blitz bowl') || name.includes('bbb') || (name.includes('budget') && name.includes('blitz'));
    });
    if (bbb.length === 0) {
      const prev = String(Number(currentSeason) - 1);
      const prevLeagues = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${prev}`).then(r => r.json());
      bbb = prevLeagues.filter(league => {
        const name = (league?.name || '').toLowerCase();
        return name.includes('budget blitz bowl') || name.includes('bbb') || (name.includes('budget') && name.includes('blitz'));
      });
    }
    if (bbb.length === 0) throw new Error('No BBB league found for commissioner');
    const mostRecent = bbb.sort((a, b) => Number(b.season) - Number(a.season))[0];
    return mostRecent.league_id;
  }

  async function handleGenerateMockDraft() {
    try {
      setGenerating(true);
      setGenError(null);
      setGenResult(null);
      setProgressText('Creating player database...');
      setApprovedPool(false);
      setApprovedOrder(false);
      setPoolPreview(null);
      setOrderPreview(null);
      setOrderPreviewContext(null);
      // Step 1: Scrape and generate player pool locally
      const poolRes = await fetch('/api/admin/player-pool/scrape', { method: 'POST' });
      const poolJson = await poolRes.json();
      if (!poolRes.ok || !poolJson.ok) {
        throw new Error(poolJson?.error || 'Failed to generate player pool');
      }
      // Load the saved pool for preview
      const poolDataRes = await fetch('/data/player-pool.json', { cache: 'no-store' });
      const poolData = await poolDataRes.json();
      setPoolPreview(Array.isArray(poolData) ? poolData : []);

      setProgressText('Calculating draft order (including traded picks)...');
      // Step 2: Resolve leagueId and fetch draft order using Draft page logic
      const leagueId = await resolveBBBLeagueId();
      // 1. Fetch all drafts for this league
      const draftsRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/drafts`, { cache: 'no-store' });
      const draftsData = await draftsRes.json();
      // 2. Find active draft with draft_order
      const activeDraft = Array.isArray(draftsData)
        ? draftsData.find((d) => d?.status && d.status !== 'complete' && d.draft_order)
        : null;
      if (activeDraft && activeDraft.draft_order) {
        // Fetch users, rosters, and traded picks
        const [usersRes, rostersRes, tradedRes] = await Promise.all([
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`, { cache: 'no-store' }),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { cache: 'no-store' }),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, { cache: 'no-store' }),
        ]);
        const usersData = await usersRes.json();
        const rostersData = await rostersRes.json();
        const tradedPicks = await tradedRes.json();
        // Determine the target season (draft year)
        const targetSeason = activeDraft.season || (new Date().getFullYear() + 1);
        // Map draft_order to slots with original roster_id
        let draftOrderArray = Object.entries(activeDraft.draft_order).map(
          ([userId, slot]) => {
            const roster = rostersData.find((r) => r.owner_id === userId);
            return {
              slot: Number(slot),
              originalRosterId: roster?.roster_id,
              userId,
              teamName: usersData.find((u) => u.user_id === userId)?.display_name || 'Unknown Team',
            };
          }
        );
        draftOrderArray = draftOrderArray.sort((a, b) => a.slot - b.slot);
        // For each slot, check for a traded pick for this season and round 1
        draftOrderArray = draftOrderArray.map((entry) => {
          const traded = tradedPicks.find(
            (tp) => String(tp.season) === String(targetSeason)
              && Number(tp.round) === 1
              && Number(tp.roster_id) === Number(entry.originalRosterId)
          );
          let ownerRosterId = entry.originalRosterId;
          let isTraded = false;
          if (traded) {
            ownerRosterId = traded.owner_id;
            isTraded = Number(traded.owner_id) !== Number(traded.roster_id);
          }
          const ownerRoster = rostersData.find((r) => Number(r.roster_id) === Number(ownerRosterId));
          const ownerUser = ownerRoster ? usersData.find((u) => u.user_id === ownerRoster.owner_id) : null;
          const originalOwner = rostersData.find((r) => Number(r.roster_id) === Number(entry.originalRosterId));
          const originalOwnerUser = originalOwner ? usersData.find((u) => u.user_id === originalOwner.owner_id) : null;
          return {
            slot: entry.slot,
            teamName: ownerUser?.display_name || ownerUser?.username || 'Unknown Team',
            rosterId: ownerRosterId,
            originalRosterId: entry.originalRosterId,
            originalOwnerName: originalOwnerUser?.display_name || originalOwnerUser?.username || 'Unknown Team',
            isTraded,
          };
        });
        setOrderPreviewContext({
          draftOrder: draftOrderArray,
          rosters: rostersData,
          users: usersData,
          tradedPicks,
          targetSeason,
        });
        setGenResult({ ...(genResult || {}), draftOrderDebug: { source: 'sleeper_traded_picks', targetSeason, draftOrder: draftOrderArray } });
      } else {
        // Fallback: use canonical debug API (with traded picks enabled)
        const ordRes = await fetch(`/api/debug/draft-order?leagueId=${leagueId}&applyRoundOneTrades=true`, { cache: 'no-store' });
        const ordJson = await ordRes.json();
        if (!ordRes.ok || !ordJson.draft_order) {
          throw new Error(ordJson?.error || 'Failed to compute draft order');
        }
        const [usersRes, rostersRes, tradedRes] = await Promise.all([
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`, { cache: 'no-store' }),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { cache: 'no-store' }),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, { cache: 'no-store' }),
        ]);
        const [usersData, rostersData, tradedPicks] = await Promise.all([
          usersRes.json(),
          rostersRes.json(),
          tradedRes.json(),
        ]);
        setOrderPreviewContext({
          draftOrder: Array.isArray(ordJson.draft_order) ? ordJson.draft_order : [],
          rosters: rostersData,
          users: usersData,
          tradedPicks,
          targetSeason: ordJson.targetSeason,
        });
        setGenResult({ ...(genResult || {}), draftOrderDebug: ordJson });
      }
      setProgressText('Review the player pool and draft order below, then approve to continue.');
      setGenerating(false);
      return;
    } catch (e) {
      setGenError(e.message || String(e));
    } finally {
      // generating flag toggled off above on success
    }
  }

  if (status === 'loading') {
    return <div className="p-8 text-center">Loading...</div>;
  }

  const groupedOrderPreview = groupOrderPreviewByRound(orderPreview);

  return (
    <main className="min-h-screen bg-[#001A2B] text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-[#FF4B1F] mb-8">Admin Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link 
            href="/admin/announcements" 
            className="bg-black/30 rounded-lg border border-white/10 p-6 hover:bg-black/40 transition-colors"
          >
            <h2 className="text-xl font-bold mb-2">Announcements</h2>
            <p className="text-white/70">Create banners for the home page</p>
          </Link>
          <Link 
            href="/admin/users" 
            className="bg-black/30 rounded-lg border border-white/10 p-6 hover:bg-black/40 transition-colors"
          >
            <h2 className="text-xl font-bold mb-2">User Management</h2>
            <p className="text-white/70">Create, edit, and manage user accounts</p>
          </Link>
          <Link 
            href="/admin/drafts/create"
            className="bg-black/30 rounded-lg border border-white/10 p-6 hover:bg-black/40 transition-colors"
          >
            <h2 className="text-xl font-bold mb-2">Create Draft</h2>
            <p className="text-white/70">Start a new draft and manage draft settings</p>
          </Link>
          <Link
            href="/admin/drafts"
            className="bg-black/30 rounded-lg border border-white/10 p-6 hover:bg-black/40 transition-colors"
          >
            <h2 className="text-xl font-bold mb-2">Drafts Overview</h2>
            <p className="text-white/70">View and manage all drafts</p>
          </Link>
          <div className="bg-black/30 rounded-lg border border-white/10 p-6">
            <h2 className="text-xl font-bold mb-2">AI Mock Draft Generator (Only works in localhost)</h2>
            <p className="text-white/70 mb-4">Generate a multi-round AI mock draft and publish to the Mock Drafts tab.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">Mock Draft Title</label>
                <input
                  className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm"
                  value={draftTitle}
                  onChange={e=>setDraftTitle(e.target.value)}
                  placeholder="BBB 2026 AI Mock Draft"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Description</label>
                <input
                  className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm"
                  value={draftDescription}
                  onChange={e=>setDraftDescription(e.target.value)}
                  placeholder="AI-generated mock with per-pick reasoning"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Rounds (1–7)</label>
                <select
                  className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm"
                  value={rounds}
                  onChange={e=>setRounds(Math.max(1, Math.min(7, Number(e.target.value) || 1)))}
                >
                  {[1,2,3,4,5,6,7].map(r=> (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-3 text-white/70 text-sm">
              This will scrape the latest KTC rookie rankings and store the normalized player pool locally.
            </div>
            {progressText && (
              <div className="mb-3 text-white/80 text-sm">{progressText}</div>
            )}
            <button
              onClick={handleGenerateMockDraft}
              disabled={generating}
              className={`px-4 py-2 rounded-lg ${generating ? 'bg-white/20' : 'bg-[#FF4B1F] hover:bg-[#FF4B1F]/80'} text-white`}
            >
              {generating ? 'Generating…' : 'Generate Mock Draft'}
            </button>
            {genError && (
              <div className="mt-3 text-red-400 text-sm">{genError}</div>
            )}
            {(poolPreview || orderPreview) && (
              <div className="mt-4 space-y-4">
                {Array.isArray(poolPreview) && poolPreview.length > 0 && (
                  <div className="bg-black/20 rounded border border-white/10 p-3">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-white">Player Pool Preview ({poolPreview.length})</h3>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={approvedPool} onChange={e=>setApprovedPool(e.target.checked)} />
                        <span>Approve Player Pool</span>
                      </label>
                    </div>
                    <div className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap">
                      {poolPreview.slice(0, 200).map((p, i) => (
                        <div key={i} className="py-0.5 border-b border-white/5">
                          {p.name} ({p.position}) rank {p.rank}
                        </div>
                      ))}
                      {poolPreview.length > 200 && (
                        <div className="text-white/50 mt-1">Showing first 200 players…</div>
                      )}
                    </div>
                  </div>
                )}
                {Array.isArray(orderPreview) && orderPreview.length > 0 && (
                  <div className="bg-black/20 rounded border border-white/10 p-3">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2 mb-2">
                      <div>
                        <h3 className="font-bold text-white">Draft Order Preview ({groupedOrderPreview.length} rounds)</h3>
                        {genResult?.draftOrderDebug?.targetSeason && (
                          <div className="text-white/70 text-xs mt-1">Draft Year: {genResult.draftOrderDebug.targetSeason}</div>
                        )}
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={approvedOrder} onChange={e=>setApprovedOrder(e.target.checked)} />
                        <span>Approve Draft Order</span>
                      </label>
                    </div>
                    <div className="mt-2 max-h-[32rem] overflow-auto space-y-3 text-sm">
                      {groupedOrderPreview.map(({ round, picks }) => (
                        <div key={round}>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Round {round}</div>
                          <div className="grid grid-cols-1 gap-2">
                            {picks.map((o, i) => {
                          // Support both picks and fallback data
                          const rosterId = o.rosterId ?? o.roster_id;
                          const originalRosterId = o.originalRosterId ?? o.original_roster_id;
                          const isTraded = originalRosterId && rosterId && (Number(originalRosterId) !== Number(rosterId));
                          // Try to show original owner name if available
                          let originalOwnerName = o.originalOwnerName || o.original_owner_name || null;
                          if (!originalOwnerName && genResult?.draftOrderDebug?.draft_order) {
                            // Try to find the original owner name from the draft order debug array
                            const orig = genResult.draftOrderDebug.draft_order.find(
                              (d) => Number((d.rosterId ?? d.roster_id)) === Number(originalRosterId)
                            );
                            originalOwnerName = orig?.teamName || null;
                          }
                              return (
                                <div key={`${round}-${i}`} className="bg-black/10 p-2 rounded border border-white/10">
                                  <span className="text-[#FF4B1F] font-bold">{round}.{String(o.slot).padStart(2,'0')}</span>
                                  <span className="ml-2 text-white/90">{o.teamName}</span>
                                  <span className="ml-2 text-white/60 text-xs">(roster_id: {rosterId}, orig: {originalRosterId}{isTraded && originalOwnerName ? `, original: ${originalOwnerName}` : ''})</span>
                                  {isTraded && (
                                    <span className="ml-2 text-yellow-400 text-xs">[TRADED]</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    {genResult?.draftOrderDebug && (
                      <details className="mt-3 bg-black/10 p-2 rounded border border-white/10">
                        <summary className="cursor-pointer text-white/80 text-sm">Debug</summary>
                        <div className="mt-2 text-xs text-white/70 whitespace-pre-wrap">
                          {JSON.stringify(genResult.draftOrderDebug, null, 2)}
                        </div>
                      </details>
                    )}
                  </div>
                )}
                {(approvedPool && approvedOrder) && (
                  <div>
                    <button
                      onClick={handleApproveAndRun}
                      className="px-4 py-2 rounded-lg bg-[#1FDDFF] text-black hover:bg-[#1FDDFF]/80"
                    >
                      Run AI Mock Draft
                    </button>
                  </div>
                )}
              </div>
            )}
            {genResult && (
              <div className="mt-3 text-sm text-white/80 space-y-2">
                <div>Draft created: {genResult.draftId ? String(genResult.draftId) : 'Preview only (dry run)'}</div>
                <details className="bg-black/20 p-3 rounded border border-white/10">
                  <summary className="cursor-pointer">Debug Trace</summary>
                  <div className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap">
                    {JSON.stringify(genResult.trace || [], null, 2)}
                  </div>
                </details>
                <details className="bg-black/20 p-3 rounded border border-white/10">
                  <summary className="cursor-pointer">Article Markdown</summary>
                  <div className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap">{genResult.article}</div>
                </details>
                <Link href="/draft" className="inline-block mt-1 text-[#FF4B1F] underline">View in Draft Center → Mock Draft tab</Link>
              </div>
            )}
          </div>
          <div className="bg-black/30 rounded-lg border border-white/10 p-6">
            <h2 className="text-xl font-bold mb-2">League Settings</h2>
            <p className="text-white/70">Configure league settings (Coming Soon)</p>
          </div>
          <div className="bg-black/30 rounded-lg border border-white/10 p-6 md:col-span-2">
            <h2 className="text-xl font-bold mb-2">Schedule Generator</h2>
            <p className="text-white/70 mb-4">
              Build a random regular-season schedule for the current BBB season. Weeks 1-3 and 12-14 are divisional mirrors, and Weeks 4-11 randomize inter-division matchups.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={handleGenerateSchedule}
                disabled={scheduleGenerating}
                className={`px-4 py-2 rounded-lg ${scheduleGenerating ? 'bg-white/20' : 'bg-[#FF4B1F] hover:bg-[#FF4B1F]/80'} text-white`}
              >
                {scheduleGenerating ? 'Generating…' : 'Generate Schedule'}
              </button>
              <button
                type="button"
                onClick={handleDownloadScheduleCsv}
                disabled={!scheduleResult?.weeks?.length}
                className={`px-4 py-2 rounded-lg ${scheduleResult?.weeks?.length ? 'bg-[#1FDDFF] hover:bg-[#1FDDFF]/80 text-black' : 'bg-white/20 text-white/60 cursor-not-allowed'}`}
              >
                Export CSV
              </button>
            </div>
            {scheduleError && (
              <div className="mb-3 text-sm text-red-400">{scheduleError}</div>
            )}
            {scheduleResult?.weeks?.length > 0 && (
              <div className="bg-black/20 rounded border border-white/10 p-3">
                <div className="text-sm text-white/70 mb-3">
                  Season: {scheduleResult.season || 'Unknown'} | League ID: {scheduleResult.leagueId || 'Unknown'}
                </div>
                <div className="max-h-[32rem] overflow-auto space-y-3">
                  {scheduleResult.weeks.map((weekEntry) => (
                    <div key={weekEntry.week} className="bg-black/10 rounded border border-white/10 p-3">
                      <div className="text-xs uppercase tracking-wide text-white/60 mb-2">Week {weekEntry.week}</div>
                      <div className="space-y-1 text-sm">
                        {weekEntry.matchups.map((matchup, index) => (
                          <div key={`${weekEntry.week}-${index}`} className="flex flex-wrap items-center gap-2">
                            <span className="text-white/80">{matchup.teamA.teamName}</span>
                            <span className="text-white/50">vs</span>
                            <span className="text-white/80">{matchup.teamB.teamName}</span>
                            <span className={`text-xs ${matchup.type === 'divisional' ? 'text-yellow-300' : 'text-cyan-300'}`}>
                              [{matchup.type}]
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="bg-black/30 rounded-lg border border-white/10 p-6">
            <h2 className="text-xl font-bold mb-2">Contract Audit</h2>
            <p className="text-white/70 mb-4">
              Find rostered players who do not have an active contract with their current owning team.
            </p>
            <button
              type="button"
              onClick={() => loadContractAudit(false)}
              disabled={contractAuditLoading}
              className={`px-4 py-2 rounded-lg ${contractAuditLoading ? 'bg-white/20' : 'bg-[#FF4B1F] hover:bg-[#FF4B1F]/80'} text-white`}
            >
              {contractAuditLoading && !contractAuditData ? 'Loading…' : 'Open Contract Audit'}
            </button>
            {contractAuditData?.issueCount > 0 && (
              <div className="mt-3 text-sm text-yellow-300">
                Last run found {contractAuditData.issueCount} issue{contractAuditData.issueCount === 1 ? '' : 's'}.
              </div>
            )}
            {contractAuditData?.issueCount === 0 && contractAuditData && (
              <div className="mt-3 text-sm text-green-300">Last run found no contract issues.</div>
            )}
            {contractAuditError && !isContractAuditOpen && (
              <div className="mt-3 text-sm text-red-400">{contractAuditError}</div>
            )}
          </div>
          <div className="bg-black/30 rounded-lg border border-white/10 p-6">
            <h2 className="text-xl font-bold mb-2">Content Management</h2>
            <p className="text-white/70">Manage website content (Coming Soon)</p>
          </div>
        </div>
        
        {/* System Stats */}
        <div className="mt-8 bg-black/30 rounded-lg border border-white/10 p-6">
          <h2 className="text-xl font-bold mb-4">System Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-black/20 p-4 rounded">
              <div className="text-sm text-white/70">Current User</div>
              <div className="font-bold">{session?.user?.name || 'Unknown'}</div>
            </div>
            <div className="bg-black/20 p-4 rounded">
              <div className="text-sm text-white/70">Role</div>
              <div className="font-bold">{session?.user?.role || 'Unknown'}</div>
            </div>
            <div className="bg-black/20 p-4 rounded">
              <div className="text-sm text-white/70">Environment</div>
              <div className="font-bold">Development</div>
            </div>
            <div className="bg-black/20 p-4 rounded">
              <div className="text-sm text-white/70">Server Time</div>
              <div className="font-bold">{new Date().toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Missing Images  Section */}
        <div className="mt-8 bg-black/30 rounded-lg border border-white/10 p-6">
          <h2 className="text-xl font-bold mb-4">Players Missing Card Images</h2>
          {loadingMissing ? (
            <div>Loading...</div>
          ) : sortedImages.length === 0 ? (
            <div className="text-green-400">All active players have images!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 px-3 cursor-pointer" onClick={() => handleSort("playerName")}>
                      Player {sortConfig.key === "playerName" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="text-left py-2 px-3 cursor-pointer" onClick={() => handleSort("team")}>
                      Team {sortConfig.key === "team" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="text-left py-2 px-3 cursor-pointer" onClick={() => handleSort("position")}>
                      Position {sortConfig.key === "position" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="text-left py-2 px-3 cursor-pointer" onClick={() => handleSort("salary")}>
                      Salary {sortConfig.key === "salary" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="text-left py-2 px-3 cursor-pointer" onClick={() => handleSort("ktc")}>
                      KTC Score {sortConfig.key === "ktc" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedImages.map((p, idx) => (
                    <tr key={idx} className="border-b border-white/5 hover:bg-black/20">
                      <td className="py-2 px-3">{p.playerName}</td>
                      <td className="py-2 px-3">{p.team}</td>
                      <td className="py-2 px-3">{p.position}</td>
                      <td className="py-2 px-3">
                        {p.salary !== "" && !isNaN(p.salary)
                          ? `$${Number(p.salary).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
                          : "-"}
                      </td>
                      <td className="py-2 px-3">
                        {p.ktc !== "" && !isNaN(p.ktc)
                          ? Number(p.ktc).toLocaleString(undefined, { maximumFractionDigits: 0 })
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ContractAuditModal
        isOpen={isContractAuditOpen}
        onClose={() => setIsContractAuditOpen(false)}
        onRefresh={() => loadContractAudit(true)}
        loading={contractAuditLoading}
        error={contractAuditError}
        auditData={contractAuditData}
      />
    </main>
  );
}