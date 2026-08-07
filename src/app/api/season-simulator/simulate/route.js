import { NextResponse } from 'next/server';
import {
  DEFAULT_SIMULATION_SETTINGS,
  fetchSleeperLeagueBundle,
  runSeasonSimulation,
} from '@/utils/seasonSimulatorUtils';
import { getSeasonSimulatorSettings } from '@/lib/db-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BATCH_SIMULATIONS = 20;

function normalizeBatchSimulationCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return MAX_BATCH_SIMULATIONS;
  return Math.min(MAX_BATCH_SIMULATIONS, Math.max(1, Math.floor(numeric)));
}

function normalizeRngConfig(rngConfig = {}) {
  return {
    boomBustStdDev: Number(rngConfig.boomBustStdDev ?? DEFAULT_SIMULATION_SETTINGS.boomBustStdDev),
    shortInjuryChance: Number(rngConfig.shortInjuryChance ?? DEFAULT_SIMULATION_SETTINGS.shortInjuryChance),
    longInjuryChance: Number(rngConfig.longInjuryChance ?? DEFAULT_SIMULATION_SETTINGS.longInjuryChance),
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('leagueId');

    if (!leagueId) {
      return NextResponse.json({ ok: false, error: 'Missing required query param: leagueId' }, { status: 400 });
    }

    const bundle = await fetchSleeperLeagueBundle(leagueId);
    const settingsResult = await getSeasonSimulatorSettings();

    return NextResponse.json({
      ok: true,
      leagueId,
      leagueName: bundle.league?.name || 'Unknown League',
      season: bundle.season,
      currentWeek: bundle.currentWeek,
      playoffWeekStart: bundle.playoffWeekStart,
      regularSeasonEndWeek: bundle.regularSeasonEndWeek,
      playoffTeams: bundle.playoffTeams,
      rosterPositions: bundle.rosterPositions,
      rosters: bundle.rosters || [],
      users: bundle.users || [],
      settings: settingsResult?.success ? settingsResult.settings : DEFAULT_SIMULATION_SETTINGS,
      teamCount: bundle.rosters?.length || 0,
      defaults: DEFAULT_SIMULATION_SETTINGS,
      defaultStartMode: 'current',
      maxBatchSimulations: MAX_BATCH_SIMULATIONS,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err?.message || 'Failed to load simulator config' }, { status: 502 });
  }
}

export async function POST(request) {
  const startedAt = Date.now();

  try {
    const body = await request.json();

    const leagueId = String(body?.leagueId || '').trim();
    if (!leagueId) {
      return NextResponse.json({ ok: false, error: 'leagueId is required' }, { status: 400 });
    }

    const startMode = body?.startMode === 'full' ? 'full' : 'current';
    const settingsResult = await getSeasonSimulatorSettings();
    const persistedSettings = settingsResult?.success ? settingsResult.settings : DEFAULT_SIMULATION_SETTINGS;
    const simulations = normalizeBatchSimulationCount(body?.simulations);
    const rosterTrades = Array.isArray(body?.rosterTrades) ? body.rosterTrades : [];

    const result = await runSeasonSimulation({
      leagueId,
      simulations,
      startMode,
      rngConfig: normalizeRngConfig(persistedSettings),
      rosterTrades,
    });

    console.log('[Season Simulator] batch completed', {
      leagueId,
      simulations,
      startMode,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ...result,
      settingsUsed: persistedSettings,
      maxBatchSimulations: MAX_BATCH_SIMULATIONS,
    });
  } catch (err) {
    console.error('[Season Simulator] batch failed', {
      durationMs: Date.now() - startedAt,
      error: err?.stack || err?.message || String(err),
    });

    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to run season simulation batch' },
      { status: 500 }
    );
  }
}
