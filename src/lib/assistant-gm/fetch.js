const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TRANSIENT_RETRIES = 1;
const RETRY_DELAY_MS = 150;

function createDeadlineError(url) {
  return Object.assign(new Error(`Request deadline exceeded: ${url}`), {
    name: 'TimeoutError',
    code: 'REQUEST_DEADLINE_EXCEEDED',
  });
}

function isTransientStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

async function fetchResponse(url, { timeoutMs = DEFAULT_TIMEOUT_MS, cache = 'no-store', deadlineAt } = {}) {
  let attempt = 0;
  while (true) {
    const remainingMs = deadlineAt == null ? timeoutMs : deadlineAt - Date.now();
    if (remainingMs <= 0) throw createDeadlineError(url);
    const attemptTimeoutMs = Math.max(1, Math.min(timeoutMs, remainingMs));
    const response = await fetch(url, { cache, signal: AbortSignal.timeout(attemptTimeoutMs) });
    if (response.ok || !isTransientStatus(response.status) || attempt >= MAX_TRANSIENT_RETRIES) return response;
    if (deadlineAt != null && deadlineAt - Date.now() <= RETRY_DELAY_MS + 100) return response;

    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
}

export async function fetchJson(url, options) {
  const response = await fetchResponse(url, options);
  if (!response.ok) throw new Error(`Failed request ${response.status}: ${url}`);
  return response.json();
}

export async function fetchText(url, options) {
  const response = await fetchResponse(url, options);
  if (!response.ok) throw new Error(`Failed request ${response.status}: ${url}`);
  return response.text();
}
