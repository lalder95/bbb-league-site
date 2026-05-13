'use client';
import { useState, useEffect, useCallback } from 'react';
import PlayerProfileCard from '@/app/my-team/components/PlayerProfileCard';
import { isDraftPickAsset, getDisplayDraftSlot } from '@/utils/draftPickTradeUtils';

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

function assetLabel(asset) {
  if (!asset) return 'Unknown';
  if (asset.assetType === 'player') return asset.playerName || 'Unknown Player';
  const round = asset.round ? `Round ${asset.round}` : '';
  const season = asset.season ? `${asset.season} ` : '';
  const bucket = asset.bucket ? ` (${asset.bucket})` : '';
  return `${season}${round}${bucket} Pick`.trim();
}

function positionColor(pos) {
  const p = String(pos || '').toUpperCase();
  if (p === 'QB') return 'bg-red-500/20 text-red-300 border-red-500/30';
  if (p === 'RB') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  if (p === 'WR') return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
  if (p === 'TE') return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  return 'bg-white/10 text-white/60 border-white/20';
}

function leadingOfferAssetLabel(asset) {
  if (!asset) return 'Unknown';
  if (asset.assetType === 'player') return asset.playerName || 'Unknown Player';
  const round = asset.round ? `Round ${asset.round}` : '';
  const season = asset.season ? `${asset.season} ` : '';
  const bucket = asset.bucket ? ` (${asset.bucket})` : '';
  const originalTeam = asset.originalTeam ? ` from ${asset.originalTeam}` : '';
  return `${season}${round}${bucket} Pick${originalTeam}`.trim();
}

function getOrdinalRoundLabel(round) {
  const numericRound = Number(round);
  if (!Number.isFinite(numericRound) || numericRound <= 0) return 'Round';
  const teenCheck = numericRound % 100;
  const suffix = teenCheck >= 11 && teenCheck <= 13
    ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' }[numericRound % 10] || 'th');
  return `${numericRound}${suffix}`;
}

function buildCriteriaSummary(criteria) {
  if (!criteria) return null;

  const sections = {
    general: [],
    player: [],
    picks: [],
  };

  if (criteria.minTotalKtc > 0) sections.general.push({ label: 'Min KTC', value: Number(criteria.minTotalKtc).toLocaleString() });
  if (criteria.minTotalBv > 0) sections.general.push({ label: 'Min BV', value: Number(criteria.minTotalBv).toLocaleString() });
  if (criteria.maxTotalAssets > 0) sections.general.push({ label: 'Max assets', value: String(criteria.maxTotalAssets) });
  if (criteria.maxPlayers >= 0) sections.general.push({ label: 'Max players', value: String(criteria.maxPlayers) });
  if (criteria.maxPicks >= 0) sections.general.push({ label: 'Max picks', value: String(criteria.maxPicks) });
  if (criteria.acceptPlayers === false) sections.general.push({ label: 'Players', value: 'Not accepted' });
  if (criteria.acceptPicks === false) sections.general.push({ label: 'Picks', value: 'Not accepted' });

  if (criteria.positions?.length > 0) sections.player.push({ label: 'Positions', value: criteria.positions.join(', ') });
  if (criteria.minKtc > 0) sections.player.push({ label: 'Min player KTC', value: Number(criteria.minKtc).toLocaleString() });
  if (criteria.minBv > 0) sections.player.push({ label: 'Min player BV', value: Number(criteria.minBv).toLocaleString() });
  if (criteria.maxAge > 0) sections.player.push({ label: 'Max age', value: String(criteria.maxAge) });
  if (criteria.maxSalary > 0) sections.player.push({ label: 'Max salary', value: `$${criteria.maxSalary}/yr` });
  if (criteria.contractTypes?.length > 0) sections.player.push({ label: 'Contracts', value: criteria.contractTypes.join(', ') });

  if (criteria.pickRounds?.length > 0) {
    const sortedRounds = [...criteria.pickRounds]
      .map((round) => Number(round))
      .filter((round) => Number.isFinite(round))
      .sort((a, b) => a - b);
    sections.picks.push({ label: 'Rounds', value: sortedRounds.map(getOrdinalRoundLabel).join(', ') });
  }

  return sections;
}

const OFFER_VISIBILITY_LABELS = {
  full: 'Full leading offer',
  exists_only: 'Offer exists only',
  countdown_only: 'Countdown only',
  value_summary: 'Value summary only',
  hidden: 'Fully hidden',
};

