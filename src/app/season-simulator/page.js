'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import AdminToolModal from '../admin/components/AdminToolModal';
import RosterTradeModal from './components/RosterTradeModal';
import { downloadCSV, formatNullableForCSV } from '@/utils/csvUtils';

const DEFAULT_ADMIN_CONFIG = {
  simulations: 250,
  boomBustStdDev: 0.18,
  shortInjuryChance: 0.05,
  longInjuryChance: 0.01,
};

const ADMIN_FIELD_HELP = {
  simulations: 'Total simulated seasons for the final dashboard. Production runs are automatically split into 20-season batches and combined.',
  boomBustStdDev: 'How wide the weekly point distribution should be. This is a decimal spread, not a percentage.',
  shortInjuryChance: "Chance a selected starter suffers an in-game injury after lineup selection. The player stays in the lineup, but that week's output is reduced to 35–80% of its randomized level.",
  longInjuryChance: 'Chance an otherwise eligible player is unavailable before lineup selection for that simulated week. If a projected starter is unavailable, the optimal lineup is rebuilt from the remaining players.',
};

const SIMULATION_BATCH_SIZE = 20;
const SIMULATION_BATCH_ATTEMPTS = 3;


function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatPercentInputValue(value) {
  return Number(value || 0) * 100;
}

function normalizePercentInputValue(value) {
  return Number(value || 0) / 100;
}

function formatNumber(value) {
  return Number(value || 0).toFixed(2);
}

async function readApiJson(response, label = 'Request') {
  const text = await response.text();

  if (!text) {
    throw new Error(`${label} failed (${response.status}) with an empty response.`);
  }

  try {
    return JSON.parse(text);
  } catch {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 180);
    throw new Error(
      `${label} failed (${response.status}). The server returned a non-JSON response${preview ? `: ${preview}` : '.'}`
    );
  }
}

function getSimulationCacheKey(leagueId) {
  return `season-simulator-cache:${String(leagueId || '')}`;
}

