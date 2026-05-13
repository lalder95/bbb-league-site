'use client';
import { useEffect, useMemo, useState } from 'react';

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

function SectionLabel({ children }) {
  return <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">{children}</div>;
}

function OptionCard({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl border p-4 text-left transition-all duration-150',
        selected
          ? 'border-[#FF4B1F]/50 bg-[#FF4B1F]/10'
          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]'
      )}
    >
      {children}
    </button>
  );
}

function CriteriaRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <label className="text-sm text-white/70 pt-2 shrink-0 w-36">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, placeholder }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF4B1F]/50 focus:bg-white/[0.07]"
    />
  );
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

function assetLabel(asset) {
  if (!asset) return 'Unknown';
  if (asset.assetType === 'player') return asset.playerName || 'Unknown Player';
  const round = asset.round ? `Round ${asset.round}` : '';
  const season = asset.season ? `${asset.season} ` : '';
  const bucket = asset.bucket ? ` (${asset.bucket})` : '';
  return `${season}${round}${bucket} Pick`.trim();
}

const VISIBILITY_OPTIONS = [
  { value: 'full', label: 'Full Leading Offer', description: 'Others can see exactly what the current Pending Offer includes.' },
  { value: 'exists_only', label: 'Only That An Offer Exists', description: 'Others can see the listing has an offer, but not details.' },
  { value: 'countdown_only', label: 'Only That Countdown Has Started', description: 'Others can see when an auction is live, but not offer details.' },
  { value: 'value_summary', label: 'Value Summary Only', description: 'Others can see approximate KTC/BV and asset count, but not exact assets.' },
  { value: 'hidden', label: 'Fully Hidden', description: 'Others cannot see offer status or details.' },
];

