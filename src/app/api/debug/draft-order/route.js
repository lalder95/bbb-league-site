import { NextResponse } from 'next/server';
import calculateSeasonMaxPF from '@/utils/maxpf';
import { buildDraftOrder } from '@/utils/draftOrderUtils';

export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get('leagueId');
  if (!leagueId) {
    return NextResponse.json({ error: 'Missing required query param: leagueId' }, { status: 400 });
  }

  try {
    // Fetch users and rosters for team name mapping
    const [usersRes, rostersRes, winnersRes] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`, { cache: 'no-store' }),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { cache: 'no-store' }),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/winners_bracket`, { cache: 'no-store' }),
    ]);

    if (!usersRes.ok) throw new Error('Failed to fetch users');
    if (!rostersRes.ok) throw new Error('Failed to fetch rosters');

    const [users, rosters, winnersBracket] = await Promise.all([
      usersRes.json(),
      rostersRes.json(),
      winnersRes.ok ? winnersRes.json() : Promise.resolve([]),
    ]);

    // Compute MaxPF map
    const maxpfMap = await calculateSeasonMaxPF({ leagueId });

    // Build order
    const order = buildDraftOrder({ rosters, maxpfMap, winnersBracket });

    // Map to enriched objects
    const enriched = order
      .map((entry) => {
        const roster = rosters.find((r) => r.roster_id === entry.roster_id);
        const ownerId = roster?.owner_id;
        const owner = users.find((u) => u.user_id === ownerId);
        const teamName = owner?.display_name || 'Unknown Team';
        const avatarId = owner?.avatar;
        const avatarUrl = avatarId ? `https://sleepercdn.com/avatars/thumbs/${avatarId}` : null;
        const stats = roster
          ? {
              wins: roster.wins || 0,
              losses: roster.losses || 0,
              ties: roster.ties || 0,
              fpts: roster.fpts || 0,
              maxpf: Number(maxpfMap[entry.roster_id] || 0),
            }
          : {};
        return { ...entry, owner_id: ownerId, teamName, avatarUrl, ...stats };
      })
      .sort((a, b) => a.slot - b.slot);

    return NextResponse.json(
      {
        leagueId,
        computedAt: new Date().toISOString(),
        notes: 'Non-playoff (1-6) sorted by MaxPF asc; ties: win% asc, fpts asc, coin flip. Playoff (7-12) reverse winners bracket finish. Consolation ignored.',
        draft_order: enriched,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
