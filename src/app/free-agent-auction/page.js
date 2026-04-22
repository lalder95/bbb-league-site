'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import Papa from 'papaparse';
import Image from 'next/image';

const USER_ID = '456973480269705216';

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

function getGroupTheme(group) {
  switch (group) {
    case 'Active':
      return {
        pill: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200',
        section: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
        surface: 'border-emerald-400/35 bg-emerald-500/8',
      };
    case 'Upcoming':
      return {
        pill: 'border-sky-400/30 bg-sky-500/15 text-sky-200',
        section: 'border-sky-400/30 bg-sky-500/10 text-sky-100',
        surface: 'border-sky-400/35 bg-sky-500/8',
      };
    default:
      return {
        pill: 'border-white/15 bg-white/8 text-slate-200',
        section: 'border-white/15 bg-white/8 text-slate-100',
        surface: 'border-white/20 bg-black/20',
      };
  }
}

function SurfaceButton({ tone = 'orange', className = '', children, ...props }) {
  const tones = {
    orange: 'border-[#FF4B1F]/40 bg-[#FF4B1F] text-white hover:bg-[#ff6a3c] focus-visible:ring-[#FF4B1F]/40',
    ghost: 'border-white/15 bg-white/5 text-white hover:bg-white/10 focus-visible:ring-white/20',
    purple: 'border-purple-400/30 bg-purple-600/85 text-white hover:bg-purple-500 focus-visible:ring-purple-400/40',
    yellow: 'border-amber-400/30 bg-amber-500/85 text-white hover:bg-amber-400 focus-visible:ring-amber-300/40',
    blue: 'border-sky-400/30 bg-sky-600/85 text-white hover:bg-sky-500 focus-visible:ring-sky-400/40',
    danger: 'border-red-400/30 bg-red-700/90 text-white hover:bg-red-600 focus-visible:ring-red-400/40',
    green: 'border-emerald-400/30 bg-emerald-600/85 text-white hover:bg-emerald-500 focus-visible:ring-emerald-400/40',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        tones[tone] || tones.orange,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function TeamIdentity({ username, avatarId, size = 10, subtitle }) {
  const dimension = size * 4;

  return (
    <div className="flex items-center gap-3 min-w-0">
      {avatarId ? (
        <Image
          src={`https://sleepercdn.com/avatars/${avatarId}`}
          alt={username}
          width={dimension}
          height={dimension}
          className="rounded-full border border-white/10 object-cover"
          loading="lazy"
          unoptimized={String(username || '').startsWith('http')}
        />
      ) : (
        <span
          className="inline-block rounded-full border border-white/10 bg-white/10"
          style={{ width: dimension, height: dimension }}
        />
      )}
      <div className="min-w-0">
        <div className="truncate font-medium text-white">{username || '-'}</div>
        {subtitle ? <div className="truncate text-xs text-white/45">{subtitle}</div> : null}
      </div>
    </div>
  );
}

function MetricCard({ eyebrow, title, detail, accent = 'orange' }) {
  const accents = {
    orange: 'from-[#FF4B1F]/18 via-[#FF4B1F]/8 to-transparent border-[#FF4B1F]/20',
    blue: 'from-sky-500/18 via-sky-500/8 to-transparent border-sky-400/20',
    green: 'from-emerald-500/18 via-emerald-500/8 to-transparent border-emerald-400/20',
    slate: 'from-white/10 via-white/5 to-transparent border-white/10',
  };

  return (
    <div className={cn('rounded-3xl border bg-gradient-to-br px-4 py-4 backdrop-blur-sm', accents[accent] || accents.orange)}>
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">{eyebrow}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{title}</div>
      {detail ? <div className="mt-1 text-sm text-white/60">{detail}</div> : null}
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, children, maxWidth = 'max-w-2xl' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className={cn('relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#020817]/95 shadow-2xl shadow-black/40', maxWidth)}>
        <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
          <button
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl text-white/70 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
          <h2 className="pr-12 text-xl font-semibold text-white sm:text-2xl">{title}</h2>
          {subtitle ? <p className="mt-1 pr-12 text-sm text-white/60">{subtitle}</p> : null}
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">{children}</div>
      </div>
    </div>
  );
}

function getDraftTimeZone(draft) {
  return draft?.timeZone || 'America/Chicago';
}

function parseDraftDateTime(value, timeZone = 'America/Chicago') {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return value;

  const rawValue = String(value).trim();
  if (!rawValue) return new Date(NaN);
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(rawValue)) {
    return new Date(rawValue);
  }

  return fromZonedTime(rawValue, timeZone);
}

function getCurrentTime() {
  return new Date();
}

function formatDraftDateTime(value, timeZone, pattern = 'MM/dd/yyyy h:mm a zzz') {
  const parsedValue = parseDraftDateTime(value, timeZone);
  if (Number.isNaN(parsedValue.getTime())) return 'Invalid time';
  return formatInTimeZone(parsedValue, timeZone || 'America/Chicago', pattern);
}

function formatDraftDateTimeInput(value, timeZone) {
  const parsedValue = parseDraftDateTime(value, timeZone);
  if (Number.isNaN(parsedValue.getTime())) return '';
  return formatInTimeZone(parsedValue, timeZone || 'America/Chicago', "yyyy-MM-dd'T'HH:mm");
}

function formatCapSpace(value) {
  return `$${value.toFixed(1)}`;
}

function getCapSpaceColor(value) {
  if (value >= 100) return 'text-green-400';
  if (value >= 75) return 'text-yellow-400';
  if (value >= 50) return 'text-[#FF4B1F]';
  return 'text-red-500';
}

function getPlayerStartTime(draftStartDate, startDelay, draftTimeZone = 'America/Chicago') {
  const start = parseDraftDateTime(draftStartDate, draftTimeZone);
  if (Number.isNaN(start.getTime())) return start;
  return new Date(start.getTime() + Number(startDelay || 0) * 60 * 60 * 1000);
}

// End date is at least 24 hours after the most recent bid for this player
function getPlayerEndTime(draftStartDate, startDelay, nomDuration, contractPoints = 0, bidLog = [], playerId, draftBlind = false, draftTimeZone = 'America/Chicago', draftEndDate = null) {
  const start = getPlayerStartTime(draftStartDate, startDelay, draftTimeZone);

  // Blind auctions should run until the configured draft end date.
  // Do NOT reduce the timer and do NOT enforce a 24-hour minimum after each bid.
  if (draftBlind) {
    const explicitEnd = parseDraftDateTime(draftEndDate, draftTimeZone);
    if (!Number.isNaN(explicitEnd.getTime())) {
      return explicitEnd;
    }

    const effectiveDuration = Number(nomDuration || 0);
    const calculatedEnd = new Date(start.getTime() + effectiveDuration * 60 * 1000);
    return calculatedEnd;
  } else {
    let effectiveDuration;
    const reductionPercent = Math.min(Number(contractPoints) * 0.0138, 0.95);
    effectiveDuration = Number(nomDuration || 0) * (1 - reductionPercent);
    const calculatedEnd = new Date(start.getTime() + effectiveDuration * 60 * 1000);

    // Find the most recent bid for this player
    const playerBids = (bidLog || []).filter(b => String(b.playerId) === String(playerId));
    let latestBidTime = null;
    if (playerBids.length > 0) {
      latestBidTime = new Date(
        playerBids.reduce((latest, b) =>
          !latest || new Date(b.timestamp) > new Date(latest) ? b.timestamp : latest
        , null)
      );
    }

    // 24 hours after the most recent bid
    let minEnd = null;
    if (latestBidTime) {
      minEnd = new Date(latestBidTime.getTime() + 24 * 60 * 60 * 1000);
    }

    // The end time is the later of calculatedEnd and minEnd
    if (minEnd && minEnd > calculatedEnd) {
      return minEnd;
    }
    return calculatedEnd;
  }
}

function resolveBlindAuctionOutcome(playerId, bidLog = []) {
  const playerBids = (bidLog || []).filter(bid => String(bid.playerId) === String(playerId));
  if (playerBids.length === 0) {
    return { topScore: null, leaders: [], isTie: false };
  }

  const bestBidByTeam = new Map();
  playerBids.forEach(bid => {
    const username = String(bid.username || 'Unknown');
    const existing = bestBidByTeam.get(username);
    const bidScore = Number(bid.contractPoints) || 0;
    const existingScore = existing ? Number(existing.contractPoints) || 0 : -Infinity;

    if (!existing || bidScore > existingScore) {
      bestBidByTeam.set(username, bid);
    }
  });

  const bestBids = Array.from(bestBidByTeam.values());
  const topScore = Math.max(...bestBids.map(bid => Number(bid.contractPoints) || 0));
  const leaders = bestBids
    .filter(bid => (Number(bid.contractPoints) || 0) === topScore)
    .sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')));

  return {
    topScore,
    leaders,
    isTie: leaders.length > 1,
  };
}

// Helper to check if current user is in draft users
function isUserInDraft(session, draft) {
  if (!session?.user?.name || !Array.isArray(draft?.users)) return false;
  return draft.users.some(u => u.username === session.user.name);
}

function userHasActiveContractWithPlayer(session, activeContractsByTeam, playerId) {
  const username = String(session?.user?.name || '').trim();
  const normalizedPlayerId = String(playerId || '').trim();
  if (!username || !normalizedPlayerId) return false;
  const rosteredPlayers = activeContractsByTeam[username];
  return Boolean(rosteredPlayers && rosteredPlayers.has(normalizedPlayerId));
}

function calculateContractScore(salary, years) {
  salary = Number(salary);
  years = Number(years);
  let total = 0;
  let yearSalary = salary;
  for (let y = 1; y <= years; y++) {
    if (y > 1) {
      yearSalary = Math.ceil(yearSalary * 1.1 * 10) / 10;
    }
    if (y === 1) total += yearSalary * 1.0;
    if (y === 2) total += yearSalary * 0.8;
    if (y === 3) total += yearSalary * 0.6;
    if (y === 4) total += yearSalary * 0.4;
  }
  return Math.round(total * 10) / 10;
}

function normalizePlayerImageName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[\s'-]/g, '_')
    .replace(/[^a-z0-9_.]/g, '');
}

function getDefaultPlayerImage(position) {
  const defaults = {
    qb: '/players/cardimages/default_qb.png',
    rb: '/players/cardimages/default_rb.png',
    te: '/players/cardimages/default_te.png',
    wr: '/players/cardimages/default_wr.png',
  };

  return defaults[String(position || '').toLowerCase()] || '/logo.png';
}

function normalizeDraftPlayer(player, fallbackStartDelay = 0) {
  return {
    playerId: Number(player.playerId),
    playerName: player.playerName ?? '',
    position: player.position ?? '',
    ktc: player.ktc ?? '',
    status: player.status ?? 'UPCOMING',
    startDelay: Number(player.startDelay ?? fallbackStartDelay ?? 0)
  };
}

export default function FreeAgentAuctionPage() {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [bidSalary, setBidSalary] = useState('');
  const [bidYears, setBidYears] = useState('');
  const [placingBid, setPlacingBid] = useState(false);
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetConfirmId, setResetConfirmId] = useState(null);
  const [playerCountdowns, setPlayerCountdowns] = useState({});
  const [capTeams, setCapTeams] = useState([]);
  const [activeContractsByTeam, setActiveContractsByTeam] = useState({});
  const [teamAvatars, setTeamAvatars] = useState({});
  const [cardImageIndex, setCardImageIndex] = useState([]);
  const [selectedPlayerImageSrc, setSelectedPlayerImageSrc] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'countdown', direction: 'asc' });
  const [filterPosition, setFilterPosition] = useState('ALL');
  const [searchName, setSearchName] = useState('');
  const [showBoardFiltersModal, setShowBoardFiltersModal] = useState(false);
  const [isPortraitDevice, setIsPortraitDevice] = useState(false);
  const [showCapModal, setShowCapModal] = useState(false);
  const [bidLogSearch, setBidLogSearch] = useState('');
  const [bidLogBidder, setBidLogBidder] = useState('ALL');
  const [showBidLogModal, setShowBidLogModal] = useState(false);
  const [showResetButtons, setShowResetButtons] = useState(false);
  const [retractConfirmPlayerId, setRetractConfirmPlayerId] = useState(null);
  const [showAdminToolsModal, setShowAdminToolsModal] = useState(false);
  const [adminToolPlayers, setAdminToolPlayers] = useState([]);
  const [adminToolLoading, setAdminToolLoading] = useState(false);
  const [adminToolSaving, setAdminToolSaving] = useState(false);
  const [adminToolError, setAdminToolError] = useState('');
  const [adminToolSearch, setAdminToolSearch] = useState('');
  const [adminToolPosition, setAdminToolPosition] = useState('ALL');
  const [adminToolStartDelays, setAdminToolStartDelays] = useState({});
  const [adminToolStartDate, setAdminToolStartDate] = useState('');
  const [adminToolEndDate, setAdminToolEndDate] = useState('');
  const initialLoadDone = useRef(false);
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === 'admin';

  useEffect(() => {
    function updateOrientationState() {
      const isPortrait = window.innerHeight > window.innerWidth;
      const isSmallViewport = window.innerWidth < 1024;
      setIsPortraitDevice(isPortrait && isSmallViewport);
    }
    updateOrientationState();
    window.addEventListener('resize', updateOrientationState);
    return () => window.removeEventListener('resize', updateOrientationState);
  }, []);

  useEffect(() => {
    if (!draft || !draft.players) return;
    const interval = setInterval(() => {
      const now = getCurrentTime();
      const draftTimeZone = getDraftTimeZone(draft);
      const countdowns = {};
      draft.players.forEach(p => {
        const result = draft.results?.find(r => r.playerId === p.playerId);
        const contractPoints = result ? Number(result.contractPoints) : 0;
        const playerStartTime = getPlayerStartTime(draft.startDate, p.startDelay, draftTimeZone);
          const playerEndTime = getPlayerEndTime(draft.startDate, p.startDelay, draft.nomDuration, contractPoints, draft.bidLog, p.playerId, draft.blind, draftTimeZone, draft.endDate);
        let group = 'Ended';
        if (now < playerStartTime) group = 'Upcoming';
        else if (now >= playerStartTime && now < playerEndTime) group = 'Active';

        let colorClass = '';
        if (group === 'Active') colorClass = 'text-green-400';
        else if (group === 'Upcoming') colorClass = 'text-blue-400';
        else colorClass = 'text-gray-400';

        let diff = 0;
        if (group === 'Upcoming') diff = playerStartTime - now;
        else if (group === 'Active') diff = playerEndTime - now;

        countdowns[p.playerId] =
          diff > 0
            ? <span className={colorClass}>{formatCountdown(diff)}</span>
            : '';
      });
      setPlayerCountdowns(countdowns);
    }, 1000);
    return () => clearInterval(interval);
  }, [draft]);

  useEffect(() => {
    let cancelled = false;

    async function loadCardImageIndex() {
      try {
        const response = await fetch('/players/cardimages/index.json');
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && Array.isArray(data)) {
          setCardImageIndex(data);
        }
      } catch {
        if (!cancelled) {
          setCardImageIndex([]);
        }
      }
    }

    loadCardImageIndex();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedPlayer) {
      setSelectedPlayerImageSrc('');
      return;
    }

    const normalized = normalizePlayerImageName(selectedPlayer.playerName);
    const altNormalized = String(selectedPlayer.playerName || '')
      .toLowerCase()
      .replace(/[\s']/g, '_')
      .replace(/[^a-z0-9_.-]/g, '');
    const indexedImage = Array.isArray(cardImageIndex)
      ? cardImageIndex.find(image => {
          const filename = String(image?.filename || '').toLowerCase();
          return filename.includes(normalized) || filename.includes(altNormalized);
        })
      : null;

    if (indexedImage?.src) {
      setSelectedPlayerImageSrc(indexedImage.src);
      return;
    }

    if (normalized) {
      setSelectedPlayerImageSrc(`https://res.cloudinary.com/drn1zhflh/image/upload/f_auto,q_auto,w_768/${normalized}.png`);
      return;
    }

    setSelectedPlayerImageSrc(getDefaultPlayerImage(selectedPlayer.position));
  }, [selectedPlayer, cardImageIndex]);

  const fetchDraft = async (showLoading = false) => {
    if (showLoading && !initialLoadDone.current) setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/drafts');
      if (!res.ok) {
        setError('Failed to load draft.');
        setDraft(null);
        return;
      }
      const text = await res.text();
      if (!text) {
        setDraft(null);
        return;
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setError('Invalid draft data.');
        setDraft(null);
        return;
      }
      if (Array.isArray(data) && data.length > 0) {
        const latestDraft = data
          .filter(d => d.state === 'ACTIVE')
          .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
        setDraft(latestDraft || null);
      } else {
        setDraft(null);
      }
    } catch {
      setError('Failed to load draft.');
      setDraft(null);
    } finally {
      if (showLoading && !initialLoadDone.current) {
        setLoading(false);
        initialLoadDone.current = true;
      }
    }
  };

  useEffect(() => {
    fetchDraft(true);
    const interval = setInterval(() => {
      fetchDraft(false);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!draft?.startDate) return;
    const interval = setInterval(() => {
      const now = getCurrentTime();
      const start = parseDraftDateTime(draft.startDate, getDraftTimeZone(draft));
      const diff = start - now;
      if (diff <= 0) {
        setCountdown('Auction Started!');
        clearInterval(interval);
      } else {
        setCountdown(formatCountdown(diff));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [draft?.startDate, draft?.timeZone]);

  const handleBid = async () => {
    if (!isUserInDraft(session, draft)) {
      setError('You are not eligible to bid in this auction.');
      return;
    }

    if (userHasActiveContractWithPlayer(session, activeContractsByTeam, selectedPlayer?.playerId)) {
      setError('You cannot bid on a player who already has an active contract with your team.');
      return;
    }

    const salary = Number(bidSalary);
    const years = Number(bidYears);

    if (
      !selectedPlayer ||
      !bidSalary ||
      !bidYears ||
      isNaN(salary) ||
      isNaN(years) ||
      salary < 1 ||
      salary > 200 ||
      years < 1 ||
      years > 4 ||
      !/^\d+(\.\d{1})?$/.test(bidSalary) ||
      (salary * 10) % 1 !== 0
    ) {
      setError('Salary must be $1.0-$200.0 in $0.1 increments. Years must be 1-4.');
      return;
    }

    const contractPoints = calculateContractScore(salary, years);

    const res = await fetch('/api/admin/drafts');
    const drafts = await res.json();
    const latestDraft = Array.isArray(drafts)
      ? drafts.filter(d => d.state === 'ACTIVE').sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0]
      : null;
    if (!latestDraft) {
      setError('Draft not found.');
      return;
    }
    const currentResult = latestDraft.results.find(r => r.playerId === selectedPlayer.playerId);
    const currentHighScore = currentResult ? Number(currentResult.contractPoints) : 0;

    if (!draft?.blind && contractPoints >= currentHighScore + 5 && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    setPlacingBid(true);
    setSuccess('');
    setError('');
    setShowConfirm(false);

    try {
      // Only enforce "must be higher than current high bid" if NOT blind
      if (!draft?.blind && contractPoints <= currentHighScore) {
        setError('Contract Score must be higher than the current high bid.');
        setPlacingBid(false);
        return;
      }

      if (draft?.blind) {
        // Prevent duplicate or lower contract score for user's own bid in blind draft
        const userBids = (draft.bidLog || []).filter(
          b => b.playerId === selectedPlayer.playerId && b.username === session?.user?.name
        );
        if (userBids.length > 0) {
          const userLastBid = userBids.reduce((latest, b) =>
            !latest || new Date(b.timestamp) > new Date(latest.timestamp) ? b : latest,
            null
          );
          if (contractPoints <= Number(userLastBid.contractPoints)) {
            setError('Your new bid must have a higher contract score than your previous bid for this player. To lower your bid, you must cancel the current bid and place a new bid.');
            setPlacingBid(false);
            return;
          }
        }
      }

      const newResult = {
        username: session?.user?.name || 'Unknown',
        playerId: selectedPlayer.playerId,
        salary: salary,
        years: years,
        contractPoints: contractPoints,
        state: 'ACTIVE',
        expiration: '',
      };

      // Generate AI reactions for NON-BLIND auctions
      let reactions = [];
      if (!latestDraft.blind) {
        try {
          const aiRes = await fetch('/api/ai/bid_reactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: session?.user?.name || 'Unknown',
              playerName: selectedPlayer.playerName,
              salary,
              years
            })
          });
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            if (Array.isArray(aiData.reactions)) reactions = aiData.reactions;
          }
        } catch (e) {
          // Silently ignore AI errors; reactions remain empty
        }
      }

      const newBid = {
        username: session?.user?.name || 'Unknown',
        playerId: selectedPlayer.playerId,
        salary: salary,
        years: years,
        contractPoints: contractPoints,
        comments: '', // For future use
        reactions, // AI reactions (array of {name, role, persona, reaction})
        timestamp: new Date().toISOString()
      };

      const updatedResults = [
        ...latestDraft.results.filter(r => r.playerId !== selectedPlayer.playerId),
        newResult,
      ];

      const updatedBidLog = [...(latestDraft.bidLog || []), newBid];

      const patchRes = await fetch(`/api/admin/drafts/${latestDraft._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: updatedResults, bidLog: updatedBidLog }),
      });

      if (!patchRes.ok) throw new Error(await patchRes.text());

      setSuccess('Bid placed!');
      setBidSalary('');
      setBidYears('');
      setShowConfirm(false);
      await fetchDraft();
    } catch (err) {
      setError(err.message || 'Failed to place bid.');
    } finally {
      setPlacingBid(false);
    }
  };

  const currentHighSalary = selectedPlayer
    ? Number(
        draft?.results?.find(r => r.playerId === selectedPlayer.playerId)?.salary ?? 0
      )
    : 0;
  const currentHighScore = selectedPlayer
    ? Number(
        draft?.results?.find(r => r.playerId === selectedPlayer.playerId)?.contractPoints ?? 0
      )
    : 0;
  const currentHighYears = selectedPlayer
    ? Number(
        draft?.results?.find(r => r.playerId === selectedPlayer.playerId)?.years ?? 0
      )
    : 0;
  const selectedPlayerAlreadyRostered = selectedPlayer
    ? userHasActiveContractWithPlayer(session, activeContractsByTeam, selectedPlayer.playerId)
    : false;

  useEffect(() => {
    async function fetchCapData() {
      try {
        const contractsResponse = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
        const contractsText = await contractsResponse.text();

        const finesResponse = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_TeamFines.csv');
        const finesText = await finesResponse.text();

        const contractRows = contractsText.split('\n');
        const contracts = contractRows.slice(1)
          .filter(row => row.trim())
          .map(row => {
            const values = row.split(',');
            const playerId = String(values[0] || '').trim();
            const status = values[14];
            const isActive = status === 'Active';

            return {
              playerId,
              team: values[33],
              isActive: isActive,
              curYear: isActive ? parseFloat(values[15]) || 0 : parseFloat(values[24]) || 0,
              year2: isActive ? parseFloat(values[16]) || 0 : parseFloat(values[25]) || 0,
              year3: isActive ? parseFloat(values[17]) || 0 : parseFloat(values[26]) || 0,
              year4: isActive ? parseFloat(values[18]) || 0 : parseFloat(values[27]) || 0,
            };
          });

        const finesRows = finesText.split('\n');
        const fines = finesRows.slice(1)
          .filter(row => row.trim())
          .reduce((acc, row) => {
            const [team, year1, year2, year3, year4] = row.split(',');
            acc[team] = {
              curYear: parseFloat(year1) || 0,
              year2: parseFloat(year2) || 0,
              year3: parseFloat(year3) || 0,
              year4: parseFloat(year4) || 0,
            };
            return acc;
          }, {});

        const teamCaps = {};
        const rosterMap = {};

        contracts.forEach(contract => {
          if (!teamCaps[contract.team]) {
            teamCaps[contract.team] = {
              team: contract.team,
              curYear: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
              year2: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
              year3: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
              year4: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 }
            };
          }
          if (contract.isActive && contract.team && contract.playerId) {
            if (!rosterMap[contract.team]) {
              rosterMap[contract.team] = new Set();
            }
            rosterMap[contract.team].add(contract.playerId);
          }
          const capData = teamCaps[contract.team];
          if (contract.isActive) {
            capData.curYear.active += contract.curYear;
            capData.year2.active += contract.year2;
            capData.year3.active += contract.year3;
            capData.year4.active += contract.year4;
          } else {
            capData.curYear.dead += contract.curYear;
            capData.year2.dead += contract.year2;
            capData.year3.dead += contract.year3;
            capData.year4.dead += contract.year4;
          }
        });

        Object.entries(teamCaps).forEach(([teamName, capData]) => {
          const teamFines = fines[teamName] || { curYear: 0, year2: 0, year3: 0, year4: 0 };

          capData.curYear.fines = teamFines.curYear;
          capData.year2.fines = teamFines.year2;
          capData.year3.fines = teamFines.year3;
          capData.year4.fines = teamFines.year4;

          ['curYear', 'year2', 'year3', 'year4'].forEach(year => {
            capData[year].remaining = capData[year].total -
              capData[year].active -
              capData[year].dead -
              capData[year].fines;
          });
        });

        if (draft && draft.results) {
          Object.values(teamCaps).forEach(team => {
            team.spend = draft.results
              .filter(r => r.username === team.team)
              .reduce((sum, r) => sum + (Number(r.contractPoints) || 0), 0);
          });
        }
        setActiveContractsByTeam(rosterMap);
        setCapTeams(Object.values(teamCaps));
      } catch (error) {
        // Optionally handle error
      }
    }
    fetchCapData();
  }, [draft]);

  useEffect(() => {
    async function fetchAvatars() {
      try {
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;

        const userLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${currentSeason}`);
        const userLeagues = await userLeaguesResponse.json();

        let bbbLeagues = userLeagues.filter(league =>
          league.name && (
            league.name.includes('Budget Blitz Bowl') ||
            league.name.includes('budget blitz bowl') ||
            league.name.includes('BBB') ||
            (league.name.toLowerCase().includes('budget') && league.name.toLowerCase().includes('blitz'))
          )
        );

        if (bbbLeagues.length === 0 && userLeagues.length > 0) {
          bbbLeagues = [userLeagues[0]];
        }

        const mostRecentLeague = bbbLeagues.sort((a, b) => b.season - a.season)[0];
        const leagueId = mostRecentLeague.league_id;

        const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
        const users = await res.json();
        if (!users || !Array.isArray(users)) return;
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
  }, []);

  useEffect(() => {
    if (!showAdminToolsModal || !isAdmin) return;

    let cancelled = false;
    async function loadAdminToolPlayers() {
      setAdminToolLoading(true);
      setAdminToolError('');
      try {
        const [playersRes, ktcRes] = await Promise.all([
          fetch('/api/players/all'),
          fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/Players.csv')
        ]);

        if (!playersRes.ok || !ktcRes.ok) {
          throw new Error('Failed to load available players.');
        }

        const [playersData, ktcCsv] = await Promise.all([playersRes.json(), ktcRes.text()]);
        const parsedKtc = Papa.parse(ktcCsv, { header: true });
        const ktcMap = {};
        parsedKtc.data.forEach(row => {
          if (row?.PlayerID && row['KTC Value']) {
            ktcMap[row.PlayerID] = row['KTC Value'];
          }
        });

        const allowedPositions = ['QB', 'WR', 'RB', 'TE'];
        const seen = new Set();
        const mergedPlayers = (Array.isArray(playersData) ? playersData : [])
          .filter(player => allowedPositions.includes(player.position))
          .map(player => ({
            playerId: Number(player.playerId),
            playerName: player.playerName,
            position: player.position,
            ktc: ktcMap[player.playerId] || ''
          }))
          .filter(player => Number(player.ktc) > 0)
          .filter(player => {
            if (seen.has(String(player.playerId))) return false;
            seen.add(String(player.playerId));
            return true;
          })
          .sort((a, b) => a.playerName.localeCompare(b.playerName));

        if (!cancelled) {
          setAdminToolPlayers(mergedPlayers);
        }
      } catch (err) {
        if (!cancelled) {
          setAdminToolError(err.message || 'Failed to load available players.');
        }
      } finally {
        if (!cancelled) {
          setAdminToolLoading(false);
        }
      }
    }

    loadAdminToolPlayers();
    return () => {
      cancelled = true;
    };
  }, [showAdminToolsModal, isAdmin]);

  useEffect(() => {
    if (!showAdminToolsModal || !draft) return;
    const draftTimeZone = getDraftTimeZone(draft);
    setAdminToolStartDate(formatDraftDateTimeInput(draft.startDate, draftTimeZone));
    setAdminToolEndDate(formatDraftDateTimeInput(draft.endDate, draftTimeZone));
  }, [showAdminToolsModal, draft]);

  const contractedPlayerIdSet = React.useMemo(
    () => new Set(Object.values(activeContractsByTeam).flatMap(playerSet => Array.from(playerSet || []))),
    [activeContractsByTeam]
  );

  const draftPlayerIdSet = React.useMemo(
    () => new Set((draft?.players || []).map(player => String(player.playerId))),
    [draft?.players]
  );

  const filteredAdminToolPlayers = React.useMemo(() => {
    const normalizedSearch = adminToolSearch.trim().toLowerCase();
    return adminToolPlayers.filter(player => {
      const matchesSearch = !normalizedSearch || player.playerName.toLowerCase().includes(normalizedSearch);
      const matchesPosition = adminToolPosition === 'ALL' || player.position === adminToolPosition;
      return matchesSearch && matchesPosition && !draftPlayerIdSet.has(String(player.playerId));
    });
  }, [adminToolPlayers, adminToolSearch, adminToolPosition, draftPlayerIdSet]);

  const updateDraftPlayers = async (nextPlayers, nextResults = draft?.results || [], nextBidLog = draft?.bidLog || []) => {
    if (!draft?._id) return;
    setAdminToolSaving(true);
    setAdminToolError('');

    try {
      const patchRes = await fetch(`/api/admin/drafts/${draft._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          players: nextPlayers.map(player => normalizeDraftPlayer(player)),
          results: nextResults,
          bidLog: nextBidLog
        })
      });

      if (!patchRes.ok) {
        throw new Error(await patchRes.text());
      }

      const updatedDraft = await patchRes.json();
      setDraft(updatedDraft);
      setSuccess('Player pool updated.');
    } catch (err) {
      setAdminToolError(err.message || 'Failed to update the player pool.');
    } finally {
      setAdminToolSaving(false);
    }
  };

  const handleAdminAddPlayer = async (player) => {
    if (!draft) return;
    if (draftPlayerIdSet.has(String(player.playerId))) return;

    const startDelay = Number(adminToolStartDelays[player.playerId] ?? 0);
    const nextPlayers = [
      ...(draft.players || []).map(existing => normalizeDraftPlayer(existing)),
      normalizeDraftPlayer({ ...player, startDelay, status: 'UPCOMING' }, startDelay)
    ];
    await updateDraftPlayers(nextPlayers);
  };

  const handleAdminRemovePlayer = async (player) => {
    if (!draft) return;

    const hasExistingBids = (draft.results || []).some(result => String(result.playerId) === String(player.playerId))
      || (draft.bidLog || []).some(bid => String(bid.playerId) === String(player.playerId));

    if (hasExistingBids) {
      const confirmed = window.confirm(`Remove ${player.playerName} and clear all associated bids/results?`);
      if (!confirmed) return;
    }

    const nextPlayers = (draft.players || []).filter(existing => String(existing.playerId) !== String(player.playerId));
    const nextResults = (draft.results || []).filter(result => String(result.playerId) !== String(player.playerId));
    const nextBidLog = (draft.bidLog || []).filter(bid => String(bid.playerId) !== String(player.playerId));
    await updateDraftPlayers(nextPlayers, nextResults, nextBidLog);
  };

  const handleAdminUpdateSchedule = async () => {
    if (!draft?._id) return;

    const draftTimeZone = getDraftTimeZone(draft);
    const nextStartDate = adminToolStartDate ? fromZonedTime(adminToolStartDate, draftTimeZone).toISOString() : '';
    const nextEndDate = adminToolEndDate ? fromZonedTime(adminToolEndDate, draftTimeZone).toISOString() : '';

    if (!nextStartDate || Number.isNaN(new Date(nextStartDate).getTime())) {
      setAdminToolError('Please provide a valid draft start time.');
      return;
    }

    if (!nextEndDate || Number.isNaN(new Date(nextEndDate).getTime())) {
      setAdminToolError('Please provide a valid draft end time.');
      return;
    }

    if (new Date(nextEndDate) <= new Date(nextStartDate)) {
      setAdminToolError('Draft end time must be after the start time.');
      return;
    }

    setAdminToolSaving(true);
    setAdminToolError('');

    try {
        const nextNomDuration = Math.round((new Date(nextEndDate).getTime() - new Date(nextStartDate).getTime()) / 60000);

      const patchRes = await fetch(`/api/admin/drafts/${draft._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: nextStartDate,
          endDate: nextEndDate,
            nomDuration: nextNomDuration,
        })
      });

      if (!patchRes.ok) {
        throw new Error(await patchRes.text());
      }

      const updatedDraft = await patchRes.json();
      setDraft(updatedDraft);
      setSuccess('Draft schedule updated.');
    } catch (err) {
      setAdminToolError(err.message || 'Failed to update the draft schedule.');
    } finally {
      setAdminToolSaving(false);
    }
  };

  const filteredPlayers = React.useMemo(() => {
    if (!draft?.players) return [];
    return draft.players.filter(p => {
      let positionMatch = filterPosition === 'ALL' || p.position === filterPosition;
      let nameMatch = !searchName || p.playerName.toLowerCase().includes(searchName.toLowerCase());
      return positionMatch && nameMatch;
    });
  }, [draft?.players, draft?.startDate, draft?.nomDuration, filterPosition, searchName]);

  const sortedPlayers = React.useMemo(() => {
    const playersCopy = [...filteredPlayers];
    playersCopy.sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      if (sortConfig.key === 'highBid') {
        aValue = draft.results?.find(r => r.playerId === a.playerId)?.contractPoints ?? 0;
        bValue = draft.results?.find(r => r.playerId === b.playerId)?.contractPoints ?? 0;
      }
      if (sortConfig.key === 'highBidder') {
        aValue = draft.results?.find(r => r.playerId === a.playerId)?.username ?? '';
        bValue = draft.results?.find(r => r.playerId === b.playerId)?.username ?? '';
      }
      if (sortConfig.key === 'startDate') {
        aValue = getPlayerStartTime(draft.startDate, a.startDelay, getDraftTimeZone(draft));
        bValue = getPlayerStartTime(draft.startDate, b.startDelay, getDraftTimeZone(draft));
      }
      if (sortConfig.key === 'endDate') {
        const aResult = draft.results?.find(r => r.playerId === a.playerId);
        const bResult = draft.results?.find(r => r.playerId === b.playerId);
        const aContractPoints = aResult ? Number(aResult.contractPoints) : 0;
        const bContractPoints = bResult ? Number(bResult.contractPoints) : 0;
        aValue = getPlayerEndTime(draft.startDate, a.startDelay, draft.nomDuration, aContractPoints, draft.bidLog, a.playerId, draft.blind, getDraftTimeZone(draft), draft.endDate);
        bValue = getPlayerEndTime(draft.startDate, b.startDelay, draft.nomDuration, bContractPoints, draft.bidLog, b.playerId, draft.blind, getDraftTimeZone(draft), draft.endDate);
      }
      if (sortConfig.key === 'countdown') {
        const now = getCurrentTime();
        const aResult = draft.results?.find(r => r.playerId === a.playerId);
        const bResult = draft.results?.find(r => r.playerId === b.playerId);
        const aContractPoints = aResult ? Number(aResult.contractPoints) : 0;
        const bContractPoints = bResult ? Number(bResult.contractPoints) : 0;
        const aEnd = getPlayerEndTime(draft.startDate, a.startDelay, draft.nomDuration, aContractPoints, draft.bidLog, a.playerId, draft.blind, getDraftTimeZone(draft), draft.endDate);
        const bEnd = getPlayerEndTime(draft.startDate, b.startDelay, draft.nomDuration, bContractPoints, draft.bidLog, b.playerId, draft.blind, getDraftTimeZone(draft), draft.endDate);
        aValue = aEnd - now;
        bValue = bEnd - now;
      }
      if (sortConfig.key === 'ktc') {
        aValue = Number(a.ktc) || 0;
        bValue = Number(b.ktc) || 0;
      }

      // For dates, compare as numbers
      if (aValue instanceof Date && bValue instanceof Date) {
        aValue = aValue.getTime();
        bValue = bValue.getTime();
      }

      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return playersCopy;
  }, [filteredPlayers, draft?.results, sortConfig, draft?.startDate, draft?.endDate, draft?.nomDuration, draft?.bidLog, draft?.blind]);

  const groupedPlayers = React.useMemo(() => {
    if (!sortedPlayers) return { Active: [], Upcoming: [], Ended: [] };
    const now = getCurrentTime();
    const draftTimeZone = getDraftTimeZone(draft);
    const groups = { Active: [], Upcoming: [], Ended: [] };
    sortedPlayers.forEach(p => {
      const result = draft.results?.find(r => r.playerId === p.playerId);
      const contractPoints = result ? Number(result.contractPoints) : 0;
      const start = getPlayerStartTime(draft.startDate, p.startDelay, draftTimeZone);
      const end = getPlayerEndTime(draft.startDate, p.startDelay, draft.nomDuration, contractPoints, draft.bidLog, p.playerId, draft.blind, draftTimeZone, draft.endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        groups.Ended.push(p);
      } else if (now < start) {
        groups.Upcoming.push(p);
      } else if (now >= start && now < end) {
        groups.Active.push(p);
      } else {
        groups.Ended.push(p);
      }
    });
    return groups;
  }, [sortedPlayers, draft?.startDate, draft?.endDate, draft?.nomDuration, draft?.results, draft?.bidLog, draft?.blind]);

  const visiblePlayers = React.useMemo(
    () => ['Active', 'Upcoming', 'Ended'].flatMap(group => groupedPlayers[group] || []),
    [groupedPlayers]
  );

  const resetPlayerBid = async (playerId) => {
    const updatedResults = draft.results.filter(r => r.playerId !== playerId);
    const updatedBidLog = (draft.bidLog || []).filter(b => b.playerId !== playerId);
    await fetch(`/api/admin/drafts/${draft._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: updatedResults, bidLog: updatedBidLog }),
    });
    setResetConfirmId(null);
    await fetchDraft();
  };

  function handleSort(key) {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  }

  function buildPlayerView(player, forcedGroup = null) {
    if (!player) return null;

    const storedResult = draft.results?.find(r => String(r.playerId) === String(player.playerId));
    const blindOutcome = draft?.blind ? resolveBlindAuctionOutcome(player.playerId, draft.bidLog || []) : null;
    const storedContractScore = storedResult ? Number(storedResult.contractPoints) : 0;
    const draftTimeZone = getDraftTimeZone(draft);
    const playerStartTime = getPlayerStartTime(draft.startDate, player.startDelay, draftTimeZone);
    const playerEndTime = getPlayerEndTime(
      draft.startDate,
      player.startDelay,
      draft.nomDuration,
      storedContractScore,
      draft.bidLog,
      player.playerId,
      draft.blind,
      draftTimeZone,
      draft.endDate
    );
    const now = getCurrentTime();

    let group = forcedGroup;
    if (!group) {
      if (isNaN(playerStartTime.getTime()) || isNaN(playerEndTime.getTime())) {
        group = 'Ended';
      } else if (now < playerStartTime) {
        group = 'Upcoming';
      } else if (now >= playerStartTime && now < playerEndTime) {
        group = 'Active';
      } else {
        group = 'Ended';
      }
    }

    const resolvedBlindResult = draft?.blind && group === 'Ended' && blindOutcome?.leaders.length === 1
      ? blindOutcome.leaders[0]
      : null;
    const result = resolvedBlindResult || storedResult;
    const salary = result ? Number(result.salary) : 0;
    const years = result ? Number(result.years) : null;
    const contractScore = draft?.blind && group === 'Ended'
      ? blindOutcome?.topScore ?? null
      : result
      ? Number(result.contractPoints)
      : null;

    const alreadyRosteredByUser = userHasActiveContractWithPlayer(session, activeContractsByTeam, player.playerId);
    const canBid =
      now > playerStartTime &&
      now < playerEndTime &&
      (countdown === 'Auction Started!' || countdown === '') &&
      isUserInDraft(session, draft) &&
      !alreadyRosteredByUser;

    const userBids = (draft.bidLog || []).filter(
      bid => String(bid.playerId) === String(player.playerId) && bid.username === session?.user?.name
    );
    const userLastBid = userBids.length > 0
      ? userBids.reduce((latest, bid) =>
          !latest || new Date(bid.timestamp) > new Date(latest.timestamp) ? bid : latest,
          null
        )
      : null;

    return {
      player,
      result,
      salary,
      contractScore,
      years,
      blindOutcome,
      hasBlindTie: Boolean(draft?.blind && group === 'Ended' && blindOutcome?.isTie),
      hasBlindBids: Boolean(draft?.blind && blindOutcome?.leaders.length),
      draftTimeZone,
      playerStartTime,
      playerEndTime,
      group,
      groupLabel: group === 'Ended' ? 'Final' : group,
      theme: getGroupTheme(group),
      alreadyRosteredByUser,
      canBid,
      isUserHighBidder: Boolean(result && session?.user?.name && result.username === session.user.name),
      userLastBid,
      bidCount: (draft.bidLog || []).filter(bid => String(bid.playerId) === String(player.playerId)).length,
      countdownLabel: group === 'Ended' ? 'Closed' : group === 'Upcoming' ? 'Starts in' : 'Time left',
      actionLabel: alreadyRosteredByUser
        ? 'Already rostered'
        : group === 'Ended'
        ? 'Auction closed'
        : group === 'Upcoming'
        ? 'Not live yet'
        : isUserInDraft(session, draft)
        ? 'Select to bid'
        : 'View only',
    };
  }

  function PlayerListEntry({ player, group }) {
    const view = buildPlayerView(player, group);
    const isSelected = String(selectedPlayer?.playerId) === String(player.playerId);
    const scoreTileLabel = draft?.blind
      ? view.group === 'Ended'
        ? 'Final'
        : view.userLastBid
        ? 'Your bid'
        : 'Status'
      : 'Score';
    const scoreTileValue = draft?.blind
      ? view.group === 'Ended'
        ? view.contractScore ?? '—'
        : view.userLastBid
        ? view.userLastBid.contractPoints
        : '—'
      : view.result
      ? view.contractScore
      : '—';
    const contractLine = draft?.blind
      ? view.group === 'Ended'
        ? view.hasBlindTie
          ? `Tie at ${view.contractScore}`
          : view.result
          ? `$${view.result.salary} / ${view.result.years}y`
          : view.hasBlindBids
          ? `Top score ${view.contractScore}`
          : 'No bids'
        : view.userLastBid
        ? `$${view.userLastBid.salary} / ${view.userLastBid.years}y`
        : 'Blind market active'
      : view.result
      ? `$${view.salary} / ${view.years}y`
      : 'No bids yet';

    return (
      <button
        type="button"
        onClick={() => {
          setShowConfirm(false);
          setResetConfirmId(null);
          if (String(selectedPlayer?.playerId) !== String(player.playerId)) {
            setBidSalary('');
            setBidYears('');
          }
          setSelectedPlayer(player);
        }}
        className={cn(
          'group relative w-full overflow-hidden rounded-[20px] border px-3 py-3 text-left transition-all duration-150',
          isSelected
            ? 'border-[#FFB800]/60 bg-[linear-gradient(90deg,rgba(255,184,0,0.2),rgba(255,184,0,0.06)_18%,rgba(19,40,56,0.9)_52%,rgba(11,23,34,0.98)_100%)] shadow-[0_14px_38px_rgba(0,0,0,0.34)] ring-1 ring-[#FFB800]/35'
            : 'border-white/10 bg-[linear-gradient(90deg,rgba(18,38,53,0.92),rgba(10,21,33,0.98))] hover:border-white/20 hover:bg-[#102638] ring-1 ring-white/5',
          view.isUserHighBidder && !draft?.blind ? 'shadow-[0_0_0_1px_rgba(252,211,77,0.28)]' : ''
        )}
      >
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-1.5',
            view.group === 'Active'
              ? 'bg-gradient-to-b from-emerald-300 via-emerald-400 to-emerald-500'
              : view.group === 'Upcoming'
              ? 'bg-gradient-to-b from-sky-300 via-sky-400 to-sky-500'
              : 'bg-gradient-to-b from-slate-300 via-slate-200 to-slate-400'
          )}
        />
        <div className="relative flex items-center gap-3 pl-2">
          <div className="min-w-[74px] rounded-[16px] border border-white/10 bg-[#08111f]/95 px-2.5 py-2.5 text-center shadow-lg shadow-black/20">
            <div className="text-[9px] uppercase tracking-[0.22em] text-white/40">{scoreTileLabel}</div>
            <div className="mt-1.5 font-mono text-2xl font-bold leading-none text-[#4dd9ff]">{scoreTileValue}</div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em]', view.theme.pill)}>
                {view.groupLabel}
              </span>
              <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-white/75">
                {player.position}
              </span>
              {view.isUserHighBidder && !draft?.blind ? (
                <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-amber-100">
                  Leading
                </span>
              ) : null}
            </div>

            <div className="mt-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[17px] font-semibold leading-tight tracking-tight text-white">{player.playerName}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-white/45">
                  <span>KTC {player.ktc || '-'}</span>
                  {Number(player.startDelay || 0) > 0 ? <span>Starts +{Number(player.startDelay || 0)}h</span> : null}
                  {draft?.blind && view.group !== 'Ended' ? null : (
                  <span>{contractLine}</span>
                  )}
                </div>
              </div>

              <div className="min-w-[88px] text-right">
                <div className="text-[9px] uppercase tracking-[0.22em] text-white/35">{view.countdownLabel}</div>
                <div className="mt-1.5 text-[13px] font-semibold text-white">{playerCountdowns[player.playerId] ?? <span className="text-white/35">—</span>}</div>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 text-[11px]">
              <div className="flex flex-wrap items-center gap-2 text-white/50">
                {draft?.blind ? (
                  view.group === 'Ended' ? (
                    <span>
                      {view.hasBlindTie
                        ? `Tie: ${view.blindOutcome.leaders.map(bid => bid.username).join(', ')}`
                        : view.result
                        ? `Winner: ${view.result.username}`
                        : 'Closed with no bids'}
                    </span>
                  ) : view.userLastBid ? (
                    <span>Your last update {formatTimeAgo(view.userLastBid.timestamp)}</span>
                  ) : (
                    <span>Blind bidding in progress</span>
                  )
                ) : (
                  <span>{view.result ? `Leader: ${view.result.username}` : 'No leader yet'}</span>
                )}
              </div>
              {!draft?.blind && (
                <div className="flex items-center gap-2 text-white/35">
                  <span>{view.bidCount} bid{view.bidCount === 1 ? '' : 's'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </button>
    );
  }

  useEffect(() => {
    if (!visiblePlayers.length) {
      if (selectedPlayer) {
        setSelectedPlayer(null);
        setBidSalary('');
        setBidYears('');
        setShowConfirm(false);
      }
      return;
    }

    const matchingPlayer = visiblePlayers.find(
      player => String(player.playerId) === String(selectedPlayer?.playerId)
    );

    if (!matchingPlayer) {
      setSelectedPlayer(visiblePlayers[0]);
      setBidSalary('');
      setBidYears('');
      setShowConfirm(false);
      return;
    }

    if (matchingPlayer !== selectedPlayer) {
      setSelectedPlayer(matchingPlayer);
    }
  }, [visiblePlayers, selectedPlayer]);

  // Prefill bidSalary and bidYears when a player is selected
  useEffect(() => {
    if (!selectedPlayer) return;
    // Only set defaults if both fields are empty (i.e., modal just opened)
    if (bidSalary !== '' || bidYears !== '') return;

    if (draft?.blind) {
      const userBids = (draft.bidLog || []).filter(
        b => b.playerId === selectedPlayer.playerId && b.username === session?.user?.name
      );
      if (userBids.length > 0) {
        const userLastBid = userBids.reduce((latest, b) =>
          !latest || new Date(b.timestamp) > new Date(latest.timestamp) ? b : latest,
          null
        );
        setBidSalary(String(userLastBid.salary ?? '1'));
        setBidYears(String(userLastBid.years ?? '1'));
      } else {
        setBidSalary('1');
        setBidYears('1');
      }
    } else {
      const result = draft.results.find(r => r.playerId === selectedPlayer.playerId);
      if (result) {
        setBidSalary(String(result.salary ?? ''));
        setBidYears(String(result.years ?? ''));
      } else {
        setBidSalary('');
        setBidYears('');
      }
    }
  }, [selectedPlayer, draft?.blind, draft?.results, draft?.bidLog, session?.user?.name, bidSalary, bidYears]);

  function formatCountdown(ms) {
    if (ms <= 0) return '';
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / (60 * 60 * 24));
    const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const timeStr = `${hours.toString().padStart(2, '0')}:` +
      `${minutes.toString().padStart(2, '0')}:` +
      `${seconds.toString().padStart(2, '0')}`;
    return days > 0
      ? (
          <>
            {days} Days<br />{timeStr}
          </>
        )
      : timeStr;
  }

  function formatTimeAgo(dateString) {
    if (!dateString) return '';
    const now = new Date();
    const date = new Date(dateString);
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return `${diff} second${diff !== 1 ? 's' : ''} ago`;
    if (diff < 3600) {
      const min = Math.floor(diff / 60);
      return `${min} minute${min !== 1 ? 's' : ''} ago`;
    }
    if (diff < 86400) {
      const hr = Math.floor(diff / 3600);
      return `${hr} hour${hr !== 1 ? 's' : ''} ago`;
    }
    const days = Math.floor(diff / 86400);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const filteredBidLog = React.useMemo(() => {
    if (!draft?.bidLog) return [];
    const filtered = draft.bidLog.filter(bid => {
      const player = draft.players?.find(p => String(p.playerId) === String(bid.playerId));
      const playerName = player ? player.playerName : '';
      const matchesName = !bidLogSearch || playerName.toLowerCase().includes(bidLogSearch.toLowerCase());
      const matchesBidder = bidLogBidder === 'ALL' || bid.username === bidLogBidder;
      return matchesName && matchesBidder;
    });
    // Sort newest -> oldest by timestamp
    return filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [draft?.bidLog, draft?.players, bidLogSearch, bidLogBidder]);

  const bidLogBidders = React.useMemo(
    () => Array.from(new Set((draft?.bidLog || []).map(bid => bid.username))).sort((a, b) => a.localeCompare(b)),
    [draft?.bidLog]
  );
  const selectedPlayerBidActivity = React.useMemo(() => {
    if (!selectedPlayer?.playerId || !draft?.bidLog) return [];
    return (draft.bidLog || [])
      .filter(bid => String(bid.playerId) === String(selectedPlayer.playerId))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [draft?.bidLog, selectedPlayer?.playerId]);

  const totalPlayers = draft?.players?.length ?? 0;
  const filteredPlayerCount = sortedPlayers.length;
  const totalTeams = draft?.users?.length ?? 0;
  const availablePositions = React.useMemo(
    () => Array.from(new Set(draft?.players?.map(player => player.position) ?? [])).sort(),
    [draft?.players]
  );
  const auctionStarted = countdown === 'Auction Started!' || countdown === '';
  const draftTimeZone = getDraftTimeZone(draft);
  const currentUserCap = capTeams.find(team => team.team === session?.user?.name) || null;
  const phaseSummary = {
    Active: groupedPlayers.Active.length,
    Upcoming: groupedPlayers.Upcoming.length,
    Ended: groupedPlayers.Ended.length,
  };
  const selectedPlayerView = buildPlayerView(selectedPlayer);
  const selectedBidScore = bidSalary && bidYears ? calculateContractScore(bidSalary, bidYears) : null;
  const selectedBidRows = React.useMemo(() => {
    const weights = [1, 0.8, 0.6, 0.4];
    const activeYears = Number(bidYears || 0);

    if (!bidSalary) {
      return weights.map((weight, index) => ({
        year: index + 1,
        salary: null,
        percent: `${weight * 100}%`,
        score: null,
        active: false,
      }));
    }

    const yearOneSalary = Number(bidSalary);
    const yearTwoSalary = Math.ceil(yearOneSalary * 1.1 * 10) / 10;
    const yearThreeSalary = Math.ceil(yearTwoSalary * 1.1 * 10) / 10;
    const yearFourSalary = Math.ceil(yearThreeSalary * 1.1 * 10) / 10;
    const salaries = [yearOneSalary, yearTwoSalary, yearThreeSalary, yearFourSalary];

    return salaries.map((salary, index) => ({
      year: index + 1,
      salary,
      percent: `${weights[index] * 100}%`,
      score: index < activeYears ? salary * weights[index] : null,
      active: index < activeYears,
    }));
  }, [bidSalary, bidYears]);

  const auctionStatus = !draft
    ? 'No active auction'
    : !draft?.startDate
    ? 'Schedule pending'
    : auctionStarted
    ? 'Auction live'
    : 'Pre-auction';

  if (status === 'loading') return null;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#001A2B] px-4 py-10 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[70vh] max-w-4xl items-center justify-center">
          <div className="w-full rounded-[32px] border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl shadow-black/20 backdrop-blur-sm">
            <div className="mx-auto h-12 w-12 animate-pulse rounded-full border border-[#FF4B1F]/40 bg-[#FF4B1F]/20" />
            <h1 className="mt-6 text-2xl font-semibold">Loading auction board</h1>
            <p className="mt-2 text-sm text-white/60">Fetching the latest draft, timers, and bids.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!draft) {
    return (
      <main className="min-h-screen bg-[#001A2B] px-4 py-10 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[70vh] max-w-4xl items-center justify-center">
          <div className="w-full rounded-[32px] border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl shadow-black/20 backdrop-blur-sm">
            <div className="text-[11px] uppercase tracking-[0.3em] text-white/45">Free Agent Auction</div>
            <h1 className="mt-4 text-3xl font-semibold">No active draft found</h1>
            <p className="mt-3 text-sm text-white/60">Start or activate a draft from the admin tools to populate the live auction experience.</p>
          </div>
        </div>
      </main>
    );
  }

  if (isPortraitDevice) {
    return (
      <main className="min-h-screen bg-[#001A2B] px-4 py-10 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center">
          <div className="w-full rounded-[32px] border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl shadow-black/20 backdrop-blur-sm">
            <div className="text-[11px] uppercase tracking-[0.3em] text-white/45">Free Agent Auction</div>
            <h1 className="mt-4 text-3xl font-semibold">Rotate your device</h1>
            <p className="mt-3 text-sm text-white/60">
              This page is designed for a landscape layout. Rotate your device to continue using the auction board.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#001A2B] text-white">
      <div className="relative isolate overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,75,31,0.22),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.18),_transparent_30%),linear-gradient(180deg,_rgba(2,6,23,0.45),_rgba(2,6,23,0.12))]" />
        <div className="relative mx-auto max-w-[1700px] px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 backdrop-blur-sm sm:p-6">
            <div className={cn('grid gap-6 xl:items-start', auctionStarted ? 'xl:grid-cols-1' : 'xl:grid-cols-[minmax(0,1.5fr)_minmax(420px,0.9fr)]')}>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                    <img src="/logo.png" alt="BBB League" className="h-8 w-8 object-contain" />
                  </div>
                  <span className={cn('inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]', draft?.blind ? 'border-violet-400/30 bg-violet-500/15 text-violet-200' : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200')}>
                    {draft?.blind ? 'Blind auction' : 'Open auction'}
                  </span>
                  <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
                    {auctionStatus}
                  </span>
                </div>

                <div className="mt-5">
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Free Agent Auction</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/62">
                    Scan the board, lock onto a target, and work the contract panel without leaving the market view.
                  </p>
                </div>
              </div>

              {!auctionStarted && (
                <div className="rounded-[26px] border border-white/10 bg-[#020817]/70 p-4 shadow-lg shadow-black/20">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.24em] text-white/45">
                        {auctionStarted ? 'Auction status' : 'Auction countdown'}
                      </div>
                      <div className="mt-2 text-3xl font-semibold tracking-tight text-white">
                        {auctionStarted ? 'Live now' : (countdown || 'Pending')}
                      </div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-white/55">
                      {draftTimeZone}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/62">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/42">Window</div>
                      <div className="mt-1.5">Start: {draft?.startDate ? formatDraftDateTime(draft.startDate, draftTimeZone) : '—'}</div>
                      <div className="mt-1">End: {draft?.endDate ? formatDraftDateTime(draft.endDate, draftTimeZone) : '—'}</div>
                    </div>
                    <div className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/62">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/42">Your room</div>
                      <div className="mt-1.5 text-xl font-semibold text-white">
                        {currentUserCap ? formatCapSpace(currentUserCap.curYear.remaining) : '—'}
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        {currentUserCap ? `Spend ${formatCapSpace(currentUserCap.spend || 0)}` : 'Open the cap table for league context.'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1700px] px-4 py-8 sm:px-6 lg:px-8">
        {success && (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {success}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(360px,0.62fr)_minmax(0,1.38fr)] xl:items-stretch 2xl:grid-cols-[minmax(380px,0.58fr)_minmax(0,1.42fr)]">
          <section className="xl:min-h-0">
            <div className="flex flex-col rounded-[30px] border border-white/10 bg-white/[0.04] p-3.5 shadow-xl shadow-black/10 backdrop-blur-sm sm:p-4 xl:h-[calc(100vh-15rem)] xl:min-h-[680px] xl:max-h-[calc(100vh-15rem)] xl:overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">Marketplace</div>
                  <h2 className="mt-1 text-2xl font-semibold">Player board</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBoardFiltersModal(true)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white/78 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4B1F]/30"
                  aria-label="Open filter and sort options"
                  title="Filter and sort"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="18" x2="20" y2="18" />
                    <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
                    <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
                    <circle cx="11" cy="18" r="2" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              </div>

              <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-[26px] border border-white/10 bg-[#020817]/72 p-2.5 xl:overflow-hidden">
                {filteredPlayerCount === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-white/10 px-6 py-14 text-center xl:flex-1 xl:place-content-center">
                    <div className="text-lg font-medium text-white">No players match the current filters</div>
                    <p className="mt-2 text-sm text-white/55">Try clearing the search or switching to another position group.</p>
                  </div>
                ) : (
                  <div className="space-y-4 overflow-auto pr-1 xl:h-full xl:min-h-0 xl:max-h-full">
                    {['Active', 'Upcoming', 'Ended'].map(group => (
                      groupedPlayers[group].length > 0 ? (
                        <div key={group} className="space-y-2.5">
                          <div className={cn('sticky top-0 z-10 rounded-2xl border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] backdrop-blur-sm', getGroupTheme(group).section)}>
                            {group === 'Ended' ? 'Final' : group} · {groupedPlayers[group].length}
                          </div>
                          <div className="space-y-2">
                            {groupedPlayers[group].map(player => (
                              <PlayerListEntry key={player.playerId} player={player} group={group} />
                            ))}
                          </div>
                        </div>
                      ) : null
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/10 backdrop-blur-sm sm:p-5">
              {selectedPlayerView ? (
                <>
                  <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(120deg,rgba(59,130,246,0.14),rgba(2,6,23,0.94)_28%,rgba(255,75,31,0.1)_100%)] shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
                    <div className="border-b border-white/10 px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]', selectedPlayerView.theme.pill)}>
                          {selectedPlayerView.groupLabel}
                        </span>
                        <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/75">
                          {selectedPlayer.position}
                        </span>
                        <span className="inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">
                          {draft?.blind ? 'Blind market' : 'Open market'}
                        </span>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1.15fr)_minmax(280px,0.95fr)] xl:items-stretch">
                        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(77,217,255,0.16),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-2.5 shadow-lg shadow-black/20">
                          <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/10 to-transparent" />
                          <div className="relative h-full min-h-[250px] overflow-hidden rounded-[20px] border border-white/10 bg-[#07101c]">
                            <Image
                              src={selectedPlayerImageSrc || getDefaultPlayerImage(selectedPlayer.position)}
                              alt={selectedPlayer.playerName}
                              fill
                              className="object-cover object-top"
                              sizes="(min-width: 1536px) 220px, (min-width: 1280px) 220px, 100vw"
                              unoptimized={String(selectedPlayerImageSrc || '').startsWith('http')}
                              onError={() => setSelectedPlayerImageSrc(getDefaultPlayerImage(selectedPlayer.position))}
                            />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#07101c] via-[#07101c]/40 to-transparent" />
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                              <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Player card</div>
                              <div className="mt-2 text-sm font-semibold text-white">{selectedPlayer.playerName}</div>
                              <div className="mt-1 text-xs text-white/55">{selectedPlayer.position} • BBB auction pool</div>
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0 rounded-[24px] border border-white/10 bg-black/20 px-4 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase tracking-[0.24em] text-white/45">Selected player</div>
                              <h2 className="mt-2 truncate text-3xl font-semibold tracking-tight text-white sm:text-[38px]">{selectedPlayer.playerName}</h2>
                            </div>
                            <div className="rounded-[18px] border border-cyan-300/20 bg-[#08111f]/95 px-4 py-3 text-center shadow-lg shadow-black/20">
                              <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/45">KTC</div>
                              <div className="mt-1.5 text-3xl font-semibold leading-none text-[#4dd9ff]">{selectedPlayer.ktc || '-'}</div>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/58">
                            <span>ID {selectedPlayer.playerId}</span>
                            {Number(selectedPlayer.startDelay || 0) > 0 ? <span>Starts +{Number(selectedPlayer.startDelay || 0)}h</span> : null}
                            {!draft?.blind ? <span>{selectedPlayerView.bidCount} total bid{selectedPlayerView.bidCount === 1 ? '' : 's'}</span> : null}
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            <div
                              className="rounded-[20px] border border-white/10 bg-[#08111f]/80 px-4 py-3.5"
                              title={
                                (selectedPlayerView.playerStartTime instanceof Date && !isNaN(selectedPlayerView.playerStartTime) && selectedPlayerView.playerEndTime instanceof Date && !isNaN(selectedPlayerView.playerEndTime))
                                  ? `Start: ${formatDraftDateTime(selectedPlayerView.playerStartTime, selectedPlayerView.draftTimeZone)}\nEnd: ${formatDraftDateTime(selectedPlayerView.playerEndTime, selectedPlayerView.draftTimeZone)}`
                                  : 'Invalid time'
                              }
                            >
                              <div className="text-[10px] uppercase tracking-[0.22em] text-white/42">{selectedPlayerView.countdownLabel}</div>
                              <div className="mt-2 text-[28px] font-semibold leading-none text-white">{playerCountdowns[selectedPlayer.playerId] ?? <span className="text-white/35">—</span>}</div>
                              <div className="mt-2 text-xs text-white/45">{draft?.blind ? 'Private until final reveal' : 'Public contest window'}</div>
                            </div>
                            <div className="rounded-[20px] border border-white/10 bg-[#08111f]/80 px-4 py-3.5">
                              <div className="text-[10px] uppercase tracking-[0.22em] text-white/42">Your room</div>
                              <div className="mt-2 text-[28px] font-semibold leading-none text-white">
                                {currentUserCap ? formatCapSpace(currentUserCap.curYear.remaining) : '—'}
                              </div>
                              <div className="mt-2 text-xs text-white/45">
                                {currentUserCap ? `Spend ${formatCapSpace(currentUserCap.spend || 0)}` : 'League cap table available in modal.'}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-4">
                          {!draft?.blind ? (
                            <>
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Current market</div>
                                  <div className="mt-2 text-2xl font-semibold text-white">
                                    {selectedPlayerView.result ? `$${selectedPlayerView.salary} / ${selectedPlayerView.years}y` : 'No bids yet'}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">Score</div>
                                  <div className="mt-2 font-mono text-3xl font-bold text-[#FFB800]">
                                    {selectedPlayerView.result ? selectedPlayerView.contractScore : '—'}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-4 rounded-[20px] border border-white/10 bg-[#08111f]/80 px-4 py-3.5">
                                <div className="text-[10px] uppercase tracking-[0.2em] text-white/42">Current leader</div>
                                <div className="mt-3">
                                  <TeamIdentity
                                    username={selectedPlayerView.result?.username ?? '-'}
                                    avatarId={selectedPlayerView.result?.username ? teamAvatars[selectedPlayerView.result.username] : null}
                                    size={11}
                                    subtitle={selectedPlayerView.result ? 'Top active offer' : 'No bids yet'}
                                  />
                                </div>
                              </div>
                            </>
                          ) : selectedPlayerView.group === 'Ended' ? (
                            <>
                              <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/65">{selectedPlayerView.hasBlindTie ? 'Final tie' : 'Final result'}</div>
                              <div className="mt-2 text-2xl font-semibold text-white">
                                {selectedPlayerView.hasBlindTie
                                  ? `Tie at ${selectedPlayerView.contractScore}`
                                  : selectedPlayerView.result
                                  ? `$${selectedPlayerView.result.salary} / ${selectedPlayerView.result.years}y`
                                  : 'Closed with no bids'}
                              </div>
                              <div className="mt-1 text-sm text-emerald-100/75">
                                {selectedPlayerView.hasBlindTie
                                  ? `${selectedPlayerView.blindOutcome.leaders.length} teams finished tied for the top score.`
                                  : selectedPlayerView.result
                                  ? `Winning score ${selectedPlayerView.contractScore}`
                                  : 'No winning contract was recorded.'}
                              </div>
                              {selectedPlayerView.hasBlindTie ? (
                                <div className="mt-4 rounded-[20px] border border-amber-400/20 bg-amber-500/10 p-3.5">
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    {selectedPlayerView.blindOutcome.leaders.map(bid => (
                                      <div key={`${bid.username}-${bid.playerId}`} className="rounded-[18px] border border-white/10 bg-[#08111f]/75 px-4 py-3">
                                        <TeamIdentity
                                          username={bid.username}
                                          avatarId={teamAvatars[bid.username]}
                                          size={11}
                                          subtitle={`$${bid.salary} / ${bid.years}y`}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : selectedPlayerView.result ? (
                                <div className="mt-4 rounded-[20px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3.5">
                                  <TeamIdentity
                                    username={selectedPlayerView.result.username}
                                    avatarId={teamAvatars[selectedPlayerView.result.username]}
                                    size={11}
                                    subtitle="Winning bidder"
                                  />
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Blind market</div>
                                  <div className="mt-2 text-xl font-semibold text-white">
                                    {selectedPlayerView.userLastBid ? 'Your offer is on file' : 'No personal bid yet'}
                                  </div>
                                </div>
                                {selectedPlayerView.userLastBid ? (
                                  <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/50">
                                    Updated {formatTimeAgo(selectedPlayerView.userLastBid.timestamp)}
                                  </div>
                                ) : null}
                              </div>
                              <div className="mt-3 text-sm text-white/58">
                                Competing bids stay hidden until the player closes. Your latest offer remains visible here.
                              </div>
                              {selectedPlayerView.userLastBid ? (
                                <div className="mt-4 rounded-[20px] border border-white/10 bg-[#08111f]/80 px-4 py-3.5">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/42">Your last bid</div>
                                      <div className="mt-2 font-mono text-2xl text-sky-200">${selectedPlayerView.userLastBid.salary} / {selectedPlayerView.userLastBid.years}y</div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/42">Score</div>
                                      <div className="mt-2 font-mono text-3xl font-bold text-[#FFB800]">{selectedPlayerView.userLastBid.contractPoints}</div>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(460px,1.1fr)]">
                    <div className="rounded-[26px] border border-white/10 bg-[#020817]/70 p-4 shadow-lg shadow-black/20">
                      <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.2em] text-white/42">Market activity</div>
                            <div className="mt-2 text-lg font-semibold text-white">
                              {draft?.blind
                                ? selectedPlayerView.group === 'Ended'
                                  ? `${selectedPlayerBidActivity.length} blind bid${selectedPlayerBidActivity.length === 1 ? '' : 's'} revealed`
                                  : 'Blind activity hidden'
                                : `${selectedPlayerBidActivity.length} logged bid${selectedPlayerBidActivity.length === 1 ? '' : 's'}`}
                            </div>
                          </div>
                          {(selectedPlayerBidActivity.length > 0 && (!draft?.blind || selectedPlayerView.group === 'Ended')) ? (
                            <div className="rounded-full border border-white/10 bg-[#08111f]/80 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/50">
                              Newest first
                            </div>
                          ) : null}
                        </div>

                        <p className="mt-1.5 text-sm text-white/55">
                          {draft?.blind
                            ? selectedPlayerView.group === 'Ended'
                              ? selectedPlayerView.hasBlindTie
                                ? `Top score ${selectedPlayerView.contractScore} shared by ${selectedPlayerView.blindOutcome.leaders.map(bid => bid.username).join(', ')}.`
                                : selectedPlayerView.result
                                ? `${selectedPlayerView.result.username} finished on top with a score of ${selectedPlayerView.contractScore}.`
                                : 'No blind bids were submitted for this player.'
                              : 'Competing activity and contract terms remain hidden until the player closes.'
                            : 'Scroll the full offer log for this player.'}
                        </p>

                        {draft?.blind && selectedPlayerView.group !== 'Ended' ? (
                          <div className="mt-4 rounded-[18px] border border-dashed border-white/10 px-4 py-6 text-sm text-white/50">
                            Blind activity will unlock here once this player reaches Final.
                          </div>
                        ) : selectedPlayerBidActivity.length > 0 ? (
                          <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                            {selectedPlayerBidActivity.map((bid, index) => (
                              <div key={`${bid.username}-${bid.timestamp}-${index}`} className="rounded-[18px] border border-white/10 bg-[#08111f]/72 px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <TeamIdentity
                                    username={bid.username}
                                    avatarId={teamAvatars[bid.username]}
                                    size={9}
                                    subtitle={formatTimeAgo(bid.timestamp)}
                                  />
                                  <div className="text-right">
                                    <div className="font-mono text-lg font-semibold text-sky-200">${bid.salary} / {bid.years}y</div>
                                    <div className="mt-1 text-xs text-[#FFB800]">Score {bid.contractPoints}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-[18px] border border-dashed border-white/10 px-4 py-6 text-sm text-white/50">
                            No bids have been logged for this player yet.
                          </div>
                        )}
                      </div>

                      {draft?.blind && selectedPlayerView.userLastBid && selectedPlayerView.group !== 'Ended' && (
                        <div className="mt-3 rounded-[20px] border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-yellow-100">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.2em] text-white/42">Your live blind offer</div>
                              <div className="mt-2 font-mono text-2xl text-sky-200">${selectedPlayerView.userLastBid.salary} / {selectedPlayerView.userLastBid.years}y</div>
                              <div className="mt-1 text-xs text-white/50">Score {selectedPlayerView.userLastBid.contractPoints} • Updated {formatTimeAgo(selectedPlayerView.userLastBid.timestamp)}</div>
                            </div>
                            <SurfaceButton tone="danger" className="sm:min-w-[150px]" onClick={() => setRetractConfirmPlayerId(selectedPlayer.playerId)}>
                              Cancel Bid
                            </SurfaceButton>
                          </div>
                        </div>
                      )}

                      {session?.user?.role === 'admin' && showResetButtons && (selectedPlayerView.result || selectedPlayerView.hasBlindBids) && (
                        <div className="mt-3 rounded-[20px] border border-red-400/20 bg-red-500/10 px-4 py-3.5 text-sm text-red-100">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.2em] text-red-100/60">Admin action</div>
                              <div className="mt-1 font-medium">Reset the selected player&apos;s market state</div>
                            </div>
                            <SurfaceButton tone="danger" onClick={() => setResetConfirmId(selectedPlayer.playerId)}>
                              Reset bid
                            </SurfaceButton>
                          </div>
                          {resetConfirmId === selectedPlayer.playerId && (
                            <div className="mt-4 rounded-2xl border border-red-400/20 bg-[#020817] p-3 text-xs text-red-100 shadow-xl shadow-black/30">
                              <div className="font-medium">Reset this player&apos;s bid?</div>
                              <div className="mt-1 text-red-100/70">This clears the active result and deletes that player&apos;s bid log.</div>
                              <div className="mt-3 flex gap-2">
                                <SurfaceButton tone="danger" className="flex-1 rounded-xl px-3 py-2 text-xs" onClick={() => resetPlayerBid(selectedPlayer.playerId)}>
                                  Reset
                                </SurfaceButton>
                                <SurfaceButton tone="ghost" className="flex-1 rounded-xl px-3 py-2 text-xs" onClick={() => setResetConfirmId(null)}>
                                  Cancel
                                </SurfaceButton>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="rounded-[26px] border border-white/10 bg-[#020817]/78 p-4 shadow-lg shadow-black/20">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Contract composer</div>
                          <h3 className="mt-1.5 text-xl font-semibold text-white">Build your offer</h3>
                          <p className="mt-1 text-sm text-white/55">
                            {draft?.blind
                              ? 'Blind offers stay private until the player closes.'
                              : 'Your contract score must top the current market.'}
                          </p>
                        </div>
                        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-white/55">
                          {selectedPlayerView.canBid ? 'Eligible now' : selectedPlayerView.actionLabel}
                        </div>
                      </div>

                      {selectedPlayerAlreadyRostered && (
                        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                          You already have this player on an active contract, so bidding is disabled.
                        </div>
                      )}

                      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
                        <div className="space-y-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Salary ($)</label>
                              <input
                                type="number"
                                min={1}
                                max={200}
                                step={0.1}
                                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#FF4B1F]/40 focus:ring-2 focus:ring-[#FF4B1F]/20 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="Enter salary"
                                value={bidSalary}
                                disabled={placingBid || !selectedPlayerView.canBid || selectedPlayerAlreadyRostered}
                                onChange={e => {
                                  const val = e.target.value.replace(/[^0-9.]/g, '');
                                  setBidSalary(val);
                                }}
                              />
                            </div>
                            <div>
                              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Years (1-4)</label>
                              <input
                                type="number"
                                min={1}
                                max={4}
                                step={1}
                                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#FF4B1F]/40 focus:ring-2 focus:ring-[#FF4B1F]/20 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="Enter years"
                                value={bidYears}
                                disabled={placingBid || !selectedPlayerView.canBid || selectedPlayerAlreadyRostered}
                                onChange={e => {
                                  const val = e.target.value.replace(/[^0-9]/g, '');
                                  if (['1', '2', '3', '4'].includes(val)) {
                                    setBidYears(val);
                                  } else if (val === '') {
                                    setBidYears('');
                                  }
                                }}
                              />
                            </div>
                          </div>

                          <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Score breakdown</div>
                              {!draft?.blind && (
                                <div className="text-xs text-white/45">Current high: {selectedPlayerView.result ? currentHighScore : '—'}</div>
                              )}
                            </div>
                            <div className="mt-3 overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="border-b border-white/10 text-left text-white/55">
                                    <th className="pb-2 pr-4 font-medium">Year</th>
                                    <th className="pb-2 pr-4 font-medium">Salary</th>
                                    <th className="pb-2 pr-4 font-medium">Weight</th>
                                    <th className="pb-2 font-medium">Score</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedBidRows.map(row => (
                                    <tr key={row.year} className="border-b border-white/5 last:border-0">
                                      <td className="py-2 pr-4">Year {row.year}</td>
                                      <td className="py-2 pr-4">{row.salary == null ? <span className="text-white/35">—</span> : `$${row.salary.toFixed(1)}`}</td>
                                      <td className="py-2 pr-4">{row.percent}</td>
                                      <td className="py-2">{row.score == null ? <span className="text-white/35">—</span> : row.score.toFixed(1)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
                            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Contract score</div>
                            <div className="mt-3 text-4xl font-semibold text-[#FFB800]">{selectedBidScore ?? '-'}</div>
                            {!draft?.blind && (
                              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/65">
                                <div><span className="text-white/45">Current high bid</span><br />{selectedPlayerView.result ? `$${currentHighSalary} / ${currentHighYears}y` : 'No bids yet'}</div>
                                <div className="mt-3"><span className="text-white/45">Current contract score</span><br />{selectedPlayerView.result ? currentHighScore : '—'}</div>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-3">
                            <SurfaceButton
                              className="w-full"
                              onClick={handleBid}
                              disabled={placingBid || !bidSalary || !bidYears || !selectedPlayerView.canBid || selectedPlayerAlreadyRostered}
                            >
                              {placingBid ? 'Placing bid…' : 'Place bid'}
                            </SurfaceButton>
                            <SurfaceButton
                              tone="ghost"
                              className="w-full"
                              onClick={() => {
                                setBidSalary('');
                                setBidYears('');
                                setShowConfirm(false);
                              }}
                              disabled={placingBid}
                            >
                              Clear inputs
                            </SurfaceButton>
                          </div>
                        </div>
                      </div>

                      {!draft?.blind && showConfirm && (
                        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                          Your bid is {selectedBidScore - currentHighScore} above the current high contract score.
                          <div className="mt-3 flex gap-2">
                            <SurfaceButton tone="yellow" className="flex-1" onClick={() => handleBid()} disabled={placingBid || selectedPlayerAlreadyRostered}>
                              Yes, place bid
                            </SurfaceButton>
                            <SurfaceButton tone="ghost" className="flex-1" onClick={() => setShowConfirm(false)} disabled={placingBid}>
                              Cancel
                            </SurfaceButton>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-[28px] border border-dashed border-white/10 px-6 py-20 text-center text-white/55">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">Selection pending</div>
                  <div className="mt-3 text-2xl font-semibold text-white">Choose a player from the board</div>
                  <p className="mt-2 text-sm text-white/55">The right panel will show their market details, current offer, and bidding controls.</p>
                </div>
              )}
            </div>

          </aside>
        </div>

        <div className="mt-8 rounded-[26px] border border-white/10 bg-[#020817]/72 p-4 shadow-lg shadow-black/20">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Auction actions</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SurfaceButton className="w-full" onClick={() => setShowCapModal(true)}>View cap space</SurfaceButton>
              <SurfaceButton className="w-full" tone="ghost" onClick={() => setShowBidLogModal(true)}>View bid log</SurfaceButton>
              {isAdmin && (
                <SurfaceButton className="w-full" tone="purple" onClick={() => setShowAdminToolsModal(true)}>Admin tools</SurfaceButton>
              )}
              {session?.user?.role === 'admin' && (
                <SurfaceButton className="w-full" tone={showResetButtons ? 'yellow' : 'ghost'} onClick={() => setShowResetButtons(v => !v)}>
                  {showResetButtons ? 'Hide reset buttons' : 'Show reset buttons'}
                </SurfaceButton>
              )}
            </div>
          </div>
        </div>
      </div>

      {showBoardFiltersModal && (
        <ModalShell
          title="Board filters"
          subtitle="Search the player pool, narrow positions, and change the board order without crowding the main rail."
          onClose={() => setShowBoardFiltersModal(false)}
          maxWidth="max-w-3xl"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="boardFilterSearchName" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Search player</label>
              <input
                id="boardFilterSearchName"
                type="text"
                value={searchName}
                onChange={e => setSearchName(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#FF4B1F]/40 focus:ring-2 focus:ring-[#FF4B1F]/20"
                placeholder="Type a name..."
              />
            </div>

            <div>
              <label htmlFor="boardFilterPosition" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Position</label>
              <select
                id="boardFilterPosition"
                value={filterPosition}
                onChange={e => setFilterPosition(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#FF4B1F]/40 focus:ring-2 focus:ring-[#FF4B1F]/20"
              >
                <option value="ALL">All positions</option>
                {availablePositions.map(pos => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="boardFilterSort" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Sort by</label>
              <select
                id="boardFilterSort"
                value={sortConfig.key}
                onChange={e => setSortConfig({ key: e.target.value, direction: 'asc' })}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#FF4B1F]/40 focus:ring-2 focus:ring-[#FF4B1F]/20"
              >
                <option value="countdown">Time Remaining</option>
                <option value="playerName">Player</option>
                <option value="position">Position</option>
                <option value="ktc">KTC</option>
                {!draft?.blind && <option value="highBid">Bid Value</option>}
                {!draft?.blind && <option value="highBidder">High bidder</option>}
              </select>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Direction</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SurfaceButton
                tone={sortConfig.direction === 'asc' ? 'orange' : 'ghost'}
                className="w-full"
                onClick={() => setSortConfig(prev => ({ ...prev, direction: 'asc' }))}
              >
                Ascending
              </SurfaceButton>
              <SurfaceButton
                tone={sortConfig.direction === 'desc' ? 'orange' : 'ghost'}
                className="w-full"
                onClick={() => setSortConfig(prev => ({ ...prev, direction: 'desc' }))}
              >
                Descending
              </SurfaceButton>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-white/55">
              {filteredPlayerCount} player{filteredPlayerCount === 1 ? '' : 's'} currently match these settings.
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <SurfaceButton
                tone="ghost"
                onClick={() => {
                  setSearchName('');
                  setFilterPosition('ALL');
                  setSortConfig({ key: 'countdown', direction: 'asc' });
                }}
              >
                Reset filters
              </SurfaceButton>
              <SurfaceButton onClick={() => setShowBoardFiltersModal(false)}>
                Done
              </SurfaceButton>
            </div>
          </div>
        </ModalShell>
      )}

      {showCapModal && (
        <ModalShell
          title="Cap Space"
          subtitle="Current year cap room across the league, with spend visibility respecting blind-auction rules."
          onClose={() => setShowCapModal(false)}
          maxWidth="max-w-4xl"
        >
          <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-black/20">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-left text-white/70">
                  <th className="px-4 py-3 font-semibold">Team</th>
                  <th className="px-4 py-3 font-semibold">Cap Space</th>
                  {(!draft?.blind || capTeams.some(team => session?.user?.name === team.team)) && (
                    <th className="px-4 py-3 font-semibold">Spend</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {capTeams
                  .slice()
                  .sort((a, b) => a.team.localeCompare(b.team))
                  .map((team, idx) => {
                    const isActiveUser = session?.user?.name === team.team;
                    return (
                      <tr key={team.team || idx} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                        <td className="px-4 py-3">
                          <TeamIdentity username={team.team} avatarId={teamAvatars[team.team]} size={11} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('text-sm font-semibold', getCapSpaceColor(team.curYear.remaining))}>{formatCapSpace(team.curYear.remaining)}</span>
                        </td>
                        {(!draft?.blind || isActiveUser) && (
                          <td className="px-4 py-3 text-right text-white/75">{formatCapSpace(team.spend || 0)}</td>
                        )}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </ModalShell>
      )}

      {showBidLogModal && (
        <ModalShell
          title="Bid Log"
          subtitle={draft.blind ? 'Blind-auction privacy is still enforced here.' : 'Review the most recent offers, filtered by player or bidder.'}
          onClose={() => setShowBidLogModal(false)}
          maxWidth="max-w-5xl"
        >
          {draft.blind ? (
            <div className="rounded-[24px] border border-white/10 bg-black/20 px-6 py-14 text-center text-sm text-white/55">
              All bids and bidders are hidden for this draft until each player reaches Final.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
                <input
                  type="text"
                  value={bidLogSearch}
                  onChange={(e) => setBidLogSearch(e.target.value)}
                  placeholder="Filter by player name"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#FF4B1F]/40 focus:ring-2 focus:ring-[#FF4B1F]/20"
                />
                <select
                  value={bidLogBidder}
                  onChange={(e) => setBidLogBidder(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#FF4B1F]/40 focus:ring-2 focus:ring-[#FF4B1F]/20"
                >
                  <option value="ALL">All bidders</option>
                  {bidLogBidders.map(bidder => (
                    <option key={bidder} value={bidder}>{bidder}</option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-black/20">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5 text-left text-white/70">
                      <th className="px-4 py-3 font-semibold">Player</th>
                      <th className="px-4 py-3 font-semibold">Bidder</th>
                      <th className="px-4 py-3 font-semibold">Contract</th>
                      <th className="px-4 py-3 font-semibold">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBidLog.length > 0 ? (
                      filteredBidLog.map((bid, idx) => {
                        const player = draft.players?.find(p => String(p.playerId) === String(bid.playerId));
                        return (
                          <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                            <td className="px-4 py-3 font-medium text-white">{player ? player.playerName : 'Unknown'}</td>
                            <td className="px-4 py-3">
                              <TeamIdentity username={bid.username} avatarId={teamAvatars[bid.username]} size={8} />
                            </td>
                            <td className="px-4 py-3 font-mono text-white/80">
                              ${bid.salary} / {bid.years}y
                              <div className="mt-1 text-xs text-sky-200">Score: {bid.contractPoints}</div>
                            </td>
                            <td className="px-4 py-3 text-white/45">{formatTimeAgo(bid.timestamp)}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-white/50">No bids match the current filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ModalShell>
      )}

      {showAdminToolsModal && isAdmin && (
        <ModalShell
          title="Admin Tools"
          subtitle="Update the schedule and manage the live auction player pool without leaving the board."
          onClose={() => setShowAdminToolsModal(false)}
          maxWidth="max-w-7xl"
        >
          {adminToolError && (
            <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {adminToolError}
            </div>
          )}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="space-y-6">
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Draft schedule</div>
                    <h3 className="mt-2 text-lg font-semibold">Timing controls</h3>
                    <p className="mt-1 text-sm text-white/55">All edits use {getDraftTimeZone(draft)} and update the active draft in-place.</p>
                  </div>
                  <SurfaceButton tone="blue" onClick={handleAdminUpdateSchedule} disabled={adminToolSaving}>
                    {adminToolSaving ? 'Saving…' : 'Save schedule'}
                  </SurfaceButton>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Start time</label>
                    <input
                      type="datetime-local"
                      value={adminToolStartDate}
                      onChange={(e) => setAdminToolStartDate(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-[#020817]/70 px-4 py-3 text-white outline-none transition focus:border-[#FF4B1F]/40 focus:ring-2 focus:ring-[#FF4B1F]/20"
                    />
                    <div className="mt-2 text-xs text-white/45">Current: {draft?.startDate ? formatDraftDateTime(draft.startDate, getDraftTimeZone(draft)) : '—'}</div>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/50">End time</label>
                    <input
                      type="datetime-local"
                      value={adminToolEndDate}
                      onChange={(e) => setAdminToolEndDate(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-[#020817]/70 px-4 py-3 text-white outline-none transition focus:border-[#FF4B1F]/40 focus:ring-2 focus:ring-[#FF4B1F]/20"
                    />
                    <div className="mt-2 text-xs text-white/45">Current: {draft?.endDate ? formatDraftDateTime(draft.endDate, getDraftTimeZone(draft)) : '—'}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Current player pool</div>
                    <h3 className="mt-2 text-lg font-semibold">{draft?.players?.length ?? 0} players</h3>
                  </div>
                </div>
                <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {(draft?.players || [])
                    .slice()
                    .sort((a, b) => a.playerName.localeCompare(b.playerName))
                    .map(player => (
                      <div key={player.playerId} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#020817]/60 p-3">
                        <div>
                          <div className="font-medium text-white">{player.playerName}</div>
                          <div className="text-xs text-white/50">{player.position} • KTC {player.ktc || '-'} • Start Delay {Number(player.startDelay || 0)}h</div>
                        </div>
                        <SurfaceButton tone="danger" className="px-3 py-2 text-xs" onClick={() => handleAdminRemovePlayer(player)} disabled={adminToolSaving}>
                          Remove
                        </SurfaceButton>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Add players</div>
                  <h3 className="mt-2 text-lg font-semibold">{filteredAdminToolPlayers.length} available</h3>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={adminToolSearch}
                  onChange={(e) => setAdminToolSearch(e.target.value)}
                  placeholder="Search player name"
                  className="w-full rounded-2xl border border-white/10 bg-[#020817]/70 px-4 py-3 text-white outline-none transition focus:border-[#FF4B1F]/40 focus:ring-2 focus:ring-[#FF4B1F]/20"
                />
                <select
                  value={adminToolPosition}
                  onChange={(e) => setAdminToolPosition(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#020817]/70 px-4 py-3 text-white outline-none transition focus:border-[#FF4B1F]/40 focus:ring-2 focus:ring-[#FF4B1F]/20"
                >
                  <option value="ALL">All Positions</option>
                  {['QB', 'RB', 'WR', 'TE'].map(position => (
                    <option key={position} value={position}>{position}</option>
                  ))}
                </select>
              </div>
              <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {adminToolLoading ? (
                  <div className="rounded-2xl border border-white/10 bg-[#020817]/60 px-4 py-6 text-center text-white/60">Loading players...</div>
                ) : filteredAdminToolPlayers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-white/50">No players match the current filters.</div>
                ) : (
                  filteredAdminToolPlayers.map(player => (
                    <div key={player.playerId} className="grid gap-3 rounded-2xl border border-white/10 bg-[#020817]/60 p-4 md:grid-cols-[minmax(0,1fr)_100px_auto] md:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 font-medium text-white">
                          <span>{player.playerName}</span>
                          {contractedPlayerIdSet.has(String(player.playerId)) && (
                            <span className="rounded-full border border-amber-400/20 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200">Contracted</span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-white/50">{player.position} • KTC {player.ktc || '-'} • ID {player.playerId}</div>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-white/45">Start delay</label>
                        <input
                          type="number"
                          min={0}
                          value={adminToolStartDelays[player.playerId] ?? 0}
                          onChange={(e) => setAdminToolStartDelays(prev => ({ ...prev, [player.playerId]: e.target.value }))}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none transition focus:border-[#FF4B1F]/40 focus:ring-2 focus:ring-[#FF4B1F]/20"
                        />
                      </div>
                      <SurfaceButton tone="green" className="md:self-end" onClick={() => handleAdminAddPlayer(player)} disabled={adminToolSaving}>
                        Add
                      </SurfaceButton>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </ModalShell>
      )}

      {retractConfirmPlayerId && (
        <ModalShell
          title="Retract bid?"
          subtitle="This removes your current bid for this player, but you can still submit a new one afterward."
          onClose={() => setRetractConfirmPlayerId(null)}
          maxWidth="max-w-md"
        >
          <div className="space-y-5">
            <p className="text-sm text-white/65">
              Are you sure you want to retract your bid for this player? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <SurfaceButton tone="ghost" className="flex-1" onClick={() => setRetractConfirmPlayerId(null)}>
                Cancel
              </SurfaceButton>
              <SurfaceButton
                tone="danger"
                className="flex-1"
                onClick={async () => {
                  await handleRetractBids(retractConfirmPlayerId);
                  setRetractConfirmPlayerId(null);
                }}
              >
                Retract bid
              </SurfaceButton>
            </div>
          </div>
        </ModalShell>
      )}
    </main>
  );
  
  async function handleRetractBids(playerId) {
    if (!draft?.blind || !session?.user?.name) return;
    // Remove all this user's bids for this player from the bid log
    const updatedBidLog = (draft.bidLog || []).filter(
      b => !(b.playerId === playerId && b.username === session.user.name)
    );
    // Remove their result if they are the high bidder for this player
    const updatedResults = draft.results.filter(
      r => !(r.playerId === playerId && r.username === session.user.name)
    );
    await fetch(`/api/admin/drafts/${draft._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: updatedResults, bidLog: updatedBidLog }),
    });
    await fetchDraft();
  }
}