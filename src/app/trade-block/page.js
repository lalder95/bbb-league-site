'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ListingCard from './components/ListingCard';
import PlayerProfileCard from '@/app/my-team/components/PlayerProfileCard';
import CreateListingWizard from './components/CreateListingWizard';
import EditListingModal from './components/EditListingModal';
import OfferModal from './components/OfferModal';
import ManageOffersModal from './components/ManageOffersModal';
import userSleeperIds from '@/data/user-sleeper-ids.json';
import { estimateDraftPositions, getTeamName } from '@/utils/draftUtils';
import { createDraftPickAsset, DEFAULT_FUTURE_PICK_BUCKET } from '@/utils/draftPickTradeUtils';

const USER_ID = '456973480269705216';
const CONTRACTS_CSV_URL = 'https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv';

function cn(...classes) { return classes.filter(Boolean).join(' '); }

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My Listings' },
  { key: 'open', label: 'Open' },
  { key: 'countdown_active', label: 'Countdown' },
  { key: 'pending_admin', label: 'Pending Admin' },
];

function AdminSettingsModal({ settings, onSave, onClose, actingUsername, onActingUsernameChange }) {
  const [form, setForm] = useState(settings || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setForm(settings || {}); }, [settings]);

  function field(key, label, type = 'number', extra = {}) {
    return (
      <label key={key} className="flex flex-col gap-1">
        <span className="text-xs text-white/50">{label}</span>
        {type === 'checkbox' ? (
          <input
            type="checkbox"
            checked={!!form[key]}
            onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.checked }))}
            className="h-4 w-4 accent-[#FF4B1F]"
          />
        ) : (
          <input
            type={type}
            value={form[key] ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FF4B1F]/50 w-28"
            {...extra}
          />
        )}
      </label>
    );
  }

  async function save() {
    setSaving(true);
    try {
      await fetch('/api/admin/trade-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_settings', settings: form }),
      });
      setSaved(true);
      onSave?.(form);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#020817]/98 shadow-2xl">
        <div className="border-b border-white/10 bg-white/[0.02] px-5 py-4">
          <button
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
          <h2 className="pr-12 text-xl font-bold text-white">Admin Settings</h2>
          <p className="mt-1 text-sm text-white/45">Manage the acting user and trade-block behavior without leaving the board.</p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
            <h3 className="mb-1 text-sm font-bold text-white">Acting User</h3>
            <p className="mb-4 text-xs text-white/45">Use the trade block exactly as another manager for testing.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {userSleeperIds.map((user) => {
                const selected = user.username === actingUsername;
                return (
                  <button
                    key={user.username}
                    type="button"
                    onClick={() => onActingUsernameChange?.(user.username)}
                    className={cn(
                      'rounded-2xl border px-3 py-2 text-left text-sm transition',
                      selected
                        ? 'border-[#FF4B1F]/40 bg-[#FF4B1F]/15 text-white'
                        : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white'
                    )}
                  >
                    {user.username}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
            <h3 className="mb-4 text-sm font-bold text-white">Trade Block Rules</h3>
            <div className="flex flex-wrap gap-5">
              {field('maxActivePostingsPerUser', 'Max Postings/User')}
              {field('autoArchiveDays', 'Auto-Archive Days')}
              {field('defaultCountdownDays', 'Default Countdown Days')}
              {field('minCountdownDays', 'Min Countdown Days')}
              {field('maxCountdownDays', 'Max Countdown Days')}
              {field('newPostingsEnabled', 'New Postings Enabled', 'checkbox')}
              {field('auctionModeEnabled', 'Auction Mode', 'checkbox')}
              {field('straightTradeModeEnabled', 'Straight Trade Mode', 'checkbox')}
              {field('mediaFeedEnabled', 'Media Feed Posts', 'checkbox')}
              {field('mediaIntensityLow', 'KTC Low Threshold')}
              {field('mediaIntensityMid', 'KTC Mid Threshold')}
              {field('mediaIntensityHigh', 'KTC High Threshold')}
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 bg-white/[0.02] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold text-white hover:bg-white/10 transition"
            >
              Close
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-2xl border border-[#FF4B1F]/40 bg-[#FF4B1F] px-5 py-2 text-sm font-semibold text-white hover:bg-[#ff6a3c] transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TradeBlockPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [listings, setListings] = useState([]);
  const [settings, setSettings] = useState(null);
  const [playerContracts, setPlayerContracts] = useState([]);
  const [tradedPicks, setTradedPicks] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [draftOrderData, setDraftOrderData] = useState(null);
  const [leagueId, setLeagueId] = useState(null);
  const [rosters, setRosters] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentSeason, setCurrentSeason] = useState(null);
  const [leagueWeek, setLeagueWeek] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [actingUsername, setActingUsername] = useState('');
  const [showAdminSettings, setShowAdminSettings] = useState(false);

  // Modals
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editModalListing, setEditModalListing] = useState(null);
  const [offerModalListing, setOfferModalListing] = useState(null);
  const [manageModalListing, setManageModalListing] = useState(null);
  const [profilePlayerId, setProfilePlayerId] = useState(null);

  const isAdmin = session?.user?.role === 'admin';
  const sessionUsername = session?.user?.name || '';

  useEffect(() => {
    if (sessionUsername && !actingUsername) {
      setActingUsername(sessionUsername);
    }
  }, [actingUsername, sessionUsername]);

  const actingSleeperId = useMemo(() => {
    const selectedUser = userSleeperIds.find((u) => u.username.toLowerCase() === actingUsername.toLowerCase());
    return selectedUser?.sleeperId || null;
  }, [actingUsername]);

  const myUsername = actingUsername || sessionUsername;

  // Resolve the current user's Sleeper roster_id.
  // Prefer the sleeperId from the JWT; fall back to the static mapping.
  const myRosterId = useMemo(() => {
    if (!rosters.length) return null;
    const sleeperId =
      actingSleeperId ||
      session?.user?.sleeperId ||
      userSleeperIds.find((u) => u.username.toLowerCase() === myUsername.toLowerCase())?.sleeperId;
    if (!sleeperId) return null;
    const roster = rosters.find((r) => String(r.owner_id) === String(sleeperId));
    return roster?.roster_id ?? null;
  }, [actingSleeperId, session?.user?.sleeperId, myUsername, rosters]);

  const effectiveSession = useMemo(() => {
    if (!session?.user) return session;
    return {
      ...session,
      user: {
        ...session.user,
        name: myUsername,
        username: myUsername,
        sleeperId: actingSleeperId || session.user.sleeperId,
      },
    };
  }, [actingSleeperId, myUsername, session]);

  const myDraftPickAssets = useMemo(() => {
    if (!myRosterId || !rosters.length || !users.length || !currentSeason || !draftOrderData) return [];

    const normalize = (value) => String(value || '').trim().toLowerCase();
    const knownTeams = [...new Set(playerContracts.map((player) => player.team).filter(Boolean))];
    const resolveKnownTeamName = (teamName) => {
      const normalizedTeam = normalize(teamName);
      return (
        knownTeams.find((knownTeam) => normalize(knownTeam) === normalizedTeam) ||
        knownTeams.find((knownTeam) => normalize(knownTeam).includes(normalizedTeam) || normalizedTeam.includes(normalize(knownTeam))) ||
        teamName
      );
    };

    const pickActiveDraft = (draftList) => {
      if (!Array.isArray(draftList) || draftList.length === 0) return null;

      const nonComplete = draftList.filter((draft) => draft?.status && draft.status !== 'complete');
      if (nonComplete.length === 0) return null;

      const statusPriority = {
        drafting: 0,
        in_progress: 1,
        paused: 2,
        pre_draft: 3,
        upcoming: 4,
      };

      return nonComplete
        .slice()
        .sort((a, b) => {
          const priorityA = statusPriority[String(a.status)] ?? 99;
          const priorityB = statusPriority[String(b.status)] ?? 99;
          if (priorityA !== priorityB) return priorityA - priorityB;
          return Number(b.start_time || 0) - Number(a.start_time || 0);
        })[0];
    };

    const activeDraft = pickActiveDraft(drafts);
    const activeDraftOrderEntries = activeDraft?.draft_order
      ? Object.entries(activeDraft.draft_order).map(([userId, slot]) => ({
          roster_id: Number(rosters.find((roster) => String(roster.owner_id) === String(userId))?.roster_id),
          original_roster_id: Number(rosters.find((roster) => String(roster.owner_id) === String(userId))?.roster_id),
          slot: Number(slot),
        }))
      : [];
    const canonicalOrderEntries = activeDraftOrderEntries.length > 0
      ? activeDraftOrderEntries
      : (draftOrderData?.draft_order || []);

    const draftOrder = canonicalOrderEntries
      .slice()
      .sort((a, b) => Number(a.slot) - Number(b.slot))
      .map((entry) => ({
        rosterId: Number(entry.original_roster_id ?? entry.roster_id),
        slot: Number(entry.slot),
      }));

    const projectedSlotsByOriginalRosterId = Object.fromEntries(
      canonicalOrderEntries.map((entry) => [
        Number(entry.original_roster_id ?? entry.roster_id),
        Number(entry.slot),
      ])
    );

    const baseSeason = Number(draftOrderData?.targetSeason || Number(currentSeason) + 1);
    const seasonsToShow = Array.from({ length: 3 }, (_, index) => String(baseSeason + index));
    const myTeamName = resolveKnownTeamName(getTeamName(myRosterId, rosters, users));
    const nextAssets = [];

    seasonsToShow.forEach((season, seasonIndex) => {
      if (seasonIndex === 0) {
        const canonicalDraftOrder = (draftOrderData?.draft_order || [])
          .slice()
          .sort((a, b) => Number(a.slot) - Number(b.slot));

        canonicalDraftOrder.forEach((entry) => {
          const originalRosterId = Number(entry.original_roster_id ?? entry.roster_id);
          const projectedSlot = projectedSlotsByOriginalRosterId[originalRosterId];
          const originalOwnerName = resolveKnownTeamName(getTeamName(originalRosterId, rosters, users));

          for (let round = 1; round <= 7; round += 1) {
            const trade = tradedPicks.find((pick) => (
              String(pick.season) === season &&
              Number(pick.round) === round &&
              Number(pick.roster_id) === originalRosterId
            ));

            const currentOwnerRosterId = trade ? Number(trade.owner_id) : originalRosterId;
            if (Number(currentOwnerRosterId) !== Number(myRosterId)) continue;

            nextAssets.push(createDraftPickAsset({
              season,
              round,
              pickPosition: projectedSlot || 1,
              originalOwner: originalOwnerName,
              currentOwner: myTeamName,
              mappedSlotDebug: projectedSlot != null ? String(projectedSlot) : 'mapping failed',
              bucketOverride: projectedSlot ? undefined : DEFAULT_FUTURE_PICK_BUCKET,
              slotDetermined: Boolean(projectedSlot),
            }));
          }
        });

        return;
      }

      const estimatedTeamPicks = estimateDraftPositions(
        rosters,
        tradedPicks,
        { season, settings: { rounds: 7 } },
        draftOrder,
        (rosterId) => resolveKnownTeamName(getTeamName(rosterId, rosters, users)),
        season,
      );

      const currentPicks = Array.isArray(estimatedTeamPicks?.[myTeamName]?.currentPicks)
        ? estimatedTeamPicks[myTeamName].currentPicks
        : [];

      currentPicks.forEach((pick) => {
        nextAssets.push(createDraftPickAsset({
          season,
          round: pick.round,
          pickPosition: pick.pickPosition,
          originalOwner: resolveKnownTeamName(pick.originalOwner),
          currentOwner: myTeamName,
          bucketOverride: DEFAULT_FUTURE_PICK_BUCKET,
          mappedSlotDebug: 'future default',
        }));
      });
    });

    return nextAssets.sort((a, b) => {
      const seasonDiff = Number(a.season) - Number(b.season);
      if (seasonDiff !== 0) return seasonDiff;
      const roundDiff = Number(a.round) - Number(b.round);
      if (roundDiff !== 0) return roundDiff;
      return Number(a.pickPosition) - Number(b.pickPosition);
    });
  }, [currentSeason, draftOrderData, drafts, myRosterId, playerContracts, rosters, tradedPicks, users]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login?callbackUrl=/trade-block');
  }, [status, router]);

  const fetchListings = useCallback(async () => {
    try {
      const res = await fetch('/api/trade-block', {
        headers: actingUsername ? { 'x-trade-block-acting-user': actingUsername } : undefined,
      });
      const data = await res.json();
      if (res.ok) setListings(data?.listings || []);
    } catch {}
  }, [actingUsername]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/trade-block');
      const data = await res.json();
      if (res.ok) setSettings(data?.settings || null);
    } catch {}
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;

    async function init() {
      setLoading(true);
      try {
        // Fetch leagueId, listings, contracts CSV, NFL state, and admin settings all in parallel
        const [leagueIdRes, listingsRes, csvRes, stateRes, settingsRes] = await Promise.all([
          fetch('/api/sleeper/bbb-league-id', { cache: 'no-store' }),
          fetch('/api/trade-block', {
            headers: actingUsername ? { 'x-trade-block-acting-user': actingUsername } : undefined,
          }),
          fetch(CONTRACTS_CSV_URL),
          fetch('https://api.sleeper.app/v1/state/nfl'),
          fetch('/api/admin/trade-block'),
        ]);

        const leagueIdData = leagueIdRes.ok ? await leagueIdRes.json() : null;
        const resolvedLeagueId = leagueIdData?.leagueId ? String(leagueIdData.leagueId) : null;
        setLeagueId(resolvedLeagueId);

        if (listingsRes.ok) {
          const d = await listingsRes.json();
          setListings(d?.listings || []);
        }

        if (csvRes.ok) {
          const text = await csvRes.text();
          const rows = text.split('\n');
          const parsed = rows.slice(1)
            .filter((row) => row.trim())
            .map((row) => {
              const v = row.split(',');
              const rowStatus = v[14];
              return {
                playerId: v[0],
                playerName: v[1],
                contractType: v[2],
                contractFinalYear: v[5],
                position: v[21],
                nflTeam: v[22],
                age: v[32],
                team: v[33],
                ktcValue: v[34] ? parseInt(v[34], 10) : 0,
                curYear: parseFloat(v[15]) || 0,
                status: rowStatus,
                isActive: rowStatus === 'Active',
              };
            })
            .filter((p) => p.isActive);
          setPlayerContracts(parsed);
        }

        if (stateRes.ok) {
          const state = await stateRes.json();
          setCurrentSeason(state?.season);
          setLeagueWeek(state?.week);
        }

        if (settingsRes.ok) {
          const d = await settingsRes.json();
          setSettings(d?.settings || null);
        }

        if (!resolvedLeagueId) return;

        setRosters([]);
        setUsers([]);
        setTradedPicks([]);
        setDrafts([]);
        setDraftOrderData(null);

        // Fetch all Sleeper league data + draft order + traded picks in one parallel batch
        const [rostersRes, usersRes, draftsRes, orderRes, picksRes] = await Promise.all([
          fetch(`https://api.sleeper.app/v1/league/${resolvedLeagueId}/rosters`, { cache: 'no-store' }),
          fetch(`https://api.sleeper.app/v1/league/${resolvedLeagueId}/users`, { cache: 'no-store' }),
          fetch(`https://api.sleeper.app/v1/league/${resolvedLeagueId}/drafts`, { cache: 'no-store' }),
          fetch(`/api/debug/draft-order?leagueId=${resolvedLeagueId}`, { cache: 'no-store' }),
          fetch(`https://api.sleeper.app/v1/league/${resolvedLeagueId}/traded_picks`, { cache: 'no-store' }),
        ]);
        if (rostersRes.ok) setRosters(await rostersRes.json());
        if (usersRes.ok) setUsers(await usersRes.json());
        if (draftsRes.ok) setDrafts(await draftsRes.json());
        if (orderRes.ok) setDraftOrderData(await orderRes.json());
        if (picksRes.ok) setTradedPicks(await picksRes.json());
      } catch (e) {
        setError('Failed to load trade block data.');
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [actingUsername, status]);

  // Poll listings every 30s for countdown updates
  useEffect(() => {
    if (status !== 'authenticated') return;
    const id = setInterval(fetchListings, 30000);
    return () => clearInterval(id);
  }, [status, fetchListings]);

  const filteredListings = useMemo(() => {
    if (activeTab === 'all') return listings;
    if (activeTab === 'mine') return listings.filter((l) => l.posterUsername === myUsername);
    if (activeTab === 'open') return listings.filter((l) => ['open', 'offers_received'].includes(l.status));
    if (activeTab === 'countdown_active') return listings.filter((l) => l.status === 'countdown_active');
    if (activeTab === 'pending_admin') return listings.filter((l) => l.status === 'pending_admin');
    return listings;
  }, [listings, activeTab, myUsername]);

  function handleArchive(listing) {
    fetch(`/api/trade-block/${listing.listingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'archive' }),
    }).then(fetchListings);
  }

  if (status === 'loading' || (status === 'unauthenticated')) {
    return (
      <div className="min-h-screen bg-[#020817] flex items-center justify-center">
        <div className="text-white/40">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020817] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Hero header */}
        <div className="mb-8">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">Trade Block</h1>
              <p className="mt-1 text-white/40 text-sm max-w-xl">
                Post players and picks you're willing to move. Accept offers directly or run a countdown auction.
              </p>
              {isAdmin && myUsername && (
                <p className="mt-2 text-xs text-white/35">
                  Viewing as <span className="text-white/70 font-semibold">{myUsername}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAdminSettings(true)}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white transition"
                  aria-label="Open admin settings"
                  title="Open admin settings"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              )}
              {settings?.newPostingsEnabled !== false && (
                <button
                  type="button"
                  onClick={() => setWizardOpen(true)}
                  className="rounded-2xl border border-[#FF4B1F]/40 bg-[#FF4B1F] px-5 py-3 text-sm font-bold text-white hover:bg-[#ff6a3c] transition shadow-lg"
                >
                  + New Listing
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap mb-6 border-b border-white/10 pb-4">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-semibold transition',
                activeTab === tab.key
                  ? 'border-[#FF4B1F]/50 bg-[#FF4B1F]/20 text-[#FF4B1F]'
                  : 'border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/25'
              )}
            >
              {tab.label}
              {tab.key !== 'all' && tab.key !== 'mine' && (
                <span className="ml-1.5 text-xs text-white/30">
                  {listings.filter((l) =>
                    tab.key === 'open' ? ['open', 'offers_received'].includes(l.status) : l.status === tab.key
                  ).length}
                </span>
              )}
              {tab.key === 'mine' && (
                <span className="ml-1.5 text-xs text-white/30">
                  {listings.filter((l) => l.posterUsername === myUsername).length}
                </span>
              )}
              {tab.key === 'all' && (
                <span className="ml-1.5 text-xs text-white/30">{listings.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Listings gallery */}
        {loading ? (
          <div className="py-20 text-center text-white/30">Loading listings…</div>
        ) : filteredListings.length === 0 ? (
          <div className="rounded-3xl border border-white/8 bg-white/[0.02] py-20 text-center">
            <div className="text-white/30 text-lg font-semibold mb-2">No listings found</div>
            {activeTab === 'all' && settings?.newPostingsEnabled !== false && (
              <p className="text-white/20 text-sm">Be the first to post something on the trade block!</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-white/30">Scroll sideways to browse listings.</div>
            <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
              <div className="flex snap-x snap-mandatory gap-4">
                {filteredListings.map((listing) => (
                  <div
                    key={listing.listingId}
                    className="w-[min(88vw,24rem)] shrink-0 snap-start sm:w-[22rem] lg:w-[24rem]"
                  >
                    <ListingCard
                      listing={listing}
                      session={effectiveSession}
                      playerContracts={playerContracts}
                      onEdit={(l) => setEditModalListing(l)}
                      onOpenOfferModal={(l) => setOfferModalListing(l)}
                      onOpenManageModal={(l) => setManageModalListing(l)}
                      onArchive={handleArchive}
                      onOpenPlayerProfile={(id) => setProfilePlayerId(id)}
                      isAdmin={isAdmin}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Player Profile Modal */}
      {profilePlayerId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setProfilePlayerId(null)}
        >
          <div
            className="bg-transparent p-0 rounded-lg shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <PlayerProfileCard
              playerId={profilePlayerId}
              imageExtension="png"
              expanded={true}
              className="w-56 h-80 sm:w-72 sm:h-[26rem] md:w-80 md:h-[30rem] max-w-full max-h-[90vh]"
              onExpandClick={() => setProfilePlayerId(null)}
            />
            <button
              className="absolute top-2 right-2 text-white bg-black/60 rounded-full px-3 py-1 hover:bg-black"
              onClick={() => setProfilePlayerId(null)}
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAdminSettings && isAdmin && settings && (
        <AdminSettingsModal
          settings={settings}
          onSave={(s) => setSettings(s)}
          onClose={() => setShowAdminSettings(false)}
          actingUsername={myUsername}
          onActingUsernameChange={setActingUsername}
        />
      )}

      {wizardOpen && (
        <CreateListingWizard
          onClose={() => setWizardOpen(false)}
          onSuccess={() => { setWizardOpen(false); fetchListings(); }}
          playerContracts={playerContracts}
          draftPickAssets={myDraftPickAssets}
          tradedPicks={tradedPicks}
          rosters={rosters}
          users={users}
          currentSeason={currentSeason}
          leagueWeek={leagueWeek}
          settings={settings}
          myRosterId={myRosterId}
          actingUsername={myUsername}
        />
      )}

      {editModalListing && (
        <EditListingModal
          listing={editModalListing}
          settings={settings}
          actingUsername={myUsername}
          onClose={() => setEditModalListing(null)}
          onSuccess={() => {
            setEditModalListing(null);
            fetchListings();
          }}
        />
      )}

      {offerModalListing && (
        <OfferModal
          listing={offerModalListing}
          onClose={() => setOfferModalListing(null)}
          onSuccess={() => { setOfferModalListing(null); fetchListings(); }}
          playerContracts={playerContracts}
          draftPickAssets={myDraftPickAssets}
          tradedPicks={tradedPicks}
          rosters={rosters}
          users={users}
          currentSeason={currentSeason}
          leagueWeek={leagueWeek}
          myRosterId={myRosterId}
          actingUsername={myUsername}
        />
      )}

      {manageModalListing && (
        <ManageOffersModal
          listing={manageModalListing}
          onClose={() => setManageModalListing(null)}
          onUpdate={fetchListings}
          playerContracts={playerContracts}
          tradedPicks={tradedPicks}
          rosters={rosters}
          users={users}
          currentSeason={currentSeason}
          leagueWeek={leagueWeek}
          session={effectiveSession}
        />
      )}
    </div>
  );
}
