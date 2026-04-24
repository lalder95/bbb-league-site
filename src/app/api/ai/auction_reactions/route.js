import { generateAuctionReaction } from '@/lib/free-agent-auction-reactions';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const { eventType, ...params } = body || {};

    if (!eventType || !['winner', 'blind-reveal'].includes(String(eventType))) {
      return Response.json({ error: 'Invalid eventType.' }, { status: 400 });
    }

    if (!params.playerName) {
      return Response.json({ error: 'playerName is required.' }, { status: 400 });
    }

    const reactions = await generateAuctionReaction({
      ...params,
      eventType: String(eventType),
      seed: params.seed || `${eventType}|${params.playerName}`,
    });

    return Response.json({ reactions }, { status: 200 });
  } catch (error) {
    return Response.json({ reactions: [], error: error.message }, { status: 500 });
  }
}