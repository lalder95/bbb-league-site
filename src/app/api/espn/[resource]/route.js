import { NextResponse } from 'next/server';
import { espnFetch } from '../utils/espnClient';

// Whitelist supported ESPN resources and their allowed query params + default TTL
const RESOURCES = {
  scoreboard: { path: '/scoreboard', params: ['dates', 'week', 'year', 'seasontype'], ttl: 15 },
  summary: { path: '/summary', params: ['event'], ttl: 20 },
  playbyplay: { path: '/playbyplay', params: ['event'], ttl: 8 },
};

function normalizeResource(name) {
  const key = String(name || '').toLowerCase();
  if (key === 'pbp' || key === 'play-by-play' || key === 'play_by_play') return 'playbyplay';
  return key;
}

function pickParams(searchParams, allowed) {
  const out = {};
  for (const k of allowed) {
    const v = searchParams.get(k);
    if (v !== null && v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

export async function GET(req, context) {
  try {
    const params = await context.params;
    const resourceRaw = params?.resource;
    const resource = normalizeResource(resourceRaw);

    const meta = RESOURCES[resource];
    if (!meta) {
      return NextResponse.json(
        {
          ok: false,
          error: `Unsupported resource "${resourceRaw}". Use one of: ${Object.keys(RESOURCES).join(', ')}`,
        },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const sp = url.searchParams;

    // Support eventId alias for summary/playbyplay
    if (!sp.get('event') && sp.get('eventId')) {
      sp.set('event', sp.get('eventId'));
    }

    const paramsOut = pickParams(sp, meta.params);

    // Determine caching behavior
    const noStore = sp.get('nocache') === '1' || sp.get('noStore') === '1';
    const ttlParam = sp.get('ttl');
    const ttl = ttlParam ? Math.max(0, Number(ttlParam) || meta.ttl) : meta.ttl;

    const data = await espnFetch(meta.path, {
      params: paramsOut,
      revalidate: ttl,
      noStore,
    });

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message || 'Unknown error' }, { status: 502 });
  }
}