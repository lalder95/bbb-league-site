'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import PlayerProfileCard from '@/app/my-team/components/PlayerProfileCard';
import { getAssetBudgetValue, getAssetKey, getDisplayDraftSlot, isDraftPickAsset } from '@/utils/draftPickTradeUtils';

const DEFAULT_POSITION_FILTER = 'ALL';
const DEFAULT_SORT_OPTION = 'name-asc';

const formatSalary = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '$-';
  return `$${numeric.toFixed(1)}`;
};

const getLeagueYearLabel = (baseSeason, yearKey) => {
  const resolvedBaseSeason = Number(baseSeason) || new Date().getFullYear();
  const offsets = {
    curYear: 0,
    year2: 1,
    year3: 2,
    year4: 3,
  };

  return String(resolvedBaseSeason + (offsets[yearKey] || 0));
};

const formatContractYearValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return '-';
  return formatSalary(numeric);
};

const getPlayerNameStyle = (name) => {
  const length = String(name || '').trim().length;
  if (length <= 10) return { fontSize: '1.12rem', letterSpacing: '0em' };
  if (length <= 14) return { fontSize: '1.02rem', letterSpacing: '-0.01em' };
  if (length <= 18) return { fontSize: '0.94rem', letterSpacing: '-0.015em' };
  if (length <= 22) return { fontSize: '0.86rem', letterSpacing: '-0.02em' };
  if (length <= 26) return { fontSize: '0.78rem', letterSpacing: '-0.025em' };
  return { fontSize: '0.72rem', letterSpacing: '-0.03em' };
};

const getBudgetValue = (asset, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition }) => {
  const value = getAssetBudgetValue(asset, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition });
  return Number.isNaN(value) ? null : value;
};

const carouselLaneVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: 'easeOut',
      staggerChildren: 0.045,
    },
  },
};

const carouselCardVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.22, ease: 'easeOut' },
  },
};

const modeButtonClassName = (active) => (
  `flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${active ? 'border-[#FF4B1F]/40 bg-[#FF4B1F]/20 text-[#FFD0C2]' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'}`
);

function PickerToolbarButton({ active, label, children, onClick, type = 'button' }) {
  return (
    <button type={type} className={modeButtonClassName(active)} onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  );
}

function PlayersIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4.5 w-4.5" aria-hidden="true">
      <path d="M6.5 7.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />
      <path d="M13.75 8.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z" />
      <path d="M2.75 15.75a3.75 3.75 0 0 1 7.5 0" />
      <path d="M11 15.75a2.75 2.75 0 0 1 5.5 0" />
    </svg>
  );
}

function PicksIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4.5 w-4.5" aria-hidden="true">
      <path d="M4 5.75h12" />
      <path d="M4 10h12" />
      <path d="M4 14.25h7.5" />
      <path d="m13.5 13.25 1.5 1.5 3-3" />
    </svg>
  );
}

function CarouselIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4.5 w-4.5" aria-hidden="true">
      <rect x="2.75" y="5" width="4" height="10" rx="1.2" />
      <rect x="8" y="3.5" width="4" height="13" rx="1.2" />
      <rect x="13.25" y="5" width="4" height="10" rx="1.2" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4.5 w-4.5" aria-hidden="true">
      <rect x="3" y="4" width="14" height="12" rx="1.4" />
      <path d="M3 8h14" />
      <path d="M8 8v8" />
      <path d="M13 8v8" />
    </svg>
  );
}

function CarouselNavButton({ direction, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      aria-label={direction === 'previous' ? 'Scroll previous assets' : 'Scroll next assets'}
    >
      <span className="text-lg leading-none">{direction === 'previous' ? '<' : '>'}</span>
    </button>
  );
}

