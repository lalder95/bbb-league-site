'use client';
import React, { useState, useEffect } from 'react';
import TradeSummary from './TradeSummary';
import PlayerProfileCard from '../my-team/components/PlayerProfileCard';
import { AnimatePresence, motion } from 'framer-motion';
import SleeperImportModal from './components/SleeperImportModal';
import { useSession } from 'next-auth/react';
import { estimateDraftPositions, getTeamName } from '@/utils/draftUtils';
import { createDraftPickAsset, DEFAULT_FUTURE_PICK_BUCKET, getAssetBudgetValue, getAssetKey, getDisplayDraftSlot, isDraftPickAsset } from '@/utils/draftPickTradeUtils';

const USER_ID = '456973480269705216'; // Your Sleeper user ID
const DEFAULT_POSITION_FILTER = 'ALL';
const DEFAULT_SORT_OPTION = 'name-asc';
const BV_TOOLTIP = 'Budget Value = KTC minus salary penalty, plus a position-based adjustment.';
const INCOMING_BAR_ROTATE_MS = 5000;
const INCOMING_BAR_METRICS = [
  'ktc',
  'bv',
  'cap',
  'age',
];
const TEAM_BAR_COLORS = [
  'from-emerald-500 to-emerald-300',
  'from-blue-500 to-cyan-300',
  'from-orange-500 to-amber-300',
  'from-fuchsia-500 to-pink-300',
  'from-violet-500 to-indigo-300',
  'from-red-500 to-rose-300',
];

const getBudgetValue = (player, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition }) => {
  const value = getAssetBudgetValue(player, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition });
  return Number.isNaN(value) ? null : value;
};

const getEligibilityText = (value) => String(value).toLowerCase() === 'true' ? 'Yes' : 'No';

const getRestrictedStatusText = (value) => String(value).toLowerCase() === 'true' ? '(Restricted)' : '(Unrestricted)';

const isTruthyFlag = (value) => String(value).toLowerCase() === 'true';

const formatContractYearValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '-';
  return formatSalary(num);
};

const getValueHeatStyle = (value, min, max) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  const clamped = Math.min(Math.max(numeric, min), max);
  const ratio = (clamped - min) / (max - min || 1);
  const hue = Math.round(ratio * 120);
  return { color: `hsl(${hue} 85% 62%)` };
};

