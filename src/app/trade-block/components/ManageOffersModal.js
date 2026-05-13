'use client';
import { useState, useEffect, useMemo } from 'react';

function cn(...classes) { return classes.filter(Boolean).join(' '); }

function assetLabel(asset) {
  if (!asset) return 'Unknown';
  if (asset.assetType === 'player') return asset.playerName || 'Unknown Player';
  const season = asset.season ? `${asset.season} ` : '';
  const round = asset.round ? `Round ${asset.round}` : '';
  const bucket = asset.bucket ? ` (${asset.bucket})` : '';
  const originalTeam = asset.originalTeam ? ` from ${asset.originalTeam}` : '';
  return `${season}${round}${bucket} Pick${originalTeam}`.trim();
}

function positionColor(pos) {
  const p = String(pos || '').toUpperCase();
  if (p === 'QB') return 'bg-red-500/20 text-red-300';
  if (p === 'RB') return 'bg-emerald-500/20 text-emerald-300';
  if (p === 'WR') return 'bg-sky-500/20 text-sky-300';
  if (p === 'TE') return 'bg-amber-500/20 text-amber-300';
  return 'bg-white/10 text-white/50';
}

function AssetChip({ asset }) {
  const label = assetLabel(asset);
  const ktc = Number(asset?.ktcValue || asset?.pickKtcValue || 0);
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">
      {asset?.position && (
        <span className={cn('rounded px-1 py-0.5 text-[10px] font-bold', positionColor(asset.position))}>
          {asset.position}
        </span>
      )}
      <span className="text-sm text-white">{label}</span>
      {ktc > 0 && <span className="text-xs text-white/40">{ktc.toLocaleString()}</span>}
    </div>
  );
}

const OFFER_STATUS_META = {
  pending:    { label: 'Pending', color: 'bg-blue-500/20 text-blue-300' },
  selected:   { label: 'Selected', color: 'bg-amber-500/20 text-amber-300' },
  withdrawn:  { label: 'Withdrawn', color: 'bg-white/10 text-white/40' },
  rejected:   { label: 'Rejected', color: 'bg-red-500/20 text-red-300' },
  completed:  { label: 'Completed', color: 'bg-emerald-500/20 text-emerald-300' },
  voided:     { label: 'Voided', color: 'bg-white/10 text-white/40' },
};

