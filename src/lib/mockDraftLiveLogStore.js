// Simple in-memory log store for live debugging in the Admin UI.
// NOTE: On Vercel/serverless, this is per-instance and not durable.
// It's useful for local debugging and for seeing logs while the same instance handles requests.

const store = globalThis.__bbbMockDraftLiveLogStore || new Map();
globalThis.__bbbMockDraftLiveLogStore = store;

export function appendLiveLog(jobId, entry) {
  if (!jobId) return;
  const now = new Date();
  const e = {
    at: entry?.at ? new Date(entry.at) : now,
    type: entry?.type || 'info',
    message: entry?.message || '',
    pickNumber: entry?.pickNumber || null,
  };
  const existing = store.get(jobId) || [];
  existing.push(e);
  // keep last 300
  if (existing.length > 300) existing.splice(0, existing.length - 300);
  store.set(jobId, existing);
}

export function getLiveLogs(jobId, { since } = {}) {
  const existing = store.get(jobId) || [];
  if (!since) return existing;
  const sinceDate = new Date(since);
  return existing.filter(l => new Date(l.at) > sinceDate);
}

export function clearLiveLogs(jobId) {
  store.delete(jobId);
}