function PlayerCarouselCard({
  player,
  currentSeason,
  selected,
  onToggle,
  onOpenInfo,
  ktcPerDollar,
  usePositionRatios,
  positionRatios,
  avgKtcByPosition,
}) {
  const budgetValue = getBudgetValue(player, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition });
  const contractYearLabels = {
    curYear: getLeagueYearLabel(currentSeason, 'curYear'),
    year2: getLeagueYearLabel(currentSeason, 'year2'),
    year3: getLeagueYearLabel(currentSeason, 'year3'),
    year4: getLeagueYearLabel(currentSeason, 'year4'),
  };

  return (
    <motion.article
      variants={carouselCardVariants}
      whileHover={{ y: -4, scale: 1.01 }}
      className={`flex h-full min-h-[28rem] w-[18rem] shrink-0 snap-start flex-col rounded-2xl border bg-[#02111f] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.24)] transition-all ${selected ? 'border-[#FF4B1F] bg-[#1B0C08]' : 'border-white/10'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">Player</div>
          <div className="mt-1 pr-2 font-bold leading-tight text-white" style={getPlayerNameStyle(player.playerName)}>
            {player.playerName}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenInfo(player)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
        >
          Info
        </button>
      </div>

      <div className="mt-4 flex items-center justify-center rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          <PlayerProfileCard
            playerId={player.id}
            imageExtension="png"
            expanded={false}
            className="h-20 w-20"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/55">Position</div>
          <div className="mt-1 text-3xl font-black leading-none text-blue-100">{player.position || '-'}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/55">Age</div>
          <div className="mt-1 text-3xl font-black leading-none text-white">{player.age || '-'}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">KTC</div>
          <div className="mt-1 text-base font-bold text-white">{Math.round(Number(player.ktcValue) || 0).toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">BV</div>
          <div className="mt-1 text-base font-bold text-[#FFB199]">{budgetValue ?? '-'}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Cap</div>
          <div className="mt-1 text-base font-bold text-emerald-200">{formatSalary(player.curYear)}</div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white/80">
        <div className="flex items-center justify-between gap-3">
          <span className="text-white/55">Type</span>
          <span className="text-right font-semibold text-white">{player.contractType || '-'}</span>
        </div>
        <div className="mt-2 space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-white/55">{contractYearLabels.curYear}</span>
            <span>{formatContractYearValue(player.curYear)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-white/55">{contractYearLabels.year2}</span>
            <span>{formatContractYearValue(player.year2)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-white/55">{contractYearLabels.year3}</span>
            <span>{formatContractYearValue(player.year3)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-white/55">{contractYearLabels.year4}</span>
            <span>{formatContractYearValue(player.year4)}</span>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={() => onToggle(player)}
          className={`w-full rounded-xl px-4 py-3 text-sm font-bold transition-colors ${selected ? 'border border-red-500/35 bg-red-500/15 text-red-100 hover:bg-red-500/25' : 'border border-[#FF4B1F]/30 bg-[#FF4B1F]/15 text-[#FFD0C2] hover:bg-[#FF4B1F]/25'}`}
        >
          {selected ? 'Remove Asset' : 'Add Asset'}
        </button>
      </div>
    </motion.article>
  );
}

function PickCarouselCard({ pick, selected, onToggle, ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition }) {
  const budgetValue = getBudgetValue(pick, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition });

  return (
    <motion.article
      variants={carouselCardVariants}
      whileHover={{ y: -4, scale: 1.01 }}
      className={`flex h-full min-h-[23rem] w-[16.5rem] shrink-0 snap-start flex-col rounded-2xl border bg-[#02111f] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.24)] transition-all ${selected ? 'border-[#FF4B1F] bg-[#1B0C08]' : 'border-white/10'}`}
    >
      <div className="rounded-2xl border border-sky-400/20 bg-gradient-to-br from-sky-500/15 via-indigo-500/10 to-violet-500/10 p-4 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-100">Draft Pick</div>
        <div className="mt-2 text-3xl font-black leading-none text-white">R{pick.round}</div>
        <div className="mt-2 text-sm font-semibold text-white/80">{pick.season} {pick.pickBucketLabel}</div>
        <div className="mt-1 text-xs text-white/60">{getDisplayDraftSlot(pick) || pick.playerName}</div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white/80">
        <div className="flex items-center justify-between gap-3">
          <span className="text-white/55">Original Team</span>
          <span className="text-right font-semibold text-white">{pick.originalTeam || '-'}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-white/55">Current Team</span>
          <span className="text-right font-semibold text-white">{pick.team || '-'}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-white/55">Rookie Cap</span>
          <span className="font-semibold text-emerald-200">{formatSalary(pick.pickSalary)}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">KTC</div>
          <div className="mt-1 text-base font-bold text-white">{Math.round(Number(pick.ktcValue) || 0).toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">BV</div>
          <div className="mt-1 text-base font-bold text-[#FFB199]">{budgetValue ?? '-'}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Slot</div>
          <div className="mt-1 text-base font-bold text-white">{getDisplayDraftSlot(pick) || '-'}</div>
        </div>
      </div>

      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={() => onToggle(pick)}
          className={`w-full rounded-xl px-4 py-3 text-sm font-bold transition-colors ${selected ? 'border border-red-500/35 bg-red-500/15 text-red-100 hover:bg-red-500/25' : 'border border-[#FF4B1F]/30 bg-[#FF4B1F]/15 text-[#FFD0C2] hover:bg-[#FF4B1F]/25'}`}
        >
          {selected ? 'Remove Asset' : 'Add Asset'}
        </button>
      </div>
    </motion.article>
  );
}

export default function AssetPickerModal({
  isOpen,
  onClose,
  participant,
  filteredAssets,
  availablePositions,
  setSearchTerm,
  setPositionFilter,
  setSortOption,
  addAsset,
  removeAsset,
  ktcPerDollar,
  usePositionRatios,
  positionRatios,
  avgKtcByPosition,
}) {
  const [assetMode, setAssetMode] = useState('players');
  const [viewMode, setViewMode] = useState('carousel');
  const [popupPlayer, setPopupPlayer] = useState(null);
  const carouselRef = useRef(null);

  const currentSeason = participant?.currentSeason;
  const selectedAssetKeys = useMemo(
    () => new Set((participant?.selectedPlayers || []).map((asset) => getAssetKey(asset))),
    [participant?.selectedPlayers],
  );
  const playerPositionOptions = useMemo(
    () => (availablePositions || []).filter((position) => position && position !== 'PICK'),
    [availablePositions],
  );

  const playerAssets = useMemo(
    () => (filteredAssets || []).filter((asset) => !isDraftPickAsset(asset)),
    [filteredAssets],
  );
  const pickAssets = useMemo(
    () => (filteredAssets || []).filter((asset) => isDraftPickAsset(asset)),
    [filteredAssets],
  );
  const displayedAssets = assetMode === 'players' ? playerAssets : pickAssets;

  useEffect(() => {
    if (!isOpen) {
      setPopupPlayer(null);
      return;
    }

    setAssetMode('players');
    setViewMode('carousel');
    setPopupPlayer(null);
  }, [isOpen, participant?.id]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (popupPlayer) {
          setPopupPlayer(null);
          return;
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, popupPlayer]);

  if (!isOpen || !participant?.team) return null;

  const handleToggleAsset = (asset) => {
    const assetKey = getAssetKey(asset);

    if (selectedAssetKeys.has(assetKey)) {
      removeAsset(assetKey);
      return;
    }

    addAsset(asset);
  };

  const scrollCarousel = (delta) => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const sortValue = participant.sortOption || DEFAULT_SORT_OPTION;
  const positionValue = participant.positionFilter || DEFAULT_POSITION_FILTER;
  const searchValue = participant.searchTerm || '';
  const emptyCopy = assetMode === 'players'
    ? 'No players match the current search and filter.'
    : 'No picks match the current search.';

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-stretch justify-center p-0 sm:px-6 sm:py-3">
        <div
          className="flex h-full w-full flex-col overflow-hidden border border-white/10 bg-[#001A2B] sm:h-[calc(100vh-1.5rem)] sm:max-w-6xl sm:rounded-3xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b border-white/10 bg-[#00111F]/95 px-4 py-4 backdrop-blur-sm sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Asset Browser</div>
                <h2 className="mt-1 text-2xl font-black text-[#FF4B1F]">{participant.team}</h2>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/70">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{playerAssets.length} players available</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{pickAssets.length} picks available</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{participant.selectedPlayers.length} selected on page</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="self-start rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>

          <div className="border-b border-white/10 bg-[#001523] px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-black/20 p-2">
              <PickerToolbarButton active={assetMode === 'players'} onClick={() => setAssetMode('players')} label="Show players">
                <PlayersIcon />
              </PickerToolbarButton>
              <PickerToolbarButton active={assetMode === 'picks'} onClick={() => setAssetMode('picks')} label="Show picks">
                <PicksIcon />
              </PickerToolbarButton>

              <div className="mx-1 h-6 w-px bg-white/12" aria-hidden="true" />

              <PickerToolbarButton active={viewMode === 'carousel'} onClick={() => setViewMode('carousel')} label="Carousel view">
                <CarouselIcon />
              </PickerToolbarButton>
              <PickerToolbarButton active={viewMode === 'table'} onClick={() => setViewMode('table')} label="Table view">
                <TableIcon />
              </PickerToolbarButton>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.9fr)_minmax(220px,1fr)]">
              <input
                type="text"
                value={searchValue}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={assetMode === 'players' ? 'Search players by name...' : 'Search picks by season, round, or team...'}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-white outline-none transition-colors placeholder:text-white/35 focus:border-[#FF4B1F]/40"
              />

              {assetMode === 'players' ? (
                <select
                  value={positionValue}
                  onChange={(event) => setPositionFilter(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#0a1929] px-3 py-2.5 text-white outline-none transition-colors focus:border-[#FF4B1F]/40"
                >
                  <option value={DEFAULT_POSITION_FILTER}>All Positions</option>
                  {playerPositionOptions.map((position) => (
                    <option key={position} value={position}>{position}</option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white/55">
                  Position filter applies to players only.
                </div>
              )}

              <select
                value={sortValue}
                onChange={(event) => setSortOption(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0a1929] px-3 py-2.5 text-white outline-none transition-colors focus:border-[#FF4B1F]/40"
              >
                <option value="name-asc">Sort: Name (A-Z)</option>
                <option value="cost-desc">Sort: Cost (High-Low)</option>
                <option value="ktc-desc">Sort: KTC (High-Low)</option>
                <option value="bv-desc">Sort: BV (High-Low)</option>
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            {displayedAssets.length === 0 ? (
              <div className="flex h-full min-h-[14rem] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/20 px-6 text-center text-sm text-white/50">
                {emptyCopy}
              </div>
            ) : viewMode === 'carousel' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">{assetMode === 'players' ? 'Player Cards' : 'Pick Cards'}</div>
                    <div className="text-sm text-white/65">Scroll horizontally or use the arrows to browse assets.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CarouselNavButton direction="previous" onClick={() => scrollCarousel(-340)} />
                    <CarouselNavButton direction="next" onClick={() => scrollCarousel(340)} />
                  </div>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`${assetMode}-${viewMode}`}
                    ref={carouselRef}
                    variants={carouselLaneVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
                  >
                    {assetMode === 'players'
                      ? playerAssets.map((player) => (
                          <PlayerCarouselCard
                            key={player.uniqueKey}
                            player={player}
                            currentSeason={currentSeason}
                            selected={selectedAssetKeys.has(getAssetKey(player))}
                            onToggle={handleToggleAsset}
                            onOpenInfo={setPopupPlayer}
                            ktcPerDollar={ktcPerDollar}
                            usePositionRatios={usePositionRatios}
                            positionRatios={positionRatios}
                            avgKtcByPosition={avgKtcByPosition}
                          />
                        ))
                      : pickAssets.map((pick) => (
                          <PickCarouselCard
                            key={pick.uniqueKey}
                            pick={pick}
                            selected={selectedAssetKeys.has(getAssetKey(pick))}
                            onToggle={handleToggleAsset}
                            ktcPerDollar={ktcPerDollar}
                            usePositionRatios={usePositionRatios}
                            positionRatios={positionRatios}
                            avgKtcByPosition={avgKtcByPosition}
                          />
                        ))}
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : assetMode === 'players' ? (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-white/5 text-left text-[11px] uppercase tracking-[0.12em] text-white/60">
                      <tr>
                        <th className="px-3 py-3 font-semibold">Name</th>
                        <th className="px-3 py-3 font-semibold">Pos</th>
                        <th className="px-3 py-3 font-semibold">Age</th>
                        <th className="px-3 py-3 font-semibold">KTC</th>
                        <th className="px-3 py-3 font-semibold">BV</th>
                        <th className="px-3 py-3 font-semibold">Cap</th>
                        <th className="px-3 py-3 font-semibold">Type</th>
                        <th className="px-3 py-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playerAssets.map((player) => {
                        const budgetValue = getBudgetValue(player, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition });
                        const isSelected = selectedAssetKeys.has(getAssetKey(player));

                        return (
                          <tr key={player.uniqueKey} className={`border-t border-white/10 transition-colors ${isSelected ? 'bg-[#FF4B1F]/10' : 'hover:bg-white/5'}`}>
                            <td className="px-3 py-3 font-semibold text-white">{player.playerName}</td>
                            <td className="px-3 py-3 text-white/75">{player.position || '-'}</td>
                            <td className="px-3 py-3 text-white/75">{player.age || '-'}</td>
                            <td className="px-3 py-3 text-white/75">{Math.round(Number(player.ktcValue) || 0).toLocaleString()}</td>
                            <td className="px-3 py-3 text-white/75">{budgetValue ?? '-'}</td>
                            <td className="px-3 py-3 text-white/75">{formatSalary(player.curYear)}</td>
                            <td className="px-3 py-3 text-white/75">{player.contractType || '-'}</td>
                            <td className="px-3 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPopupPlayer(player)}
                                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
                                >
                                  Info
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleAsset(player)}
                                  className={`rounded-full px-3 py-1 text-xs font-semibold ${isSelected ? 'border border-red-500/35 bg-red-500/15 text-red-100 hover:bg-red-500/25' : 'border border-[#FF4B1F]/30 bg-[#FF4B1F]/15 text-[#FFD0C2] hover:bg-[#FF4B1F]/25'}`}
                                >
                                  {isSelected ? 'Remove' : 'Add'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-white/5 text-left text-[11px] uppercase tracking-[0.12em] text-white/60">
                      <tr>
                        <th className="px-3 py-3 font-semibold">Pick</th>
                        <th className="px-3 py-3 font-semibold">Slot</th>
                        <th className="px-3 py-3 font-semibold">KTC</th>
                        <th className="px-3 py-3 font-semibold">BV</th>
                        <th className="px-3 py-3 font-semibold">Cap</th>
                        <th className="px-3 py-3 font-semibold">Original Team</th>
                        <th className="px-3 py-3 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pickAssets.map((pick) => {
                        const budgetValue = getBudgetValue(pick, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition });
                        const isSelected = selectedAssetKeys.has(getAssetKey(pick));

                        return (
                          <tr key={pick.uniqueKey} className={`border-t border-white/10 transition-colors ${isSelected ? 'bg-[#FF4B1F]/10' : 'hover:bg-white/5'}`}>
                            <td className="px-3 py-3 font-semibold text-white">{pick.playerName}</td>
                            <td className="px-3 py-3 text-white/75">{getDisplayDraftSlot(pick) || '-'}</td>
                            <td className="px-3 py-3 text-white/75">{Math.round(Number(pick.ktcValue) || 0).toLocaleString()}</td>
                            <td className="px-3 py-3 text-white/75">{budgetValue ?? '-'}</td>
                            <td className="px-3 py-3 text-white/75">{formatSalary(pick.pickSalary)}</td>
                            <td className="px-3 py-3 text-white/75">{pick.originalTeam || '-'}</td>
                            <td className="px-3 py-3">
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleToggleAsset(pick)}
                                  className={`rounded-full px-3 py-1 text-xs font-semibold ${isSelected ? 'border border-red-500/35 bg-red-500/15 text-red-100 hover:bg-red-500/25' : 'border border-[#FF4B1F]/30 bg-[#FF4B1F]/15 text-[#FFD0C2] hover:bg-[#FF4B1F]/25'}`}
                                >
                                  {isSelected ? 'Remove' : 'Add'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {popupPlayer && !isDraftPickAsset(popupPlayer) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4" onClick={() => setPopupPlayer(null)}>
          <div className="relative" onClick={(event) => event.stopPropagation()}>
            <PlayerProfileCard
              playerId={popupPlayer.id}
              imageExtension="png"
              expanded={true}
              className="h-[30rem] max-h-[90vh] w-80 max-w-full"
              onExpandClick={() => setPopupPlayer(null)}
            />
            <button
              type="button"
              className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-white hover:bg-black"
              onClick={() => setPopupPlayer(null)}
            >
              x
            </button>
            <div className="mt-2 text-center text-lg font-bold text-white">{popupPlayer.playerName}</div>
          </div>
        </div>
      )}
    </>
  );
}