const SUMMARY_TONES = {
  listingSetup: {
    panel: 'bg-[#FF4B1F]/[0.06] border-[#FF4B1F]/20',
    table: 'border-[#FF4B1F]/15 bg-[#FF4B1F]/[0.05]',
    label: 'text-[#f7a37c]',
    value: 'text-white/88',
    divider: 'border-[#FF4B1F]/12',
  },
  general: {
    table: 'border-white/10 bg-white/[0.04]',
    label: 'text-white/48',
    value: 'text-white/78',
    divider: 'border-white/8',
  },
  player: {
    table: 'border-sky-400/15 bg-sky-500/[0.05]',
    label: 'text-sky-200/72',
    value: 'text-sky-50/92',
    divider: 'border-sky-400/10',
  },
  picks: {
    table: 'border-amber-400/15 bg-amber-500/[0.05]',
    label: 'text-amber-200/78',
    value: 'text-amber-50/92',
    divider: 'border-amber-400/10',
  },
};

function buildListingSetupSummary(listing) {
  const rows = [];
  if (listing?.postingType) {
    rows.push({ label: 'Type', value: listing.postingType === 'auction' ? 'Auction trade' : 'Straight trade' });
  }
  if (listing?.postingType === 'auction' && Number(listing?.countdownDays) > 0) {
    const countdownDays = Number(listing.countdownDays);
    rows.push({ label: 'Countdown', value: `${countdownDays} ${countdownDays === 1 ? 'Day' : 'Days'}` });
  }
  if (listing?.offerVisibility) {
    rows.push({ label: 'Visibility', value: OFFER_VISIBILITY_LABELS[listing.offerVisibility] || listing.offerVisibility });
  }
  if (listing?.filterMode) {
    rows.push({ label: 'Filter', value: listing.filterMode === 'hard' ? 'Hard rules' : 'Flexible' });
  }
  return rows;
}

