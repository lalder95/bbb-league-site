'use client';
import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import AssistantGMChat from '@/app/my-team/components/AssistantGMChat';
import SimpleAssetPicker from './SimpleAssetPicker';

function cn(...classes) { return classes.filter(Boolean).join(' '); }

const STEPS = [
  { id: 'asset', label: 'Select Asset' },
  { id: 'type', label: 'Posting Type' },
  { id: 'visibility', label: 'Offer Visibility' },
  { id: 'filters', label: 'Filter Mode' },
  { id: 'criteria', label: 'Return Criteria' },
  { id: 'review', label: 'Review & Publish' },
];

const VISIBILITY_OPTIONS = [
  { value: 'full', label: 'Full Leading Offer', description: 'Others can see exactly what the current Pending Offer includes.' },
  { value: 'exists_only', label: 'Only That An Offer Exists', description: 'Others can see the listing has an offer, but not details.' },
  { value: 'countdown_only', label: 'Only That Countdown Has Started', description: 'Others can see when an auction is live, but not offer details.' },
  { value: 'value_summary', label: 'Value Summary Only', description: 'Others can see approximate KTC/BV and asset count, but not exact assets.' },
  { value: 'hidden', label: 'Fully Hidden', description: 'Others cannot see offer status or details.' },
];

const PRESET_PRESETS = {
  rebuild: {
    label: 'Rebuild',
    description: 'Younger players, picks, future value',
    criteria: {
      maxAge: 28,
      minTotalKtc: 0,
      acceptPicks: true,
      acceptPlayers: true,
      maxSalary: 20,
    },
  },
  compete: {
    label: 'Compete',
    description: 'Immediate production, players preferred',
    criteria: {
      maxAge: 32,
      acceptPicks: false,
      acceptPlayers: true,
    },
  },
};

function StepIndicator({ steps, currentStep }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const isActive = step.id === currentStep;
        const isDone = steps.findIndex((s) => s.id === currentStep) > i;
        return (
          <div key={step.id} className="flex items-center gap-1 shrink-0">
            <div className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold transition-all',
              isActive ? 'border-[#FF4B1F] bg-[#FF4B1F] text-white' :
                isDone ? 'border-emerald-500 bg-emerald-500 text-white' :
                  'border-white/20 bg-white/5 text-white/40'
            )}>
              {isDone ? '✓' : i + 1}
            </div>
            <span className={cn('text-xs hidden sm:block', isActive ? 'text-white font-semibold' : isDone ? 'text-emerald-400' : 'text-white/30')}>
              {step.label}
            </span>
            {i < steps.length - 1 && <div className="h-px w-4 bg-white/15 mx-1 hidden sm:block" />}
          </div>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">{children}</div>;
}

function OptionCard({ selected, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl border p-4 text-left transition-all duration-150',
        selected
          ? 'border-[#FF4B1F]/50 bg-[#FF4B1F]/10'
          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]',
        className
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
  if (!asset) return 'None';
  if (asset.assetType === 'player') return asset.playerName || 'Unknown';
  const round = asset.round ? `Round ${asset.round}` : '';
  const season = asset.season ? `${asset.season} ` : '';
  const bucket = asset.bucket ? ` (${asset.bucket})` : '';
  return `${season}${round}${bucket} Pick`.trim();
}

