// Defensive display helper to avoid rendering objects/arrays as React children
function safeDisplay(val) {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'object') return '[object]';
  return String(val);
}
import React, { useEffect, useMemo, useState } from "react";
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import {
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  CalendarRange,
  ChevronLeft,
  ClipboardList,
  FileText,
  History,
  NotebookPen,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useBudgetRatios } from '../../providers';
import { getAssetBudgetValue } from '@/utils/draftPickTradeUtils';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';

// Add a small client-side cache with TTL for ESPN API responses
const ESPN_CACHE_TTL_DEFAULT = 20_000; // 20s
const ESPN_CACHE =
  typeof window !== "undefined"
    ? (window.__ESPN_CACHE ||= new Map())
    : new Map();

async function fetchCachedJson(url, ttlMs = ESPN_CACHE_TTL_DEFAULT, fetchOpts = {}) {
  const now = Date.now();
  const entry = ESPN_CACHE.get(url);
  if (entry && entry.expiresAt > now) {
    if (entry.data) return entry.data;
    if (entry.promise) return entry.promise;
  }
  const promise = fetch(url, fetchOpts)
    .then(r => r.json())
    .then(json => {
      ESPN_CACHE.set(url, { data: json, expiresAt: now + ttlMs });
      return json;
    })
    .catch(err => {
      ESPN_CACHE.delete(url);
      throw err;
    });
  ESPN_CACHE.set(url, { promise, expiresAt: now + ttlMs });
  return promise;
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[\s'-]/g, "_")
    .replace(/[^a-z0-9_.]/g, "");
}

// Title-case utility (Passing, Rushing, etc.)
function titleCase(s) {
  if (!s) return '';
  return String(s)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

// Fallback headers for NFL groups in case ESPN.labels are missing
const NFL_FALLBACK_LABELS = {
  passing: ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACKS', 'QBR', 'RTG'],
  rushing: ['CAR', 'YDS', 'AVG', 'TD', 'LONG'],
  receiving: ['REC', 'YDS', 'AVG', 'TD', 'LONG'],
  fumbles: ['FUM', 'LOST'],
  defensive: ['TOT', 'SOLO', 'SACKS', 'TFL', 'PD', 'QB HITS', 'TD', 'INT'],
  kicking: ['FG', 'PCT', 'LONG', 'XP', 'PTS'],
  kickReturns: ['RET', 'YDS', 'AVG', 'LONG', 'TD'],
  puntReturns: ['RET', 'YDS', 'AVG', 'LONG', 'TD'],
  punts: ['NO', 'YDS', 'AVG', 'TB', 'IN20', 'LONG'],
};

// Resolve headers from ESPN, fallback to mapping by group name
function resolveStatHeaders(statGroup) {
  const labels = statGroup?.labels || statGroup?.headers;
  if (Array.isArray(labels) && labels.length) return labels;
  const key = (statGroup?.name || statGroup?.displayName || '').trim();
  if (!key) return [];
  // Try normalized key in our map
  const norm = key.replace(/\s+/g, '').toLowerCase();
  if (NFL_FALLBACK_LABELS[norm]) return NFL_FALLBACK_LABELS[norm];
  // Try raw key lowercased (passing, rushing, etc.)
  const low = key.toLowerCase();
  if (NFL_FALLBACK_LABELS[low]) return NFL_FALLBACK_LABELS[low];
  return [];
}

// Helper: ESPN athlete id
function getAthleteId(a) {
  return a?.athlete?.id ?? a?.id ?? null;
}

// Normalize ESPN stat group name for comparison (e.g., "Passing", "Rushing")
function normalizeGroupName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

// Which stat groups to show per position
function desiredGroupsForPosition(position) {
  const pos = String(position || '').toLowerCase();
  if (pos.includes('qb')) return ['passing', 'rushing'];
  if (pos.includes('rb')) return ['rushing', 'receiving'];
  return null; // default to the matched group only
}

function formatEspnGameDate(value) {
  if (!value) return 'Date TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date TBD';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatEspnGameTime(value) {
  if (!value) return 'Kickoff TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Kickoff TBD';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function clampMetric(value, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function toMetricPercent(value, ceiling) {
  const numericValue = Number(value) || 0;
  const safeCeiling = Math.max(Number(ceiling) || 0, 1);
  return clampMetric((numericValue / safeCeiling) * 100);
}

function getPercentileRank(value, values) {
  const numericValue = Number(value);
  const pool = (values || []).map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  if (!Number.isFinite(numericValue) || pool.length === 0) return 0;
  const lowerOrEqual = pool.filter((entry) => entry <= numericValue).length;
  return clampMetric((lowerOrEqual / pool.length) * 100);
}

const TAB_CONFIG = [
  {
    id: 'contract',
    label: 'Contract data',
    icon: FileText,
    eyebrow: 'Contract snapshot',
    description: 'Placeholder content for contract structure, guarantees, and team-level notes.',
  },
  {
    id: 'history',
    label: 'Game history',
    icon: History,
    eyebrow: 'Game log',
    description: 'Placeholder content for recent usage, opponent splits, and game-by-game trends.',
  },
  {
    id: 'value',
    label: 'Player value',
    icon: ClipboardList,
    eyebrow: 'Value profile',
    description: 'Player market value, budget value, and contract efficiency relative to the position.',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    eyebrow: 'Performance model',
    description: 'Placeholder content for efficiency indicators, opportunity metrics, and role grading.',
  },
  {
    id: 'notes',
    label: 'Notes',
    icon: NotebookPen,
    eyebrow: 'Scouting notes',
    description: 'Placeholder content for staff notes, roster strategy, and weekly observations.',
  },
];

export default function PlayerProfileCard({
  playerId,
  contracts,
  imageExtension = "png",
  expanded = false,
  onExpandClick,
  onClick,
  className = "",
  teamAvatars = {},
  teamName = "",
  avatarOnly = false,
  defaultTab = null,
}) {
  if (typeof playerId !== 'string' && typeof playerId !== 'number') {
    return null;
  }
  const [contract, setContract] = useState(null);
  const [imgSrc, setImgSrc] = useState(null);
  const [flippedContainer, setFlippedContainer] = useState(false);
  const [flippedCard, setFlippedCard] = useState(false);
  const [allContracts, setAllContracts] = useState([]);
  const [leagueContracts, setLeagueContracts] = useState([]);
  const [playerStats, setPlayerStats] = useState(null);
  const [nextGame, setNextGame] = useState(null);
  const [playerGameHistory, setPlayerGameHistory] = useState(null); // null=not fetched, []=no data
  const [gameHistoryLoading, setGameHistoryLoading] = useState(false);
  const [leagueScoringSettings, setLeagueScoringSettings] = useState(null); // null=not fetched
  const [chartView, setChartView] = useState('pts'); // 'pts' | 'usage' | 'yds' | 'tds'
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(TAB_CONFIG[0].id);
  const [isMobile, setIsMobile] = useState(false);
  const [playerNote, setPlayerNote] = useState('');
  const [playerLists, setPlayerLists] = useState([]);
  const [selectedPlayerLists, setSelectedPlayerLists] = useState([]);
  const [newPlayerListName, setNewPlayerListName] = useState('');
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [notesSaveMessage, setNotesSaveMessage] = useState('');
  const { data: session, status: sessionStatus } = useSession();
  const ratiosCtx = useBudgetRatios?.() || {};

  useEffect(() => {
    async function fetchContract() {
      if (contracts && contracts.length) {
        const found = contracts.find(
          (c) => String(c.playerId) === String(playerId)
        );
        setContract(found || null);
        setAllContracts(contracts.filter(c => String(c.playerId) === String(playerId)));
        setLeagueContracts(contracts);
      } else {
        const response = await fetch(
          "https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv"
        );
        const text = await response.text();
        const rows = text.split("\n");
        const headers = rows[0].split(",");
        const idx = headers.findIndex(
          (h) => h.trim().toLowerCase() === "player id" || h.trim().toLowerCase() === "playerid"
        );
        const nflTeamIdx = headers.findIndex(
          (h) => h.trim().toLowerCase() === "nfl team"
        );
        const playerContracts = rows
          .slice(1)
          .map((row) => row.split(","))
          .filter((cols) => String(cols[idx]) === String(playerId));
        const parsedLeagueContracts = rows
          .slice(1)
          .map((colsRaw) => colsRaw.split(","))
          .filter((cols) => cols.length > 1)
          .map((cols) => ({
            playerId: cols[0],
            playerName: cols[1],
            contractType: cols[2],
            contractStartYear: cols[4],
            contractFinalYear: cols[5],
            position: cols[21],
            status: cols[14],
            curYear: cols[15] ? parseFloat(cols[15]) : 0,
            year2: cols[16] ? parseFloat(cols[16]) : 0,
            year3: cols[17] ? parseFloat(cols[17]) : 0,
            year4: cols[18] ? parseFloat(cols[18]) : 0,
            age: cols[32],
            team: cols[33],
            ktcValue: cols[34],
            rfaEligible: cols[37],
            franchiseTagEligible: cols[38],
            nflTeam: nflTeamIdx !== -1 ? cols[nflTeamIdx] : '',
          }));
        setLeagueContracts(parsedLeagueContracts);

        if (playerContracts.length > 0) {
          const foundRow = playerContracts[0];
          setContract({
            playerId: foundRow[0],
            playerName: foundRow[1],
            contractType: foundRow[2],
            status: foundRow[14],
            team: foundRow[33],
            position: foundRow[21],
            curYear: foundRow[15] ? parseFloat(foundRow[15]) : 0,
            year2: foundRow[16] ? parseFloat(foundRow[16]) : 0,
            year3: foundRow[17] ? parseFloat(foundRow[17]) : 0,
            year4: foundRow[18] ? parseFloat(foundRow[18]) : 0,
            contractFinalYear: foundRow[5],
            age: foundRow[32],
            ktcValue: foundRow[34],
            rfaEligible: foundRow[37],
            franchiseTagEligible: foundRow[38],
            nflTeam: nflTeamIdx !== -1 ? foundRow[nflTeamIdx] : "", // <-- Use dynamic index
          });
          setAllContracts(playerContracts.map(cols => ({
            playerId: cols[0],
            playerName: cols[1],
            contractType: cols[2],
            status: cols[14],
            contractStartYear: cols[4],
            team: cols[33],
            position: cols[21],
            curYear: cols[15] ? parseFloat(cols[15]) : 0,
            year2: cols[16] ? parseFloat(cols[16]) : 0,
            year3: cols[17] ? parseFloat(cols[17]) : 0,
            year4: cols[18] ? parseFloat(cols[18]) : 0,
            contractFinalYear: cols[5],
            age: cols[32],
            ktcValue: cols[34],
            rfaEligible: cols[37],
            franchiseTagEligible: cols[38],
            nflTeam: nflTeamIdx !== -1 ? cols[nflTeamIdx] : "",
          })));
        } else {
          setContract(null);
          setAllContracts([]);
        }
      }
    }
    fetchContract();
  }, [playerId, contracts]);

  useEffect(() => {
    if (!contract) {
      setImgSrc(null);
      return;
    }
    const defaultImages = {
      qb: "/players/cardimages/default_qb.png",
      rb: "/players/cardimages/default_rb.png",
      te: "/players/cardimages/default_te.png",
      wr: "/players/cardimages/default_wr.png",
    };
    async function fetchImage() {
      const normalized = normalizeName(contract.playerName);
      const altNormalized = contract.playerName
        .toLowerCase()
        .replace(/[\s']/g, "_")
        .replace(/[^a-z0-9_.-]/g, "")
      let images = [];
      try {
        const res = await fetch("/players/cardimages/index.json");
        images = await res.json();
      } catch (e) {
        images = [];
      }
      let found = null;
      if (Array.isArray(images)) {
        found = images.find(img =>
          img.filename.toLowerCase().includes(normalized) ||
          img.filename.toLowerCase().includes(altNormalized)
        );
      }
      if (found) {
        setImgSrc(found.src);
        return;
      }
      const cloudinaryUrl = `https://res.cloudinary.com/drn1zhflh/image/upload/f_auto,q_auto,w_384/${normalized}.png`;
      try {
        const res = await fetch(cloudinaryUrl, { method: "HEAD" });
        if (res.ok) {
          setImgSrc(cloudinaryUrl);
          return;
        }
      } catch (e) {}
      const pos = (contract.position || "").toLowerCase();
      setImgSrc(defaultImages[pos] || "");
    }
    fetchImage();
  }, [contract, imageExtension]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateViewport = () => {
      setIsMobile(window.innerWidth < 768);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (!expanded) {
      setDrawerOpen(false);
      setFlippedCard(false);
      setFlippedContainer(false);
      setActiveTab(TAB_CONFIG[0].id);
      return;
    }

    setActiveTab(defaultTab && TAB_CONFIG.some((t) => t.id === defaultTab) ? defaultTab : TAB_CONFIG[0].id);
    setDrawerOpen(false);
    setFlippedContainer(isMobile);
    setFlippedCard(false);
  }, [expanded, playerId, isMobile]);

  const handleImgError = () => {
    if (!contract) return;
    const defaultImages = {
      qb: "/players/cardimages/default_qb.png",
      rb: "/players/cardimages/default_rb.png",
      te: "/players/cardimages/default_te.png",
      wr: "/players/cardimages/default_wr.png",
    };
    const pos = (contract.position || "").toLowerCase();
    const defaultSrc = defaultImages[pos] || "";
    if (imgSrc !== defaultSrc) setImgSrc(defaultSrc);
  };

  useEffect(() => {
    async function fetchStatsAndNextGame() {
      setPlayerStats(null);
      setNextGame(null);

      // Only fetch when the card is expanded to avoid N cards × M events
      if (!expanded) {
        return;
      }

      if (!contract?.playerName) {
        console.warn('[ESPN DEBUG] Skipping ESPN fetch: missing contract.playerName', { contract });
        return;
      }

      // Normalizers
      function normalizeLoose(str) {
        return String(str)
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '');
      }
      const contractName = normalizeLoose(contract.playerName);

      function getAthleteName(a) {
        return (
          a?.displayName ||
          a?.athlete?.displayName ||
          a?.athlete?.shortName ||
          a?.athlete?.fullName ||
          a?.athlete?.name ||
          null
        );
      }

      let scoreboard;
      try {
        const json = await fetchCachedJson('/api/espn/scoreboard?seasontype=2', 15_000);
        if (!json?.ok) {
          console.error('[ESPN DEBUG] Scoreboard fetch failed', { ok: json?.ok, error: json?.error });
          return;
        }
        scoreboard = json.data;
      } catch (err) {
        console.error('[ESPN DEBUG] Error fetching scoreboard', err);
        return;
      }

      const allEvents = scoreboard?.events || [];
      if (!Array.isArray(allEvents) || allEvents.length === 0) return;

      // Filter to only the player’s team to avoid fetching every event summary
      let events = allEvents;
      let abbr = null;
      if (contract?.nflTeam) {
        abbr = String(contract.nflTeam).toUpperCase();
        events = allEvents.filter(e =>
          (e?.competitions?.[0]?.competitors || [])
            .some(c => c?.team?.abbreviation?.toUpperCase() === abbr)
        );
      }

      let foundStats = false;

      for (const event of events.slice(0, 2)) {
        const eventId = event?.id;
        if (!eventId) continue;

        try {
          const j = await fetchCachedJson(`/api/espn/summary?event=${eventId}`, 20_000);
          if (!j?.ok) {
            continue;
          }

          const summary = j.data;
          const playerBlocks = summary?.boxscore?.players || [];

          for (const team of playerBlocks) {
            for (const statGroup of team?.statistics || []) {
              for (const a of statGroup?.athletes || []) {
                const rawName = getAthleteName(a);
                if (!rawName) continue;
                const apiName = normalizeLoose(rawName);

                if (apiName.includes(contractName) || contractName.includes(apiName)) {
                  // We found the athlete. Collect one or more stat groups for this athlete.
                  const matchedAthleteId = getAthleteId(a);
                  const matchedNameNorm = normalizeLoose(rawName);

                  // Desired groups by position (QB -> Passing+Rushing, RB -> Rushing+Receiving)
                  const wanted = desiredGroupsForPosition(contract?.position);
                  const groupsOut = [];

                  // Utility: add a group's row for this same athlete if present
                  function addGroupRow(group) {
                    if (!group) return;
                    const headers = resolveStatHeaders(group);
                    // find the same athlete in this group
                    const ath = (group?.athletes || []).find(ga => {
                      const gaId = getAthleteId(ga);
                      const gaName = getAthleteName(ga);
                      const gaNorm = gaName ? normalizeLoose(gaName) : '';
                      return (matchedAthleteId && gaId && gaId === matchedAthleteId) ||
                             (!!gaNorm && gaNorm === matchedNameNorm);
                    });
                    const rowStats = ath?.stats || ath?.statistics || [];
                    if (rowStats && rowStats.length) {
                      groupsOut.push({
                        statType: titleCase(group?.displayName || group?.name || 'Stats'),
                        headers,
                        stats: rowStats,
                      });
                    }
                  }

                  if (Array.isArray(wanted) && wanted.length) {
                    for (const wName of wanted) {
                      const g = (team?.statistics || []).find(sg =>
                        normalizeGroupName(sg?.name || sg?.displayName) === normalizeGroupName(wName)
                      );
                      addGroupRow(g);
                    }
                  } else {
                    addGroupRow(statGroup);
                  }

                  if (groupsOut.length === 0) {
                    const rawStats = a?.stats || a?.statistics || [];
                    const headers = resolveStatHeaders(statGroup);
                    groupsOut.push({
                      statType: titleCase(statGroup?.displayName || statGroup?.name || 'Stats'),
                      headers,
                      stats: rawStats,
                    });
                  }

                  const competition = event?.competitions?.[0];
                  const competitors = competition?.competitors || [];
                  const teamAbbr = String(contract?.nflTeam || '').toUpperCase();
                  const myCompetitor = competitors.find(
                    (competitor) => competitor?.team?.abbreviation?.toUpperCase() === teamAbbr
                  );
                  const opponentCompetitor = competitors.find(
                    (competitor) => competitor?.team?.abbreviation?.toUpperCase() !== teamAbbr
                  );
                  const myScore = Number(myCompetitor?.score);
                  const opponentScore = Number(opponentCompetitor?.score);
                  const outcome =
                    Number.isFinite(myScore) && Number.isFinite(opponentScore)
                      ? myScore === opponentScore
                        ? 'Tied'
                        : myScore > opponentScore
                          ? 'Won'
                          : 'Lost'
                      : competition?.status?.type?.description || 'Game logged';

                  setPlayerStats({
                    displayName: rawName,
                    groups: groupsOut,
                    event: {
                      opponent: opponentCompetitor?.team?.displayName || 'TBD',
                      opponentAbbr: opponentCompetitor?.team?.abbreviation || '',
                      date: event?.date,
                      venue: competition?.venue?.fullName || '',
                      homeAway: myCompetitor?.homeAway || '',
                      outcome,
                      teamScore: Number.isFinite(myScore) ? myScore : null,
                      opponentScore: Number.isFinite(opponentScore) ? opponentScore : null,
                      shortName: event?.shortName || event?.name || '',
                    },
                  });
                  foundStats = true;
                  break;
                }
              }
              if (foundStats) break;
            }
            if (foundStats) break;
          }
          if (foundStats) break;
        } catch (e) {
          console.error('[ESPN DEBUG] Error fetching summary', { eventId }, e);
        }
      }

      // Next game (already filtered by team above)
      if (!foundStats && abbr) {
        let next = null;
        for (const event of events) {
          const comps = event?.competitions?.[0]?.competitors || [];
          const mine = comps.find(c => c?.team?.abbreviation?.toUpperCase() === abbr);
          if (mine) {
            const opp = comps.find(c => c?.team?.abbreviation?.toUpperCase() !== abbr);
            next = {
              opponent: opp?.team?.displayName || 'TBD',
              date: event.date,
              venue: event.competitions?.[0]?.venue?.fullName || '',
              homeAway: mine.homeAway,
              eventName: event.name,
              shortName: event.shortName,
            };
            break;
          }
        }
        if (next) setNextGame(next);
      }
    }

    fetchStatsAndNextGame();
  }, [expanded, contract?.playerName, contract?.nflTeam]);

  // Multi-game history fetch — runs when analytics tab becomes active
  useEffect(() => {
    if (!expanded || (activeTab !== 'analytics' && activeTab !== 'history' && activeTab !== 'value')) return;
    if (!contract?.playerName || !contract?.nflTeam) return;
    // Already loaded for this player — skip
    if (playerGameHistory !== null) return;

    let cancelled = false;
    setGameHistoryLoading(true);

    const abbr = String(contract.nflTeam).toUpperCase();
    const pos = String(contract.position || '').toUpperCase();

    function normalizeLoose(str) {
      return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    }
    const contractName = normalizeLoose(contract.playerName);

    function getAthleteNameLocal(a) {
      return a?.displayName || a?.athlete?.displayName || a?.athlete?.shortName || a?.athlete?.fullName || null;
    }

    function extractUsageFromGroups(teamStats, matchedId, matchedNorm) {
      let usageVal = 0, yds = 0, tds = 0, statLabel = '', secLabel = '', recVal = 0;
      for (const sg of teamStats) {
        const sgName = normalizeGroupName(sg?.name || sg?.displayName || '');
        const ath = (sg?.athletes || []).find((ga) => {
          const gaId = getAthleteId(ga);
          const gaName = getAthleteNameLocal(ga);
          const gaNorm = gaName ? normalizeLoose(gaName) : '';
          return (matchedId && gaId && gaId === matchedId) || gaNorm === matchedNorm;
        });
        if (!ath) continue;
        const stats = ath?.stats || ath?.statistics || [];
        const headers = resolveStatHeaders(sg);

        if (pos === 'QB' && sgName.includes('pass')) {
          const cattI = headers.findIndex((h) => /^c[\s/]att$/i.test(h));
          const attI = headers.findIndex((h) => /^att$/i.test(h));
          const yI = headers.findIndex((h) => /^yds$/i.test(h));
          const tdI = headers.findIndex((h) => /^td$/i.test(h));
          if (attI !== -1) {
            usageVal = Number(stats[attI]) || 0;
            statLabel = 'Attempts';
          } else if (cattI !== -1) {
            const raw = String(stats[cattI] || '');
            usageVal = Number(raw.split('/')[1]) || 0;
            secLabel = `${raw.split('/')[0] || '0'} cmp`;
            statLabel = 'Attempts';
          }
          if (yI !== -1) yds = Number(stats[yI]) || 0;
          if (tdI !== -1) tds = Number(stats[tdI]) || 0;
        } else if (pos === 'RB' && sgName.includes('rush')) {
          const carI = headers.findIndex((h) => /^car$/i.test(h));
          const yI = headers.findIndex((h) => /^yds$/i.test(h));
          const tdI = headers.findIndex((h) => /^td$/i.test(h));
          if (carI !== -1) { usageVal = Number(stats[carI]) || 0; statLabel = 'Carries'; }
          if (yI !== -1) yds = Number(stats[yI]) || 0;
          if (tdI !== -1) tds = Number(stats[tdI]) || 0;
        } else if ((pos === 'WR' || pos === 'TE') && sgName.includes('receiv')) {
          const tgtI = headers.findIndex((h) => /^tgt$/i.test(h));
          const recI = headers.findIndex((h) => /^rec$/i.test(h));
          const yI = headers.findIndex((h) => /^yds$/i.test(h));
          const tdI = headers.findIndex((h) => /^td$/i.test(h));
          const recCount = recI !== -1 ? Number(stats[recI]) || 0 : 0;
          if (tgtI !== -1) {
            usageVal = Number(stats[tgtI]) || 0;
            statLabel = 'Targets';
            secLabel = recCount > 0 ? `${recCount} rec` : '';
          } else if (recI !== -1) {
            usageVal = recCount;
            statLabel = 'Receptions';
          }
          recVal = recCount;
          if (yI !== -1) yds = Number(stats[yI]) || 0;
          if (tdI !== -1) tds = Number(stats[tdI]) || 0;
        }
      }
      return { usageVal, yds, tds, statLabel, secLabel, recVal };
    }

    async function fetchGameHistory() {
      // Fetch league scoring settings (once per session)
      try {
        const sj = await fetchCachedJson('/api/sleeper/scoring-settings', 3_600_000);
        if (sj?.ok && sj?.scoring_settings) {
          setLeagueScoringSettings(sj.scoring_settings);
        } else {
          setLeagueScoringSettings({});
        }
      } catch {
        setLeagueScoringSettings({});
      }
      if (cancelled) return;

      // Step 1: seed week/year from current scoreboard
      let seedWeek = 18;
      let seedYear = new Date().getFullYear();
      try {
        const j = await fetchCachedJson('/api/espn/scoreboard?seasontype=2', 15_000);
        if (j?.data?.week?.number) seedWeek = j.data.week.number;
        if (j?.data?.season?.year) seedYear = j.data.season.year;
      } catch { /* use defaults */ }

      if (cancelled) return;

      const games = [];
      const seenEventIds = new Set();
      const MAX_GAMES = 10;
      const MAX_SEARCH = 22;

      let week = seedWeek;
      let year = seedYear;
      let seasontype = 2;
      let searched = 0;

      while (games.length < MAX_GAMES && searched < MAX_SEARCH) {
        if (cancelled) return;

        try {
          const url = `/api/espn/scoreboard?seasontype=${seasontype}&week=${week}&year=${year}`;
          const j = await fetchCachedJson(url, 120_000);
          const boardEvents = j?.data?.events || [];

          // Find this team's completed game for this week
          const teamEvents = boardEvents.filter((e) => {
            const completed = e?.competitions?.[0]?.status?.type?.completed === true;
            const hasTeam = (e?.competitions?.[0]?.competitors || []).some(
              (c) => c?.team?.abbreviation?.toUpperCase() === abbr
            );
            return completed && hasTeam;
          });

          for (const event of teamEvents) {
            if (games.length >= MAX_GAMES || cancelled) break;
            if (seenEventIds.has(event.id)) continue;
            seenEventIds.add(event.id);
            try {
              const sj = await fetchCachedJson(`/api/espn/summary?event=${event.id}`, 120_000);
              if (cancelled) return;
              const playerBlocks = sj?.data?.boxscore?.players || [];
              let found = false;

              for (const team of playerBlocks) {
                if (found) break;
                for (const sg of team?.statistics || []) {
                  if (found) break;
                  for (const a of sg?.athletes || []) {
                    const rawName = getAthleteNameLocal(a);
                    if (!rawName) continue;
                    const normName = normalizeLoose(rawName);
                    if (!normName.includes(contractName) && !contractName.includes(normName)) continue;

                    const competition = event.competitions?.[0];
                    const competitors = competition?.competitors || [];
                    const mine = competitors.find((c) => c?.team?.abbreviation?.toUpperCase() === abbr);
                    const opp = competitors.find((c) => c?.team?.abbreviation?.toUpperCase() !== abbr);
                    const myScore = Number(mine?.score);
                    const oppScore = Number(opp?.score);
                    const outcome =
                      Number.isFinite(myScore) && Number.isFinite(oppScore)
                        ? myScore > oppScore ? 'Won' : myScore === oppScore ? 'Tied' : 'Lost'
                        : 'N/A';

                    const matchedId = getAthleteId(a);
                    const matchedNorm = normName;
                    const { usageVal, yds, tds, statLabel, secLabel, recVal } = extractUsageFromGroups(
                      team?.statistics || [],
                      matchedId,
                      matchedNorm
                    );

                    games.push({
                      date: event.date,
                      opponent: opp?.team?.abbreviation || 'TBD',
                      homeAway: mine?.homeAway || '',
                      outcome,
                      label: statLabel || 'Usage',
                      value: usageVal,
                      yards: yds,
                      tds,
                      rec: recVal,
                      secondary: secLabel,
                      week,
                      year,
                    });
                    found = true;
                    break;
                  }
                }
              }
            } catch { /* skip this event */ }
          }
        } catch { /* skip this week */ }

        // Step backwards
        week--;
        if (week < 1) {
          year--;
          seasontype = 2;
          week = year >= 2021 ? 18 : 17;
        }
        searched++;
      }

      if (!cancelled) {
        setPlayerGameHistory(games);
        setGameHistoryLoading(false);
      }
    }

    fetchGameHistory();
    return () => { cancelled = true; };
  }, [expanded, activeTab, contract?.playerName, contract?.nflTeam, contract?.position, playerGameHistory]);

  // Reset game history when player changes
  useEffect(() => {
    setPlayerGameHistory(null);
    setGameHistoryLoading(false);
    // Don't reset leagueScoringSettings — it's league-wide, not player-specific
  }, [contract?.playerName, contract?.nflTeam]);

  useEffect(() => {
    if (!expanded || activeTab !== 'notes') {
      return;
    }

    if (sessionStatus === 'loading') {
      return;
    }

    if (!session?.user?.id) {
      setPlayerNote('');
      setPlayerLists([]);
      setSelectedPlayerLists([]);
      setNewPlayerListName('');
      setListPickerOpen(false);
      setNotesError('');
      setNotesSaveMessage('');
      setNotesLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPlayerNotes() {
      try {
        setNotesLoading(true);
        setNotesError('');
        setNotesSaveMessage('');

        const response = await fetch(`/api/user/player-notes?playerId=${encodeURIComponent(String(playerId))}`, {
          cache: 'no-store',
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load notes');
        }

        if (cancelled) {
          return;
        }

        setPlayerNote(String(payload?.note || ''));
        setPlayerLists(Array.isArray(payload?.lists) ? payload.lists : []);
        setSelectedPlayerLists(Array.isArray(payload?.selectedLists) ? payload.selectedLists : []);
        setNewPlayerListName('');
      } catch (error) {
        if (!cancelled) {
          setNotesError(error.message || 'Failed to load notes');
        }
      } finally {
        if (!cancelled) {
          setNotesLoading(false);
        }
      }
    }

    loadPlayerNotes();

    return () => {
      cancelled = true;
    };
  }, [expanded, activeTab, playerId, session?.user?.id, sessionStatus]);

  const valueProfile = useMemo(() => {
    const positionKey = String(contract?.position || '').toUpperCase();
    const activeLeaguePeers = (leagueContracts || []).filter((entry) => {
      const samePosition = String(entry?.position || '').toUpperCase() === positionKey;
      const activeStatus = String(entry?.status || '').toLowerCase() === 'active';
      const hasPlayerId = String(entry?.playerId || '').trim().length > 0;
      return samePosition && activeStatus && hasPlayerId;
    });

    const uniquePeerMap = new Map();
    activeLeaguePeers.forEach((entry) => {
      const key = String(entry.playerId);
      if (!uniquePeerMap.has(key)) {
        uniquePeerMap.set(key, {
          ...entry,
          curYear: Number(entry.curYear) || 0,
          ktcValue: Number(entry.ktcValue) || 0,
        });
        return;
      }

      const existing = uniquePeerMap.get(key);
      existing.curYear += Number(entry.curYear) || 0;
      existing.ktcValue = Math.max(Number(existing.ktcValue) || 0, Number(entry.ktcValue) || 0);
      if (!existing.contractType && entry.contractType) existing.contractType = entry.contractType;
    });

    const peers = Array.from(uniquePeerMap.values());
    const activeRows = (allContracts || []).filter(
      (entry) => String(entry?.status || '').toLowerCase() === 'active'
    );
    const currentKtc = Number(contract?.ktcValue) || 0;
    const currentSalary =
      activeRows.reduce((sum, entry) => sum + (Number(entry?.curYear) || 0), 0) ||
      Number(contract?.curYear) ||
      0;
    const ktcPerDollar = ratiosCtx.ktcPerDollar ?? 0;
    const usePositionRatios = ratiosCtx.usePositionRatios ?? false;
    const positionRatios = ratiosCtx.positionRatios ?? {};
    const avgKtcByPosition = peers.length
      ? { [positionKey]: peers.reduce((sum, entry) => sum + (Number(entry.ktcValue) || 0), 0) / peers.length }
      : {};
    const budgetValue = getAssetBudgetValue(
      {
        ...contract,
        position: contract?.position,
        curYear: currentSalary,
        ktcValue: currentKtc,
      },
      {
        ktcPerDollar,
        usePositionRatios,
        positionRatios,
        avgKtcByPosition,
      }
    );

    const peerKtcValues = peers.map((entry) => Number(entry.ktcValue) || 0);
    const peerBudgetValues = peers.map((entry) =>
      getAssetBudgetValue(entry, {
        ktcPerDollar,
        usePositionRatios,
        positionRatios,
        avgKtcByPosition,
      })
    );
    const peerSalaries = peers.map((entry) => Number(entry.curYear) || 0);

    const ktcScore = toMetricPercent(currentKtc, Math.max(...peerKtcValues, currentKtc, 1));
    const bvScore = toMetricPercent(budgetValue, Math.max(...peerBudgetValues, budgetValue, 1));
    const cheaperThanPercent = peerSalaries.length
      ? clampMetric((peerSalaries.filter((salary) => salary >= currentSalary).length / peerSalaries.length) * 100)
      : 0;
    const salaryPercentile = getPercentileRank(currentSalary, peerSalaries);

    const avgPPG = (() => {
      if (!Array.isArray(playerGameHistory) || playerGameHistory.length === 0) return null;
      const ss = leagueScoringSettings || {};
      // Scoring multipliers — fall back to standard if settings not loaded
      const passYdPts  = Number(ss.pass_yd)       || 0.04;
      const passTdPts  = Number(ss.pass_td)        || 4;
      const rushYdPts  = Number(ss.rush_yd)        || 0.1;
      const rushTdPts  = Number(ss.rush_td)        || 6;
      const recYdPts   = Number(ss.rec_yd)         || 0.1;
      const recTdPts   = Number(ss.rec_td)         || 6;
      const recPts     = Number(ss.rec)            || 0;   // 0 = standard, 0.5 = half-PPR, 1 = full PPR
      const brtePts    = Number(ss.bonus_rec_te)   || 0;  // TE premium

      const sum = playerGameHistory.reduce((s, g) => {
        let pts = 0;
        if (positionKey === 'QB') {
          pts = (g.yards || 0) * passYdPts + (g.tds || 0) * passTdPts;
        } else if (positionKey === 'RB') {
          pts = (g.yards || 0) * rushYdPts + (g.tds || 0) * rushTdPts + (g.rec || 0) * recPts;
        } else {
          const tePremium = positionKey === 'TE' ? brtePts : 0;
          pts = (g.yards || 0) * recYdPts + (g.tds || 0) * recTdPts + (g.rec || 0) * (recPts + tePremium);
        }
        return s + pts;
      }, 0);
      return Math.round((sum / playerGameHistory.length) * 10) / 10;
    })();
    const ppgRefMax = positionKey === 'QB' ? 40 : positionKey === 'RB' ? 25 : positionKey === 'TE' ? 20 : 30;
    const ppgScore = avgPPG !== null ? clampMetric((avgPPG / ppgRefMax) * 100) : null;

    return {
      positionKey,
      peerCount: peers.length,
      currentKtc,
      budgetValue,
      currentSalary,
      ktcScore,
      bvScore,
      contractCostScore: cheaperThanPercent,
      salaryPercentile,
      peers,
      peerAges: peers.map((p) => Number(p.age) || 0).filter((a) => a > 0),
      ktcRank: (() => {
        const sorted = [...peers].sort((a, b) => (Number(b.ktcValue) || 0) - (Number(a.ktcValue) || 0));
        const idx = sorted.findIndex((p) => String(p.playerId) === String(contract?.playerId));
        return idx >= 0 ? idx + 1 : 0;
      })(),
      avgPPG,
      ppgScore,
      radarData: [
        { metric: 'KTC', score: Math.round(ktcScore), raw: currentKtc.toLocaleString() || '0' },
        { metric: 'BV', score: Math.round(bvScore), raw: Math.round(budgetValue).toLocaleString() },
        { metric: 'Cost', score: Math.round(cheaperThanPercent), raw: `$${currentSalary.toFixed(1)}M` },
        ...(ppgScore !== null ? [{ metric: 'Avg PPG', score: Math.round(ppgScore), raw: `${avgPPG} pts` }] : []),
      ],
    };
  }, [contract, leagueContracts, allContracts, ratiosCtx.ktcPerDollar, ratiosCtx.usePositionRatios, ratiosCtx.positionRatios, playerGameHistory, leagueScoringSettings]);

  if (!contract) {
    return (
      <div
        className={
          expanded
            ? "w-[95vw] max-w-[95vw] aspect-[2.5/3.5] min-h-[22rem] max-h-[95vh] md:w-96 md:max-w-none md:aspect-[2.5/3.5] md:h-[32rem] flex items-center justify-center bg-gray-900 rounded-lg shadow-lg text-white text-xl overflow-hidden"
            : "w-16 h-16 flex items-center justify-center bg-gray-900 rounded-lg shadow-lg text-white text-xl overflow-hidden"
        }
      >
        Loading...
      </div>
    );
  }

  // Utility to safely render only strings/numbers in bubbles
  function safeDisplay(val) {
    if (val === null || val === undefined) return "-";
    if (typeof val === "string" || typeof val === "number") return val;
    if (typeof val === "boolean") return val ? "Yes" : "No";
    return "-";
  }

  const Bubble = ({ children, className = "" }) => {
    let display;
    if (children === null || children === undefined) {
      display = "-";
    } else if (typeof children === "string" || typeof children === "number" || typeof children === "boolean") {
      display = safeDisplay(children);
    } else {
      display = "-";
    }
    return (
      <span
        className={
          // Bigger, responsive bubbles that won’t overflow; truncate long text
          "inline-flex items-center rounded-full font-semibold text-white " +
          "px-[clamp(8px,1.4vw,12px)] py-[clamp(4px,0.8vw,7px)] " +
          "text-[clamp(12px,1.1vw,16px)] mr-1.5 mb-1.5 bg-black/30 " +
          "max-w-full truncate " + // prevent individual bubble overflow
          className
        }
        title={String(display)} // show full text on hover
      >
        {String(display)}
      </span>
    );
  };

  // Simple table for ESPN stats with headers (responsive, non-overflowing)
  const StatsTable = ({ statType, headers = [], stats = [] }) => {
    const hasHeaders = Array.isArray(headers) && headers.length > 0;
    const computedHeaders = hasHeaders ? headers : stats.map((_, i) => `Stat ${i + 1}`);
    const colCount = Math.max(computedHeaders.length, stats.length);
    const displayHeaders = Array.from({ length: colCount }, (_, i) => computedHeaders[i] ?? `Stat ${i + 1}`);
    const displayValues = Array.from({ length: colCount }, (_, i) => stats[i] ?? '-');

    // Auto-reduce table text size for many columns, clamped between 11–16px
    const tableFontPx = Math.max(11, Math.min(16, 16 - Math.max(0, colCount - 7)));

    return (
      <div className="w-full max-w-[95vw] md:max-w-4xl px-2">
        <div className="rounded-lg border border-white/15 bg-black/70 backdrop-blur-sm shadow-xl overflow-hidden">
          <div className="text-lg font-bold text-[#FF4B1F] mb-1 text-center pt-2">
            {statType}
          </div>
          {/* Constrain width and allow horizontal scroll on very narrow screens */}
          <div className="w-full overflow-x-auto">
            <table
              className="w-full text-sm rounded-t-none"
              style={{ fontSize: `${tableFontPx}px`, tableLayout: 'auto' }}
            >
              <thead className="bg-white/5 text-[#FF4B1F]">
                <tr>
                  {displayHeaders.map((h, i) => (
                    <th
                      key={i}
                      className="px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap text-center font-semibold border-b border-white/10"
                    >
                      {String(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white/0">
                <tr className="hover:bg-white/5">
                  {displayValues.map((v, i) => (
                    <td
                      key={i}
                      className="px-2 sm:px-3 py-1.5 sm:py-2 text-center text-white/90 border-b border-white/10 whitespace-nowrap"
                    >
                      {String(v)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const activeTabConfig = TAB_CONFIG.find((tab) => tab.id === activeTab) || TAB_CONFIG[0];
  const activeContractRows = allContracts
    .filter((entry) => entry.status === 'Active' || entry.status === 'Future')
    .sort((left, right) => {
      const leftYear = Number(left.contractFinalYear) || 0;
      const rightYear = Number(right.contractFinalYear) || 0;
      return leftYear - rightYear;
    });
  const activeContractCount = activeContractRows.length;
  const aggregateCurrentSalary = activeContractRows.reduce(
    (total, entry) => total + (Number(entry.curYear) || 0),
    0
  );
  const activeContractOnlyRows = activeContractRows.filter(
    (entry) => String(entry.status).toLowerCase() === 'active'
  );
  const futureContractOnlyRows = activeContractRows.filter(
    (entry) => String(entry.status).toLowerCase() === 'future'
  );
  const latestControlYear = activeContractRows.reduce((latest, entry) => {
    const finalYear = Number(entry.contractFinalYear) || 0;
    return finalYear > latest ? finalYear : latest;
  }, 0);
  const latestActiveContractYear = activeContractOnlyRows.reduce((latest, entry) => {
    const finalYear = Number(entry.contractFinalYear) || 0;
    return finalYear > latest ? finalYear : latest;
  }, 0);
  const latestFutureContractYear = futureContractOnlyRows.reduce((latest, entry) => {
    const finalYear = Number(entry.contractFinalYear) || 0;
    return finalYear > latest ? finalYear : latest;
  }, 0);
  const earliestFutureContractStartYear = futureContractOnlyRows.reduce((earliest, entry) => {
    const startYear = Number(entry.contractStartYear) || 0;
    if (!startYear) return earliest;
    if (!earliest) return startYear;
    return startYear < earliest ? startYear : earliest;
  }, 0);
  const activeEligibility = {
    rfa: activeContractRows.some((entry) => String(entry.rfaEligible).toLowerCase() === 'true'),
    tag: activeContractRows.some((entry) => String(entry.franchiseTagEligible).toLowerCase() === 'true'),
  };
  const hasEverReceivedFranchiseTag = allContracts.some((entry) =>
    String(entry.contractType).toLowerCase().includes('franchise')
  );
  const hasFutureContract = allContracts.some(
    (entry) => String(entry.status).toLowerCase() === 'future'
  );
  const extensionEligible = allContracts.some(
    (entry) =>
      String(entry.status).toLowerCase() === 'active' &&
      String(entry.contractType).toLowerCase() === 'base'
  ) && !hasFutureContract;
  const franchiseTagEligibleOverall =
    activeEligibility.tag || (activeEligibility.rfa && !hasEverReceivedFranchiseTag);
  const controlThroughYear = latestControlYear +
    (franchiseTagEligibleOverall ? 1 : 0) +
    (activeEligibility.rfa ? 7 : 0) +
    (extensionEligible ? 3 : 0);

  const formatSalary = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return 'No salary';
    }
    return `$${numericValue.toFixed(1)}M`;
  };
  const insightItems = [
    {
      label: 'Contracts',
      value: activeContractCount ? `${activeContractCount} tracked` : 'No active deals',
    },
    {
      label: 'ESPN sync',
      value: playerStats ? 'Box score cached' : nextGame ? 'Next game cached' : expanded ? 'Awaiting feed' : 'Idle',
    },
    {
      label: 'Status',
      value: safeDisplay(contract.status),
    },
  ];

  const capsuleClassName =
    'inline-flex items-center rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/78';

  const renderContractsTab = () => {
    if (!activeContractRows.length) {
      return (
        <div className="flex min-h-full flex-col gap-5">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-[#f7a37c]">
              Contract snapshot
            </p>
            <h3 className="mt-2 text-2xl font-black uppercase tracking-[0.08em] text-white">
              Contract data
            </h3>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/74">
              No active or future contract rows are available for this player right now.
            </p>
          </div>

          <div className="rounded-[1.35rem] border border-dashed border-white/18 bg-black/15 px-4 py-5 text-sm leading-6 text-white/70">
            Once contract data is present, this tab will visualize salary structure, contract type, and tag leverage in a more digestible format.
          </div>
        </div>
      );
    }

    const summaryCards = [
      {
        label: 'Contract type',
        value: safeDisplay(activeContractRows[0]?.contractType),
        icon: FileText,
      },
      {
        label: 'Current hit',
        value: formatSalary(aggregateCurrentSalary),
        icon: BadgeDollarSign,
      },
      {
        label: 'Control through',
        value: latestControlYear ? String(controlThroughYear) : 'TBD',
        icon: CalendarRange,
      },
    ];

    const eligibilityCards = [
      {
        label: 'RFA eligibility',
        active: activeEligibility.rfa,
        years: 7,
      },
      {
        label: 'Franchise tag',
        active: franchiseTagEligibleOverall,
        years: 1,
      },
      {
        label: 'Extension eligibility',
        active: extensionEligible,
        years: 3,
      },
    ];

    const currentSeason = new Date().getFullYear();
    const currentContractYears = latestActiveContractYear
      ? Math.max(1, latestActiveContractYear - currentSeason + 1)
      : 0;
    const futureContractYears = latestFutureContractYear && earliestFutureContractStartYear
      ? Math.max(0, latestFutureContractYear - earliestFutureContractStartYear + 1)
      : 0;
    const controlSegments = [
      {
        label: 'Current contract',
        shortLabel: 'Contract',
        years: currentContractYears,
        active: currentContractYears > 0,
        color: 'from-[#f35b2f] to-[#ff9f68]',
      },
      {
        label: 'Future contract',
        shortLabel: 'Future',
        years: futureContractYears,
        active: futureContractYears > 0,
        color: 'from-amber-400 to-yellow-200',
      },
      {
        label: 'Extension',
        shortLabel: 'Ext',
        years: extensionEligible ? 3 : 0,
        active: extensionEligible,
        color: 'from-violet-500 to-fuchsia-300',
      },
      {
        label: 'RFA base contract',
        shortLabel: 'RFA Base',
        years: activeEligibility.rfa ? 4 : 0,
        active: activeEligibility.rfa,
        color: 'from-cyan-500 to-sky-300',
      },
      {
        label: 'RFA extension',
        shortLabel: 'RFA Ext',
        years: activeEligibility.rfa ? 3 : 0,
        active: activeEligibility.rfa,
        color: 'from-indigo-500 to-blue-300',
      },
      {
        label: 'Franchise tag',
        shortLabel: 'Tag',
        years: franchiseTagEligibleOverall ? 1 : 0,
        active: franchiseTagEligibleOverall,
        color: 'from-emerald-500 to-emerald-300',
      },
    ].filter((segment) => segment.active && segment.years > 0);
    const totalControlYears = controlSegments.reduce((total, segment) => total + segment.years, 0);
    const timelineStartYear = Number.parseInt(currentSeason, 10) || new Date().getFullYear();
    let nextSegmentStartYear = timelineStartYear;
    const controlSegmentsWithYears = controlSegments.map((segment) => {
      const startYear = nextSegmentStartYear;
      const endYear = startYear + segment.years - 1;
      nextSegmentStartYear = endYear + 1;
      return {
        ...segment,
        startYear,
        endYear,
      };
    });

    return (
      <div className="flex min-h-full flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {summaryCards.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="relative overflow-hidden rounded-[1.15rem] border border-white/10 bg-black/20 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[#f7a37c] opacity-30">
                  <Icon className="h-12 w-12" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div className="relative z-10 text-center">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.28em] text-white/55">
                    {item.label}
                  </p>
                  <p className="mt-4 text-xl font-black uppercase tracking-[0.06em] text-white">{item.value}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {eligibilityCards.map((item) => {
            const Icon = item.active ? ShieldCheck : ShieldAlert;
            return (
              <div
                key={item.label}
                className={`relative overflow-hidden rounded-[1.15rem] border px-4 py-2.5 ${item.active ? 'border-emerald-400/35 bg-emerald-500/10' : 'border-red-400/35 bg-black/20'}`}
              >
                <span className={`pointer-events-none absolute inset-0 flex items-center justify-center opacity-30 ${item.active ? 'text-emerald-200' : 'text-red-200'}`}>
                  <Icon className="h-12 w-12" strokeWidth={1.9} aria-hidden="true" />
                </span>
                <div className="relative z-10 rounded-xl bg-[#08111d]/72 px-2 py-1.5 text-center backdrop-blur-[1px]">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.28em] text-white/90 [text-shadow:0_1px_0_rgba(0,0,0,0.35)]">{item.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.68rem] font-black uppercase tracking-[0.28em] text-white/55">
                Control timeline
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/35">
                {currentSeason} to {controlThroughYear}
              </p>
            </div>
            <p className="text-sm font-black uppercase tracking-[0.08em] text-white/86">
              {totalControlYears} years
            </p>
          </div>

          <div className="mt-4 overflow-hidden rounded-full border border-white/10 bg-[#08111d] p-1">
            <div className="flex h-9 w-full gap-1">
              {controlSegmentsWithYears.map((segment) => (
                <div
                  key={segment.label}
                  className={`flex h-full items-center justify-center rounded-full bg-gradient-to-r px-2 text-center ${segment.color}`}
                  style={{ width: `${(segment.years / totalControlYears) * 100}%` }}
                  title={`${segment.label}: ${segment.years} year${segment.years === 1 ? '' : 's'} (${segment.startYear}${segment.endYear !== segment.startYear ? `-${segment.endYear}` : ''})`}
                >
                  <span className="truncate text-[0.62rem] font-black uppercase tracking-[0.18em] text-[#04111d]">
                    {segment.shortLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    );
  };

  const renderGameHistoryTab = () => {
    const gameMeta = playerStats?.event || null;
    const groupedStats = Array.isArray(playerStats?.groups) ? playerStats.groups : [];
    const hasStats = groupedStats.length > 0;
    const locationLine = gameMeta?.homeAway === 'home' ? 'vs' : gameMeta?.homeAway === 'away' ? '@' : 'vs';

    // Next-game / latest-game single-line banner
    const bannerGame = gameMeta || nextGame;
    const bannerLabel = gameMeta ? 'Latest game' : nextGame ? 'Next game' : null;
    const bannerOpponent = bannerGame
      ? `${(bannerGame.homeAway === 'away' || bannerGame.homeAway === '@') ? '@' : 'vs'} ${bannerGame.opponentAbbr || bannerGame.opponent}`
      : null;
    const bannerDate = bannerGame ? formatEspnGameDate(bannerGame.date) : null;
    const bannerResult = hasStats && gameMeta?.outcome
      ? `${gameMeta.outcome}${gameMeta.teamScore != null && gameMeta.opponentScore != null ? ` ${gameMeta.teamScore}–${gameMeta.opponentScore}` : ''}`
      : null;

    const histPos = String(contract?.position || '').toUpperCase();

    // Scoring multipliers
    const ss = leagueScoringSettings || {};
    const passYdPts = Number(ss.pass_yd)      || 0.04;
    const passTdPts = Number(ss.pass_td)      || 4;
    const rushYdPts = Number(ss.rush_yd)      || 0.1;
    const rushTdPts = Number(ss.rush_td)      || 6;
    const recYdPts  = Number(ss.rec_yd)       || 0.1;
    const recTdPts  = Number(ss.rec_td)       || 6;
    const recPts    = Number(ss.rec)          || 0;
    const brtePts   = Number(ss.bonus_rec_te) || 0;
    const recPtsLabel = recPts === 1 ? 'PPR' : recPts === 0.5 ? 'Half-PPR' : 'Standard';

    const outcomeColor = (o) =>
      o === 'Won' ? '#4ade80' : o === 'Lost' ? '#f87171' : '#94a3b8';

    // Chart view definitions
    const usageLabel = Array.isArray(playerGameHistory) && playerGameHistory[0]?.label
      ? playerGameHistory[0].label
      : histPos === 'QB' ? 'Pass Att' : histPos === 'RB' ? 'Carries' : 'Targets';

    const views = [
      { id: 'pts',   label: `Pts · ${recPtsLabel}` },
      { id: 'usage', label: usageLabel },
      { id: 'yds',   label: 'Yards' },
      { id: 'tds',   label: 'TDs' },
    ];

    return (
      <div className="flex min-h-full flex-col gap-4">

        {/* Single-line next/latest game banner */}
        {bannerLabel ? (
          <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-white/10 bg-black/20 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="text-[0.6rem] font-bold uppercase tracking-[0.24em] text-white/40">{bannerLabel}</span>
              <span className="text-sm font-black uppercase tracking-wide text-white">{bannerOpponent}</span>
              {bannerDate ? <span className="text-[0.72rem] text-white/50">{bannerDate}</span> : null}
            </div>
            {bannerResult ? (
              <span className={`text-[0.72rem] font-bold ${bannerResult.startsWith('Won') ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                {bannerResult}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* ESPN box score (if available) */}
        {hasStats ? (
          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[0.68rem] font-black uppercase tracking-[0.28em] text-white/55">Latest ESPN box score</p>
                <p className="mt-2 text-lg font-black uppercase tracking-[0.06em] text-white">
                  {gameMeta?.shortName || `${safeDisplay(contract.nflTeam)} ${locationLine} ${gameMeta?.opponent || 'TBD'}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={capsuleClassName}>{formatEspnGameDate(gameMeta?.date)}</span>
                <span className={capsuleClassName}>{formatEspnGameTime(gameMeta?.date)}</span>
                {gameMeta?.venue ? <span className={capsuleClassName}>{gameMeta.venue}</span> : null}
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {groupedStats.map((group) => (
                <div key={group.statType} className="min-w-0 rounded-[1rem] border border-white/8 bg-[#08111d]/55 py-2">
                  <StatsTable statType={group.statType} headers={group.headers} stats={group.stats} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Combined bar chart with stat toggle */}
        {(() => {
          if (gameHistoryLoading || playerGameHistory === null) {
            return (
              <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-5">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.26em] text-white/50">Last 10 games</p>
                <p className="mt-3 text-[0.8rem] text-white/40">Fetching game history…</p>
              </div>
            );
          }
          if (!playerGameHistory || playerGameHistory.length === 0) {
            return (
              <div className="rounded-[1.35rem] border border-dashed border-white/18 bg-black/15 px-4 py-5 text-[0.8rem] text-white/60">
                No recent game data found.
              </div>
            );
          }

          // Per-game fantasy pts
          const gameFantasyPts = playerGameHistory.map((g) => {
            let pts = 0;
            if (histPos === 'QB') {
              pts = (g.yards || 0) * passYdPts + (g.tds || 0) * passTdPts;
            } else if (histPos === 'RB') {
              pts = (g.yards || 0) * rushYdPts + (g.tds || 0) * rushTdPts + (g.rec || 0) * recPts;
            } else {
              const tePremium = histPos === 'TE' ? brtePts : 0;
              pts = (g.yards || 0) * recYdPts + (g.tds || 0) * recTdPts + (g.rec || 0) * (recPts + tePremium);
            }
            return Math.round(pts * 10) / 10;
          });

          // Map view id → per-game values and colour scale
          const barData = {
            pts:   { values: gameFantasyPts,                           refMax: histPos === 'QB' ? 40 : histPos === 'RB' ? 25 : histPos === 'TE' ? 20 : 30 },
            usage: { values: playerGameHistory.map((g) => g.value),   refMax: histPos === 'QB' ? 55 : histPos === 'RB' ? 22 : histPos === 'TE' ? 8  : 12 },
            yds:   { values: playerGameHistory.map((g) => g.yards),   refMax: histPos === 'QB' ? 320: histPos === 'RB' ? 100: histPos === 'TE' ? 60 : 100 },
            tds:   { values: playerGameHistory.map((g) => g.tds),     refMax: 2 },
          };

          // Sort by actual game date ascending (oldest → newest, left → right)
          const sortedIndices = playerGameHistory
            .map((_, idx) => idx)
            .sort((a, b) => new Date(playerGameHistory[a].date) - new Date(playerGameHistory[b].date));
          const chronoHistory = sortedIndices.map((idx) => playerGameHistory[idx]);

          const activeView = barData[chartView] || barData.pts;
          const rawValues = sortedIndices.map((idx) => activeView.values[idx]);
          const refMax = activeView.refMax;
          const displayMax = Math.max(refMax, ...rawValues);

          const avg = rawValues.length
            ? Math.round((rawValues.reduce((s, v) => s + v, 0) / rawValues.length) * 10) / 10
            : 0;

          const barColor = (v) =>
            v / displayMax >= 0.65 ? '#4ade80' : v / displayMax >= 0.3 ? '#f7a37c' : '#f87171';

          return (
            <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              {/* Header row: avg stat + toggle pills */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.26em] text-white/50">
                    {views.find((v) => v.id === chartView)?.label}
                  </p>
                  <p className="mt-1 text-3xl font-black leading-none tracking-tight text-white">
                    {avg}
                    <span className="ml-1 text-base font-medium text-white/40">avg</span>
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1 pt-0.5">
                  {views.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setChartView(v.id)}
                      className={`rounded-full px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide transition-colors ${
                        chartView === v.id
                          ? 'bg-[#f7a37c]/20 text-[#f7a37c]'
                          : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bars */}
              {(() => {
                // Bar track height = container (8.75rem) minus dot (h-1.5=0.375rem) minus gap (gap-1=0.25rem)
                const barTrackRem = 8.75 - 0.375 - 0.25; // 8.125rem
                const lineBottomRem = displayMax > 0 ? (avg / displayMax) * barTrackRem : 0;
                return (
                  <div className="relative mt-4 flex gap-1.5" style={{ height: '8.75rem' }}>
                    {rawValues.map((val, i) => {
                      const pct = displayMax > 0 ? Math.min((val / displayMax) * 100, 100) : 0;
                      const game = chronoHistory[i];
                      return (
                        <div key={i} className="flex h-full flex-1 flex-col items-center gap-1">
                          <div
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: outcomeColor(game?.outcome) }}
                            title={game?.outcome}
                          />
                          <div className="relative flex w-full flex-1 items-end overflow-hidden rounded-t-sm bg-white/8">
                            <div
                              className="w-full rounded-t-sm transition-all duration-500"
                              style={{ height: `${Math.max(pct, 3)}%`, backgroundColor: barColor(val) }}
                            />
                            {val > 0 ? (
                              <span className="absolute inset-x-0 top-0 pt-0.5 text-center text-[0.6rem] font-black text-white/75">
                                {val}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {/* Average dotted line */}
                    {avg > 0 ? (
                      <div
                        className="pointer-events-none absolute inset-x-0 flex items-center"
                        style={{ bottom: `${lineBottomRem.toFixed(3)}rem` }}
                      >
                        <div className="h-px w-full border-t border-dashed border-white/40" />
                        <span className="ml-1 shrink-0 text-[0.58rem] font-bold text-white/50">{avg}</span>
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {/* X-axis labels */}
              <div className="mt-1.5 flex gap-1.5">
                {chronoHistory.map((game, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center">
                    <span className="w-full truncate text-center text-[0.56rem] font-bold text-white/50">
                      {game.homeAway === 'away' ? '@' : 'vs'}{game.opponent}
                    </span>
                    <span className="text-[0.54rem] text-white/30">
                      {game.date ? new Date(game.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  const renderPlayerValueTab = () => {
    return (
      <div className="flex min-h-full flex-col">
        <div className="h-[22rem] min-w-0 rounded-[1rem] border border-white/8 bg-[#08111d]/55 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={valueProfile.radarData} outerRadius="68%">
              <PolarGrid stroke="rgba(255,255,255,0.14)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: 700 }} />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                tickCount={5}
              />
              <Radar
                name="Player value"
                dataKey="score"
                stroke="#f7a37c"
                fill="#f35b2f"
                fillOpacity={0.38}
                strokeWidth={2.5}
              />
              <RechartsTooltip
                formatter={(value, _name, props) => [`${value}/100`, `${props?.payload?.metric || 'Metric'} score`]}
                labelFormatter={(label, payload) => {
                  const datum = payload?.[0]?.payload;
                  return datum ? `${label}: ${datum.raw}` : label;
                }}
                contentStyle={{
                  backgroundColor: '#08111d',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: '14px',
                  color: '#ffffff',
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const togglePlayerListSelection = (listName) => {
    setNotesSaveMessage('');
    setNotesError('');
    setSelectedPlayerLists((current) => {
      if (current.includes(listName)) {
        return current.filter((entry) => entry !== listName);
      }
      return [...current, listName];
    });
  };

  const addPendingPlayerList = () => {
    const trimmed = String(newPlayerListName || '').trim().replace(/\s+/g, ' ');
    if (!trimmed) {
      return;
    }

    setPlayerLists((current) => {
      if (current.some((entry) => String(entry.name).toLowerCase() === trimmed.toLowerCase())) {
        return current;
      }

      return [...current, {
        name: trimmed,
        normalizedName: trimmed.toLowerCase(),
        playerCount: 0,
        selected: true,
      }].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
    });

    setSelectedPlayerLists((current) => (
      current.some((entry) => entry.toLowerCase() === trimmed.toLowerCase())
        ? current
        : [...current, trimmed]
    ));
    setNewPlayerListName('');
    setNotesSaveMessage('');
    setNotesError('');
  };

  const handleSavePlayerNotes = async () => {
    if (!session?.user?.id) {
      setNotesError('You must be logged in to save notes.');
      return;
    }

    try {
      setNotesSaving(true);
      setNotesError('');
      setNotesSaveMessage('');

      const response = await fetch('/api/user/player-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId: String(playerId),
          playerName: contract?.playerName || '',
          note: playerNote,
          selectedLists: selectedPlayerLists,
          newListName: newPlayerListName,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save notes');
      }

      setPlayerNote(String(payload?.note || ''));
      setPlayerLists(Array.isArray(payload?.lists) ? payload.lists : []);
      setSelectedPlayerLists(Array.isArray(payload?.selectedLists) ? payload.selectedLists : []);
      setNewPlayerListName('');
      setNotesSaveMessage('Saved');
    } catch (error) {
      setNotesError(error.message || 'Failed to save notes');
    } finally {
      setNotesSaving(false);
    }
  };

  const renderNotesTab = () => {
    if (sessionStatus === 'loading' || notesLoading) {
      return (
        <div className="flex min-h-full items-center justify-center rounded-[1.35rem] border border-dashed border-white/18 bg-black/15 px-6 py-8 text-center text-sm font-semibold uppercase tracking-[0.22em] text-white/60">
          Loading notes
        </div>
      );
    }

    if (!session?.user?.id) {
      return (
        <div className="flex min-h-full items-center justify-center rounded-[1.35rem] border border-dashed border-white/18 bg-black/15 px-6 py-8 text-center">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-[#f7a37c]">Notes</p>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Sign in to save private notes and organize this player into your own custom lists.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-full flex-col gap-5">
        <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.28em] text-white/55">
            Private notes
          </p>
          <textarea
            className="mt-3 h-[14.4rem] w-full resize-none rounded-[1rem] border border-[#d7dde7] bg-white px-4 py-3 text-sm font-medium leading-6 text-slate-900 caret-slate-900 outline-none transition placeholder:!text-slate-400 focus:border-[#f35b2f]/70"
            style={{ color: '#0f172a' }}
            value={playerNote}
            onChange={(event) => {
              setPlayerNote(event.target.value);
              setNotesSaveMessage('');
              setNotesError('');
            }}
            placeholder="Track trade ideas, role notes, injury context, or anything else you want to remember about this player."
          />
        </div>

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            {listPickerOpen ? (
              <div className="absolute bottom-full left-0 z-20 mb-3 w-[min(22rem,calc(100vw-3rem))] rounded-[1.25rem] border border-white/14 bg-[#0b1220] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.52)] ring-1 ring-black/30">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-white/72">
                      Player lists
                    </p>
                    <p className="mt-1 text-xs leading-5 text-white/62">
                      Add this player to one or more of your lists.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setListPickerOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/78 transition hover:bg-white/14 hover:text-white"
                    aria-label="Close player list picker"
                  >
                    <X className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                </div>

                <div className="mt-4 flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
                  {playerLists.length > 0 ? playerLists.map((list) => {
                    const selected = selectedPlayerLists.some(
                      (entry) => String(entry).toLowerCase() === String(list.name).toLowerCase()
                    );

                    return (
                      <button
                        key={list.normalizedName || list.name}
                        type="button"
                        onClick={() => togglePlayerListSelection(list.name)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${selected ? 'border-[#f35b2f] bg-[#f35b2f]/90 text-white shadow-[0_10px_24px_rgba(243,91,47,0.28)]' : 'border-white/18 bg-white/6 text-white/82 hover:border-white/35 hover:bg-white/10 hover:text-white'}`}
                      >
                        {list.name}
                      </button>
                    );
                  }) : (
                    <p className="text-sm text-white/68">No custom lists yet.</p>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-3">
                  <input
                    type="text"
                    value={newPlayerListName}
                    onChange={(event) => {
                      setNewPlayerListName(event.target.value);
                      setNotesSaveMessage('');
                      setNotesError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addPendingPlayerList();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-full border border-[#d7dde7] bg-white px-4 py-2.5 text-sm text-slate-900 caret-slate-900 outline-none transition placeholder:!text-slate-400 focus:border-[#f35b2f]/70"
                    style={{ color: '#0f172a' }}
                    placeholder="Create a new player list"
                  />
                  <button
                    type="button"
                    onClick={addPendingPlayerList}
                    className="w-full rounded-full border border-[#f35b2f]/40 bg-[#f35b2f]/18 px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#f35b2f]/26"
                  >
                    Add list
                  </button>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setListPickerOpen((current) => !current)}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition ${listPickerOpen || selectedPlayerLists.length > 0 ? 'border-[#f35b2f]/70 bg-[#f35b2f]/18 text-[#ffb08d]' : 'border-white/12 bg-white/6 text-white/68 hover:border-white/28 hover:bg-white/10 hover:text-white'}`}
              aria-label="Add player to a list"
              title="Add player to a list"
            >
              <ClipboardList className="h-4.5 w-4.5" strokeWidth={2.2} />
            </button>
          </div>

          <div>
            {notesError ? <p className="text-sm font-medium text-red-300">{notesError}</p> : null}
            {!notesError && notesSaveMessage ? <p className="text-sm font-medium text-emerald-300">{notesSaveMessage}</p> : null}
          </div>
          <button
            type="button"
            onClick={handleSavePlayerNotes}
            disabled={notesSaving}
            className="rounded-full bg-[#f35b2f] px-5 py-2.5 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff744d] disabled:cursor-not-allowed disabled:bg-[#f35b2f]/50"
          >
            {notesSaving ? 'Saving...' : 'Save notes'}
          </button>
        </div>
      </div>
    );
  };

  const ToggleDrawerButton = ({ onClick, open, title, mobile = false }) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={`pointer-events-auto z-30 flex items-center justify-center border border-white/15 bg-[#f35b2f] text-white shadow-[0_18px_35px_rgba(12,18,30,0.45)] transition hover:bg-[#ff744d] focus:outline-none focus:ring-2 focus:ring-[#f7a37c]/60 ${mobile ? 'h-20 w-10 rounded-r-full border-l-0' : 'h-24 w-12 rounded-r-full border-l-0'}`}
      aria-label={title}
      title={title}
    >
      <ArrowRight
        className={`h-5 w-5 transition-transform duration-500 ${open ? 'rotate-180' : 'rotate-0'}`}
        strokeWidth={2.4}
        aria-hidden="true"
      />
    </button>
  );

  const renderPlaceholderPanel = () => (
    <div className="flex min-h-full flex-col gap-5">
      <div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-[#f7a37c]">
          {activeTabConfig.eyebrow}
        </p>
        <h3 className="mt-2 text-2xl font-black uppercase tracking-[0.08em] text-white">
          {activeTabConfig.label}
        </h3>
        <p className="mt-3 max-w-md text-sm leading-6 text-white/74">
          {activeTabConfig.description}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {insightItems.map((item) => (
          <div
            key={item.label}
            className="rounded-[1.1rem] border border-white/10 bg-black/20 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-white/45">
              {item.label}
            </p>
            <p className="mt-2 text-sm font-medium text-white/88">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[1.35rem] border border-dashed border-white/18 bg-black/15 px-4 py-5 text-sm leading-6 text-white/70">
        Placeholder layout only for phase one. Real {activeTabConfig.label.toLowerCase()} content can be wired into this tab once the modal shell and interaction model are approved.
      </div>
    </div>
  );

  const renderAnalyticsTab = () => {
    const pos = valueProfile.positionKey || 'N/A';
    const { ktcRank, peerCount, peerAges, peers: analyticsPeers } = valueProfile;
    const age = Number(contract?.age) || 0;

    // Rank label
    const rankSuffix = (() => { const n = ktcRank; const mod100 = n % 100; const mod10 = n % 10; if (mod100 >= 11 && mod100 <= 13) return 'th'; if (mod10 === 1) return 'st'; if (mod10 === 2) return 'nd'; if (mod10 === 3) return 'rd'; return 'th'; })();
    const rankRatio = peerCount > 0 ? ktcRank / peerCount : 1;
    const rankColor = ktcRank <= 3 ? '#f7c948' : rankRatio <= 0.3 ? '#4ade80' : '#f7a37c';

    // Age zones
    const AGE_ZONES = [
      { label: 'Developing', min: 0, max: 23, color: '#60a5fa' },
      { label: 'Rising', min: 23, max: 26, color: '#4ade80' },
      { label: 'Prime', min: 26, max: 29, color: '#f7a37c' },
      { label: 'Veteran', min: 29, max: 99, color: '#f87171' },
    ];
    const currentZone = AGE_ZONES.find((z) => age >= z.min && age < z.max) || AGE_ZONES[AGE_ZONES.length - 1];

    const allAges = [...peerAges, ...(age > 0 ? [age] : [])];
    const minAge = allAges.length ? Math.min(...allAges) : 22;
    const maxAge = allAges.length ? Math.max(...allAges) : 35;
    const ageSpan = Math.max(maxAge - minAge, 1);
    const ageBarPercent = age > 0 ? Math.min(((age - minAge) / ageSpan) * 100, 100) : null;

    return (
      <div className="flex min-h-full flex-col gap-4">
        {/* Row 1: Rank + Age profile cards */}
        <div className="grid gap-3 grid-cols-2">
          {/* KTC Rank */}
          <div className="relative overflow-hidden rounded-[1.15rem] border border-white/10 bg-black/20 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.26em] text-white/50">
              {pos} rank (KTC)
            </p>
            <p className="mt-2 text-4xl font-black leading-none tracking-tight" style={{ color: rankColor }}>
              {ktcRank > 0 ? `${ktcRank}${rankSuffix}` : '—'}
            </p>
            <p className="mt-1.5 text-[0.7rem] text-white/50">
              of {peerCount} active {pos}s
            </p>
          </div>

          {/* Age profile */}
          <div className="relative overflow-hidden rounded-[1.15rem] border border-white/10 bg-black/20 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.26em] text-white/50">Age profile</p>
            {age > 0 ? (
              <>
                <p className="mt-2 text-4xl font-black leading-none tracking-tight" style={{ color: currentZone.color }}>
                  {age}
                </p>
                <p className="mt-1.5 text-[0.7rem] text-white/50">{currentZone.label}</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-white/35">Unavailable</p>
            )}
          </div>
        </div>

        {/* Age distribution bar */}
        {age > 0 && peerAges.length > 1 ? (
          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.26em] text-white/50">
              Age vs. {pos} peers ({peerAges.length} players)
            </p>
            {/* Zone color bar */}
            <div className="relative flex h-4 w-full overflow-hidden rounded-full">
              {AGE_ZONES.map((z) => {
                const zStart = Math.max(z.min, minAge);
                const zEnd = Math.min(z.max, maxAge + 1);
                const w = Math.max(((zEnd - zStart) / (ageSpan + 1)) * 100, 0);
                return w > 0 ? (
                  <div key={z.label} style={{ width: `${w}%`, backgroundColor: z.color, opacity: 0.35 }} />
                ) : null;
              })}
              {/* Player marker */}
              {ageBarPercent !== null ? (
                <div
                  className="absolute top-0 h-full w-[5px] rounded-full bg-white shadow-[0_0_7px_rgba(255,255,255,0.85)]"
                  style={{ left: `calc(${ageBarPercent}% - 2.5px)` }}
                />
              ) : null}
            </div>
            <div className="mt-1.5 flex justify-between text-[0.61rem] font-medium text-white/40">
              <span>Age {minAge}</span>
              <span className="text-white/65">
                {(contract.playerName || '').split(' ').slice(-1)[0]} · Age {age} · {currentZone.label}
              </span>
              <span>Age {maxAge}</span>
            </div>
            {/* Zone legend */}
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {AGE_ZONES.map((z) => {
                const count = peerAges.filter((a) => a >= z.min && a < z.max).length;
                if (count === 0) return null;
                return (
                  <span key={z.label} className="flex items-center gap-1 text-[0.63rem] text-white/50">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: z.color }} />
                    {z.label}: {count}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderActiveTabPanel = () => {
    if (activeTab === 'contract') {
      return renderContractsTab();
    }

    if (activeTab === 'history') {
      return renderGameHistoryTab();
    }

    if (activeTab === 'value') {
      return renderPlayerValueTab();
    }

    if (activeTab === 'analytics') {
      return renderAnalyticsTab();
    }

    if (activeTab === 'notes') {
      return renderNotesTab();
    }

    return renderPlaceholderPanel();
  };

  const renderTabRail = (mobile = false) => (
    <div className={`absolute top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 ${mobile ? '-right-14' : '-right-16'}`}>
      {TAB_CONFIG.map((tab) => {
        const Icon = tab.icon;
        const selected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab(tab.id);
              if (!drawerOpen) {
                setDrawerOpen(true);
                if (isMobile) {
                  setFlippedContainer(true);
                  setFlippedCard(true);
                }
              }
            }}
            className={`flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 shadow-[0_14px_28px_rgba(5,8,18,0.28)] transition ${selected ? 'bg-[#f35b2f] text-white' : 'bg-[#112033]/92 text-white/72 hover:bg-[#16304b] hover:text-white'}`}
            aria-label={tab.label}
            title={tab.label}
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={2.2} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );

  const renderMobileTabRail = () => (
    <div className="mt-4 flex justify-center gap-2">
      {TAB_CONFIG.map((tab) => {
        const Icon = tab.icon;
        const selected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab(tab.id);
              if (!drawerOpen) {
                setDrawerOpen(true);
                setFlippedContainer(true);
                setFlippedCard(true);
              }
            }}
            className={`flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 shadow-[0_14px_28px_rgba(5,8,18,0.28)] transition ${selected ? 'bg-[#f35b2f] text-white' : 'bg-[#112033]/92 text-white/72 hover:bg-[#16304b] hover:text-white'}`}
            aria-label={tab.label}
            title={tab.label}
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={2.2} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );

  const renderDrawerSurface = (mobile = false) => (
    <div
      className={`relative flex h-full w-full flex-col overflow-visible rounded-[1.75rem] border border-white/12 bg-[linear-gradient(180deg,rgba(10,21,37,0.98),rgba(9,17,29,0.96))] px-5 py-5 text-left text-white shadow-[0_28px_60px_rgba(5,9,18,0.45)] ${mobile ? '' : 'min-h-[32rem]'}`}
    >
      <div>
        <div className={mobile ? 'flex items-start gap-3' : ''}>
          {mobile ? (
            <button
              type="button"
              onClick={handleDrawerToggle}
              className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/6 text-white/72 transition hover:bg-white/12 hover:text-white"
              aria-label="Back to player image"
              title="Back to player image"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.3} />
            </button>
          ) : null}
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-white/42">Player profile</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.08em] text-white">
              {safeDisplay(contract.playerName)}
            </h2>
          </div>
        </div>

        <div className={`mt-6 overflow-y-auto pr-2 ${mobile ? 'max-h-[23rem]' : 'max-h-[23rem]'}`}>
          {renderActiveTabPanel()}
        </div>
      </div>

      {!mobile && renderTabRail(false)}
    </div>
  );

  const handleDrawerToggle = () => {
    if (isMobile) {
      const nextOpen = !drawerOpen;
      setDrawerOpen(nextOpen);
      setFlippedContainer(true);
      setFlippedCard(nextOpen);
      return;
    }

    setDrawerOpen((current) => !current);
  };

  // Central close handler: ensure parent can set expanded = false
  const handleClose = (e) => {
    e?.stopPropagation?.();
    setDrawerOpen(false);
    setFlippedCard(false);
    setTimeout(() => setFlippedContainer(false), 300);

    if (typeof onExpandClick === 'function') {
      // Prefer an explicit "close" signal
      onExpandClick(false);
      return;
    }
    if (typeof onClick === 'function') {
      onClick(false);
    }
  };

  if (!expanded) {
    return (
      <div
        className={`group relative overflow-hidden rounded-[1.2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(28,58,90,0.55),rgba(7,12,20,0.96))] shadow-[0_18px_35px_rgba(7,12,20,0.38)] ${className && className.match(/w-\d+/) ? className : 'w-36 h-36 sm:w-40 sm:h-40'}`}
        onClick={onClick}
      >
        {imgSrc ? (
          <Image
            src={imgSrc}
            alt={contract?.playerName}
            width={144}
            height={144}
            className="h-full w-full object-contain transition duration-500 group-hover:scale-[1.03]"
            onError={handleImgError}
            unoptimized={imgSrc && imgSrc.startsWith('http')}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-900 text-white text-lg">
            Loading...
          </div>
        )}
        {!avatarOnly && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#08101b] via-[#08101bcc] to-transparent px-3 py-2 text-white">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-white/90">{safeDisplay(contract.playerName)}</div>
            <div className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-white/55">
              {safeDisplay(contract.position)} • {safeDisplay(contract.team)}{contract.age ? ` • Age ${contract.age}` : ''}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex justify-center px-1 py-1 text-white sm:px-2" onClick={(e) => e.stopPropagation()}>
      <div className="w-[min(98vw,78rem)]">
        <div className="relative overflow-visible pt-2 md:pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-0 top-0 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-black/35 text-white/86 transition hover:bg-black/45 hover:text-white"
            aria-label="Close"
            title="Close"
          >
            <X className="h-5 w-5" strokeWidth={2.3} aria-hidden="true" />
          </button>

          <div className={`hidden items-center justify-center md:flex ${drawerOpen ? 'gap-0' : 'gap-0'}`}>
            <div className="relative z-20 h-[32rem] w-[22rem] shrink-0 overflow-visible rounded-[1.9rem] border border-white/10 bg-[linear-gradient(160deg,rgba(10,17,29,0.95),rgba(7,12,20,0.96))] shadow-[0_24px_55px_rgba(5,8,18,0.42)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(243,91,47,0.18),transparent_45%)]" />
              {imgSrc ? (
                <Image
                  src={imgSrc}
                  alt={contract?.playerName}
                  width={384}
                  height={538}
                  className="relative z-10 h-full w-full object-contain"
                  onError={handleImgError}
                  unoptimized={imgSrc && imgSrc.startsWith('http')}
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gray-900 text-lg text-white">Loading...</div>
              )}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#08101b] via-[#08101be6] to-transparent px-5 pb-5 pt-12 text-white">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-white/48">Player profile</p>
                <h2 className="mt-2 text-[2rem] font-black uppercase tracking-[0.08em] text-white">
                  {safeDisplay(contract.playerName)}
                </h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className={capsuleClassName}>{safeDisplay(contract.position)}</span>
                  <span className={capsuleClassName}>{safeDisplay(contract.team)}</span>
                </div>
              </div>
            </div>

            <div className="relative z-30 flex h-[32rem] w-12 shrink-0 items-center justify-center">
              <ToggleDrawerButton
                onClick={handleDrawerToggle}
                open={drawerOpen}
                title={drawerOpen ? 'Hide profile drawer' : 'Open profile drawer'}
              />
            </div>

            <div
              className={`relative z-10 overflow-visible transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${drawerOpen ? 'w-[31rem] opacity-100' : 'w-0 opacity-0'}`}
              style={{ transform: drawerOpen ? 'translateX(0)' : 'translateX(-25rem)' }}
              aria-hidden={!drawerOpen}
            >
              <div className={`overflow-visible transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${drawerOpen ? 'max-w-[31rem]' : 'max-w-0'}`}>
                <div className="h-[32rem] w-[31rem]">
                  {renderDrawerSurface(false)}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 md:hidden">
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDrawerToggle(); }}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#f35b2f] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(12,18,30,0.45)] transition hover:bg-[#ff744d] focus:outline-none focus:ring-2 focus:ring-[#f7a37c]/60"
                aria-label={drawerOpen ? 'Reveal player image' : 'Reveal profile drawer'}
                title={drawerOpen ? 'Reveal player image' : 'Reveal profile drawer'}
              >
                <RotateCcw className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                {drawerOpen ? 'View Card' : 'View Profile'}
              </button>
            </div>
            <div className="mx-auto w-full max-w-[22rem]" style={{ perspective: '1800px' }}>
              <div
                className="relative h-[30rem] min-w-0 w-full transition-transform duration-700 ease-[cubic-bezier(0.34,1.52,0.64,1)]"
                style={{ transformStyle: 'preserve-3d', WebkitTransformStyle: 'preserve-3d', transform: flippedCard ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
              >
                <div
                  className="absolute inset-0 overflow-visible rounded-[1.9rem] border border-white/10 bg-[linear-gradient(160deg,rgba(10,17,29,0.95),rgba(7,12,20,0.96))] shadow-[0_24px_55px_rgba(5,8,18,0.42)]"
                  style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
                >
                  <div className="relative h-full w-full overflow-hidden rounded-[1.9rem]">
                    <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(243,91,47,0.18),transparent_45%)]" />
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={contract?.playerName || 'Player card image'}
                        className="relative z-10 h-full w-full object-contain [transform:translateZ(0)]"
                        onError={handleImgError}
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-900 text-lg text-white">Loading...</div>
                    )}

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#08101b] via-[#08101be6] to-transparent px-5 pb-5 pt-14 text-white">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-white/48">Player profile</p>
                      <h2 className="mt-2 text-[1.35rem] font-black uppercase tracking-[0.08em] text-white">
                        {safeDisplay(contract.playerName)}
                      </h2>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className={capsuleClassName}>{safeDisplay(contract.position)}</span>
                        <span className={capsuleClassName}>{safeDisplay(contract.team)}</span>
                        {contract.age ? <span className={capsuleClassName}>Age {contract.age}</span> : null}
                      </div>
                    </div>
                  </div>

                </div>

                <div
                  className="absolute inset-0 overflow-visible rounded-[1.9rem]"
                  style={{ transform: 'rotateY(180deg) translateZ(0)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                  {renderDrawerSurface(true)}
                </div>
              </div>
            </div>
            {renderMobileTabRail()}
          </div>
        </div>
      </div>
    </div>
  );
}