const buildPlayerAssetsFromContracts = (parsedContracts) => {
  const groupedContracts = parsedContracts.reduce((acc, contract) => {
    if (!(contract.isActive || contract.status === 'Future')) return acc;

    const key = `${contract.id}-${contract.team}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(contract);
    return acc;
  }, {});

  return Object.values(groupedContracts)
    .map((contractGroup) => {
      const primaryContract = contractGroup.find((contract) => contract.isActive) || contractGroup[0];
      const uniqueContractTypes = [...new Set(contractGroup.map((contract) => contract.contractType).filter(Boolean))];
      const maxFinalYear = contractGroup.reduce((maxYear, contract) => {
        const contractYear = Number(contract.contractFinalYear);
        if (!Number.isFinite(contractYear)) return maxYear;
        return Math.max(maxYear, contractYear);
      }, Number.NEGATIVE_INFINITY);

      return {
        ...primaryContract,
        uniqueKey: `player-${primaryContract.id}-${primaryContract.team}`,
        contractRowKeys: contractGroup.map((contract) => contract.uniqueKey),
        contractType: uniqueContractTypes.length <= 1 ? (uniqueContractTypes[0] || primaryContract.contractType) : 'Multiple',
        curYear: contractGroup.reduce((sum, contract) => sum + (Number(contract.curYear) || 0), 0),
        year2: contractGroup.reduce((sum, contract) => sum + (Number(contract.year2) || 0), 0),
        year3: contractGroup.reduce((sum, contract) => sum + (Number(contract.year3) || 0), 0),
        year4: contractGroup.reduce((sum, contract) => sum + (Number(contract.year4) || 0), 0),
        contractFinalYear: Number.isFinite(maxFinalYear) ? String(maxFinalYear) : (primaryContract.contractFinalYear || '-'),
        rfaEligible: contractGroup.some((contract) => isTruthyFlag(contract.rfaEligible)),
        franchiseTagEligible: contractGroup.some((contract) => isTruthyFlag(contract.franchiseTagEligible)),
      };
    })
    .filter((player) => player.isActive)
    .sort((a, b) => a.playerName.localeCompare(b.playerName));
};

const formatCompactMetric = (value, type) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';

  switch (type) {
    case 'currency':
      return formatSalary(numeric);
    case 'age':
      return numeric > 0 ? `${numeric.toFixed(1)}` : '-';
    case 'integer':
    default:
      return Math.round(numeric).toLocaleString();
  }
};

const getIncomingMetricConfig = ({ metricKey, ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition }) => {
  const configs = {
    ktc: {
      key: 'ktc',
      label: 'Total KTC Incoming',
      type: 'integer',
      getValue: (players) => players.reduce((sum, player) => sum + (parseFloat(player.ktcValue) || 0), 0),
    },
    bv: {
      key: 'bv',
      label: 'Total BV Incoming',
      type: 'integer',
      getValue: (players) => players.reduce((sum, player) => sum + (getBudgetValue(player, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition }) || 0), 0),
    },
    cap: {
      key: 'cap',
      label: 'Total Cap Incoming',
      type: 'currency',
      getValue: (players) => players.reduce((sum, player) => sum + (parseFloat(player.curYear) || 0), 0),
    },
    age: {
      key: 'age',
      label: 'Average Age Incoming',
      type: 'age',
      getValue: (players) => {
        if (!players.length) return 0;
        const totalAge = players.reduce((sum, player) => sum + (parseFloat(player.age) || 0), 0);
        return totalAge / players.length;
      },
    },
  };

  return configs[metricKey] || configs.ktc;
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

function PlayerMetric({ label, value, accent = 'text-white', valueClassName = 'text-sm', valueStyle, tooltip }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-xs font-bold uppercase tracking-[0.08em] text-white/85">
        <span>{label}</span>
        {tooltip ? (
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[10px] normal-case text-white/80"
            title={tooltip}
            aria-label={tooltip}
          >
            ?
          </span>
        ) : null}
      </div>
      <div className={`mt-1 break-words font-semibold leading-tight ${valueClassName} ${accent}`} style={valueStyle}>{value}</div>
    </div>
  );
}

function PlayerMetrics({ player, ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition, compact = false, showContract = true }) {
  const isPick = isDraftPickAsset(player);
  const budgetValue = getBudgetValue(player, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition });
  const ktcValue = parseFloat(player.ktcValue) || 0;
  const contractLabel = isPick
    ? `${formatSalary(player.pickSalary ?? player.year2 ?? 0)}`
    : `${player.contractType || '-'} · ${formatSalary(player.curYear)}`;
  const compactGridClass = showContract ? 'grid-cols-2' : 'grid-cols-2';

  return (
    <div className={`grid gap-2 ${compact ? compactGridClass : 'grid-cols-2 lg:grid-cols-3'}`}>
      {showContract && (
        <PlayerMetric label={isPick ? 'Rookie Cap' : 'Contract'} value={contractLabel} accent="text-[#FFB199]" />
      )}
      <PlayerMetric
        label="KTC"
        value={player.ktcValue || '-'}
        valueClassName={compact ? 'text-xl' : 'text-base'}
        valueStyle={getValueHeatStyle(ktcValue, 0, 10000)}
      />
      <div className={compact && showContract ? 'col-span-2' : ''}>
        <PlayerMetric
          label="BV"
          value={budgetValue ?? '-'}
          valueClassName={compact ? 'text-xl' : 'text-base'}
          valueStyle={getValueHeatStyle(budgetValue, -2000, 6000)}
          tooltip={BV_TOOLTIP}
        />
      </div>
      {!compact && (isPick ? (
        <>
          <PlayerMetric label="Bucket" value={player.pickBucketLabel || '-'} accent="text-sky-200" />
          <PlayerMetric label="Owner" value={player.originalTeam || '-'} accent="text-white" />
          <PlayerMetric label="Final Yr" value={player.contractFinalYear || '-'} accent="text-amber-200" />
        </>
      ) : (
        <>
          <PlayerMetric label="Age" value={player.age || '-'} accent={Number(player.age) >= 30 ? 'text-yellow-300' : 'text-white'} />
          <PlayerMetric label="RFA" value={getEligibilityText(player.rfaEligible)} accent={getEligibilityText(player.rfaEligible) === 'Yes' ? 'text-amber-300' : 'text-white'} />
          <PlayerMetric label="Tag" value={getEligibilityText(player.franchiseTagEligible)} accent={getEligibilityText(player.franchiseTagEligible) === 'Yes' ? 'text-violet-300' : 'text-white'} />
        </>
      ))}
    </div>
  );
}

function IncomingTradeBar({ entries, metricConfig, autoplay, onToggleAutoplay, onNextMetric }) {
  const [showDetails, setShowDetails] = useState(false);
  const totalValue = entries.reduce((sum, entry) => sum + (Number.isFinite(entry.value) ? Math.abs(entry.value) : 0), 0);
  const fallbackPercent = entries.length ? (100 / entries.length) : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#001A2B]/95 shadow-[0_-12px_30px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/65">Incoming Trade Share</div>
            <div className="text-sm font-bold text-white sm:text-base">{metricConfig.label}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowDetails((prev) => !prev)}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
              type="button"
            >
              {showDetails ? 'Hide Breakdown' : 'Show Breakdown'}
            </button>
            <button
              onClick={onNextMetric}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
              type="button"
            >
              Next Metric
            </button>
            <button
              onClick={onToggleAutoplay}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${autoplay ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100' : 'border-white/15 bg-white/5 text-white'}`}
              type="button"
            >
              {autoplay ? `Auto: ${INCOMING_BAR_ROTATE_MS / 1000}s` : 'Auto Off'}
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-full border border-white/10 bg-black/30">
          <div className="flex min-h-11 w-full">
            {entries.map((entry) => {
              const percent = totalValue > 0 ? ((Math.abs(entry.value) / totalValue) * 100) : fallbackPercent;
              return (
                <div
                  key={entry.team}
                  className={`flex min-w-0 items-center justify-center bg-gradient-to-r ${entry.colorClass} px-2 text-center text-sm font-extrabold text-slate-950 transition-all duration-500`}
                  style={{ width: `${percent}%` }}
                  title={`${entry.team}: ${entry.formattedValue} (${percent.toFixed(1)}%)`}
                >
                  <span className="truncate">{entry.team} · {entry.formattedValue}</span>
                </div>
              );
            })}
          </div>
        </div>

        {showDetails && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {entries.map((entry) => (
              <div key={entry.team} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-3 w-3 rounded-full bg-gradient-to-r ${entry.colorClass}`}></span>
                  <div className="truncate text-sm font-semibold text-white">{entry.team}</div>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <div className="text-lg font-bold text-white">{entry.formattedValue}</div>
                  <div className="text-sm font-semibold text-white/70">{entry.percentLabel} total</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamSection({ 
  label,
  participant,
  setTeam,
  setSearchTerm,
  setPositionFilter,
  setSortOption,
  filteredPlayers,
  addPlayer,
  removePlayer,
  updateDestination,
  uniqueTeams,
  availablePositions,
  teamOptions,
  impact,
  teamAvatars,
  canRemove,
  onRemove,
  hideDestination = false,
  // ratios and toggle from parent
  ktcPerDollar,
  usePositionRatios,
  positionRatios,
  avgKtcByPosition
}) {
  const [justAddedId, setJustAddedId] = useState(null);
  const [popupPlayer, setPopupPlayer] = useState(null);
  const availablePlayerAssets = filteredPlayers.filter((player) => !isDraftPickAsset(player));
  const availablePickAssets = filteredPlayers.filter((player) => isDraftPickAsset(player));

  const handleAddPlayer = (player) => {
    addPlayer(player);
    setJustAddedId(getAssetKey(player));
    setTimeout(() => setJustAddedId(null), 600);
  };

  return (
    <div className="flex-1 p-4">
      <div className="bg-black/30 rounded-lg border border-white/10 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[#FF4B1F]">{label}</h2>
          {canRemove && (
            <button
              onClick={onRemove}
              className="text-red-400 hover:text-red-300 text-sm bg-black/40 rounded px-2 py-1 border border-white/10"
              title="Remove team from trade"
            >
              Remove
            </button>
          )}
        </div>
        <select
          value={participant.team}
          onChange={(e) => {
            setTeam(e.target.value);
          }}
          className="w-full p-2 mb-4 rounded bg-[#0a1929] border border-white/10 text-white"
          style={{ color: 'white', backgroundColor: '#0a1929' }}
        >
          <option value="" style={{ color: '#FF4B1F', backgroundColor: '#0a1929' }}>Select Team</option>
          {uniqueTeams.map(team => (
            <option
              key={team}
              value={team}
              style={{ color: 'white', backgroundColor: '#0a1929' }}
            >
              {team}
            </option>
          ))}
        </select>

        {participant.team && (
          <>
            <div>
              <h3 className="text-sm font-bold mb-2 text-white/70">Available Assets:</h3>
              <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.8fr)_minmax(220px,1fr)]">
                <input
                  type="text"
                  placeholder="Search players by name..."
                  value={participant.searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full rounded bg-white/5 p-2 text-white border border-white/10"
                />

                <select
                  value={participant.positionFilter || DEFAULT_POSITION_FILTER}
                  onChange={(e) => setPositionFilter(e.target.value)}
                  className="w-full rounded bg-[#0a1929] p-2 text-white border border-white/10"
                >
                  <option value={DEFAULT_POSITION_FILTER}>All Positions</option>
                  {availablePositions.map((position) => (
                    <option key={position} value={position}>{position}</option>
                  ))}
                </select>

                <select
                  value={participant.sortOption || DEFAULT_SORT_OPTION}
                  onChange={(e) => setSortOption(e.target.value)}
                  className="w-full rounded bg-[#0a1929] p-2 text-white border border-white/10"
                >
                  <option value="name-asc">Sort: Name (A-Z)</option>
                  <option value="ktc-desc">Sort: KTC (High-Low)</option>
                  <option value="bv-desc">Sort: BV (High-Low)</option>
                </select>
              </div>
              <div className="max-h-[34rem] overflow-y-auto rounded-xl border-2 border-white/20 bg-black/30 p-3">
                {filteredPlayers.length === 0 && (
                  <div className="text-xs text-white/40 italic">No available assets.</div>
                )}
                {availablePlayerAssets.length > 0 && (
                  <>
                    <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-white/55">Players</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {availablePlayerAssets.map(player => (
                    <div
                      key={player.uniqueKey}
                      className={`group relative cursor-pointer rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:border-[#FF4B1F]/50 hover:bg-white/5 ${justAddedId === getAssetKey(player) ? 'border-[#FF4B1F] bg-[#FF4B1F]/10 shadow-[0_0_0_1px_rgba(255,75,31,0.25)]' : 'border-white/10 bg-black/35'}`}
                      onClick={() => handleAddPlayer(player)}
                    >
                      <div className="relative mb-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-center">
                        <div
                          className="overflow-hidden whitespace-nowrap pl-4 pr-20 font-bold leading-tight text-white"
                          style={{
                            ...getPlayerNameStyle(player.playerName),
                            lineHeight: 1.1,
                          }}
                        >
                          {player.playerName}
                        </div>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setPopupPlayer(player);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 shrink-0 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white hover:bg-black/80"
                          aria-label={`Show details for ${player.playerName}`}
                        >
                          Info
                        </button>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                        {justAddedId === getAssetKey(player) && (
                          <div className="mb-3 flex items-center justify-start">
                            <span className="rounded-full bg-[#FF4B1F]/20 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#FFB199]">
                              Added
                            </span>
                          </div>
                        )}

                        <div className="mb-5 flex items-center justify-center">
                          <div className="flex h-[6.6rem] w-[6.6rem] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40">
                            <PlayerProfileCard
                              playerId={player.id}
                              imageExtension="png"
                              expanded={false}
                              className="w-[3.85rem] h-[3.85rem]"
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-center">
                            <div className="text-xs font-bold uppercase tracking-[0.08em] text-white/85">Position</div>
                            <div className="mt-1 text-[2.375rem] font-bold leading-none text-blue-100">{player.position || '—'}</div>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-center">
                            <div className="text-xs font-bold uppercase tracking-[0.08em] text-white/85">Age</div>
                            <div className="mt-1 text-[2.375rem] font-bold leading-none text-white/90">{player.age || '-'}</div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
                        <div className="mb-2 text-center text-sm font-bold uppercase tracking-[0.08em] text-white/90">Value Snapshot</div>
                        <PlayerMetrics
                          player={player}
                          ktcPerDollar={ktcPerDollar}
                          usePositionRatios={usePositionRatios}
                          positionRatios={positionRatios}
                          avgKtcByPosition={avgKtcByPosition}
                          compact={true}
                          showContract={false}
                        />
                      </div>

                        <>
                          <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
                            <div className="mb-2 text-center text-sm font-bold uppercase tracking-[0.08em] text-white/90">Contract</div>
                            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-center">
                              <div className="py-1.5">
                                <div className="text-sm font-bold uppercase tracking-[0.08em] text-white/85">Value</div>
                                <div className="mt-2 space-y-1 text-sm font-semibold text-[#FFB199]">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-white/70">Current</span>
                                    <span>{formatContractYearValue(player.curYear)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-white/70">Year 2</span>
                                    <span>{formatContractYearValue(player.year2)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-white/70">Year 3</span>
                                    <span>{formatContractYearValue(player.year3)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-white/70">Year 4</span>
                                    <span>{formatContractYearValue(player.year4)}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="border-t border-white/10 py-1.5">
                                <div className="text-sm font-bold uppercase tracking-[0.08em] text-white/85">Type</div>
                                <div className="mt-1 break-words text-sm font-semibold text-white/90">{player.contractType || '-'}</div>
                              </div>
                              <div className="border-t border-white/10 py-1.5">
                                <div className="text-sm font-bold uppercase tracking-[0.08em] text-white/85">Final Year</div>
                                <div className="mt-1 break-words text-sm font-semibold text-white/90">{player.contractFinalYear || '-'}</div>
                                <div className="mt-1 text-xs text-white/60">{getRestrictedStatusText(player.rfaEligible)}</div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 text-xs text-white/70">
                            <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                              <div className="text-center text-sm font-bold uppercase tracking-[0.08em] text-white/90">Eligibility</div>
                              <div className="mt-2 flex flex-wrap justify-center gap-2">
                                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Franchise Tag: {String(player.franchiseTagEligible).toLowerCase() === 'true' ? 'Eligible' : 'Ineligible'}</span>
                              </div>
                            </div>
                          </div>
                        </>
                    </div>
                      ))}
                    </div>
                  </>
                )}

                {availablePickAssets.length > 0 && (
                  <div className={availablePlayerAssets.length > 0 ? 'mt-5' : ''}>
                    <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-white/55">Draft Picks</div>
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/25">
                      <table className="w-full border-collapse text-sm">
                        <thead className="bg-white/5 text-left text-[11px] uppercase tracking-[0.12em] text-white/60">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Pick</th>
                            <th className="px-3 py-2 font-semibold">KTC</th>
                            <th className="px-3 py-2 font-semibold">BV</th>
                            <th className="px-3 py-2 font-semibold">Cap</th>
                            <th className="px-3 py-2 font-semibold">Original Team</th>
                          </tr>
                        </thead>
                        <tbody>
                          {availablePickAssets.map((pick) => {
                            const pickBudgetValue = getBudgetValue(pick, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition });
                            const isJustAdded = justAddedId === getAssetKey(pick);

                            return (
                              <tr
                                key={pick.uniqueKey}
                                onClick={() => handleAddPlayer(pick)}
                                className={`cursor-pointer border-t border-white/10 transition-colors hover:bg-white/5 ${isJustAdded ? 'bg-[#FF4B1F]/10' : ''}`}
                                title={`Add ${pick.playerName}`}
                              >
                                <td className="px-3 py-2 font-semibold text-white">{pick.playerName}</td>
                                <td className="px-3 py-2 text-white/80">{Math.round(Number(pick.ktcValue) || 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-white/80">{pickBudgetValue ?? '-'}</td>
                                <td className="px-3 py-2 text-white/80">{formatSalary(pick.pickSalary)}</td>
                                <td className="px-3 py-2 text-white/80">{pick.originalTeam || '-'}</td>
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

            <div className="mb-4 mt-4">
              <h3 className="text-sm font-bold mb-2 text-white/70">Selected Assets:</h3>
              <div className="space-y-3 rounded-xl border border-[#FF4B1F]/40 bg-[#FF4B1F]/10 p-3 shadow-lg">
                {participant.selectedPlayers.length === 0 && (
                  <div className="text-xs text-white/40 italic">No assets selected.</div>
                )}
                <AnimatePresence>
                  {participant.selectedPlayers.map((player, idx) => (
                    <React.Fragment key={player.uniqueKey}>
                      {idx > 0 && (
                        <div className="w-full border-t border-white/10"></div>
                      )}
                      <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 30 }}
                        transition={{ type: "spring", stiffness: 3000, damping: 20 }}
                        className="rounded-xl border border-white/10 bg-black/35 p-3"
                      >
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div className="flex flex-1 items-start gap-3 min-w-0">
                            {isDraftPickAsset(player) ? (
                              <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-sky-500/20 via-indigo-500/15 to-violet-500/15 text-center">
                                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-100">Pick</div>
                                <div className="mt-1 text-2xl font-black leading-none text-white">R{player.round}</div>
                                <div className="mt-1 text-[11px] font-semibold text-white/70">{player.pickBucketLabel}</div>
                              </div>
                            ) : (
                              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/40">
                                <PlayerProfileCard
                                  playerId={player.id}
                                  imageExtension="png"
                                  expanded={false}
                                  className="w-14 h-14"
                                  ktcPerDollar={ktcPerDollar}
                                  usePositionRatios={usePositionRatios}
                                  positionRatios={positionRatios}
                                />
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    setPopupPlayer(player);
                                  }}
                                  className="absolute right-1.5 top-1.5 z-10 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white hover:bg-black/80"
                                  aria-label={`Show details for ${player.playerName}`}
                                >
                                  Info
                                </button>
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="truncate text-sm font-bold text-white sm:text-base">{player.playerName}</div>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold border ${isDraftPickAsset(player) ? 'bg-sky-600/25 text-sky-100 border-sky-400/20' : 'bg-blue-600/25 text-blue-100 border-blue-400/20'}`}>
                                  {isDraftPickAsset(player) ? (getDisplayDraftSlot(player) || player.pickBucketLabel || 'PICK') : (player.position || '—')}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/80">
                                  {teamAvatars[player.team] ? (
                                    <img
                                      src={`https://sleepercdn.com/avatars/${teamAvatars[player.team]}`}
                                      alt={player.team}
                                      className="mr-1.5 h-4 w-4 rounded-full"
                                    />
                                  ) : (
                                    <span className="mr-1.5 inline-block h-4 w-4 rounded-full bg-white/10"></span>
                                  )}
                                  {player.team}
                                </span>
                              </div>

                              <div className="mt-1 text-xs text-white/55">
                                {isDraftPickAsset(player)
                                  ? `${player.season} draft • Original ${player.originalTeam || '-'} • Rookie $${Number(player.pickSalary || 0).toFixed(1)} • Final Year ${player.contractFinalYear || '-'}`
                                  : `${player.nflTeam || 'No NFL Team'} • Final Year ${player.contractFinalYear || '-'} • Age ${player.age || '-'} • RFA ${getEligibilityText(player.rfaEligible)} • Tag ${getEligibilityText(player.franchiseTagEligible)}`}
                              </div>

                              <div className="mt-3">
                                <PlayerMetrics
                                  player={player}
                                  ktcPerDollar={ktcPerDollar}
                                  usePositionRatios={usePositionRatios}
                                  positionRatios={positionRatios}
                                  avgKtcByPosition={avgKtcByPosition}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 xl:w-[240px] xl:items-end">
                            {!hideDestination ? (
                              <div className="w-full rounded-xl border border-white/10 bg-black/40 p-3 xl:max-w-[240px]">
                                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-white/45">Destination</div>
                                <div className="text-xs text-white/60 mb-2">Choose the receiving team for this asset.</div>
                                <select
                                  className="w-full rounded-lg border border-white/10 bg-[#0a1929] px-2 py-2 text-sm text-white"
                                  value={player.toTeam || ''}
                                  onChange={(e) => updateDestination(getAssetKey(player), e.target.value)}
                                >
                                  <option value="">Select team</option>
                                  {teamOptions
                                    .filter(t => t !== participant.team)
                                    .map((t) => (
                                      <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                              </div>
                            ) : (
                              <div className="w-full rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 xl:max-w-[240px]">
                                Two-team trade: destination auto-resolves to the other team.
                              </div>
                            )}

                            <button
                              onClick={e => {
                                e.stopPropagation();
                                removePlayer(getAssetKey(player));
                              }}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20"
                            >
                              Remove Asset
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </React.Fragment>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {impact && (
              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="text-sm font-bold mb-2 text-white/70">Before Trade:</h3>
                  <CapImpactDisplay impact={impact.before} />
                </div>
                <div>
                  <h3 className="text-sm font-bold mb-2 text-white/70">After Trade:</h3>
                  <CapImpactDisplay impact={impact.after} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {popupPlayer && !isDraftPickAsset(popupPlayer) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setPopupPlayer(null)}
        >
          <div
            className="bg-transparent p-0 rounded-lg shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <PlayerProfileCard
              playerId={popupPlayer.id}
              imageExtension="png"
              expanded={true}
              className="w-56 h-80 sm:w-72 sm:h-[26rem] md:w-80 md:h-[30rem] max-w-full max-h-[90vh]"
              // Close handler for the in-card X
              onExpandClick={() => setPopupPlayer(null)}
            />
            <button
              className="absolute top-2 right-2 text-white bg-black/60 rounded-full px-3 py-1 hover:bg-black"
              onClick={() => setPopupPlayer(null)}
            >
              ×
            </button>
            <div className="mt-2 text-center text-lg font-bold text-white">
              {popupPlayer.playerName}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CapImpactDisplay = ({ impact }) => (
  <div className="grid grid-cols-4 gap-2 text-sm">
    {Object.entries(impact).map(([year, value]) => (
      <div key={year} className="text-center">
        <div className="text-white/70">{year}</div>
        <div className={getValidationColor(value?.remaining)}>
          {formatSalary(value?.remaining)}
        </div>
      </div>
    ))}
  </div>
);

const formatSalary = (value) => {
  const num = Number(value);
  if (isNaN(num)) return "$-";
  return `$${num.toFixed(1)}`;
};

const getValidationColor = (value) => {
  if (value < 0) return 'text-red-400';
  if (value < 50) return 'text-[#FF4B1F]';
  if (value < 100) return 'text-yellow-400';
  return 'text-green-400';
};

export default function Trade() {
  const { data: session } = useSession();
  const [contracts, setContracts] = useState([]);
  const [fines, setFines] = useState({});
  const [loading, setLoading] = useState(true);
  // Multi-team participants: {id, team, searchTerm, selectedPlayers:[{...player, toTeam?:string}]}
  const [participants, setParticipants] = useState([
    { id: 1, team: '', searchTerm: '', positionFilter: DEFAULT_POSITION_FILTER, sortOption: DEFAULT_SORT_OPTION, selectedPlayers: [] },
    { id: 2, team: '', searchTerm: '', positionFilter: DEFAULT_POSITION_FILTER, sortOption: DEFAULT_SORT_OPTION, selectedPlayers: [] },
  ]);
  const [showSummary, setShowSummary] = useState(false);
  const [teamAvatars, setTeamAvatars] = useState({});
  const [leagueId, setLeagueId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [draftPickAssetsByTeam, setDraftPickAssetsByTeam] = useState({});
  // KTC-to-Salary ratio (KTC points per $1 of salary), computed on refresh
  const [ktcPerDollar, setKtcPerDollar] = useState(null);
  // Position-specific ratios (KTC per $1) for Active contracts
  const [positionRatios, setPositionRatios] = useState({});
  // Average KTC per position across Active contracts
  const [avgKtcByPosition, setAvgKtcByPosition] = useState({});
  // Toggle to use position-specific ratios in Budget Value calculations
  const [usePositionRatios, setUsePositionRatios] = useState(true);
  // Debug info for ratio calculation
  const [ratioDebug, setRatioDebug] = useState({ totalActiveSalary: 0, totalActiveKtc: 0, activeCount: 0, sample: [] });
  const [showRatioDebug, setShowRatioDebug] = useState(false);
  const [incomingMetricIndex, setIncomingMetricIndex] = useState(0);
  const [incomingMetricAutoplay, setIncomingMetricAutoplay] = useState(true);

  // Auto-detect league ID (copied from home page)
  useEffect(() => {
    async function findBBBLeague() {
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
        setLeagueId(mostRecentLeague.league_id);
      } catch (err) {
        setLeagueId(null);
      }
    }
    findBBBLeague();
  }, []);

  // Fetch contract data (KTC from contracts CSV)
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch contracts data
        const contractsResponse = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
        const contractsText = await contractsResponse.text();

        // Fetch fines data
        const finesResponse = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_TeamFines.csv');
        const finesText = await finesResponse.text();

        // Parse contracts
        const contractRows = contractsText.split('\n');
        const parsedContracts = contractRows.slice(1)
          .filter(row => row.trim())
          .map((row, index) => {
            const values = row.split(',');
            const status = values[14];
            return {
              // stable unique key per CSV row
              uniqueKey: `${values[0]}-${values[5]}-${values[2]}-${values[14]}-${index}`,
              id: values[0],
              playerName: values[1],
              contractType: values[2],
              team: values[33],
              status,
              isActive: status === 'Active',
              curYear: parseFloat(values[15]) || 0,
              year2: parseFloat(values[16]) || 0,
              year3: parseFloat(values[17]) || 0,
              year4: parseFloat(values[18]) || 0,
              deadCurYear: parseFloat(values[24]) || 0,
              deadYear2: parseFloat(values[25]) || 0,
              deadYear3: parseFloat(values[26]) || 0,
              deadYear4: parseFloat(values[27]) || 0,
              position: values[21],
              nflTeam: values[22],
              contractFinalYear: values[5],
              age: values[32],
              ktcValue: values[34],
              rfaEligible: values[37],
              franchiseTagEligible: values[38],
            };
          });
      setContracts(parsedContracts);
      // Compute KTC-per-dollar ratio using global totals across Active contracts
      try {
        const activeContracts = parsedContracts.filter(c => c.isActive || c.status === 'Active');
        const totalActiveSalary = activeContracts.reduce((sum, c) => sum + (parseFloat(c.curYear) || 0), 0);
        const totalActiveKtc = activeContracts.reduce((sum, c) => sum + (parseFloat(c.ktcValue) || 0), 0);
        const ratio = totalActiveSalary > 0 ? (totalActiveKtc / totalActiveSalary) : 0;
        setKtcPerDollar(ratio);

        // Compute per-position ratios (KTC/$)
        const byPos = activeContracts.reduce((acc, c) => {
          const pos = (c.position || 'UNKNOWN').toUpperCase();
          const sal = parseFloat(c.curYear) || 0;
          const ktc = parseFloat(c.ktcValue) || 0;
          if (!acc[pos]) acc[pos] = { salary: 0, ktc: 0, count: 0 };
          acc[pos].salary += sal;
          acc[pos].ktc += ktc;
          acc[pos].count += 1;
          return acc;
        }, {});
        const posRatios = Object.keys(byPos).reduce((acc, pos) => {
          const { salary, ktc } = byPos[pos];
          acc[pos] = salary > 0 ? (ktc / salary) : 0;
          return acc;
        }, {});
        setPositionRatios(posRatios);
        // Compute average KTC per position across Active contracts
        const posAverages = Object.keys(byPos).reduce((acc, pos) => {
          const { ktc, count } = byPos[pos];
          acc[pos] = count > 0 ? (ktc / count) : 0;
          return acc;
        }, {});
        setAvgKtcByPosition(posAverages);
        setRatioDebug({
          totalActiveSalary,
          totalActiveKtc,
          activeCount: activeContracts.length,
          sample: activeContracts.slice(0, 10).map(c => ({
            playerName: c.playerName,
            team: c.team,
            curYear: parseFloat(c.curYear) || 0,
            ktcValue: parseFloat(c.ktcValue) || 0,
          })),
        });
      } catch (e) {
        setKtcPerDollar(0);
        setRatioDebug({ totalActiveSalary: 0, totalActiveKtc: 0, activeCount: 0, sample: [] });
      }

      // Parse fines
      const finesRows = finesText.split('\n');
      const finesObj = finesRows.slice(1)
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
      setFines(finesObj);

      // Only show active players for selection, but aggregate active + future contracts per player
      setPlayers(buildPlayerAssetsFromContracts(parsedContracts));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }
  fetchData();
  }, []);

  // Fetch avatars using detected leagueId
  useEffect(() => {
    if (!leagueId) return;
    async function fetchAvatars() {
      try {
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
  }, [leagueId]);

  const uniqueTeams = [...new Set(players.map(player => player.team))].sort();
  const uniqueTeamsKey = uniqueTeams.join('|');

  useEffect(() => {
    if (!leagueId || !uniqueTeams.length) return;

    let cancelled = false;

    async function fetchDraftAssets() {
      try {
        const [usersRes, rostersRes, tradedRes, draftsRes, orderRes] = await Promise.all([
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`, { cache: 'no-store' }),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { cache: 'no-store' }),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, { cache: 'no-store' }),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/drafts`, { cache: 'no-store' }),
          fetch(`/api/debug/draft-order?leagueId=${leagueId}`, { cache: 'no-store' }),
        ]);

        if (!usersRes.ok || !rostersRes.ok || !tradedRes.ok || !draftsRes.ok || !orderRes.ok) {
          throw new Error('Failed to fetch draft pick data');
        }

        const [users, rosters, tradedPicks, draftsJson, orderJson] = await Promise.all([
          usersRes.json(),
          rostersRes.json(),
          tradedRes.json(),
          draftsRes.json(),
          orderRes.json(),
        ]);

        const normalize = (value) => String(value || '').trim().toLowerCase();
        const resolveKnownTeamName = (teamName) => {
          const normalizedTeam = normalize(teamName);
          return (
            uniqueTeams.find((knownTeam) => normalize(knownTeam) === normalizedTeam) ||
            uniqueTeams.find((knownTeam) => normalize(knownTeam).includes(normalizedTeam) || normalizedTeam.includes(normalize(knownTeam))) ||
            teamName
          );
        };

        const pickActiveDraft = (drafts) => {
          if (!Array.isArray(drafts) || drafts.length === 0) return null;

          const nonComplete = drafts.filter((draft) => draft?.status && draft.status !== 'complete');
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

        const activeDraft = pickActiveDraft(draftsJson);
        const activeDraftOrderEntries = activeDraft?.draft_order
          ? Object.entries(activeDraft.draft_order).map(([userId, slot]) => ({
              roster_id: Number(rosters.find((roster) => String(roster.owner_id) === String(userId))?.roster_id),
              original_roster_id: Number(rosters.find((roster) => String(roster.owner_id) === String(userId))?.roster_id),
              slot: Number(slot),
            }))
          : [];
        const canonicalOrderEntries = activeDraftOrderEntries.length > 0
          ? activeDraftOrderEntries
          : (orderJson?.draft_order || []);

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
        const baseSeason = Number(orderJson?.targetSeason || new Date().getFullYear() + 1);
        const seasonsToShow = Array.from({ length: 3 }, (_, index) => String(baseSeason + index));

        const nextAssets = uniqueTeams.reduce((acc, teamName) => {
          acc[teamName] = [];
          return acc;
        }, {});

        seasonsToShow.forEach((season, seasonIndex) => {
          if (seasonIndex === 0) {
            const canonicalDraftOrder = (orderJson?.draft_order || [])
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
                const currentOwnerName = resolveKnownTeamName(getTeamName(currentOwnerRosterId, rosters, users));

                if (!nextAssets[currentOwnerName]) {
                  nextAssets[currentOwnerName] = [];
                }

                nextAssets[currentOwnerName].push(createDraftPickAsset({
                  season,
                  round,
                  pickPosition: projectedSlot || 1,
                  originalOwner: originalOwnerName,
                  currentOwner: currentOwnerName,
                  mappedSlotDebug: projectedSlot != null ? String(projectedSlot) : 'mapping failed',
                  bucketOverride: projectedSlot ? undefined : DEFAULT_FUTURE_PICK_BUCKET,
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

          Object.entries(estimatedTeamPicks || {}).forEach(([teamName, picks]) => {
            const resolvedTeamName = resolveKnownTeamName(teamName);
            const currentPicks = Array.isArray(picks?.currentPicks) ? picks.currentPicks : [];
            const seasonAssets = currentPicks.map((pick) => createDraftPickAsset({
              season,
              round: pick.round,
              pickPosition: pick.pickPosition,
              originalOwner: resolveKnownTeamName(pick.originalOwner),
              currentOwner: resolvedTeamName,
              bucketOverride: DEFAULT_FUTURE_PICK_BUCKET,
              mappedSlotDebug: 'future default',
            }));

            nextAssets[resolvedTeamName] = [
              ...(nextAssets[resolvedTeamName] || []),
              ...seasonAssets,
            ];
          });
        });

        Object.keys(nextAssets).forEach((teamName) => {
          nextAssets[teamName] = (nextAssets[teamName] || []).sort((a, b) => {
            const seasonDiff = Number(a.season) - Number(b.season);
            if (seasonDiff !== 0) return seasonDiff;
            const roundDiff = Number(a.round) - Number(b.round);
            if (roundDiff !== 0) return roundDiff;
            return Number(a.pickPosition) - Number(b.pickPosition);
          });
        });

        if (!cancelled) {
          setDraftPickAssetsByTeam(nextAssets);
        }
      } catch {
        if (!cancelled) {
          setDraftPickAssetsByTeam(uniqueTeams.reduce((acc, teamName) => {
            acc[teamName] = [];
            return acc;
          }, {}));
        }
      }
    }

    fetchDraftAssets();

    return () => {
      cancelled = true;
    };
  }, [leagueId, uniqueTeamsKey]);

  const availablePositions = [...new Set(
    [...players, ...Object.values(draftPickAssetsByTeam).flat()]
      .map(player => (player.position || '').toUpperCase().trim())
      .filter(Boolean)
  )].sort();

  useEffect(() => {
    if (!uniqueTeams.length) return;

    const normalize = (value) => String(value || '').trim().toLowerCase();
    const sessionCandidates = [
      session?.user?.teamName,
      session?.user?.team,
      session?.user?.team_name,
      session?.user?.teamSlug,
      session?.user?.team_slug,
      session?.user?.name,
      session?.user?.username,
    ].filter(Boolean);

    if (!sessionCandidates.length) return;

    const resolvedTeam = sessionCandidates.reduce((foundTeam, candidate) => {
      if (foundTeam) return foundTeam;
      const normalizedCandidate = normalize(candidate);
      return (
        uniqueTeams.find((team) => normalize(team) === normalizedCandidate) ||
        uniqueTeams.find((team) => normalize(team).includes(normalizedCandidate)) ||
        ''
      );
    }, '');

    if (!resolvedTeam) return;

    setParticipants((prev) => {
      if (!prev.length || prev[0].team) return prev;
      const next = [...prev];
      next[0] = {
        ...next[0],
        team: resolvedTeam,
      };
      return next;
    });
  }, [session, uniqueTeamsKey]);

  // Utility: set team for a participant and clear their selections
  const setParticipantTeam = (id, team) => {
    setParticipants(prev => prev.map(p => p.id === id ? {
      ...p,
      team,
      selectedPlayers: [],
      searchTerm: '',
      positionFilter: DEFAULT_POSITION_FILTER,
      sortOption: DEFAULT_SORT_OPTION,
    } : p));
  };

  const setParticipantSearch = (id, term) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, searchTerm: term } : p));
  };

  const setParticipantPositionFilter = (id, positionFilter) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, positionFilter } : p));
  };

  const setParticipantSortOption = (id, sortOption) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, sortOption } : p));
  };

  const addParticipant = () => {
    setParticipants(prev => {
      const nextId = prev.length ? Math.max(...prev.map(p => p.id)) + 1 : 1;
      return [...prev, { id: nextId, team: '', searchTerm: '', positionFilter: DEFAULT_POSITION_FILTER, sortOption: DEFAULT_SORT_OPTION, selectedPlayers: [] }];
    });
  };

  const removeParticipant = (id) => {
    setParticipants(prev => prev.filter(p => p.id !== id));
  };

  const addPlayerToParticipant = (id, player) => {
    setParticipants(prev => prev.map(p => {
      if (p.id !== id) return p;
      if (p.selectedPlayers.some(sp => getAssetKey(sp) === getAssetKey(player))) return p;
      return { ...p, selectedPlayers: [...p.selectedPlayers, { ...player, toTeam: '' }] };
    }));
  };

  const removePlayerFromParticipant = (id, playerId) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, selectedPlayers: p.selectedPlayers.filter(sp => getAssetKey(sp) !== playerId) } : p));
  };

  const updatePlayerDestination = (id, playerId, toTeam) => {
    setParticipants(prev => prev.map(p => p.id === id ? {
      ...p,
      selectedPlayers: p.selectedPlayers.map(sp => getAssetKey(sp) === playerId ? { ...sp, toTeam } : sp)
    } : p));
  };

  // Global set of selected asset ids to prevent duplicates
  const selectedIds = new Set(participants.flatMap(p => p.selectedPlayers.map(sp => getAssetKey(sp))));

  // Build filtered list per participant
  const getFilteredPlayers = (participant) => {
    const searchTerm = (participant.searchTerm || '').toLowerCase();
    const positionFilter = participant.positionFilter || DEFAULT_POSITION_FILTER;
    const teamAssets = [
      ...players.filter((player) => player.team === participant.team),
      ...(draftPickAssetsByTeam[participant.team] || []),
    ];

    return teamAssets
      .filter(player =>
        player.playerName.toLowerCase().includes(searchTerm) &&
        (positionFilter === DEFAULT_POSITION_FILTER || (player.position || '').toUpperCase() === positionFilter) &&
        !selectedIds.has(getAssetKey(player))
      )
      .sort((a, b) => {
        switch (participant.sortOption) {
          case 'ktc-desc':
            return (parseFloat(b.ktcValue) || 0) - (parseFloat(a.ktcValue) || 0);
          case 'bv-desc': {
            const bvA = getBudgetValue(a, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition }) || 0;
            const bvB = getBudgetValue(b, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition }) || 0;
            return bvB - bvA;
          }
          case 'name-asc':
          default:
            return a.playerName.localeCompare(b.playerName);
        }
      });
  };

  // Calculate cap space for a team (match Salary Cap page)
  const createEmptyCap = () => ({
    curYear: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
    year2: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
    year3: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
    year4: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 }
  });

  const addAssetCapHit = (cap, asset) => {
    if (isDraftPickAsset(asset)) return;
    cap.curYear.active += Number(asset?.curYear) || 0;
    cap.year2.active += Number(asset?.year2) || 0;
    cap.year3.active += Number(asset?.year3) || 0;
    cap.year4.active += Number(asset?.year4) || 0;
  };

  const calculateTeamCapSpace = (teamName, excludeAssets = []) => {
    const excludedContractKeys = new Set(
      (excludeAssets || []).flatMap((asset) => (
        Array.isArray(asset?.contractRowKeys) && asset.contractRowKeys.length
          ? asset.contractRowKeys
          : [getAssetKey(asset)]
      ))
    );
    const teamContracts = contracts.filter(
      c => c.team === teamName && !excludedContractKeys.has(getAssetKey(c))
    );
    const teamDraftPicks = (draftPickAssetsByTeam[teamName] || []).filter(
      (pick) => !excludedContractKeys.has(getAssetKey(pick))
    );
    const cap = createEmptyCap();
    teamContracts.forEach(c => {
      cap.curYear.active += c.curYear;
      cap.curYear.dead += c.deadCurYear;
      cap.year2.active += c.year2;
      cap.year2.dead += c.deadYear2;
      cap.year3.active += c.year3;
      cap.year3.dead += c.deadYear3;
      cap.year4.active += c.year4;
      cap.year4.dead += c.deadYear4;
    });
    teamDraftPicks.forEach((pick) => addAssetCapHit(cap, pick));
    const teamFines = fines[teamName] || { curYear: 0, year2: 0, year3: 0, year4: 0 };
    cap.curYear.fines = teamFines.curYear;
    cap.year2.fines = teamFines.year2;
    cap.year3.fines = teamFines.year3;
    cap.year4.fines = teamFines.year4;
    ['curYear', 'year2', 'year3', 'year4'].forEach(year => {
      cap[year].remaining = cap[year].total - cap[year].active - cap[year].dead - cap[year].fines;
    });
    return cap;
  };

  // Calculate trade impact using new cap logic
  const calculateTradeImpact = (teamName, incomingPlayers, outgoingPlayers) => {
    const before = calculateTeamCapSpace(teamName);
    const afterCap = calculateTeamCapSpace(teamName, outgoingPlayers);
    incomingPlayers.forEach((asset) => addAssetCapHit(afterCap, asset));
    const teamFines = fines[teamName] || { curYear: 0, year2: 0, year3: 0, year4: 0 };
    afterCap.curYear.fines = teamFines.curYear;
    afterCap.year2.fines = teamFines.year2;
    afterCap.year3.fines = teamFines.year3;
    afterCap.year4.fines = teamFines.year4;
    ['curYear', 'year2', 'year3', 'year4'].forEach(year => {
      afterCap[year].remaining = afterCap[year].total - afterCap[year].active - afterCap[year].dead - afterCap[year].fines;
    });
    return {
      before: {
        curYear: before.curYear,
        year2: before.year2,
        year3: before.year3,
        year4: before.year4,
      },
      after: {
        curYear: afterCap.curYear,
        year2: afterCap.year2,
        year3: afterCap.year3,
        year4: afterCap.year4,
      }
    };
  };

  // Build incoming/outgoing for each team from destinations
  const buildTeamFlows = () => {
    const teamToIncoming = {};
    const teamToOutgoing = {};
    const teams = participants.map(p => p.team).filter(Boolean);
    const uniqueActiveTeamsLocal = [...new Set(teams)];
    const isTwoTeamTradeLocal = uniqueActiveTeamsLocal.length === 2;
    participants.forEach(p => {
      if (!p.team) return;
      teamToIncoming[p.team] = [];
      teamToOutgoing[p.team] = p.selectedPlayers.map(sp => ({ ...sp }));
    });
    participants.forEach(p => {
      p.selectedPlayers.forEach(sp => {
        let dest = sp.toTeam;
        if (!dest && isTwoTeamTradeLocal && p.team) {
          dest = uniqueActiveTeamsLocal.find(t => t !== p.team);
        }
        if (dest && teamToIncoming[dest]) {
          teamToIncoming[dest].push({ ...sp });
        }
      });
    });
    return { teamToIncoming, teamToOutgoing };
  };

  const validateTrade = () => {
    const { teamToIncoming, teamToOutgoing } = buildTeamFlows();
    const teams = participants.map(p => p.team).filter(Boolean);
    const impactsByTeam = {};
    teams.forEach(teamName => {
      const incoming = teamToIncoming[teamName] || [];
      const outgoing = teamToOutgoing[teamName] || [];
      impactsByTeam[teamName] = calculateTradeImpact(teamName, incoming, outgoing);
    });

    const remainders = [];
    const curYearNegatives = [];
    const futureNegatives = [];
    const closeList = [];
    const yearKeys = [
      { key: 'curYear', label: 'Y1' },
      { key: 'year2', label: 'Y2' },
      { key: 'year3', label: 'Y3' },
      { key: 'year4', label: 'Y4' },
    ];
    teams.forEach(teamName => {
      const imp = impactsByTeam[teamName];
      yearKeys.forEach(({ key }) => remainders.push(imp.after[key].remaining));
      // Collect detailed warnings
      if (imp.after.curYear.remaining < 0) {
        curYearNegatives.push({ team: teamName, remaining: imp.after.curYear.remaining });
      }
      const yearsNeg = [];
      ['year2','year3','year4'].forEach(k => {
        const val = imp.after[k].remaining;
        if (val < 0) yearsNeg.push({ year: k === 'year2' ? 'Y2' : k === 'year3' ? 'Y3' : 'Y4', remaining: val });
      });
      if (yearsNeg.length) futureNegatives.push({ team: teamName, years: yearsNeg });
      yearKeys.forEach(({ key, label }) => {
        const val = imp.after[key].remaining;
        if (val >= 0 && val < 50) closeList.push({ team: teamName, year: label, remaining: val });
      });
    });
    const isInvalidCurYear = teams.some(teamName => impactsByTeam[teamName].after.curYear.remaining < 0);
    const isFutureYearOverCap = teams.some(teamName => (
      impactsByTeam[teamName].after.year2.remaining < 0 ||
      impactsByTeam[teamName].after.year3.remaining < 0 ||
      impactsByTeam[teamName].after.year4.remaining < 0
    ));
    const isClose = remainders.some(val => val >= 0 && val < 50);

    // Ensure all selected players have destinations and those destinations are valid existing teams (not self)
  const currentTeamsSet = new Set(teams);
  const isTwoTeamLocal = [...currentTeamsSet].length === 2;
  const anyMissing = isTwoTeamLocal ? false : participants.some(p => p.selectedPlayers.some(sp => !sp.toTeam));
    const anyInvalid = participants.some(p => p.selectedPlayers.some(sp => sp.toTeam && (!currentTeamsSet.has(sp.toTeam) || sp.toTeam === p.team)));
    const unassigned = anyMissing || anyInvalid;

    return {
      isValid: !isInvalidCurYear && !isFutureYearOverCap && !unassigned,
      isInvalidCurYear,
      isFutureYearOverCap,
      isClose,
      unassigned,
      impactsByTeam,
      details: {
        curYearNegatives,
        futureNegatives,
        closeList,
      }
    };
  };

  const haveAtLeastTwoTeams = participants.filter(p => p.team).length >= 2;
  const activeTeams = participants.map(p => p.team).filter(Boolean);
  const activeParticipants = participants.filter((p) => p.team);
  const uniqueActiveTeams = [...new Set(activeTeams)];
  const isTwoTeamTrade = uniqueActiveTeams.length === 2;
  const tradeValidation = haveAtLeastTwoTeams ? validateTrade() : null;
  const { teamToIncoming } = buildTeamFlows();
  const showIncomingTradeBar = activeParticipants.length >= 2 && activeParticipants.every((participant) => participant.selectedPlayers.length > 0);
  const currentIncomingMetricKey = INCOMING_BAR_METRICS[incomingMetricIndex] || INCOMING_BAR_METRICS[0];
  const incomingMetricConfig = getIncomingMetricConfig({
    metricKey: currentIncomingMetricKey,
    ktcPerDollar,
    usePositionRatios,
    positionRatios,
    avgKtcByPosition,
  });
  const incomingBarEntries = uniqueActiveTeams.map((team, index) => {
    const incomingPlayers = teamToIncoming[team] || [];
    const value = incomingMetricConfig.getValue(incomingPlayers);
    return {
      team,
      value,
      formattedValue: formatCompactMetric(value, incomingMetricConfig.type),
      colorClass: TEAM_BAR_COLORS[index % TEAM_BAR_COLORS.length],
    };
  });
  const incomingBarTotal = incomingBarEntries.reduce((sum, entry) => sum + (Number.isFinite(entry.value) ? Math.abs(entry.value) : 0), 0);
  const incomingBarEntriesWithPercent = incomingBarEntries.map((entry) => {
    const percent = incomingBarTotal > 0
      ? ((Math.abs(entry.value) / incomingBarTotal) * 100)
      : (incomingBarEntries.length ? 100 / incomingBarEntries.length : 0);
    return {
      ...entry,
      percentLabel: `${percent.toFixed(1)}%`,
    };
  });

  useEffect(() => {
    if (!incomingMetricAutoplay || !showIncomingTradeBar) return undefined;

    const intervalId = window.setInterval(() => {
      setIncomingMetricIndex((prev) => (prev + 1) % INCOMING_BAR_METRICS.length);
    }, INCOMING_BAR_ROTATE_MS);

    return () => window.clearInterval(intervalId);
  }, [incomingMetricAutoplay, showIncomingTradeBar]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
      </div>
    );
  }

  // Reset handler
  const handleReset = () => {
    setParticipants([
      { id: 1, team: '', searchTerm: '', positionFilter: DEFAULT_POSITION_FILTER, sortOption: DEFAULT_SORT_OPTION, selectedPlayers: [] },
      { id: 2, team: '', searchTerm: '', positionFilter: DEFAULT_POSITION_FILTER, sortOption: DEFAULT_SORT_OPTION, selectedPlayers: [] },
    ]);
    setShowSummary(false);
  };

  // Apply handler from import modal
  const handleApplyImport = (importParticipants) => {
    // sanitize
    const cleaned = (importParticipants || [])
      .filter(p => p && p.team)
      .map((p, idx) => ({
        id: idx + 1,
        team: p.team,
        searchTerm: '',
        positionFilter: DEFAULT_POSITION_FILTER,
        sortOption: DEFAULT_SORT_OPTION,
        selectedPlayers: Array.isArray(p.selectedPlayers) ? p.selectedPlayers : [],
      }));
    if (cleaned.length >= 2) {
      setParticipants(cleaned);
      setShowSummary(false);
    }
    setShowImport(false);
  };

  const tradeBannerTone = tradeValidation?.isInvalidCurYear
    ? {
        wrapper: 'border-red-500/40 bg-gradient-to-br from-red-500/20 via-red-500/10 to-black/20',
        badge: 'border-red-400/30 bg-red-500/20 text-red-100',
        icon: 'bg-red-500/25 text-red-200',
        title: 'text-red-100',
        accent: 'text-red-200',
        button: 'bg-red-500 text-white hover:bg-red-400 shadow-[0_10px_30px_rgba(239,68,68,0.28)]',
      }
    : tradeValidation?.isFutureYearOverCap || tradeValidation?.isClose
    ? {
        wrapper: 'border-yellow-500/35 bg-gradient-to-br from-yellow-500/18 via-amber-500/10 to-black/20',
        badge: 'border-yellow-300/30 bg-yellow-500/20 text-yellow-100',
        icon: 'bg-yellow-500/20 text-yellow-100',
        title: 'text-yellow-50',
        accent: 'text-yellow-100',
        button: 'bg-yellow-400 text-slate-950 hover:bg-yellow-300 shadow-[0_10px_30px_rgba(250,204,21,0.24)]',
      }
    : {
        wrapper: 'border-emerald-500/35 bg-gradient-to-br from-emerald-500/18 via-emerald-500/10 to-black/20',
        badge: 'border-emerald-300/30 bg-emerald-500/20 text-emerald-100',
        icon: 'bg-emerald-500/20 text-emerald-100',
        title: 'text-emerald-50',
        accent: 'text-emerald-100',
        button: 'bg-[#FF4B1F] text-white hover:bg-[#ff6a45] shadow-[0_10px_30px_rgba(255,75,31,0.28)]',
      };

  const tradeBannerHeading = tradeValidation?.unassigned
    ? 'Finish assigning destinations'
    : tradeValidation?.isInvalidCurYear
    ? 'Trade fails current-year cap rules'
    : tradeValidation?.isFutureYearOverCap
    ? 'Trade creates future cap issues'
    : tradeValidation?.isClose
    ? 'Trade is valid, but tight on cap room'
    : 'Trade looks valid';

  const tradeBannerSubheading = tradeValidation?.unassigned
    ? 'Every selected asset needs a valid receiving team before the summary can be generated.'
    : tradeValidation?.isInvalidCurYear
    ? 'One or more teams are immediately over the cap after this trade.'
    : tradeValidation?.isFutureYearOverCap
    ? 'Current-year cap may work, but future cap years still need attention.'
    : tradeValidation?.isClose
    ? 'No team is over the cap right now, but some teams are close to the threshold.'
    : 'All involved teams stay under the cap across the evaluated contract years.';

  const tradeBannerItems = tradeValidation ? [
    ...(tradeValidation.details?.curYearNegatives?.map((d) => ({
      label: 'Current year over cap',
      value: `${d.team} • $${Math.abs(d.remaining).toFixed(1)} over`,
    })) || []),
    ...(tradeValidation.details?.futureNegatives?.map((d) => ({
      label: 'Future cap issue',
      value: `${d.team} • ${d.years.map(y => `${y.year} -$${Math.abs(y.remaining).toFixed(1)}`).join(', ')}`,
    })) || []),
    ...(tradeValidation.details?.closeList?.map((d) => ({
      label: 'Close to cap',
      value: `${d.team} • ${d.year} $${d.remaining.toFixed(1)} left`,
    })) || []),
  ] : [];

  return (
    <main className={`min-h-screen bg-[#001A2B] text-white ${showIncomingTradeBar ? 'pb-64 md:pb-56' : ''}`}>
      <div className="bg-black/30 p-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className="h-16 w-16 transition-transform hover:scale-105"
            />
            <h1 className="text-3xl font-bold text-[#FF4B1F]">Trade Calculator</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded text-white hover:bg-white/20"
            >
              Import Sleeper Screenshot
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded text-white hover:bg-[#FF4B1F]/80 hover:text-white transition-colors"
            >
              Reset Trade
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Ratio Debug Controls */}
        <div className="mb-4 flex items-center justify-between">
          <div className="text-white/60 text-xs">Ratio: {ktcPerDollar != null ? ktcPerDollar.toFixed(6) : 'n/a'}</div>
          <button
            onClick={() => setShowRatioDebug(v => !v)}
            className="px-3 py-1.5 bg-white/10 border border-white/20 rounded text-white hover:bg-white/20 text-xs"
          >
            {showRatioDebug ? 'Hide Ratio Debug' : 'Show Ratio Debug'}
          </button>
        </div>
        {/* Toggle for using position-specific ratios */}
        <div className="mb-4 flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-white/80">
            <input
              type="checkbox"
              checked={usePositionRatios}
              onChange={(e) => setUsePositionRatios(e.target.checked)}
            />
            Use position-specific ratios for Budget Value
          </label>
          {usePositionRatios && (
            <span className="text-[10px] text-white/60">Uses ratio by player position (e.g., QB/RB/WR/TE). Falls back to global ratio if position is missing.</span>
          )}
        </div>
        {showRatioDebug && (
          <div className="mb-6 p-4 rounded-lg bg-black/30 border border-white/10">
            <div className="font-bold text-[#FF4B1F] mb-2">KTC-to-Salary Ratio Debug</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-black/20 border border-white/10 rounded p-2">
                <div className="text-white/70">Active Contracts</div>
                <div className="text-white font-semibold">{ratioDebug.activeCount}</div>
              </div>
              <div className="bg-black/20 border border-white/10 rounded p-2">
                <div className="text-white/70">Total Active Salary (Y1)</div>
                <div className="text-white font-semibold">${ratioDebug.totalActiveSalary.toFixed(1)}</div>
              </div>
              <div className="bg-black/20 border border-white/10 rounded p-2">
                <div className="text-white/70">Total Active KTC</div>
                <div className="text-white font-semibold">{Math.round(ratioDebug.totalActiveKtc)}</div>
              </div>
              <div className="bg-black/20 border border-white/10 rounded p-2">
                <div className="text-white/70">Ratio (KTC per $1)</div>
                <div className="text-white font-semibold">{ktcPerDollar != null ? ktcPerDollar.toFixed(6) : '-'}</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-white/70">
              Global Avg KTC per player: {ratioDebug.activeCount > 0 ? Math.round(ratioDebug.totalActiveKtc / ratioDebug.activeCount) : 0}
            </div>
            {/* Position ratios table */}
            <div className="mt-3 text-xs text-white/70">Position metrics (Ratio & Avg KTC):</div>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.keys(positionRatios).sort().map((pos) => (
                <div key={pos} className="bg-black/20 border border-white/10 rounded p-2">
                  <div className="flex items-center justify-between">
                    <div className="text-white/80 font-semibold">{pos}</div>
                    <div className="text-white text-[11px]">{positionRatios[pos] != null ? positionRatios[pos].toFixed(6) : '-'}</div>
                  </div>
                  <div className="mt-1 text-white/60 text-[11px]">AvgKTC: {Math.round((avgKtcByPosition && avgKtcByPosition[pos]) ? avgKtcByPosition[pos] : 0)}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-white/70">Sample rows (first 10):</div>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              {ratioDebug.sample.map((s, i) => (
                <div key={i} className="bg-black/20 border border-white/10 rounded p-2 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white truncate">{s.playerName}</div>
                    <div className="text-white/60 text-xs truncate">{s.team}</div>
                  </div>
                  <div className="text-white text-xs">Y1: ${s.curYear.toFixed(1)}</div>
                  <div className="text-white text-xs ml-3">KTC: {Math.round(s.ktcValue)}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-white/60">
              Formula: Ratio = (Σ Active KTC) / (Σ Active Year 1 Salary). Budget Value = KTC + Salary × (−Ratio) + AvgKTC(pos).
            </div>
          </div>
        )}
        {tradeValidation && haveAtLeastTwoTeams && (
          <div className={`mb-6 overflow-hidden rounded-2xl border p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)] ${tradeBannerTone.wrapper}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-bold ${tradeBannerTone.icon}`}>
                  {tradeValidation.unassigned ? '!' : tradeValidation.isInvalidCurYear ? '×' : tradeValidation.isFutureYearOverCap || tradeValidation.isClose ? '!' : '✓'}
                </div>

                <div className="min-w-0">
                  <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${tradeBannerTone.badge}`}>
                    Trade Status
                  </div>
                  <h3 className={`mt-3 text-xl font-bold ${tradeBannerTone.title}`}>{tradeBannerHeading}</h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-white/75">{tradeBannerSubheading}</p>

                  {!tradeValidation.unassigned && tradeBannerItems.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {tradeBannerItems.map((item, index) => (
                        <div key={`${item.label}-${item.value}-${index}`} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/85">
                          <span className="font-semibold text-white">{item.label}:</span>{' '}
                          <span className={tradeBannerTone.accent}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-stretch gap-2 lg:min-w-[220px]">
                <button
                  disabled={tradeValidation.unassigned}
                  onClick={() => setShowSummary(true)}
                  className={`rounded-xl px-5 py-3 text-base font-bold transition-all ${tradeValidation.unassigned ? 'cursor-not-allowed border border-white/10 bg-white/5 text-white/35' : tradeBannerTone.button}`}
                >
                  {tradeValidation.unassigned ? 'Assign Teams First' : 'Open Trade Summary'}
                </button>
                <div className="text-center text-xs text-white/55">
                  {tradeValidation.unassigned ? 'Destinations are required before the summary can open.' : 'Review cap impact, incoming values, draft picks, and roster fit.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {showSummary && tradeValidation && (
          <TradeSummary
            participants={participants}
            impactsByTeam={tradeValidation.impactsByTeam}
            onClose={() => setShowSummary(false)}
            teamAvatars={teamAvatars}
            salaryKtcRatio={ktcPerDollar}
            positionRatios={positionRatios}
            usePositionRatios={usePositionRatios}
            avgKtcByPosition={avgKtcByPosition}
          />
        )}

        <div className="flex items-center justify-between mb-4">
          <div className="text-white/70 text-sm">Teams in trade: {participants.filter(p => p.team).length}</div>
          <button
            onClick={addParticipant}
            className="px-3 py-1.5 bg-white/10 border border-white/20 rounded text-white hover:bg-white/20"
          >
            + Add Team
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {participants.map((p, idx) => {
            const filtered = getFilteredPlayers(p);
            const teamOptions = participants.map(pp => pp.team).filter(Boolean);
            const impact = p.team && tradeValidation ? tradeValidation.impactsByTeam?.[p.team] : null;
            return (
              <TeamSection
                key={p.id}
                label={`Team ${idx + 1}`}
                participant={p}
                setTeam={(team) => setParticipantTeam(p.id, team)}
                setSearchTerm={(term) => setParticipantSearch(p.id, term)}
                setPositionFilter={(position) => setParticipantPositionFilter(p.id, position)}
                setSortOption={(sortOption) => setParticipantSortOption(p.id, sortOption)}
                filteredPlayers={filtered}
                addPlayer={(player) => addPlayerToParticipant(p.id, player)}
                removePlayer={(playerId) => removePlayerFromParticipant(p.id, playerId)}
                updateDestination={(playerId, toTeam) => updatePlayerDestination(p.id, playerId, toTeam)}
                uniqueTeams={uniqueTeams.filter(t => !participants.some(pp => pp.id !== p.id && pp.team === t))}
                availablePositions={availablePositions}
                teamOptions={teamOptions}
                impact={impact}
                teamAvatars={teamAvatars}
                canRemove={participants.length > 2}
                onRemove={() => removeParticipant(p.id)}
                hideDestination={isTwoTeamTrade}
                ktcPerDollar={ktcPerDollar}
                usePositionRatios={usePositionRatios}
                positionRatios={positionRatios}
                avgKtcByPosition={avgKtcByPosition}
              />
            );
          })}
        </div>
      </div>
      <SleeperImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onApply={handleApplyImport}
        allPlayers={players}
        teamOptions={uniqueTeams}
        teamAvatars={teamAvatars}
      />
      {showIncomingTradeBar && (
        <IncomingTradeBar
          entries={incomingBarEntriesWithPercent}
          metricConfig={incomingMetricConfig}
          autoplay={incomingMetricAutoplay}
          onToggleAutoplay={() => setIncomingMetricAutoplay((prev) => !prev)}
          onNextMetric={() => setIncomingMetricIndex((prev) => (prev + 1) % INCOMING_BAR_METRICS.length)}
        />
      )}
    </main>
  );
}

// --- Add this CSS file in your project (src/app/trade/playerCardAnimations.css) ---
// .player-card-pop-enter {
//   opacity: 0;
//   transform: scale(0.95);
// }
// .player-card-pop-enter-active {
//   opacity: 1;
//   transform: scale(1.05);
//   transition: opacity 0.3s, transform 0.3s;
// }
// .player-card-pop-exit {
//   opacity: 1;
// }
// .player-card-pop-exit-active {
//   opacity: 0;
//   transition: opacity 0.3s;
// }
// -------------------------------------------------------------------------------