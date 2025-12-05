import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { calculateSeasonMaxPF } from '@/utils/maxpf';
import { buildDraftOrder } from '@/utils/draftOrderUtils';

export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === 'admin';
  if (!isAdmin) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { ok: true, session };
}

async function resolveBBBLeagueId() {
  const USER_ID = '456973480269705216';
  const state = await fetch('https://api.sleeper.app/v1/state/nfl', { cache: 'no-store' }).then(r => r.json());
  const currentSeason = state?.season;
  if (!currentSeason) throw new Error('Could not resolve NFL season');
  const leagues = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${currentSeason}`, { cache: 'no-store' }).then(r => r.json());
  let bbb = leagues.filter(league => {
    const name = (league?.name || '').toLowerCase();
    return name.includes('budget blitz bowl') || name.includes('bbb') || (name.includes('budget') && name.includes('blitz'));
  });
  if (bbb.length === 0) {
    const prev = String(Number(currentSeason) - 1);
    const prevLeagues = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${prev}`, { cache: 'no-store' }).then(r => r.json());
    bbb = prevLeagues.filter(league => {
      const name = (league?.name || '').toLowerCase();
      return name.includes('budget blitz bowl') || name.includes('bbb') || (name.includes('budget') && name.includes('blitz'));
    });
  }
  if (bbb.length === 0) throw new Error('No BBB league found for commissioner');
  const mostRecent = bbb.sort((a, b) => Number(b.season) - Number(a.season))[0];
  return mostRecent.league_id;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  try {
    const leagueId = await resolveBBBLeagueId();
    const [users, rosters, drafts, traded, state] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/drafts`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, { cache: 'no-store' }).then(r => r.json()),
      fetch('https://api.sleeper.app/v1/state/nfl', { cache: 'no-store' }).then(r => r.json()),
    ]);

  // Prefer a true upcoming draft. Do NOT fall back to a completed draft here.
  const upcoming = drafts.find(d => d.status === 'upcoming') || null;
    let order = [];
    const debug = {
      branch: null,
      leagueId,
      upcomingDraftId: upcoming?.draft_id || null,
      upcomingSeason: upcoming?.season || null,
      picksCount: 0,
      usedTradesCount: 0,
      targetSeason: null,
    };

  // Only use picks when the upcoming draft exists and is not completed
  if (upcoming?.draft_id && upcoming?.status !== 'complete') {
      // Try picks for traded ownership, mapping roster -> user display name via rosters/users
      try {
        const picksRes = await fetch(`https://api.sleeper.app/v1/draft/${upcoming.draft_id}/picks`, { cache: 'no-store' });
        if (picksRes.ok) {
          const picksData = await picksRes.json();
          const roundOne = (Array.isArray(picksData) ? picksData : []).filter(p => Number(p.round) === 1);
          if (roundOne.length > 0) {
            debug.branch = 'picks';
            debug.picksCount = roundOne.length;
            // Build roster_id -> owner user_id map and roster_id -> display name
            const rosterIdToUserId = Object.fromEntries((rosters || []).map(r => [r.roster_id, r.owner_id]));
            const userIdToDisplay = Object.fromEntries((users || []).map(u => [u.user_id, u.display_name || u.username || 'Unknown Team']));
            order = roundOne
              .sort((a, b) => Number(a.pick_no ?? a.pick_id ?? a.slot ?? 0) - Number(b.pick_no ?? b.pick_id ?? b.slot ?? 0))
              .map(p => {
                const ownerUserId = p.owner_id ?? rosterIdToUserId[p.roster_id] ?? null;
                const teamName = ownerUserId ? (userIdToDisplay[ownerUserId] || 'Unknown Team') : 'Unknown Team';
                const slot = Number(p.pick_no ?? p.slot ?? 0) || 1;
                return { slot, teamName, ownerUserId, rosterId: p.roster_id, originalOwnerId: p.original_owner_id };
              });
          }
        }
      } catch (_) {}
    }

    // Do NOT use upcoming.draft_order here; instead mirror Draft tab algorithm when picks are unavailable

    // Algorithmic fallback when no upcoming draft or no pick data available
    if (order.length === 0) {
      debug.branch = 'algorithmic';
      // Determine target draft season (the season the upcoming rookie draft will be for)
  const currentSeason = Number(state?.season || new Date().getFullYear());
  // If no upcoming draft or it is already complete, target the next season (e.g., 2026)
  const targetSeason = (!upcoming || upcoming.status === 'complete') ? (currentSeason + 1) : Number(upcoming.season);
      debug.targetSeason = targetSeason;

      // 1) Compute MaxPF map server-side
      const maxpfMap = await calculateSeasonMaxPF({ leagueId });

      // 2) Fetch winners bracket for playoff results
      let winnersBracket = [];
      try {
        winnersBracket = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/winners_bracket`, { cache: 'no-store' }).then(r => r.json());
      } catch (_) { /* ignore */ }

      // 3) Build base draft order (slots -> original roster_id)
      const base = buildDraftOrder({ rosters, maxpfMap, winnersBracket });

      // 4) Apply traded picks for round 1 in targetSeason
      const roundOneTrades = (Array.isArray(traded) ? traded : []).filter(tp => String(tp.season) === String(targetSeason) && Number(tp.round) === 1);
      debug.usedTradesCount = roundOneTrades.length;
      const rosterIdToUserId = Object.fromEntries((rosters || []).map(r => [r.roster_id, r.owner_id]));
      const userIdToDisplay = Object.fromEntries((users || []).map(u => [u.user_id, u.display_name || u.username || 'Unknown Team']));

      order = base
        .sort((a, b) => Number(a.slot) - Number(b.slot))
        .map(entry => {
          const trade = roundOneTrades.find(tp => Number(tp.roster_id) === Number(entry.roster_id));
          const currentRosterId = trade ? trade.owner_id : entry.roster_id;
          const ownerUserId = rosterIdToUserId[currentRosterId] ?? null;
          const teamName = ownerUserId ? (userIdToDisplay[ownerUserId] || 'Unknown Team') : 'Unknown Team';
          return {
            slot: Number(entry.slot),
            teamName,
            ownerUserId,
            rosterId: currentRosterId,
            originalOwnerId: entry.roster_id,
          };
        });
    }

    return NextResponse.json({ ok: true, leagueId, order, debug });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Failed to preview draft order' }, { status: 500 });
  }
}