function CountdownBadge({ endsAt }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    function tick() {
      const now = Date.now();
      const end = new Date(endsAt).getTime();
      const diff = end - now;
      if (diff <= 0) { setRemaining('Expired'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setRemaining(`${d}d ${h}h ${m}m`);
      else if (h > 0) setRemaining(`${h}h ${m}m ${s}s`);
      else setRemaining(`${m}m ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 border border-orange-500/30 px-3 py-1 text-sm font-semibold text-orange-300">
      <span className="animate-pulse h-2 w-2 rounded-full bg-orange-400 inline-block" />
      {remaining}
    </span>
  );
}

export default function ListingCard({
  listing,
  offers = [],
  session,
  playerContracts = [],
  onEdit,
  onOpenOfferModal,
  onOpenManageModal,
  onArchive,
  onOpenPlayerProfile,
  isAdmin = false,
}) {
  const asset = listing.asset || {};
  const isPickAsset = isDraftPickAsset(asset);
  const assetPlayerId = asset.playerId || asset.id || null;
  const matchedContract = !isPickAsset && assetPlayerId
    ? (playerContracts || []).find((contract) => String(contract.playerId) === String(assetPlayerId))
    : null;
  const isOwner = session?.user?.name === listing.posterUsername;
  const hasOfferActivity = listing.status !== 'open';
  const hasAcceptedOffer = Boolean(listing.pendingOfferId);
  const canOffer = !isOwner && ['open', 'offers_received', 'countdown_active'].includes(listing.status);
  const canManage = (isOwner || isAdmin) && !['completed', 'archived', 'voided'].includes(listing.status);
  const canEdit = isOwner && !hasAcceptedOffer && !['countdown_active', 'pending_offer_selected', 'pending_admin', 'completed', 'archived', 'voided'].includes(listing.status);
  const canArchive = (isOwner || isAdmin) &&
    !['countdown_active', 'pending_offer_selected', 'pending_admin', 'completed', 'archived', 'voided'].includes(listing.status);

  const activeOffers = offers.filter((o) => !['withdrawn', 'rejected'].includes(o.status));
  const ktcValue = Number(asset.ktcValue || asset.pickKtcValue || 0);
  const salary = Number(asset.salary || asset.curYear || matchedContract?.curYear || asset.pickSalary || 0);
  const contractTypeLabel = asset.contractType || matchedContract?.contractType || null;
  const contractFinalYear = asset.contractFinalYear || matchedContract?.contractFinalYear || null;
  const playerAge = asset.age || matchedContract?.age || null;
  const listingSetupSummary = buildListingSetupSummary(listing);
  const publicLeadingOffer = !isOwner && !isAdmin ? listing.publicLeadingOffer || null : null;
  const publicLeadingOfferSummary = !isOwner && !isAdmin ? listing.publicLeadingOfferSummary || null : null;
  const showPublicLeadingOffer = Boolean(publicLeadingOffer || publicLeadingOfferSummary);
  const criteriaSummary = buildCriteriaSummary(listing.criteria);
  const criteriaSections = [
    { key: 'general', label: 'General', rows: criteriaSummary?.general || [], tone: SUMMARY_TONES.general },
    { key: 'player', label: 'Player', rows: criteriaSummary?.player || [], tone: SUMMARY_TONES.player },
    { key: 'picks', label: 'Picks', rows: criteriaSummary?.picks || [], tone: SUMMARY_TONES.picks },
  ].filter((section) => section.rows.length > 0);
  const playerContractParts = [
    contractTypeLabel || 'Contract',
    salary > 0 ? `$${salary.toFixed(1)} / yr` : null,
    contractFinalYear ? `Through ${contractFinalYear}` : null,
  ].filter(Boolean);
  const pickSummaryParts = [
    asset.season ? `${asset.season} Draft` : null,
    asset.originalTeam ? `Original ${asset.originalTeam}` : null,
    salary > 0 ? `Rookie $${salary.toFixed(1)}` : null,
    contractFinalYear ? `Through ${contractFinalYear}` : null,
  ].filter(Boolean);

  return (
    <div className={cn(
      'rounded-3xl border bg-gradient-to-br from-white/[0.04] to-transparent backdrop-blur-sm transition-all duration-200',
      listing.status === 'countdown_active'
        ? 'border-orange-500/30 shadow-orange-500/10 shadow-lg'
        : listing.status === 'pending_admin'
        ? 'border-purple-500/25'
        : 'border-white/10',
    )}>
      <div className="p-4 sm:p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-white/45 mt-0.5">
              Listed by <span className="text-white/70">{listing.posterUsername}</span>
            </div>
          </div>

          {/* Value column */}
          <div className="text-right shrink-0">
            {ktcValue > 0 && (
              <div className="text-sm font-semibold text-white">{ktcValue.toLocaleString()} KTC</div>
            )}
            {!isPickAsset && playerAge && (
              <div className="text-xs text-white/50">Age {playerAge}</div>
            )}
            {isPickAsset && salary > 0 && (
              <div className="text-xs text-white/50">${salary.toFixed(1)} / yr</div>
            )}
            {asset.yearsLeft > 0 && (
              <div className="text-xs text-white/45">{asset.yearsLeft}yr left</div>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
          <div className="flex justify-center">
            {isPickAsset ? (
              <div className="flex h-24 w-24 flex-col items-center justify-center rounded-[1.2rem] border border-sky-400/20 bg-gradient-to-br from-sky-500/20 via-indigo-500/15 to-violet-500/15 text-center shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-100">Pick</div>
                <div className="mt-1 text-3xl font-black leading-none text-white">R{asset.round}</div>
                <div className="mt-1 text-[11px] font-semibold text-white/70">{getDisplayDraftSlot(asset) || asset.pickBucketLabel || 'Future'}</div>
              </div>
            ) : assetPlayerId ? (
              <button
                type="button"
                onClick={() => onOpenPlayerProfile?.(assetPlayerId)}
                className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/40 shadow-[0_16px_34px_rgba(0,0,0,0.24)] transition hover:border-white/20 hover:bg-black/50"
                aria-label={`Open player profile for ${asset.playerName || 'player'}`}
                title="Open player profile"
              >
                <PlayerProfileCard
                  playerId={assetPlayerId}
                  expanded={false}
                  avatarOnly
                  className="h-40 w-40"
                />
              </button>
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-[1.2rem] border border-white/10 bg-white/[0.05] text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                Asset
              </div>
            )}
          </div>

          <div className="mt-4 min-w-0 text-center">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {asset.position && (
                <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold', positionColor(asset.position))}>
                  {asset.position}
                </span>
              )}
              <h3 className="text-lg font-bold text-white">{assetLabel(asset)}</h3>
            </div>

            <div className="mt-2 text-xs leading-5 text-white/55">
              {isPickAsset
                ? pickSummaryParts.join(' • ')
                : playerContractParts.join(' • ')}
            </div>
          </div>
        </div>

        {/* Countdown timer */}
        {listing.status === 'countdown_active' && listing.countdownEndsAt && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm font-medium text-white/65">Countdown:</span>
            <CountdownBadge endsAt={listing.countdownEndsAt} />
          </div>
        )}

        {/* Offers summary */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {activeOffers.length > 0 && (
            <span className="text-xs text-white/60">
              <span className="font-semibold text-white">{activeOffers.length}</span> offer{activeOffers.length !== 1 ? 's' : ''} received
            </span>
          )}
          {listing.pendingOfferId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-xs text-amber-300 font-semibold">
              Offer Selected
            </span>
          )}
        </div>

        {showPublicLeadingOffer && (
          <div className="mt-3 rounded-xl border border-orange-500/25 bg-orange-500/[0.08] px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-200/75">Leading Offer</div>
                <div className="mt-1 text-xs text-orange-50/85">
                  {publicLeadingOffer ? 'Visible to all managers' : 'Value summary visible to all managers'}
                </div>
              </div>
              {publicLeadingOfferSummary?.assetCount > 0 && (
                <div className="rounded-full border border-orange-400/25 bg-orange-300/10 px-2.5 py-1 text-[11px] font-semibold text-orange-100/90">
                  {publicLeadingOfferSummary.assetCount} {publicLeadingOfferSummary.assetCount === 1 ? 'asset' : 'assets'}
                </div>
              )}
            </div>

            {publicLeadingOffer?.assets?.length > 0 && (
              <div className="mt-3 space-y-2">
                {publicLeadingOffer.assets.map((offerAsset, index) => (
                  <div
                    key={`${offerAsset.assetType || 'asset'}-${offerAsset.playerId || offerAsset.round || index}-${index}`}
                    className="rounded-lg border border-orange-400/15 bg-black/15 px-3 py-2 text-xs text-orange-50/92"
                  >
                    {leadingOfferAssetLabel(offerAsset)}
                  </div>
                ))}
              </div>
            )}

            {publicLeadingOfferSummary && (
              <div className="mt-3 flex flex-wrap gap-3">
                <div className="rounded-lg border border-orange-400/15 bg-black/15 px-3 py-2">
                  <div className="text-[10px] text-orange-100/60">KTC</div>
                  <div className="text-sm font-bold text-orange-50">{Number(publicLeadingOfferSummary.totalKtc || 0).toLocaleString()}</div>
                </div>
                <div className="rounded-lg border border-orange-400/15 bg-black/15 px-3 py-2">
                  <div className="text-[10px] text-orange-100/60">BV</div>
                  <div className="text-sm font-bold text-orange-50">{Number(publicLeadingOfferSummary.totalBv || 0).toLocaleString()}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {listingSetupSummary.length > 0 && (
          <div className={cn('mt-3 rounded-xl px-3 py-3', SUMMARY_TONES.listingSetup.panel)}>
            <div className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-widest text-white/40">Listing Setup</div>
            <div className={cn('overflow-hidden rounded-lg border', SUMMARY_TONES.listingSetup.table)}>
              {listingSetupSummary.map((row, index) => (
                <div
                  key={row.label}
                  className={cn(
                    'grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-3 py-2 text-xs',
                    index !== listingSetupSummary.length - 1 && `border-b ${SUMMARY_TONES.listingSetup.divider}`
                  )}
                >
                  <div className={cn('font-semibold uppercase tracking-[0.16em]', SUMMARY_TONES.listingSetup.label)}>{row.label}</div>
                  <div className={SUMMARY_TONES.listingSetup.value}>{row.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Return criteria summary */}
        {criteriaSections.length > 0 && (
          <div className="mt-3 rounded-xl bg-white/[0.04] border border-white/8 px-3 py-3">
            <div className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-widest text-white/40">Seeking</div>
            <div className="space-y-3">
              {criteriaSections.map((section) => (
                <div key={section.key}>
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{section.label}</div>
                  <div className={cn('overflow-hidden rounded-lg border', section.tone.table)}>
                    {section.rows.map((row, index) => (
                      <div
                        key={`${section.key}-${row.label}`}
                        className={cn(
                          'grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-3 py-2 text-xs',
                          index !== section.rows.length - 1 && `border-b ${section.tone.divider}`
                        )}
                      >
                        <div className={cn('font-semibold uppercase tracking-[0.12em]', section.tone.label)}>{row.label}</div>
                        <div className={section.tone.value}>{row.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {listing.notes && (
          <div className="mt-3 text-sm leading-6 text-white/60 italic">&ldquo;{listing.notes}&rdquo;</div>
        )}

        {/* Action buttons */}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {canEdit && (
            <button
              onClick={() => onEdit?.(listing)}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-all"
            >
              Edit Listing
            </button>
          )}
          {canOffer && (
            <button
              onClick={() => onOpenOfferModal?.(listing)}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#FF4B1F]/40 bg-[#FF4B1F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#ff6a3c] transition-all"
            >
              Make Offer
            </button>
          )}
          {canManage && (
            <button
              onClick={() => onOpenManageModal?.(listing)}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-all"
            >
              {isOwner ? 'Manage Offers' : 'Admin View'}
            </button>
          )}
          {canArchive && (
            <button
              onClick={() => onArchive?.(listing)}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-white/50 hover:text-white/80 hover:border-white/25 transition-all"
            >
              Archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
