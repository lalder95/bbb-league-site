'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import SimpleAssetPicker from './SimpleAssetPicker';

function cn(...classes) { return classes.filter(Boolean).join(' '); }

function assetLabel(asset) {
  if (!asset) return 'Unknown';
  if (asset.assetType === 'player') return asset.playerName || 'Unknown Player';
  const round = asset.round ? `Round ${asset.round}` : '';
  const season = asset.season ? `${asset.season} ` : '';
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

function AssetTag({ asset }) {
  if (!asset) return null;
  const label = assetLabel(asset);
  const ktc = Number(asset.ktcValue || asset.pickKtcValue || 0);
  const salary = Number(asset.salary || asset.pickSalary || 0);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 flex items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-1.5">
          {asset.position && (
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', positionColor(asset.position))}>
              {asset.position}
            </span>
          )}
          <span className="text-sm font-semibold text-white">{label}</span>
        </div>
        {(ktc > 0 || salary > 0) && (
          <div className="text-xs text-white/40 mt-0.5 flex gap-2">
            {ktc > 0 && <span>KTC {ktc.toLocaleString()}</span>}
            {salary > 0 && <span>${salary.toFixed(1)}/yr</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function CriteriaViolations({ violations, filterMode }) {
  if (!violations || violations.length === 0) return null;
  return (
    <div className={cn(
      'rounded-xl border px-3 py-2 mt-2',
      filterMode === 'hard'
        ? 'border-red-500/30 bg-red-500/10'
        : 'border-amber-500/30 bg-amber-500/10'
    )}>
      <div className={cn('text-xs font-bold mb-1', filterMode === 'hard' ? 'text-red-300' : 'text-amber-300')}>
        {filterMode === 'hard' ? 'Does Not Meet Hard Rules:' : 'Does Not Match Preferred Criteria:'}
      </div>
      {violations.map((v, i) => (
        <div key={i} className={cn('text-xs', filterMode === 'hard' ? 'text-red-300/80' : 'text-amber-300/80')}>• {v}</div>
      ))}
    </div>
  );
}

export default function OfferModal({
  listing,
  onClose,
  onSuccess,
  playerContracts = [],
  draftPickAssets = [],
  tradedPicks = [],
  rosters = [],
  users = [],
  currentSeason,
  leagueWeek,
  myRosterId: myRosterIdProp,
  actingUsername,
}) {
  const { data: session } = useSession();
  const [offerAssets, setOfferAssets] = useState([]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [existingOffer, setExistingOffer] = useState(null);
  const [loadingExistingOffer, setLoadingExistingOffer] = useState(true);
  const [leadingOfferSummary, setLeadingOfferSummary] = useState(null);
  const [leadingOffer, setLeadingOffer] = useState(null);
  const [countdownActive, setCountdownActive] = useState(false);

  const listedAsset = listing?.asset || {};
  const myUsername = actingUsername || session?.user?.name || '';

  useEffect(() => {
    let cancelled = false;

    async function loadExistingOffer() {
      if (!listing?.listingId || !myUsername) {
        setExistingOffer(null);
        setLoadingExistingOffer(false);
        return;
      }

      setLoadingExistingOffer(true);
      try {
        const res = await fetch(`/api/trade-block/${listing.listingId}/offers`, {
          headers: actingUsername ? { 'x-trade-block-acting-user': actingUsername } : undefined,
        });
        const data = await res.json();
        if (!res.ok || cancelled) {
          setLoadingExistingOffer(false);
          return;
        }

        const currentOffer = (data?.offers || []).find(
          (offer) => offer.offererUsername === myUsername && ['pending', 'selected'].includes(offer.status)
        ) || null;

        setExistingOffer(currentOffer);
        setCountdownActive(Boolean(data?.countdownActive || data?.leadingOffer || data?.leadingOfferSummary));
        setLeadingOfferSummary(data?.leadingOfferSummary || null);
        setLeadingOffer(data?.leadingOffer || null);
        if (currentOffer?.status === 'pending') {
          setOfferAssets(currentOffer.assets || []);
          setMessage(currentOffer.message || '');
        }
      } catch {
        if (!cancelled) {
          setExistingOffer(null);
          setCountdownActive(false);
          setLeadingOfferSummary(null);
          setLeadingOffer(null);
        }
      } finally {
        if (!cancelled) setLoadingExistingOffer(false);
      }
    }

    loadExistingOffer();
    return () => { cancelled = true; };
  }, [actingUsername, listing?.listingId, myUsername]);

  const showLeadingOffer = countdownActive && (leadingOfferSummary || leadingOffer);

  // Live criteria validation
  const { meets, violations } = useMemo(() => {
    if (!listing?.criteria || offerAssets.length === 0) return { meets: true, violations: [] };
    const criteria = listing.criteria;
    const violations = [];
    const players = offerAssets.filter((a) => a.assetType === 'player');
    const picks = offerAssets.filter((a) => a.assetType === 'pick');
    const totalKtc = offerAssets.reduce((s, a) => s + Number(a.ktcValue || a.pickKtcValue || 0), 0);
    const totalBv = offerAssets.reduce((s, a) => s + Number(a.bvValue || 0), 0);

    if (criteria.acceptPlayers === false && players.length > 0) violations.push('Players not accepted');
    if (criteria.acceptPicks === false && picks.length > 0) violations.push('Draft picks not accepted');
    if (criteria.maxPlayers != null && players.length > Number(criteria.maxPlayers)) violations.push(`Max ${criteria.maxPlayers} players`);
    if (criteria.maxPicks != null && picks.length > Number(criteria.maxPicks)) violations.push(`Max ${criteria.maxPicks} picks`);
    if (criteria.maxTotalAssets != null && offerAssets.length > Number(criteria.maxTotalAssets)) violations.push(`Max ${criteria.maxTotalAssets} assets`);
    if (criteria.minTotalKtc != null && totalKtc < Number(criteria.minTotalKtc)) violations.push(`Min KTC ${criteria.minTotalKtc} (you have ${Math.round(totalKtc)})`);
    if (criteria.minTotalBv != null && totalBv < Number(criteria.minTotalBv)) violations.push(`Min BV ${criteria.minTotalBv}`);
    for (const p of players) {
      if (criteria.positions?.length && !criteria.positions.includes(p.position)) violations.push(`${p.playerName}: position ${p.position} not wanted`);
      if (criteria.minKtc != null && Number(p.ktcValue || 0) < Number(criteria.minKtc)) violations.push(`${p.playerName}: KTC below minimum`);
      if (criteria.maxAge != null && Number(p.age || 0) > Number(criteria.maxAge)) violations.push(`${p.playerName}: Age above maximum`);
      if (criteria.maxSalary != null && Number(p.salary || 0) > Number(criteria.maxSalary)) violations.push(`${p.playerName}: Salary too high`);
    }
    return { meets: violations.length === 0, violations };
  }, [offerAssets, listing?.criteria]);

  async function handleSubmit() {
    if (offerAssets.length === 0) { setError('Add at least one asset to your offer.'); return; }
    if (listing?.filterMode === 'hard' && !meets) {
      setError('Your offer does not meet the required criteria.');
      return;
    }
    if (existingOffer?.status === 'selected') {
      setError('Your currently selected offer on this listing cannot be edited.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const isEditingExistingOffer = existingOffer?.status === 'pending';
      const res = await fetch(
        isEditingExistingOffer
          ? `/api/trade-block/${listing.listingId}/offers/${existingOffer.offerId}`
          : `/api/trade-block/${listing.listingId}/offers`,
        {
        method: isEditingExistingOffer ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(actingUsername ? { 'x-trade-block-acting-user': actingUsername } : {}),
        },
        body: JSON.stringify(isEditingExistingOffer ? { action: 'update', assets: offerAssets, message } : { assets: offerAssets, message }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Failed to submit offer.'); setSubmitting(false); return; }
      onSuccess?.();
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#020817]/98 shadow-2xl">
        {/* Header */}
        <div className="border-b border-white/10 bg-white/[0.02] px-5 py-4">
          <button
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white transition"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
          <h2 className="text-xl font-bold text-white pr-12">
            {existingOffer?.status === 'pending' ? 'Edit Offer' : 'Make an Offer'}
          </h2>
          <p className="text-sm text-white/50 mt-1">
            For <span className="text-white font-semibold">{assetLabel(listedAsset)}</span> from <span className="text-white/70">{listing?.posterUsername}</span>
          </p>
        </div>

        <div className="overflow-y-auto px-5 py-5 space-y-4 flex-1">
          {loadingExistingOffer && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55">Loading your existing offer…</div>
          )}

          {!loadingExistingOffer && existingOffer?.status === 'pending' && (
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
              You already have a pending offer on this listing. Updating this form will edit that offer instead of creating a new one.
            </div>
          )}

          {!loadingExistingOffer && existingOffer?.status === 'selected' && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              You already have the selected offer on this listing. That offer cannot be replaced with a new one.
            </div>
          )}

          {!loadingExistingOffer && showLeadingOffer && (
            <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-200/80">Countdown Leader</div>
                  <div className="mt-1 text-sm font-semibold text-orange-50">Current leading offer</div>
                </div>
                {leadingOfferSummary?.assetCount > 0 && (
                  <div className="rounded-full border border-orange-400/25 bg-orange-300/10 px-2.5 py-1 text-[11px] font-semibold text-orange-100/90">
                    {leadingOfferSummary.assetCount} {leadingOfferSummary.assetCount === 1 ? 'asset' : 'assets'}
                  </div>
                )}
              </div>

              {leadingOffer && Array.isArray(leadingOffer.assets) && leadingOffer.assets.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {leadingOffer.assets.map((asset, index) => (
                    <AssetTag key={`${asset.assetType || 'asset'}-${asset.playerId || asset.round || index}-${index}`} asset={asset} />
                  ))}
                  <div className="flex gap-3 flex-wrap pt-1">
                    {Number(leadingOffer.totalKtc || 0) > 0 && (
                      <div className="rounded-xl border border-orange-400/20 bg-black/15 px-3 py-2">
                        <div className="text-[10px] text-orange-100/60">Total KTC</div>
                        <div className="text-sm font-bold text-orange-50">{Number(leadingOffer.totalKtc).toLocaleString()}</div>
                      </div>
                    )}
                    {Number(leadingOffer.totalBv || 0) > 0 && (
                      <div className="rounded-xl border border-orange-400/20 bg-black/15 px-3 py-2">
                        <div className="text-[10px] text-orange-100/60">Total BV</div>
                        <div className="text-sm font-bold text-orange-50">{Number(leadingOffer.totalBv).toLocaleString()}</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : leadingOfferSummary ? (
                <div className="mt-3 flex gap-3 flex-wrap">
                  <div className="rounded-xl border border-orange-400/20 bg-black/15 px-3 py-2">
                    <div className="text-[10px] text-orange-100/60">Leading KTC</div>
                    <div className="text-sm font-bold text-orange-50">{Number(leadingOfferSummary.totalKtc || 0).toLocaleString()}</div>
                  </div>
                  <div className="rounded-xl border border-orange-400/20 bg-black/15 px-3 py-2">
                    <div className="text-[10px] text-orange-100/60">Leading BV</div>
                    <div className="text-sm font-bold text-orange-50">{Number(leadingOfferSummary.totalBv || 0).toLocaleString()}</div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
          )}

          {/* What they're listing */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">They're Offering</div>
            <AssetTag asset={listedAsset} />
          </div>

          {/* Your offer */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Your Offer</div>
            {offerAssets.length === 0 ? (
              <button
                type="button"
                onClick={() => setShowAssetPicker(true)}
                className="w-full rounded-2xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-6 text-white/50 hover:border-white/40 hover:text-white/80 transition text-sm font-semibold"
              >
                + Add Players / Picks
              </button>
            ) : (
              <div className="space-y-2">
                {offerAssets.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1"><AssetTag asset={a} /></div>
                    <button
                      type="button"
                      onClick={() => setOfferAssets((prev) => prev.filter((_, j) => j !== i))}
                      className="h-8 w-8 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/50 hover:text-white hover:border-white/25 text-sm transition shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setShowAssetPicker(true)}
                  className="w-full text-xs text-white/40 hover:text-white/70 py-1 transition"
                >
                  + Add another asset
                </button>
              </div>
            )}
          </div>

          {/* Value summary */}
          {offerAssets.length > 0 && (
            <div className="flex gap-3 flex-wrap">
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                <div className="text-[10px] text-white/40">Your Total KTC</div>
                <div className="text-base font-bold text-white">
                  {offerAssets.reduce((s, a) => s + Number(a.ktcValue || a.pickKtcValue || 0), 0).toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                <div className="text-[10px] text-white/40">Their Asset KTC</div>
                <div className="text-base font-bold text-white">
                  {Number(listedAsset.ktcValue || listedAsset.pickKtcValue || 0).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Criteria check */}
          {offerAssets.length > 0 && (
            meets
              ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                  <div className="text-xs text-emerald-300 font-semibold">✓ Meets listing criteria</div>
                </div>
              )
              : <CriteriaViolations violations={violations} filterMode={listing?.filterMode} />
          )}

          {/* Message */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Message (optional)</div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 300))}
              placeholder="Add a message with your offer…"
              rows={2}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-[#FF4B1F]/50"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="border-t border-white/10 bg-white/[0.02] px-5 py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loadingExistingOffer || submitting || existingOffer?.status === 'selected' || offerAssets.length === 0 || (listing?.filterMode === 'hard' && !meets)}
            className="inline-flex items-center rounded-2xl border border-[#FF4B1F]/40 bg-[#FF4B1F] px-6 py-2 text-sm font-semibold text-white hover:bg-[#ff6a3c] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (existingOffer?.status === 'pending' ? 'Updating…' : 'Submitting…') : (existingOffer?.status === 'pending' ? 'Update Offer' : 'Submit Offer')}
          </button>
        </div>
      </div>

      {showAssetPicker && (
        <SimpleAssetPicker
          myUsername={myUsername}
          mySleeperId={session?.user?.sleeperId}
          myRosterIdOverride={myRosterIdProp}
          playerContracts={playerContracts}
          draftPickAssets={draftPickAssets}
          tradedPicks={tradedPicks}
          rosters={rosters}
          users={users}
          currentSeason={currentSeason}
          listingCriteria={listing?.criteria}
          onSelect={(asset) => { setOfferAssets((prev) => [...prev, asset]); setShowAssetPicker(false); }}
          onClose={() => setShowAssetPicker(false)}
        />
      )}
    </div>
  );
}
