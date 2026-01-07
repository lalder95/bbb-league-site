'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * Client hook that fetches the computed draft order for a league.
 * Backed by the server-side calculator used by /api/debug/draft-order.
 *
 * @param {Object} params
 * @param {string|null|undefined} params.leagueId
 * @param {boolean} [params.enabled=true]
 */
export function useDraftOrder({ leagueId, enabled = true } = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const url = useMemo(() => {
    if (!leagueId) return null;
    const sp = new URLSearchParams({ leagueId: String(leagueId) });
    return `/api/debug/draft-order?${sp.toString()}`;
  }, [leagueId]);

  useEffect(() => {
    if (!enabled || !url) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || `Failed to fetch draft order (${res.status})`);
        }
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to fetch draft order');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, url]);

  return { loading, error, data };
}

export default useDraftOrder;
