import { NextResponse } from 'next/server';
import { calculateDraftOrderForLeague } from '@/utils/draftOrderCalculator';

export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get('leagueId');
  if (!leagueId) {
    return NextResponse.json({ error: 'Missing required query param: leagueId' }, { status: 400 });
  }

  try {
    const result = await calculateDraftOrderForLeague({ leagueId });

    return NextResponse.json(
      {
        leagueId: result.leagueId,
        targetSeason: result.targetSeason,
        usedTradesCount: result.usedTradesCount,
        computedAt: new Date().toISOString(),
        notes: 'Non-playoff (1-6) sorted by MaxPF asc; ties: win% asc, fpts asc, coin flip. Playoff (7-12) reverse winners bracket finish. Consolation ignored.',
        draft_order: result.draft_order,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