export default function EditListingModal({ listing, settings, onClose, onSuccess, actingUsername }) {
  const minDays = Number(settings?.minCountdownDays || 1);
  const maxDays = Number(settings?.maxCountdownDays || 10);
  const [hasActiveOffers, setHasActiveOffers] = useState(Boolean(listing?.pendingOfferId));
  const [offersStateResolved, setOffersStateResolved] = useState(false);
  const canEditStructure = !hasActiveOffers;

  const [offerVisibility, setOfferVisibility] = useState(listing?.offerVisibility || 'exists_only');
  const [filterMode, setFilterMode] = useState(listing?.filterMode || 'flexible');
  const [criteria, setCriteria] = useState(listing?.criteria || {});
  const [countdownDays, setCountdownDays] = useState(
    Number(listing?.countdownDays || settings?.defaultCountdownDays || 3)
  );
  const [notes, setNotes] = useState(listing?.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadOffersState() {
      if (!listing?.listingId) {
        setHasActiveOffers(Boolean(listing?.pendingOfferId));
        setOffersStateResolved(true);
        return;
      }

      try {
        const res = await fetch(`/api/trade-block/${listing.listingId}`);
        const data = await res.json();
        if (!cancelled && res.ok) {
          const offers = Array.isArray(data?.offers) ? data.offers : [];
          setHasActiveOffers(offers.some((offer) => ['pending', 'selected'].includes(offer.status)));
        }
      } catch {
        if (!cancelled) {
          setHasActiveOffers(Boolean(listing?.pendingOfferId));
        }
      } finally {
        if (!cancelled) setOffersStateResolved(true);
      }
    }

    loadOffersState();
    return () => { cancelled = true; };
  }, [listing?.listingId, listing?.pendingOfferId]);

  const summaryChips = useMemo(() => {
    const chips = [];
    if (criteria.positions?.length > 0) chips.push(`Positions: ${criteria.positions.join(', ')}`);
    if (criteria.minTotalKtc > 0) chips.push(`Min KTC: ${criteria.minTotalKtc}`);
    if (criteria.minTotalBv > 0) chips.push(`Min BV: ${criteria.minTotalBv}`);
    if (criteria.pickRounds?.length > 0) chips.push(`Rounds: ${criteria.pickRounds.map(getOrdinalRoundLabel).join(', ')}`);
    if (criteria.acceptPicks === false) chips.push('No picks');
    if (criteria.acceptPlayers === false) chips.push('No players');
    if (criteria.maxAge > 0) chips.push(`Max age: ${criteria.maxAge}`);
    if (criteria.maxSalary > 0) chips.push(`Max salary: $${criteria.maxSalary}/yr`);
    return chips;
  }, [criteria]);

  function updateCriteria(key, value) {
    setCriteria((prev) => ({ ...prev, [key]: value }));
  }

  function toggleArrayCriteria(key, value) {
    setCriteria((prev) => {
      const arr = Array.isArray(prev[key]) ? prev[key] : [];
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        offerVisibility,
        notes,
      };

      if (canEditStructure) {
        payload.filterMode = filterMode;
        payload.criteria = criteria;
        if (listing?.postingType === 'auction') {
          payload.countdownDays = countdownDays;
        }
      }

      const res = await fetch(`/api/trade-block/${listing.listingId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(actingUsername ? { 'x-trade-block-acting-user': actingUsername } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed to update listing.');
        setSubmitting(false);
        return;
      }
      onSuccess?.();
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#020817]/98 shadow-2xl">
        <div className="border-b border-white/10 bg-white/[0.02] px-5 py-4">
          <button
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
          <h2 className="pr-12 text-xl font-bold text-white">Edit Listing</h2>
          <p className="mt-1 text-sm text-white/45">
            Update the live settings for {assetLabel(listing?.asset)}.
          </p>
        </div>

        <div className="overflow-y-auto px-5 py-5 space-y-5 flex-1">
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] divide-y divide-white/8">
            {[
              ['Asset', assetLabel(listing?.asset)],
              ['Posting Type', listing?.postingType === 'auction' ? 'Auction Trade' : 'Straight Trade'],
              ['Status', listing?.status || 'open'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 px-4 py-3">
                <span className="text-xs text-white/45 shrink-0">{label}</span>
                <span className="text-sm text-right text-white">{value}</span>
              </div>
            ))}
          </div>

          {offersStateResolved && hasActiveOffers && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/85">
              This listing has a pending or accepted offer, so only notes and offer visibility can be changed right now.
            </div>
          )}

          <div className="space-y-3">
            <SectionLabel>Offer Visibility</SectionLabel>
            {VISIBILITY_OPTIONS.map((opt) => (
              <OptionCard key={opt.value} selected={offerVisibility === opt.value} onClick={() => setOfferVisibility(opt.value)}>
                <div className="flex items-start gap-3">
                  <div className={cn('mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 transition', offerVisibility === opt.value ? 'border-[#FF4B1F] bg-[#FF4B1F]' : 'border-white/30')} />
                  <div>
                    <div className="font-semibold text-white text-sm">{opt.label}</div>
                    <div className="text-xs text-white/50 mt-0.5">{opt.description}</div>
                  </div>
                </div>
              </OptionCard>
            ))}
          </div>

          {canEditStructure && (
            <>
              {listing?.postingType === 'auction' && (
                <div>
                  <SectionLabel>Countdown Length ({minDays}–{maxDays} days)</SectionLabel>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={minDays}
                        max={maxDays}
                        value={countdownDays}
                        onChange={(e) => setCountdownDays(Number(e.target.value))}
                        className="flex-1 accent-[#FF4B1F]"
                      />
                      <span className="w-12 text-center font-semibold text-white">{countdownDays}d</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <SectionLabel>Filter Mode</SectionLabel>
                <div className="space-y-3">
                  <OptionCard selected={filterMode === 'hard'} onClick={() => setFilterMode('hard')}>
                    <div className="font-semibold text-white">Hard Rules</div>
                    <div className="mt-1 text-xs text-white/50">Block offers that miss your criteria.</div>
                  </OptionCard>
                  <OptionCard selected={filterMode === 'flexible'} onClick={() => setFilterMode('flexible')}>
                    <div className="font-semibold text-white">Flexible Filters</div>
                    <div className="mt-1 text-xs text-white/50">Allow creative offers while still flagging misses.</div>
                  </OptionCard>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                <SectionLabel>Total Offer</SectionLabel>
                <CriteriaRow label="Min KTC">
                  <NumberInput value={criteria.minTotalKtc} onChange={(v) => updateCriteria('minTotalKtc', v)} min={0} placeholder="e.g. 3000" />
                </CriteriaRow>
                <CriteriaRow label="Min BV">
                  <NumberInput value={criteria.minTotalBv} onChange={(v) => updateCriteria('minTotalBv', v)} min={0} placeholder="e.g. 2000" />
                </CriteriaRow>
                <CriteriaRow label="Max Assets">
                  <NumberInput value={criteria.maxTotalAssets} onChange={(v) => updateCriteria('maxTotalAssets', v)} min={1} max={10} placeholder="e.g. 3" />
                </CriteriaRow>
                <CriteriaRow label="Max Players">
                  <NumberInput value={criteria.maxPlayers} onChange={(v) => updateCriteria('maxPlayers', v)} min={0} max={10} placeholder="e.g. 2" />
                </CriteriaRow>
                <CriteriaRow label="Max Picks">
                  <NumberInput value={criteria.maxPicks} onChange={(v) => updateCriteria('maxPicks', v)} min={0} max={10} placeholder="e.g. 2" />
                </CriteriaRow>
                <div className="flex gap-6 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-white/70">
                    <input type="checkbox" checked={criteria.acceptPlayers !== false} onChange={(e) => updateCriteria('acceptPlayers', e.target.checked ? undefined : false)} className="accent-[#FF4B1F]" />
                    Accept Players
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-white/70">
                    <input type="checkbox" checked={criteria.acceptPicks !== false} onChange={(e) => updateCriteria('acceptPicks', e.target.checked ? undefined : false)} className="accent-[#FF4B1F]" />
                    Accept Picks
                  </label>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                <SectionLabel>Player Criteria</SectionLabel>
                <CriteriaRow label="Positions">
                  <div className="flex flex-wrap gap-1.5">
                    {['QB', 'RB', 'WR', 'TE'].map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => toggleArrayCriteria('positions', pos)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-bold transition',
                          Array.isArray(criteria.positions) && criteria.positions.includes(pos)
                            ? 'border-[#FF4B1F]/50 bg-[#FF4B1F]/20 text-[#FF4B1F]'
                            : 'border-white/15 bg-white/5 text-white/60 hover:border-white/30'
                        )}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </CriteriaRow>
                <CriteriaRow label="Min KTC">
                  <NumberInput value={criteria.minKtc} onChange={(v) => updateCriteria('minKtc', v)} min={0} placeholder="per player" />
                </CriteriaRow>
                <CriteriaRow label="Min BV">
                  <NumberInput value={criteria.minBv} onChange={(v) => updateCriteria('minBv', v)} min={0} placeholder="per player" />
                </CriteriaRow>
                <CriteriaRow label="Max Age">
                  <NumberInput value={criteria.maxAge} onChange={(v) => updateCriteria('maxAge', v)} min={18} max={45} placeholder="e.g. 28" />
                </CriteriaRow>
                <CriteriaRow label="Max Salary">
                  <NumberInput value={criteria.maxSalary} onChange={(v) => updateCriteria('maxSalary', v)} min={0} step={0.5} placeholder="$/yr" />
                </CriteriaRow>
                <CriteriaRow label="Contract Types">
                  <div className="flex flex-wrap gap-1.5">
                    {['Base', 'Extension', 'Rookie', 'Franchise Tag', 'Free Agent', 'Waiver'].map((ct) => (
                      <button
                        key={ct}
                        type="button"
                        onClick={() => toggleArrayCriteria('contractTypes', ct)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-semibold transition',
                          Array.isArray(criteria.contractTypes) && criteria.contractTypes.includes(ct)
                            ? 'border-[#FF4B1F]/50 bg-[#FF4B1F]/20 text-[#FF4B1F]'
                            : 'border-white/15 bg-white/5 text-white/60 hover:border-white/30'
                        )}
                      >
                        {ct}
                      </button>
                    ))}
                  </div>
                </CriteriaRow>
              </div>

              <div className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                <SectionLabel>Pick Criteria</SectionLabel>
                <CriteriaRow label="Rounds">
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7].map((round) => (
                      <button
                        key={round}
                        type="button"
                        onClick={() => toggleArrayCriteria('pickRounds', round)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-bold transition',
                          Array.isArray(criteria.pickRounds) && criteria.pickRounds.includes(round)
                            ? 'border-[#FF4B1F]/50 bg-[#FF4B1F]/20 text-[#FF4B1F]'
                            : 'border-white/15 bg-white/5 text-white/60 hover:border-white/30'
                        )}
                      >
                        {getOrdinalRoundLabel(round)}
                      </button>
                    ))}
                  </div>
                </CriteriaRow>
              </div>
            </>
          )}

          <div>
            <SectionLabel>Notes</SectionLabel>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              placeholder="Update what you're looking for or how flexible you are."
              rows={4}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-[#FF4B1F]/50"
            />
            <div className="mt-1 text-right text-xs text-white/30">{notes.length}/500</div>
          </div>

          {summaryChips.length > 0 && canEditStructure && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
              <SectionLabel>Current Criteria Summary</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {summaryChips.map((chip) => (
                  <span key={chip} className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-xs text-white/60">
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

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
            disabled={submitting}
            className="inline-flex items-center rounded-2xl border border-[#FF4B1F]/40 bg-[#FF4B1F] px-6 py-2 text-sm font-semibold text-white hover:bg-[#ff6a3c] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