function OfferCard({ offer, listing, session, onAction, actionLoading }) {
  const meta = OFFER_STATUS_META[offer.status] || { label: offer.status, color: 'bg-white/10 text-white/40' };
  const isOwner = session?.user?.name === listing?.posterUsername;
  const isAdmin = session?.user?.role === 'admin';
  const totalKtc = useMemo(() => (offer.assets || []).reduce((s, a) => s + Number(a.ktcValue || a.pickKtcValue || 0), 0), [offer.assets]);

  return (
    <div className={cn(
      'rounded-2xl border p-4 space-y-3 transition',
      offer.status === 'selected' ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/10 bg-white/[0.02]'
    )}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-bold text-white text-sm">{offer.offererUsername}</span>
          <span className={cn('ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold', meta.color)}>{meta.label}</span>
          {offer.status === 'selected' && listing?.postingType === 'auction' && listing?.countdownEndsAt && (
            <div className="text-xs text-amber-300 mt-1">
              Countdown ends {new Date(listing.countdownEndsAt).toLocaleString()}
            </div>
          )}
        </div>
        <div className="text-xs text-white/40">KTC {totalKtc.toLocaleString()}</div>
      </div>

      {/* Assets */}
      <div className="flex flex-wrap gap-2">
        {(offer.assets || []).map((a, i) => <AssetChip key={i} asset={a} />)}
      </div>

      {/* Criteria compliance */}
      {offer.meetsCriteria != null && (
        <div className={cn(
          'rounded-xl border px-3 py-1.5 text-xs font-semibold',
          offer.meetsCriteria
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : listing?.filterMode === 'hard'
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        )}>
          {offer.meetsCriteria ? '✓ Meets criteria' : (listing?.filterMode === 'hard' ? '✗ Fails hard criteria' : '⚠ Doesn\'t match preferences')}
          {!offer.meetsCriteria && offer.criteriaViolations?.length > 0 && (
            <div className="mt-1 font-normal">
              {offer.criteriaViolations.map((v, i) => <div key={i}>• {v}</div>)}
            </div>
          )}
        </div>
      )}

      {offer.message && (
        <div className="text-xs text-white/50 italic border-l-2 border-white/10 pl-2">&ldquo;{offer.message}&rdquo;</div>
      )}

      {/* Actions */}
      {(isOwner || isAdmin) && ['pending', 'selected'].includes(offer.status) && (
        <div className="flex gap-2 flex-wrap">
          {offer.status === 'pending' && (
            <>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onAction(offer.offerId, 'select')}
                className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50"
              >
                Accept Offer
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onAction(offer.offerId, 'reject')}
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
          {offer.status === 'selected' && isAdmin && (
            <>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onAction(offer.offerId, 'complete')}
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition disabled:opacity-50"
              >
                Mark Complete
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onAction(offer.offerId, 'void')}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/10 transition disabled:opacity-50"
              >
                Void
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ManageOffersModal({
  listing,
  onClose,
  onUpdate,
  playerContracts = [],
  tradedPicks = [],
  rosters = [],
  users = [],
  currentSeason,
  leagueWeek,
  session,
}) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = session?.user?.role === 'admin';

  async function fetchOffers() {
    if (!listing?.listingId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/trade-block/${listing.listingId}/offers`);
      const data = await res.json();
      setOffers(data?.offers || []);
    } catch {
      setError('Failed to load offers.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchOffers(); }, [listing?.listingId]);

  async function handleAction(offerId, action) {
    if (action === 'select') {
      const confirmed = window.confirm('Are you sure? This is a binding agreement!');
      if (!confirmed) return;
    }

    setActionLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/trade-block/${listing.listingId}/offers/${offerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || `Failed to ${action}`); setActionLoading(false); return; }
      await fetchOffers();
      onUpdate?.();
    } catch {
      setError('Network error.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleListingAction(action) {
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/trade-block/${listing.listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || `Failed to ${action}`); setActionLoading(false); return; }
      onUpdate?.();
      onClose();
    } catch {
      setError('Network error.');
    } finally {
      setActionLoading(false);
    }
  }

  const visibleOffers = useMemo(
    () => offers.filter((offer) => offer.status !== 'rejected'),
    [offers]
  );

  const sortedOffers = useMemo(() => {
    const order = { selected: 0, pending: 1, completed: 2, voided: 3, rejected: 4, withdrawn: 5 };
    return [...visibleOffers].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  }, [visibleOffers]);

  const selectedOffer = visibleOffers.find((o) => o.status === 'selected');
  const allOffers = useMemo(
    () => sortedOffers.filter((offer) => offer.status !== 'selected'),
    [sortedOffers]
  );
  const pendingCount = visibleOffers.filter((o) => o.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#020817]/98 shadow-2xl">
        {/* Header */}
        <div className="border-b border-white/10 bg-white/[0.02] px-5 py-4">
          <button
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white transition"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
          <h2 className="text-xl font-bold text-white pr-12">Manage Offers</h2>
          <p className="text-sm text-white/50 mt-1">
            <span className="text-white font-semibold">{assetLabel(listing?.asset || {})}</span>
            {' · '}
            {listing?.postingType === 'auction' ? 'Auction' : 'Straight Trade'}
            {' · '}
            <span className="capitalize">{listing?.status?.replace(/_/g, ' ')}</span>
          </p>
        </div>

        <div className="overflow-y-auto px-5 py-5 space-y-4 flex-1">
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
          )}

          {/* Stats bar */}
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'Total Offers', value: visibleOffers.length },
              { label: 'Pending', value: pendingCount },
              { label: 'Selected', value: selectedOffer ? 1 : 0 },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2">
                <div className="text-[10px] text-white/40">{s.label}</div>
                <div className="text-lg font-bold text-white">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Selected offer highlighted */}
          {selectedOffer && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300/70 mb-2">Selected Offer</div>
              <OfferCard
                offer={selectedOffer}
                listing={listing}
                session={session}
                onAction={handleAction}
                actionLoading={actionLoading}
              />
            </div>
          )}

          {/* All offers */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">All Offers</div>
            {loading ? (
              <div className="py-8 text-center text-white/40 text-sm">Loading offers…</div>
            ) : allOffers.length === 0 ? (
              <div className="py-8 text-center text-white/30 text-sm">No offers yet.</div>
            ) : (
              <div className="space-y-3">
                {allOffers.map((offer) => (
                  <OfferCard
                    key={offer.offerId}
                    offer={offer}
                    listing={listing}
                    session={session}
                    onAction={handleAction}
                    actionLoading={actionLoading}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Admin listing actions */}
          {isAdmin && listing?.status !== 'completed' && listing?.status !== 'archived' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3">Admin Actions</div>
              <div className="flex flex-wrap gap-2">
                {listing?.status !== 'pending_admin' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleListingAction('mark_pending_admin')}
                    className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50"
                  >
                    Mark Pending Admin
                  </button>
                )}
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleListingAction('void')}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/10 transition disabled:opacity-50"
                >
                  Void Listing
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleListingAction('archive')}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/10 transition disabled:opacity-50"
                >
                  Archive Listing
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="border-t border-white/10 bg-white/[0.02] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