function readSimulationCache(leagueId) {
  if (typeof window === 'undefined' || !leagueId) return null;

  try {
    const raw = window.localStorage.getItem(getSimulationCacheKey(leagueId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || String(parsed.leagueId) !== String(leagueId)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSimulationCache(leagueId, cache) {
  if (typeof window === 'undefined' || !leagueId) return;

  try {
    window.localStorage.setItem(
      getSimulationCacheKey(leagueId),
      JSON.stringify({
        leagueId: String(leagueId),
        updatedAt: new Date().toISOString(),
        ...cache,
      })
    );
  } catch {
    // Ignore storage quota / privacy mode failures.
  }
}

function normalizeCachedRosterTrades(rosterTrades = []) {
  if (!Array.isArray(rosterTrades)) return [];

  return rosterTrades
    .map((trade) => ({
      fromRosterId: Number(trade?.fromRosterId),
      toRosterId: Number(trade?.toRosterId),
      fromTeamName: String(trade?.fromTeamName || ''),
      toTeamName: String(trade?.toTeamName || ''),
      asset: trade?.asset && typeof trade.asset === 'object'
        ? {
            assetType: String(trade.asset.assetType || 'player'),
            playerId: String(trade.asset.playerId || ''),
            playerName: String(trade.asset.playerName || trade.asset.playerId || ''),
            position: String(trade.asset.position || 'UNK'),
            nflTeam: String(trade.asset.nflTeam || ''),
          }
        : null,
    }))
    .filter((trade) => Number.isFinite(trade.fromRosterId) && Number.isFinite(trade.toRosterId) && trade.asset?.playerId);
}


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function populationStdDevFromTotals(sum, sumSquares, count) {
  if (!count) return 0;
  const mean = sum / count;
  return Math.sqrt(Math.max(0, (sumSquares / count) - (mean * mean)));
}

function createSimulationAccumulator() {
  return {
    simulations: 0,
    teams: new Map(),
  };
}

function mergeSimulationAggregation(accumulator, aggregation) {
  const batchSimulations = Number(aggregation?.simulations || 0);
  if (!batchSimulations || !Array.isArray(aggregation?.teams)) {
    throw new Error('Simulation batch returned no aggregate data.');
  }

  accumulator.simulations += batchSimulations;

  for (const row of aggregation.teams) {
    const key = String(row.rosterId);
    if (!accumulator.teams.has(key)) {
      accumulator.teams.set(key, {
        rosterId: row.rosterId,
        teamName: row.teamName,
        displayName: row.displayName,
        simulations: 0,
        winsTotal: 0,
        winsSquaredTotal: 0,
        lossesTotal: 0,
        tiesTotal: 0,
        pointsForTotal: 0,
        pointsForSquaredTotal: 0,
        pointsAgainstTotal: 0,
        playoffAppearances: 0,
        championships: 0,
        firstPickCount: 0,
        finishTotal: 0,
        recordCounts: new Map(),
        slotStats: new Map(),
      });
    }

    const team = accumulator.teams.get(key);
    for (const field of [
      'simulations',
      'winsTotal',
      'winsSquaredTotal',
      'lossesTotal',
      'tiesTotal',
      'pointsForTotal',
      'pointsForSquaredTotal',
      'pointsAgainstTotal',
      'playoffAppearances',
      'championships',
      'firstPickCount',
      'finishTotal',
    ]) {
      team[field] += Number(row[field] || 0);
    }

    for (const recordRow of row.recordCounts || []) {
      const record = String(recordRow.record || '');
      if (!record) continue;
      team.recordCounts.set(record, (team.recordCounts.get(record) || 0) + Number(recordRow.count || 0));
    }

    for (const slotRow of row.slotStats || []) {
      const slot = String(slotRow.slot || slotRow.label || 'UNK');
      if (!team.slotStats.has(slot)) {
        team.slotStats.set(slot, { slot, appearances: 0, pointsTotal: 0 });
      }
      const bucket = team.slotStats.get(slot);
      bucket.appearances += Number(slotRow.appearances || 0);
      bucket.pointsTotal += Number(slotRow.pointsTotal || 0);
    }
  }

  return batchSimulations;
}

function finalizeSimulationResult(meta, accumulator) {
  const teamSummaries = Array.from(accumulator.teams.values())
    .map((team) => {
      const divisor = Math.max(1, team.simulations);
      const averagePointsFor = team.pointsForTotal / divisor;
      const averagePointsAgainst = team.pointsAgainstTotal / divisor;

      return {
        rosterId: team.rosterId,
        teamName: team.teamName,
        displayName: team.displayName,
        averageWins: Number((team.winsTotal / divisor).toFixed(2)),
        averageLosses: Number((team.lossesTotal / divisor).toFixed(2)),
        averageTies: Number((team.tiesTotal / divisor).toFixed(2)),
        averagePointsFor: Number(averagePointsFor.toFixed(2)),
        averagePointsAgainst: Number(averagePointsAgainst.toFixed(2)),
        averageMargin: Number((averagePointsFor - averagePointsAgainst).toFixed(2)),
        pointsForVolatility: Number(
          populationStdDevFromTotals(team.pointsForTotal, team.pointsForSquaredTotal, divisor).toFixed(2)
        ),
        winsVolatility: Number(
          populationStdDevFromTotals(team.winsTotal, team.winsSquaredTotal, divisor).toFixed(2)
        ),
        averageFinish: Number((team.finishTotal / divisor).toFixed(2)),
        playoffOdds: Number(((team.playoffAppearances / divisor) * 100).toFixed(2)),
        championshipOdds: Number(((team.championships / divisor) * 100).toFixed(2)),
        firstPickOdds: Number(((team.firstPickCount / divisor) * 100).toFixed(2)),
        slotAverages: Array.from(team.slotStats.values())
          .map((slot) => ({
            slot: slot.slot,
            appearances: slot.appearances,
            avgPoints: Number((slot.pointsTotal / Math.max(1, slot.appearances)).toFixed(2)),
          }))
          .sort((left, right) => right.avgPoints - left.avgPoints || left.slot.localeCompare(right.slot)),
        recordDistribution: Array.from(team.recordCounts.entries())
          .sort((left, right) => right[1] - left[1])
          .slice(0, 5)
          .map(([record, count]) => ({
            record,
            count,
            odds: Number(((count / divisor) * 100).toFixed(2)),
          })),
      };
    })
    .sort((left, right) => left.averageFinish - right.averageFinish);

  return {
    ...meta,
    ok: true,
    simulations: accumulator.simulations,
    teamSummaries,
    rawRunsIncluded: false,
    matchupDetailIncluded: false,
  };
}

function SummaryCard({ label, value, note }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
      <div className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {note ? <div className="mt-1 text-sm text-white/55">{note}</div> : null}
    </div>
  );
}


function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0) / values.length;
}

function standardDeviation(values = []) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + ((Number(value) || 0) - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function compactTeamName(team) {
  const name = String(team?.displayName || team?.teamName || 'Team').trim();
  if (name.length <= 18) return name;
  return `${name.slice(0, 16)}…`;
}

function ProgressBar({ value, max = 100, tone = 'accent', height = 'h-2' }) {
  const width = max > 0 ? Math.max(0, Math.min(100, ((Number(value) || 0) / max) * 100)) : 0;
  const fill = tone === 'muted' ? 'bg-white/25' : tone === 'positive' ? 'bg-emerald-400/80' : tone === 'warning' ? 'bg-amber-400/80' : 'bg-[#FF4B1F]';

  return (
    <div className={`${height} overflow-hidden rounded-full bg-white/[0.07]`}>
      <div className={`h-full rounded-full ${fill} transition-[width] duration-500`} style={{ width: `${width}%` }} />
    </div>
  );
}

function InsightChip({ type = 'strength', children }) {
  const className = type === 'strength'
    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
    : 'border-amber-400/20 bg-amber-400/10 text-amber-100';

  return (
    <div className={`rounded-xl border px-3 py-2 text-xs leading-5 ${className}`}>
      <span className="mr-1.5 font-black">{type === 'strength' ? '+' : '!'}</span>
      {children}
    </div>
  );
}

function ChampionshipRace({ teams = [] }) {
  const rows = [...teams].sort((left, right) => Number(right.championshipOdds || 0) - Number(left.championshipOdds || 0));
  const maxChampionship = Math.max(1, ...rows.map((team) => Number(team.championshipOdds || 0)));

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0A1D2B] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF8A6D]">Title race</p>
          <h3 className="mt-1 text-lg font-black text-white sm:text-xl">Championship probability</h3>
          <p className="mt-1 text-sm text-white/45">Relative title odds across the league.</p>
        </div>
        <div className="hidden rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right sm:block">
          <div className="text-[10px] font-bold uppercase tracking-wide text-white/35">Leader</div>
          <div className="mt-0.5 max-w-[150px] truncate text-sm font-bold text-white">{rows[0] ? compactTeamName(rows[0]) : '—'}</div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {rows.map((team, index) => (
          <div key={team.rosterId || team.teamName} className="grid grid-cols-[minmax(0,1fr)_58px] items-center gap-3">
            <div className="min-w-0">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="w-5 shrink-0 text-[11px] font-black text-white/30">{index + 1}</span>
                <span className="truncate text-sm font-semibold text-white/80">{compactTeamName(team)}</span>
              </div>
              <div className="ml-7">
                <ProgressBar value={team.championshipOdds} max={maxChampionship} />
              </div>
            </div>
            <div className="text-right text-sm font-black text-white">{formatPercent(team.championshipOdds)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutcomeMatrix({ teams = [] }) {
  const ranked = [...teams].sort((left, right) => Number(right.championshipOdds || 0) - Number(left.championshipOdds || 0));
  const maxChampionship = Math.max(5, ...ranked.map((team) => Number(team.championshipOdds || 0)));
  const chartCeiling = Math.ceil(maxChampionship / 5) * 5;

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0A1D2B] p-4 sm:p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF8A6D]">Outcome map</p>
        <h3 className="mt-1 text-lg font-black text-white sm:text-xl">Playoff safety vs title ceiling</h3>
        <p className="mt-1 text-sm text-white/45">Further right means safer playoffs. Higher means a stronger championship ceiling.</p>
      </div>

      <div className="mt-5">
        <div className="relative h-64 overflow-hidden rounded-2xl border border-white/10 bg-black/20 sm:h-72">
          <div className="absolute inset-x-4 top-1/2 border-t border-dashed border-white/10" />
          <div className="absolute inset-y-4 left-1/2 border-l border-dashed border-white/10" />
          <div className="absolute left-3 top-2 text-[10px] font-bold uppercase tracking-wide text-white/25">Higher title ceiling</div>
          <div className="absolute bottom-2 left-3 text-[10px] font-bold uppercase tracking-wide text-white/25">Fringe</div>
          <div className="absolute bottom-2 right-3 text-[10px] font-bold uppercase tracking-wide text-white/25">Playoff safe</div>

          {ranked.map((team, index) => {
            const left = 5 + (clampPercent(team.playoffOdds) * 0.9);
            const bottom = 8 + ((Number(team.championshipOdds || 0) / chartCeiling) * 82);
            return (
              <div
                key={team.rosterId || team.teamName}
                title={`${team.displayName || team.teamName}: ${formatPercent(team.playoffOdds)} playoffs, ${formatPercent(team.championshipOdds)} champion`}
                className={`absolute flex h-7 w-7 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border text-[11px] font-black shadow-lg ${index < 3 ? 'border-[#FF9C83]/50 bg-[#FF4B1F] text-white shadow-[#FF4B1F]/20' : 'border-white/20 bg-[#173247] text-white/85 shadow-black/30'}`}
                style={{ left: `${left}%`, bottom: `${bottom}%` }}
              >
                {index + 1}
              </div>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {ranked.map((team, index) => (
            <div key={team.rosterId || team.teamName} className="flex min-w-0 items-center gap-2 text-xs text-white/55">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${index < 3 ? 'bg-[#FF4B1F] text-white' : 'bg-white/10 text-white/70'}`}>{index + 1}</span>
              <span className="truncate">{compactTeamName(team)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamOutlookCard({ team, index }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-[#0A1D2B]">
      <div className="border-b border-white/10 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">Projected rank #{index + 1}</div>
            <h3 className="mt-1 truncate text-lg font-black text-white">{team.displayName || team.teamName}</h3>
            <div className="mt-1 text-xs text-white/40">Scoring rank {team.scoringRank ? `#${team.scoringRank}` : '—'} · Avg finish {formatNumber(team.averageFinish)}</div>
          </div>
          <div className="shrink-0 rounded-2xl border border-[#FF4B1F]/20 bg-[#FF4B1F]/10 px-3 py-2 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#FF9C83]">Title</div>
            <div className="text-xl font-black text-white">{formatPercent(team.championshipOdds)}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-black/20 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-white/30">Playoffs</div>
            <div className="mt-0.5 text-sm font-black text-white">{formatPercent(team.playoffOdds)}</div>
          </div>
          <div className="rounded-xl bg-black/20 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-white/30">Avg wins</div>
            <div className="mt-0.5 text-sm font-black text-white">{formatNumber(team.averageWins)}</div>
          </div>
          <div className="rounded-xl bg-black/20 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-white/30">Avg PF</div>
            <div className="mt-0.5 text-sm font-black text-white">{team.avgPointsFor ? formatNumber(team.avgPointsFor) : '—'}</div>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-[0.13em] text-white/35">Playoff probability</span>
            <span className="font-black text-white/75">{formatPercent(team.playoffOdds)}</span>
          </div>
          <ProgressBar value={team.playoffOdds} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-200/70">Strengths</div>
            <div className="space-y-2">
              {team.strengths.slice(0, 2).map((item) => <InsightChip key={item} type="strength">{item}</InsightChip>)}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-100/70">Watch items</div>
            <div className="space-y-2">
              {team.weaknesses.slice(0, 2).map((item) => <InsightChip key={item} type="weakness">{item}</InsightChip>)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-4 text-xs">
          <div className="flex items-center justify-between rounded-xl bg-black/15 px-3 py-2">
            <span className="text-white/40">Scoring margin</span>
            <span className={`font-black ${team.avgMargin >= 0 ? 'text-emerald-200' : 'text-amber-100'}`}>{team.avgMargin >= 0 ? '+' : ''}{formatNumber(team.avgMargin)}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-black/15 px-3 py-2">
            <span className="text-white/40">#1 pick risk</span>
            <span className="font-black text-white/75">{formatPercent(team.firstPickOdds)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function AdminField({ label, helpText, children }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-white" title={helpText}>{label}</span>
      {children}
      {helpText ? <span className="text-xs leading-5 text-white/45">{helpText}</span> : null}
    </label>
  );
}

function buildSlotLabels(rosterPositions = []) {
  const ignored = new Set(['BN', 'IR', 'TAXI']);
  const counts = new Map();
  const slots = [];

  for (const rawSlot of rosterPositions) {
    const slot = String(rawSlot || '').trim();
    if (!slot || ignored.has(slot)) continue;
    counts.set(slot, (counts.get(slot) || 0) + 1);
    slots.push(slot);
  }

  const seen = new Map();
  return slots.map((slot) => {
    seen.set(slot, (seen.get(slot) || 0) + 1);
    return counts.get(slot) > 1 ? `${slot}${seen.get(slot)}` : slot;
  });
}


export default function SeasonSimulatorPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [leagueInfo, setLeagueInfo] = useState(null);
  const [leagueError, setLeagueError] = useState('');
  const [loadingLeague, setLoadingLeague] = useState(true);

  const [startMode, setStartMode] = useState('current');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [runError, setRunError] = useState('');
  const [simulationProgress, setSimulationProgress] = useState({ completed: 0, total: 0, retry: 0, batchSize: SIMULATION_BATCH_SIZE });
  const [showRosterTradeModal, setShowRosterTradeModal] = useState(false);
  const [rosterTrades, setRosterTrades] = useState([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminConfig, setAdminConfig] = useState(DEFAULT_ADMIN_CONFIG);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const lastSavedSettingsRef = useRef('');
  const settingsSuccessTimerRef = useRef(null);
  const simulationCacheHydratedRef = useRef(false);

  const slotLabels = useMemo(() => buildSlotLabels(leagueInfo?.rosterPositions || []), [leagueInfo]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoadingLeague(true);
        setLeagueError('');

        const leagueRes = await fetch('/api/sleeper/bbb-league-id', { cache: 'no-store' });
        const leagueJson = await leagueRes.json();
        if (!leagueRes.ok) {
          throw new Error(leagueJson?.error || 'Failed to resolve BBB league');
        }

        const configRes = await fetch(`/api/season-simulator/simulate?leagueId=${leagueJson.leagueId}`, { cache: 'no-store' });
        const configJson = await configRes.json();
        if (!configRes.ok || !configJson?.ok) {
          throw new Error(configJson?.error || 'Failed to load simulator config');
        }

        if (cancelled) return;
        setLeagueInfo(configJson);

        const cachedState = readSimulationCache(leagueJson.leagueId);
        if (cachedState) {
          setStartMode(cachedState.startMode || configJson.defaultStartMode || 'current');
          setRosterTrades(normalizeCachedRosterTrades(cachedState.rosterTrades));
          setResult(cachedState.result || null);
        } else {
          setStartMode(configJson.defaultStartMode || 'current');
          setRosterTrades([]);
          setResult(null);
        }

        const initialSettings = configJson.settings || DEFAULT_ADMIN_CONFIG;
        setAdminConfig({
          simulations: Number(initialSettings.simulations) || DEFAULT_ADMIN_CONFIG.simulations,
          boomBustStdDev: Number(initialSettings.boomBustStdDev) || DEFAULT_ADMIN_CONFIG.boomBustStdDev,
          shortInjuryChance: Number(initialSettings.shortInjuryChance) || DEFAULT_ADMIN_CONFIG.shortInjuryChance,
          longInjuryChance: Number(initialSettings.longInjuryChance) || DEFAULT_ADMIN_CONFIG.longInjuryChance,
        });
        lastSavedSettingsRef.current = JSON.stringify({
          simulations: Number(initialSettings.simulations) || DEFAULT_ADMIN_CONFIG.simulations,
          boomBustStdDev: Number(initialSettings.boomBustStdDev) || DEFAULT_ADMIN_CONFIG.boomBustStdDev,
          shortInjuryChance: Number(initialSettings.shortInjuryChance) || DEFAULT_ADMIN_CONFIG.shortInjuryChance,
          longInjuryChance: Number(initialSettings.longInjuryChance) || DEFAULT_ADMIN_CONFIG.longInjuryChance,
        });
        simulationCacheHydratedRef.current = true;
        setSettingsLoaded(true);
      } catch (error) {
        if (!cancelled) {
          setLeagueError(error?.message || 'Failed to load simulator');
          setLeagueInfo(null);
        }
      } finally {
        if (!cancelled) setLoadingLeague(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAdmin || !settingsLoaded) return;

    const payload = {
      simulations: Number(adminConfig.simulations),
      boomBustStdDev: Number(adminConfig.boomBustStdDev),
      shortInjuryChance: Number(adminConfig.shortInjuryChance),
      longInjuryChance: Number(adminConfig.longInjuryChance),
    };
    const serialized = JSON.stringify(payload);

    if (serialized === lastSavedSettingsRef.current) return;

    const timer = setTimeout(async () => {
      setSettingsSaving(true);
      setSettingsError('');
      try {
        const response = await fetch('/api/season-simulator/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await response.json();
        if (!response.ok || !json?.success) {
          throw new Error(json?.error || 'Failed to save simulator settings');
        }

        const savedSettings = json?.settings || payload;
        lastSavedSettingsRef.current = JSON.stringify(savedSettings);
        setSettingsSuccess('Saved');
        if (settingsSuccessTimerRef.current) {
          clearTimeout(settingsSuccessTimerRef.current);
        }
        settingsSuccessTimerRef.current = setTimeout(() => setSettingsSuccess(''), 1800);
      } catch (error) {
        setSettingsError(error?.message || 'Failed to save simulator settings');
      } finally {
        setSettingsSaving(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [adminConfig, isAdmin, settingsLoaded]);

  useEffect(() => () => {
    if (settingsSuccessTimerRef.current) {
      clearTimeout(settingsSuccessTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!simulationCacheHydratedRef.current || !leagueInfo?.leagueId) return;

    writeSimulationCache(leagueInfo.leagueId, {
      startMode,
      rosterTrades,
      result,
    });
  }, [leagueInfo?.leagueId, result, rosterTrades, startMode]);

  const rawRunRows = useMemo(() => {
    if (!Array.isArray(result?.teamSummaries)) return [];

    return result.teamSummaries.map((team) => ({
      Team: formatNullableForCSV(team.displayName || team.teamName),
      'Avg Finish': formatNullableForCSV(team.averageFinish),
      'Avg Wins': formatNullableForCSV(team.averageWins),
      'Avg Losses': formatNullableForCSV(team.averageLosses),
      'Avg Ties': formatNullableForCSV(team.averageTies),
      'Avg Points For': formatNullableForCSV(team.averagePointsFor),
      'Avg Points Against': formatNullableForCSV(team.averagePointsAgainst),
      'Avg Margin': formatNullableForCSV(team.averageMargin),
      'Playoff Odds': formatNullableForCSV(team.playoffOdds),
      'Championship Odds': formatNullableForCSV(team.championshipOdds),
      '#1 Pick Odds': formatNullableForCSV(team.firstPickOdds),
      'Scoring Volatility': formatNullableForCSV(team.pointsForVolatility),
      'Wins Volatility': formatNullableForCSV(team.winsVolatility),
      'Top Record Outcomes': formatNullableForCSV(
        (team.recordDistribution || [])
          .map((row) => `${row.record} (${row.odds}%)`)
          .join('; ')
      ),
    }));
  }, [result]);

  const teamAnalytics = useMemo(() => {
    const summaries = Array.isArray(result?.teamSummaries) ? result.teamSummaries : [];
    if (!summaries.length) return [];

    const base = summaries.map((team) => {
      const avgPointsFor = Number(team.averagePointsFor ?? team.avgPointsFor ?? 0) || 0;
      const avgPointsAgainst = Number(team.averagePointsAgainst ?? team.avgPointsAgainst ?? 0) || 0;
      const avgMargin = Number(
        team.averageMargin ?? team.avgMargin ?? (avgPointsFor - avgPointsAgainst)
      ) || 0;

      return {
        ...team,
        avgPointsFor,
        avgPointsAgainst,
        avgMargin,
        pointsForVolatility: Number(team.pointsForVolatility || 0),
        winsVolatility: Number(team.winsVolatility || 0),
        slotAverages: Array.isArray(team.slotAverages) ? team.slotAverages : [],
      };
    });

    const leagueSlotTotals = new Map();
    for (const team of base) {
      for (const slot of team.slotAverages || []) {
        const label = slot.slot || slot.label || 'UNK';
        const appearances = Number(slot.appearances || 0);
        const avgPoints = Number(slot.avgPoints || 0);
        if (!leagueSlotTotals.has(label)) {
          leagueSlotTotals.set(label, { total: 0, count: 0 });
        }
        const bucket = leagueSlotTotals.get(label);
        bucket.total += avgPoints * appearances;
        bucket.count += appearances;
      }
    }

    const leagueSlotAverages = new Map(
      Array.from(leagueSlotTotals.entries()).map(([slot, values]) => [
        slot,
        values.count ? values.total / values.count : 0,
      ])
    );

    const scoringOrder = [...base].sort((left, right) => right.avgPointsFor - left.avgPointsFor);
    const marginOrder = [...base].sort((left, right) => right.avgMargin - left.avgMargin);
    const volatilityValues = base.map((team) => team.pointsForVolatility).sort((a, b) => a - b);
    const medianVolatility = volatilityValues[Math.floor(volatilityValues.length / 2)] || 0;
    const leagueAvgPointsAgainst = average(base.map((team) => team.avgPointsAgainst));
    const leagueAvgChampionship = average(base.map((team) => Number(team.championshipOdds) || 0));
    const leagueAvgPlayoff = average(base.map((team) => Number(team.playoffOdds) || 0));
    const topThird = Math.max(1, Math.ceil(base.length / 3));
    const bottomThirdStart = Math.max(1, Math.floor((base.length * 2) / 3) + 1);

    return base
      .map((team) => {
        const scoringRankValue = scoringOrder.findIndex((row) => String(row.rosterId) === String(team.rosterId)) + 1;
        const scoringRank = team.avgPointsFor > 0 ? scoringRankValue : null;
        const marginRank = marginOrder.findIndex((row) => String(row.rosterId) === String(team.rosterId)) + 1;
        const playoffOdds = Number(team.playoffOdds) || 0;
        const championshipOdds = Number(team.championshipOdds) || 0;
        const firstPickOdds = Number(team.firstPickOdds) || 0;
        const titleConversion = playoffOdds > 0 ? championshipOdds / playoffOdds : 0;
        const strengths = [];
        const weaknesses = [];
        const slotComparisons = (team.slotAverages || [])
          .map((slot) => ({ ...slot, leagueAvg: leagueSlotAverages.get(slot.slot) || 0, delta: slot.avgPoints - (leagueSlotAverages.get(slot.slot) || 0) }))
          .filter((slot) => slot.appearances > 0 && slot.leagueAvg > 0);
        const bestSlot = [...slotComparisons].sort((a, b) => b.delta - a.delta)[0];
        const weakestSlot = [...slotComparisons].sort((a, b) => a.delta - b.delta)[0];

        if (bestSlot?.delta >= 0.75) strengths.push(`${bestSlot.slot} production is +${formatNumber(bestSlot.delta)} pts above league norm`);
        if (scoringRank && scoringRank <= topThird) strengths.push(`#${scoringRank} simulated scoring profile`);
        if (marginRank && marginRank <= topThird && team.avgMargin > 0) strengths.push(`Strong weekly edge: +${formatNumber(team.avgMargin)} scoring margin`);
        if (playoffOdds >= Math.max(65, leagueAvgPlayoff + 8)) strengths.push(`High playoff floor at ${formatPercent(playoffOdds)}`);
        if (championshipOdds >= Math.max(leagueAvgChampionship + 4, 10)) strengths.push(`Above-average title ceiling at ${formatPercent(championshipOdds)}`);
        if (titleConversion >= 0.22 && championshipOdds >= leagueAvgChampionship) strengths.push('Efficient title conversion after making the playoffs');

        if (weakestSlot?.delta <= -0.75) weaknesses.push(`${weakestSlot.slot} production is ${formatNumber(Math.abs(weakestSlot.delta))} pts below league norm`);
        if (scoringRank && scoringRank >= bottomThirdStart && team.avgPointsFor > 0) weaknesses.push(`Bottom-third simulated scoring profile (#${scoringRank})`);
        if (team.avgMargin < -0.5) weaknesses.push(`Negative scoring margin (${formatNumber(team.avgMargin)})`);
        if (playoffOdds < Math.min(45, leagueAvgPlayoff - 8)) weaknesses.push(`Narrow playoff path at ${formatPercent(playoffOdds)}`);
        if (firstPickOdds >= 12) weaknesses.push(`Meaningful #1-pick downside (${formatPercent(firstPickOdds)})`);
        if (team.avgPointsAgainst > leagueAvgPointsAgainst * 1.02 && team.avgPointsAgainst > 0) weaknesses.push('Tougher-than-average simulated schedule pressure');
        if (team.pointsForVolatility > medianVolatility * 1.12 && team.pointsForVolatility > 0) weaknesses.push('Higher scoring volatility than most teams');

        if (!strengths.length) {
          if (playoffOdds >= leagueAvgPlayoff) strengths.push('Playoff outlook is above the league average');
          else if (team.avgMargin >= 0) strengths.push('Positive aggregate scoring margin');
          else strengths.push('Upside remains in the simulation distribution');
        }

        if (!weaknesses.length) {
          if (championshipOdds < leagueAvgChampionship) weaknesses.push('Title ceiling trails the league average');
          else if (team.pointsForVolatility > medianVolatility && team.pointsForVolatility > 0) weaknesses.push('Volatility is the main watch item');
          else weaknesses.push('No major aggregate red flag; weekly variance remains');
        }

        return { ...team, scoringRank, marginRank, strengths, weaknesses };
      })
      .sort((left, right) => Number(left.averageFinish || 999) - Number(right.averageFinish || 999));
  }, [result, slotLabels]);

  const leagueStory = useMemo(() => {
    if (!teamAnalytics.length) return null;
    const byChamp = [...teamAnalytics].sort((a, b) => Number(b.championshipOdds || 0) - Number(a.championshipOdds || 0));
    const byPlayoff = [...teamAnalytics].sort((a, b) => Number(b.playoffOdds || 0) - Number(a.playoffOdds || 0));
    const byScoring = [...teamAnalytics].sort((a, b) => Number(b.avgPointsFor || 0) - Number(a.avgPointsFor || 0));
    const byFirstPick = [...teamAnalytics].sort((a, b) => Number(b.firstPickOdds || 0) - Number(a.firstPickOdds || 0));
    return {
      titleFavorite: byChamp[0],
      safestPlayoff: byPlayoff[0],
      scoringLeader: Number(byScoring[0]?.avgPointsFor || 0) > 0 ? byScoring[0] : null,
      biggestDownside: byFirstPick[0],
    };
  }, [teamAnalytics]);

  async function runSimulation() {
    if (!leagueInfo?.leagueId) return;

    const targetSimulations = Math.max(
      1,
      Math.min(5000, Math.floor(Number(adminConfig.simulations) || DEFAULT_ADMIN_CONFIG.simulations))
    );
    const serverBatchLimit = Math.max(
      1,
      Math.min(SIMULATION_BATCH_SIZE, Number(leagueInfo?.maxBatchSimulations) || SIMULATION_BATCH_SIZE)
    );

    setRunning(true);
    setRunError('');
    setSimulationProgress({ completed: 0, total: targetSimulations, retry: 0, batchSize: serverBatchLimit });

    const accumulator = createSimulationAccumulator();
    let completed = 0;
    let resultMeta = null;
    let activeBatchSize = serverBatchLimit;

    try {
      while (completed < targetSimulations) {
        const requestedBatch = Math.min(activeBatchSize, targetSimulations - completed);
        let batchJson = null;
        let lastError = null;

        for (let attempt = 1; attempt <= SIMULATION_BATCH_ATTEMPTS; attempt += 1) {
          setSimulationProgress({
            completed,
            total: targetSimulations,
            retry: attempt > 1 ? attempt - 1 : 0,
            batchSize: activeBatchSize,
          });

          try {
            const response = await fetch('/api/season-simulator/simulate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                leagueId: leagueInfo.leagueId,
                startMode,
                rosterTrades,
                simulations: requestedBatch,
              }),
            });

            const json = await readApiJson(response, `Simulation batch ${completed + 1}-${completed + requestedBatch}`);
            if (!response.ok || !json?.ok) {
              throw new Error(json?.error || `Simulation batch failed (${response.status})`);
            }

            batchJson = json;
            break;
          } catch (error) {
            lastError = error;
            if (attempt < SIMULATION_BATCH_ATTEMPTS) {
              await sleep(500 * attempt);
            }
          }
        }

        if (!batchJson) {
          if (activeBatchSize > 1) {
            activeBatchSize = Math.max(1, Math.floor(activeBatchSize / 2));
            setSimulationProgress({
              completed,
              total: targetSimulations,
              retry: 0,
              batchSize: activeBatchSize,
            });
            await sleep(750);
            continue;
          }

          throw new Error(
            `${lastError?.message || 'Simulation batch failed'} Progress was ${completed}/${targetSimulations}.`
          );
        }

        if (!resultMeta) {
          const { aggregation, teamSummaries, ...meta } = batchJson;
          resultMeta = meta;
        }

        const batchCompleted = mergeSimulationAggregation(accumulator, batchJson.aggregation);
        completed += batchCompleted;
        setSimulationProgress({ completed, total: targetSimulations, retry: 0, batchSize: activeBatchSize });

        // Yield briefly so the progress indicator can paint between requests.
        if (completed < targetSimulations) await sleep(50);
      }

      setResult(finalizeSimulationResult(resultMeta || {}, accumulator));
    } catch (error) {
      setRunError(error?.message || 'Simulation failed');
    } finally {
      setRunning(false);
    }
  }

  function exportSummaryCsv() {
    if (!rawRunRows.length) return;
    const today = new Date().toISOString().split('T')[0];
    downloadCSV(rawRunRows, `season-simulator-summary-${today}.csv`);
  }

  if (loadingLeague || status === 'loading') {
    return (
      <main className="min-h-screen bg-[#001A2B] text-white">
        <div className="flex min-h-screen items-center justify-center">
          <div className="rounded-full border-4 border-[#FF4B1F] border-t-transparent h-12 w-12 animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#061521] text-white">
      <header className="relative overflow-hidden border-b border-white/10 bg-[#081b2a]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,75,31,0.14),transparent_42%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[#FF8A6D]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FF4B1F]" />
                Rules & Tools
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
                Season <span className="text-[#FF4B1F]">Simulator</span>
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                Project the rest of the season, test alternate roster moves, and compare playoff and championship outcomes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 font-semibold text-white">
                {leagueInfo?.leagueName || 'BBB League'}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-white/60">
                {leagueInfo?.season || '—'} season
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-white/60">
                Week {leagueInfo?.currentWeek || '—'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 sm:py-8">
        {leagueError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {leagueError}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0A1D2B] shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
          <div className="border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-white sm:text-2xl">Build your simulation</h2>
                <p className="mt-1 text-sm text-white/55">Choose a starting point, optionally adjust rosters, then run the model.</p>
              </div>
              {rosterTrades.length ? (
                <span className="mt-2 w-fit rounded-full border border-[#FF4B1F]/25 bg-[#FF4B1F]/10 px-3 py-1 text-xs font-bold text-[#FF9C83] sm:mt-0">
                  {rosterTrades.length} roster move{rosterTrades.length === 1 ? '' : 's'} active
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
            <div>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-white/45">Start point</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setStartMode('current')}
                  aria-pressed={startMode === 'current'}
                  className={`rounded-2xl border p-4 text-left transition ${startMode === 'current' ? 'border-[#FF4B1F]/60 bg-[#FF4B1F]/12 shadow-[inset_0_0_0_1px_rgba(255,75,31,0.15)]' : 'border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/[0.04]'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-white">Continue from now</span>
                    <span className={`h-4 w-4 rounded-full border ${startMode === 'current' ? 'border-[#FF4B1F] bg-[#FF4B1F] shadow-[inset_0_0_0_3px_#0A1D2B]' : 'border-white/25'}`} />
                  </div>
                  <div className="mt-1 text-sm leading-5 text-white/50">Use current standings and begin with week {leagueInfo?.currentWeek || '—'}.</div>
                </button>

                <button
                  type="button"
                  onClick={() => setStartMode('full')}
                  aria-pressed={startMode === 'full'}
                  className={`rounded-2xl border p-4 text-left transition ${startMode === 'full' ? 'border-[#FF4B1F]/60 bg-[#FF4B1F]/12 shadow-[inset_0_0_0_1px_rgba(255,75,31,0.15)]' : 'border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/[0.04]'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-white">Rerun full season</span>
                    <span className={`h-4 w-4 rounded-full border ${startMode === 'full' ? 'border-[#FF4B1F] bg-[#FF4B1F] shadow-[inset_0_0_0_3px_#0A1D2B]' : 'border-white/25'}`} />
                  </div>
                  <div className="mt-1 text-sm leading-5 text-white/50">Reset to week 1 and simulate the season from scratch.</div>
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setShowRosterTradeModal(true)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
                >
                  <span aria-hidden="true">⇄</span>
                  Edit rosters
                  {rosterTrades.length ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{rosterTrades.length}</span> : null}
                </button>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => setShowAdminModal(true)}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-transparent px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    Simulation settings
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <button
                type="button"
                onClick={runSimulation}
                disabled={running || !leagueInfo?.leagueId}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF4B1F] px-5 py-3 text-base font-black text-white shadow-[0_12px_30px_rgba(255,75,31,0.22)] transition hover:bg-[#ff633e] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Simulating… {simulationProgress.completed}/{simulationProgress.total}
                  </>
                ) : (
                  <>Run simulation <span aria-hidden="true">→</span></>
                )}
              </button>
              {running && simulationProgress.total > 0 ? (
                <div className="mt-3">
                  <ProgressBar value={simulationProgress.completed} max={simulationProgress.total} height="h-2" />
                  <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-white/40">
                    <span>Batch size: {simulationProgress.batchSize} season{simulationProgress.batchSize === 1 ? '' : 's'}</span>
                    <span>{simulationProgress.retry ? `Retry ${simulationProgress.retry}/${SIMULATION_BATCH_ATTEMPTS - 1}` : `${simulationProgress.completed}/${simulationProgress.total}`}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-center text-xs leading-5 text-white/40">Results replace the previous simulation on this page.</p>
              )}
            </div>
          </div>

          {runError ? (
            <div className="border-t border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200 sm:px-6">
              {runError}
            </div>
          ) : null}
        </section>

        {result ? (
          <section className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryCard label="Simulations" value={String(result.simulations || '—')} note={result.startMode === 'full' ? 'Full-season rerun' : 'From current week'} />
              <SummaryCard label="Playoffs begin" value={`Week ${result.playoffWeekStart || '—'}`} />
              <SummaryCard label="Simulated from" value={`Week ${result.currentWeek || '—'}`} />
              <SummaryCard label="Teams" value={String(result.teamSummaries?.length || 0)} />
            </div>

            {leagueStory ? (
              <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0A1D2B]">
                <div className="border-b border-white/10 px-4 py-5 sm:px-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF8A6D]">League snapshot</p>
                      <h2 className="mt-1 text-2xl font-black text-white">What the simulation is saying</h2>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-white/50">The headline takeaways before you dig into individual teams.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[620px]">
                      {[
                        { label: 'Title favorite', team: leagueStory.titleFavorite, value: formatPercent(leagueStory.titleFavorite?.championshipOdds) },
                        { label: 'Safest playoffs', team: leagueStory.safestPlayoff, value: formatPercent(leagueStory.safestPlayoff?.playoffOdds) },
                        { label: 'Scoring leader', team: leagueStory.scoringLeader, value: leagueStory.scoringLeader?.avgPointsFor ? formatNumber(leagueStory.scoringLeader.avgPointsFor) : '—' },
                        { label: 'Most #1-pick risk', team: leagueStory.biggestDownside, value: formatPercent(leagueStory.biggestDownside?.firstPickOdds) },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="text-[10px] font-bold uppercase tracking-wide text-white/30">{item.label}</div>
                          <div className="mt-1 truncate text-sm font-bold text-white">{item.team ? compactTeamName(item.team) : '—'}</div>
                          <div className="mt-0.5 text-lg font-black text-[#FF9C83]">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              <ChampionshipRace teams={teamAnalytics} />
              <OutcomeMatrix teams={teamAnalytics} />
            </div>

            <section>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF8A6D]">Team report cards</p>
                  <h2 className="mt-1 text-2xl font-black text-white">Strengths, weaknesses & risk</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-white/50">Automatically derived from aggregate scoring, lineup-slot production, finish distributions, playoff odds, title odds, and downside risk.</p>
                </div>
                <div className="flex">
                  <button type="button" onClick={exportSummaryCsv} className="min-h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/80 transition hover:bg-white/[0.08] sm:text-sm">Team CSV</button>
                </div>
              </div>

              {isAdmin ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/55">
                  <span>Settings: {settingsSaving ? 'Saving…' : settingsSuccess || 'Saved globally'}</span>
                  {settingsError ? <span className="text-red-300">{settingsError}</span> : null}
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                {teamAnalytics.map((team, index) => <TeamOutlookCard key={team.rosterId || team.teamName} team={team} index={index} />)}
              </div>
            </section>

            <details className="group overflow-hidden rounded-3xl border border-white/10 bg-[#0A1D2B]">
              <summary className="cursor-pointer list-none px-4 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/35">Raw results</div>
                    <div className="mt-1 text-lg font-black text-white">Full projected outcomes table</div>
                    <div className="mt-1 text-sm text-white/45">Open for the exact values behind the report cards and charts.</div>
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg text-white/50 transition group-open:rotate-180 group-open:text-white">⌄</span>
                </div>
              </summary>
              <div className="border-t border-white/10 p-3 sm:p-4">
                <div className="space-y-3 md:hidden">
                  {teamAnalytics.map((team, index) => (
                    <div key={team.rosterId || team.teamName} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0"><div className="text-xs font-bold uppercase tracking-[0.16em] text-white/35">Projected rank #{index + 1}</div><div className="mt-1 truncate text-base font-bold text-white">{team.displayName || team.teamName}</div></div>
                        <div className="rounded-xl bg-[#FF4B1F]/10 px-3 py-2 text-right"><div className="text-[10px] font-bold uppercase tracking-wide text-[#FF9C83]">Avg finish</div><div className="text-xl font-black text-white">{formatNumber(team.averageFinish)}</div></div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                        <div><div className="text-[11px] uppercase tracking-wide text-white/35">Avg wins</div><div className="mt-0.5 font-bold text-white/85">{formatNumber(team.averageWins)}</div></div>
                        <div><div className="text-[11px] uppercase tracking-wide text-white/35">Playoffs</div><div className="mt-0.5 font-bold text-white/85">{formatPercent(team.playoffOdds)}</div></div>
                        <div><div className="text-[11px] uppercase tracking-wide text-white/35">Champion</div><div className="mt-0.5 font-bold text-white/85">{formatPercent(team.championshipOdds)}</div></div>
                        <div><div className="text-[11px] uppercase tracking-wide text-white/35">#1 pick</div><div className="mt-0.5 font-bold text-white/85">{formatPercent(team.firstPickOdds)}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto rounded-2xl border border-white/10 md:block">
                  <table className="min-w-full text-sm">
                    <thead className="bg-black/25 text-xs uppercase tracking-wide text-white/40"><tr><th className="px-4 py-3 text-left font-bold">Team</th><th className="px-4 py-3 text-right font-bold">Avg Finish</th><th className="px-4 py-3 text-right font-bold">Avg Wins</th><th className="px-4 py-3 text-right font-bold">Avg PF</th><th className="px-4 py-3 text-right font-bold">Playoffs</th><th className="px-4 py-3 text-right font-bold">Champion</th><th className="px-4 py-3 text-right font-bold">#1 Pick</th></tr></thead>
                    <tbody className="divide-y divide-white/10">
                      {teamAnalytics.map((team) => <tr key={team.rosterId || team.teamName} className="bg-black/5 transition hover:bg-white/[0.035]"><td className="px-4 py-3.5 font-bold text-white">{team.displayName || team.teamName}</td><td className="px-4 py-3.5 text-right font-semibold text-white/75">{formatNumber(team.averageFinish)}</td><td className="px-4 py-3.5 text-right text-white/70">{formatNumber(team.averageWins)}</td><td className="px-4 py-3.5 text-right text-white/70">{team.avgPointsFor ? formatNumber(team.avgPointsFor) : '—'}</td><td className="px-4 py-3.5 text-right text-white/70">{formatPercent(team.playoffOdds)}</td><td className="px-4 py-3.5 text-right font-semibold text-[#FF9C83]">{formatPercent(team.championshipOdds)}</td><td className="px-4 py-3.5 text-right text-white/70">{formatPercent(team.firstPickOdds)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>

          </section>
        ) : null}      </div>

      <RosterTradeModal
        isOpen={showRosterTradeModal}
        onClose={() => setShowRosterTradeModal(false)}
        onSave={setRosterTrades}
        rosters={leagueInfo?.rosters || []}
        users={leagueInfo?.users || []}
        rosterTrades={rosterTrades}
      />

      {isAdmin && showAdminModal ? (
        <AdminToolModal
          isOpen={showAdminModal}
          onClose={() => setShowAdminModal(false)}
          title="Season Simulator Settings"
          description="Adjust simulation volume and variability for the current run."
          widthClass="max-w-4xl"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <AdminField label="Simulations per run" helpText={ADMIN_FIELD_HELP.simulations}>
              <input
                type="number"
                min="1"
                max="5000"
                value={adminConfig.simulations}
                onChange={(event) => setAdminConfig((previous) => ({ ...previous, simulations: Number(event.target.value) }))}
                className="rounded-2xl border border-white/10 bg-[#00111d] px-4 py-3 text-white outline-none focus:border-[#FF4B1F]/50"
              />
            </AdminField>

            <AdminField label="Boom/bust volatility" helpText={ADMIN_FIELD_HELP.boomBustStdDev}>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={adminConfig.boomBustStdDev}
                onChange={(event) => setAdminConfig((previous) => ({ ...previous, boomBustStdDev: Number(event.target.value) }))}
                className="rounded-2xl border border-white/10 bg-[#00111d] px-4 py-3 text-white outline-none focus:border-[#FF4B1F]/50"
              />
            </AdminField>

            <AdminField label="In-game injury chance" helpText={ADMIN_FIELD_HELP.shortInjuryChance}>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formatPercentInputValue(adminConfig.shortInjuryChance)}
                onChange={(event) => setAdminConfig((previous) => ({ ...previous, shortInjuryChance: normalizePercentInputValue(event.target.value) }))}
                className="rounded-2xl border border-white/10 bg-[#00111d] px-4 py-3 text-white outline-none focus:border-[#FF4B1F]/50"
              />
            </AdminField>

            <AdminField label="Unavailable chance" helpText={ADMIN_FIELD_HELP.longInjuryChance}>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formatPercentInputValue(adminConfig.longInjuryChance)}
                onChange={(event) => setAdminConfig((previous) => ({ ...previous, longInjuryChance: normalizePercentInputValue(event.target.value) }))}
                className="rounded-2xl border border-white/10 bg-[#00111d] px-4 py-3 text-white outline-none focus:border-[#FF4B1F]/50"
              />
            </AdminField>
          </div>
          <div className="mt-4 text-sm text-white/55">
            Changes save globally for all users automatically after you edit them.
          </div>
        </AdminToolModal>
      ) : null}
    </main>
  );
}
