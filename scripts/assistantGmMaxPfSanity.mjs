import { calculateSeasonMaxPF } from '../src/utils/maxpf.js';
import { fetchJson } from '../src/lib/assistant-gm/fetch.js';
import { createRequestSnapshotProvider } from '../src/lib/assistant-gm/request-snapshot.js';

let activeRequests = 0;
let peakRequests = 0;
let metadataRequests = 0;
let transientRetryRequests = 0;
let timeoutRequests = 0;
let deadlineRetryRequests = 0;
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url) => {
  if (String(url).endsWith('/retry-fixture')) {
    transientRetryRequests += 1;
    return transientRetryRequests === 1
      ? { ok: false, status: 503, json: async () => ({}) }
      : { ok: true, json: async () => ({ value: 42 }) };
  }
  if (String(url).endsWith('/timeout-fixture')) {
    timeoutRequests += 1;
    throw Object.assign(new Error('fixture timeout'), { name: 'TimeoutError' });
  }
  if (String(url).endsWith('/deadline-fixture')) {
    deadlineRetryRequests += 1;
    return { ok: false, status: 503, json: async () => ({}) };
  }
  if (String(url).endsWith('/players/nfl')) {
    metadataRequests += 1;
    return {
      ok: true,
      json: async () => ({ rb: { position: 'RB' }, wr: { position: 'WR' } }),
    };
  }

  const week = Number(String(url).match(/matchups\/(\d+)/)?.[1]);
  if (!week) throw new Error(`Unexpected fetch: ${url}`);

  activeRequests += 1;
  peakRequests = Math.max(peakRequests, activeRequests);
  await new Promise((resolve) => setTimeout(resolve, 10));
  activeRequests -= 1;

  if (week === 3) return { ok: false, status: 503, json: async () => [] };
  return {
    ok: true,
    json: async () => [{ roster_id: 1, players_points: { rb: 10, wr: 20 } }],
  };
};

try {
  const maxPf = await calculateSeasonMaxPF({
    leagueId: 'fixture-league',
    league: { roster_positions: ['RB', 'WR'], settings: { playoff_week_start: 5 } },
    state: { season_type: 'regular', week: 4 },
    playersMeta: { rb: { position: 'RB' }, wr: { position: 'WR' } },
    matchupConcurrency: 4,
  });

  if (maxPf[1] !== 90) {
    throw new Error(`Expected failed week to be skipped with MaxPF 90; received ${maxPf[1]}`);
  }
  if (peakRequests < 2 || peakRequests > 4) {
    throw new Error(`Expected bounded concurrent requests (2..4); peak was ${peakRequests}`);
  }

  const cachedMetadataInput = {
    leagueId: 'fixture-league',
    league: { roster_positions: ['RB', 'WR'], settings: { playoff_week_start: 2 } },
    state: { season_type: 'regular', week: 1 },
    matchupConcurrency: 4,
  };
  const firstCachedRun = await calculateSeasonMaxPF(cachedMetadataInput);
  const secondCachedRun = await calculateSeasonMaxPF(cachedMetadataInput);
  if (firstCachedRun[1] !== 30 || secondCachedRun[1] !== 30 || metadataRequests !== 1) {
    throw new Error(`Expected metadata cache reuse with score 30; requests=${metadataRequests}, results=${firstCachedRun[1]}/${secondCachedRun[1]}`);
  }

  const retriedJson = await fetchJson('https://fixture.test/retry-fixture', { timeoutMs: 100 });
  if (retriedJson.value !== 42 || transientRetryRequests !== 2) {
    throw new Error(`Expected exactly one retry after 503; requests=${transientRetryRequests}`);
  }

  try {
    await fetchJson('https://fixture.test/timeout-fixture', { timeoutMs: 100 });
    throw new Error('Expected timeout fetch to reject.');
  } catch (error) {
    if (error.message === 'Expected timeout fetch to reject.' || timeoutRequests !== 1) throw error;
  }

  try {
    await fetchJson('https://fixture.test/deadline-fixture', { timeoutMs: 100, deadlineAt: Date.now() + 50 });
    throw new Error('Expected transient response to fail when there is not enough time to retry.');
  } catch (error) {
    if (error.message === 'Expected transient response to fail when there is not enough time to retry.' || deadlineRetryRequests !== 1) throw error;
  }

  try {
    await fetchJson('https://fixture.test/expired-deadline', { deadlineAt: Date.now() - 1 });
    throw new Error('Expected an expired request deadline to fail immediately.');
  } catch (error) {
    if (error.message === 'Expected an expired request deadline to fail immediately.' || error.code !== 'REQUEST_DEADLINE_EXCEEDED') throw error;
  }

  let snapshotLoads = 0;
  const makeSnapshotProvider = () => createRequestSnapshotProvider(async () => {
    snapshotLoads += 1;
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { load: snapshotLoads };
  });
  const firstRequestSnapshot = makeSnapshotProvider();
  const [snapshotA, snapshotB] = await Promise.all([firstRequestSnapshot(), firstRequestSnapshot()]);
  if (snapshotLoads !== 1 || snapshotA !== snapshotB) {
    throw new Error('Expected concurrent calls within one request to share a snapshot.');
  }
  const secondRequestSnapshot = makeSnapshotProvider();
  await secondRequestSnapshot();
  if (snapshotLoads !== 2) throw new Error('Expected a new request to load a fresh snapshot.');

  let rejectedSnapshotLoads = 0;
  const failingSnapshot = createRequestSnapshotProvider(async () => {
    rejectedSnapshotLoads += 1;
    throw new Error('snapshot fixture failure');
  });
  const failedCalls = await Promise.allSettled([failingSnapshot(), failingSnapshot()]);
  if (rejectedSnapshotLoads !== 1 || failedCalls.some((result) => result.status !== 'rejected')) {
    throw new Error('Expected a rejected snapshot load to remain single-flight within its request.');
  }

  console.log(`PASS: MaxPF parity and metadata cache; failed-week fallback; concurrency ${peakRequests}/4; one transient retry, no timeout retry, deadline-aware suppression; snapshot single-flight, rejection memoization, and request freshness.`);
} finally {
  globalThis.fetch = originalFetch;
}