export default function CreateListingWizard({
  onClose,
  onSuccess,
  playerContracts = [],
  draftPickAssets = [],
  tradedPicks = [],
  rosters = [],
  users = [],
  currentSeason,
  leagueWeek,
  settings,
  myRosterId: myRosterIdProp,
  actingUsername,
}) {
  const { data: session } = useSession();
  const [step, setStep] = useState('asset');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  const [postingType, setPostingType] = useState('auction');
  const [countdownDays, setCountdownDays] = useState(Number(settings?.defaultCountdownDays || 3));
  const [offerVisibility, setOfferVisibility] = useState('exists_only');
  const [filterMode, setFilterMode] = useState('flexible');
  const [criteria, setCriteria] = useState({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showAI, setShowAI] = useState(false);

  const minDays = Number(settings?.minCountdownDays || 1);
  const maxDays = Number(settings?.maxCountdownDays || 10);
  const auctionEnabled = settings?.auctionModeEnabled !== false;
  const straightEnabled = settings?.straightTradeModeEnabled !== false;

  const currentStepIndex = STEPS.findIndex((s) => s.id === step);
  const canGoBack = currentStepIndex > 0;
  const canGoNext = currentStepIndex < STEPS.length - 1;

  function applyPreset(presetKey) {
    const preset = PRESET_PRESETS[presetKey];
    if (preset) setCriteria(preset.criteria);
  }

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
    if (!selectedAsset) { setError('Please select an asset to list.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/trade-block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(actingUsername ? { 'x-trade-block-acting-user': actingUsername } : {}),
        },
        body: JSON.stringify({
          asset: selectedAsset,
          postingType,
          countdownDays: postingType === 'auction' ? countdownDays : null,
          offerVisibility,
          filterMode,
          criteria,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Failed to create listing.'); setSubmitting(false); return; }
      onSuccess?.();
    } catch (err) {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  // Build my roster assets for the asset picker
  const myUsername = actingUsername || session?.user?.name || '';

  const aiContext = useMemo(() => {
    if (!selectedAsset) return '';
    return `The user is creating a Trade Block listing for: ${assetLabel(selectedAsset)} (KTC: ${selectedAsset.ktcValue || selectedAsset.pickKtcValue || 0}, Salary: $${selectedAsset.salary || selectedAsset.pickSalary || 0}/yr). Help them decide on posting type, filter mode, countdown length, and return criteria.`;
  }, [selectedAsset]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#020817]/98 shadow-2xl">
        {/* Header */}
        <div className="border-b border-white/10 bg-white/[0.02] px-5 py-4">
          <button
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
          <h2 className="text-xl font-bold text-white pr-12">New Trade Block Listing</h2>
          <div className="mt-3">
            <StepIndicator steps={STEPS} currentStep={step} />
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-5 space-y-5 flex-1">
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
          )}

          {/* STEP: asset */}
          {step === 'asset' && (
            <div className="space-y-4">
              <div>
                <SectionLabel>Select the asset you want to list</SectionLabel>
                <p className="text-sm text-white/55 mb-4">Choose one player or draft pick from your roster to put on the trade block.</p>
              </div>

              {selectedAsset ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-emerald-400/70 mb-0.5">Selected Asset</div>
                    <div className="font-semibold text-white">{assetLabel(selectedAsset)}</div>
                    {(selectedAsset.ktcValue || selectedAsset.pickKtcValue) && (
                      <div className="text-xs text-white/50 mt-0.5">KTC: {(selectedAsset.ktcValue || selectedAsset.pickKtcValue || 0).toLocaleString()}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAssetPicker(true)}
                    className="text-xs text-white/50 hover:text-white underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAssetPicker(true)}
                  className="w-full rounded-2xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-8 text-white/50 hover:border-white/40 hover:text-white/80 transition-all text-sm font-semibold"
                >
                  + Choose a Player or Draft Pick
                </button>
              )}
            </div>
          )}

          {/* STEP: type */}
          {step === 'type' && (
            <div className="space-y-4">
              <SectionLabel>Posting Type</SectionLabel>
              <div className="space-y-3">
                {auctionEnabled && (
                  <OptionCard selected={postingType === 'auction'} onClick={() => setPostingType('auction')}>
                    <div className="flex items-start gap-3">
                      <div className={cn('mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 transition', postingType === 'auction' ? 'border-[#FF4B1F] bg-[#FF4B1F]' : 'border-white/30')} />
                      <div>
                        <div className="font-semibold text-white">Auction Trade</div>
                        <div className="text-xs text-white/55 mt-1">Select a preferred offer to start a countdown. Others can submit competing offers until time expires. More competitive — less likely to benefit the first bidder.</div>
                      </div>
                    </div>
                    {postingType === 'auction' && (
                      <div className="mt-4 pl-7">
                        <SectionLabel>Countdown Length ({minDays}–{maxDays} days)</SectionLabel>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={minDays}
                            max={maxDays}
                            value={countdownDays}
                            onChange={(e) => setCountdownDays(Number(e.target.value))}
                            className="flex-1 accent-[#FF4B1F]"
                          />
                          <span className="text-white font-semibold w-12 text-center">{countdownDays}d</span>
                        </div>
                      </div>
                    )}
                  </OptionCard>
                )}
                {straightEnabled && (
                  <OptionCard selected={postingType === 'straight'} onClick={() => setPostingType('straight')}>
                    <div className="flex items-start gap-3">
                      <div className={cn('mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 transition', postingType === 'straight' ? 'border-[#FF4B1F] bg-[#FF4B1F]' : 'border-white/30')} />
                      <div>
                        <div className="font-semibold text-white">Straight Trade</div>
                        <div className="text-xs text-white/55 mt-1">Accept one offer immediately. No countdown, no competing bids. Faster and simpler, but less competitive.</div>
                      </div>
                    </div>
                  </OptionCard>
                )}
              </div>

              {/* Assistant GM */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAI((v) => !v)}
                  className="text-xs text-[#FF4B1F] hover:underline"
                >
                  {showAI ? 'Hide' : 'Ask'} Assistant GM for advice
                </button>
                {showAI && (
                  <div className="mt-3 rounded-2xl border border-white/10 overflow-hidden max-h-80">
                    <AssistantGMChat
                      id="trade-block-wizard"
                      teamState="Compete"
                      assetPriority={['QB', 'RB', 'WR', 'TE', 'Picks']}
                      strategyNotes=""
                      myContracts={myContracts}
                      playerContracts={playerContracts}
                      session={session}
                      tradedPicks={tradedPicks}
                      rosters={rosters}
                      users={users}
                      leagueWeek={leagueWeek}
                      leagueYear={currentSeason}
                      activeTab="Trade Block"
                      supplementalSystemPrompt={aiContext}
                      autoMessage={selectedAsset ? `I'm listing ${assetLabel(selectedAsset)} on the trade block. Should I use straight trade or auction trade? What countdown length makes sense and what should I set as criteria?` : ''}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP: visibility */}
          {step === 'visibility' && (
            <div className="space-y-3">
              <SectionLabel>How much offer information is visible to other users?</SectionLabel>
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
          )}

          {/* STEP: filters */}
          {step === 'filters' && (
            <div className="space-y-4">
              <SectionLabel>Filter Mode</SectionLabel>
              <p className="text-sm text-white/55">Choose how your return criteria are enforced.</p>
              <div className="space-y-3">
                <OptionCard selected={filterMode === 'hard'} onClick={() => setFilterMode('hard')}>
                  <div className="flex items-start gap-3">
                    <div className={cn('mt-0.5 h-4 w-4 rounded-full border-2 shrink-0', filterMode === 'hard' ? 'border-[#FF4B1F] bg-[#FF4B1F]' : 'border-white/30')} />
                    <div>
                      <div className="font-semibold text-white">Hard Rules</div>
                      <div className="text-xs text-white/50 mt-1">Offers that don't meet your criteria cannot be submitted. Keeps the board clean but may block creative offers.</div>
                    </div>
                  </div>
                </OptionCard>
                <OptionCard selected={filterMode === 'flexible'} onClick={() => setFilterMode('flexible')}>
                  <div className="flex items-start gap-3">
                    <div className={cn('mt-0.5 h-4 w-4 rounded-full border-2 shrink-0', filterMode === 'flexible' ? 'border-[#FF4B1F] bg-[#FF4B1F]' : 'border-white/30')} />
                    <div>
                      <div className="font-semibold text-white">Flexible Filters</div>
                      <div className="text-xs text-white/50 mt-1">Offers that miss your criteria are flagged but still allowed. You communicate preferences without blocking creative packages.</div>
                    </div>
                  </div>
                </OptionCard>
              </div>
            </div>
          )}

          {/* STEP: criteria */}
          {step === 'criteria' && (
            <div className="space-y-5">
              <SectionLabel>Return Criteria</SectionLabel>
              {/* Presets */}
              <div>
                <div className="text-xs text-white/50 mb-2">Quick presets:</div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(PRESET_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyPreset(key)}
                      className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 transition"
                    >
                      {preset.label}
                      <span className="ml-1 text-white/40 font-normal">— {preset.description}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCriteria({})}
                    className="rounded-xl border border-white/10 bg-transparent px-3 py-1.5 text-xs text-white/40 hover:text-white/70 transition"
                  >
                    Clear
                  </button>
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
                    {[1, 2, 3, 4, 5, 6, 7].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleArrayCriteria('pickRounds', r)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-bold transition',
                          Array.isArray(criteria.pickRounds) && criteria.pickRounds.includes(r)
                            ? 'border-[#FF4B1F]/50 bg-[#FF4B1F]/20 text-[#FF4B1F]'
                            : 'border-white/15 bg-white/5 text-white/60 hover:border-white/30'
                        )}
                      >
                        {getOrdinalRoundLabel(r)}
                      </button>
                    ))}
                  </div>
                </CriteriaRow>
              </div>

              {/* Notes */}
              <div>
                <SectionLabel>Notes (optional)</SectionLabel>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                  placeholder="e.g. Looking for a young WR and a mid 1st…"
                  rows={3}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-[#FF4B1F]/50"
                />
                <div className="text-xs text-white/30 text-right mt-1">{notes.length}/500</div>
              </div>
            </div>
          )}

          {/* STEP: review */}
          {step === 'review' && (
            <div className="space-y-4">
              <SectionLabel>Review Your Listing</SectionLabel>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] divide-y divide-white/8">
                {[
                  ['Asset', assetLabel(selectedAsset)],
                  ['Posting Type', postingType === 'auction' ? `Auction Trade (${countdownDays}d countdown)` : 'Straight Trade'],
                  ['Offer Visibility', VISIBILITY_OPTIONS.find((o) => o.value === offerVisibility)?.label || offerVisibility],
                  ['Filter Mode', filterMode === 'hard' ? 'Hard Rules' : 'Flexible Filters'],
                  ['Notes', notes || '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 px-4 py-3">
                    <span className="text-xs text-white/45 shrink-0">{label}</span>
                    <span className="text-sm text-white text-right">{value}</span>
                  </div>
                ))}
              </div>
              {Object.keys(criteria).filter((k) => criteria[k] != null && criteria[k] !== false).length > 0 && (
                <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                  <SectionLabel>Criteria</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {criteria.positions?.length > 0 && <span className="text-xs text-white/60 bg-white/8 border border-white/10 rounded-full px-2 py-0.5">Positions: {criteria.positions.join(', ')}</span>}
                    {criteria.minTotalKtc > 0 && <span className="text-xs text-white/60 bg-white/8 border border-white/10 rounded-full px-2 py-0.5">Min KTC: {criteria.minTotalKtc}</span>}
                    {criteria.minTotalBv > 0 && <span className="text-xs text-white/60 bg-white/8 border border-white/10 rounded-full px-2 py-0.5">Min BV: {criteria.minTotalBv}</span>}
                    {criteria.pickRounds?.length > 0 && <span className="text-xs text-white/60 bg-white/8 border border-white/10 rounded-full px-2 py-0.5">Rounds: {criteria.pickRounds.map(getOrdinalRoundLabel).join(', ')}</span>}
                    {criteria.acceptPicks === false && <span className="text-xs text-red-300/80 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">No picks</span>}
                    {criteria.acceptPlayers === false && <span className="text-xs text-red-300/80 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">No players</span>}
                    {criteria.maxAge > 0 && <span className="text-xs text-white/60 bg-white/8 border border-white/10 rounded-full px-2 py-0.5">Max age: {criteria.maxAge}</span>}
                    {criteria.maxSalary > 0 && <span className="text-xs text-white/60 bg-white/8 border border-white/10 rounded-full px-2 py-0.5">Max salary: ${criteria.maxSalary}/yr</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 bg-white/[0.02] px-5 py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => canGoBack ? setStep(STEPS[currentStepIndex - 1].id) : onClose?.()}
            className="inline-flex items-center rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition"
          >
            {canGoBack ? '← Back' : 'Cancel'}
          </button>

          {step === 'review' ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !selectedAsset}
              className="inline-flex items-center rounded-2xl border border-[#FF4B1F]/40 bg-[#FF4B1F] px-6 py-2 text-sm font-semibold text-white hover:bg-[#ff6a3c] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Publishing…' : 'Publish Listing'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (step === 'asset' && !selectedAsset) { setError('Please select an asset first.'); return; }
                setError('');
                setStep(STEPS[currentStepIndex + 1].id);
              }}
              disabled={!canGoNext}
              className="inline-flex items-center rounded-2xl border border-[#FF4B1F]/40 bg-[#FF4B1F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#ff6a3c] transition disabled:opacity-50"
            >
              Next →
            </button>
          )}
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
          onSelect={(asset) => { setSelectedAsset(asset); setShowAssetPicker(false); }}
          onClose={() => setShowAssetPicker(false)}
        />
      )}
    </div>
  );
}
