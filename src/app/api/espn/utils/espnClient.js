const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

function buildUrl(path, params = {}) {
  const url = new URL(`${ESPN_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  return url.toString();
}

/**
 * Fetch from ESPN Site API with optional Next.js cache hints.
 * @param {string} path - e.g. '/scoreboard', '/summary'
 * @param {{ params?: Record<string,string|number|boolean>, revalidate?: number, noStore?: boolean, signal?: AbortSignal }} opts
 */
export async function espnFetch(path, { params = {}, revalidate = 15, noStore = false, signal } = {}) {
  const url = buildUrl(path, params);

  const fetchOpts = {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'bbb-league-site/1.0 (+https://bbb)'
    },
    signal
  };

  // Next.js caching controls
  if (noStore) {
    fetchOpts.cache = 'no-store';
  } else if (revalidate !== undefined && revalidate !== null) {
    fetchOpts.next = { revalidate: Math.max(0, Number(revalidate) || 0) };
  }

  const res = await fetch(url, fetchOpts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ESPN fetch failed ${res.status} ${res.statusText} :: ${text || url}`);
  }
  return res.json();
}