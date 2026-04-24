import { generateAuctionReaction } from '@/lib/free-agent-auction-reactions';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { username, playerName, salary, years } = await req.json();
    if (!username || !playerName || !salary || !years) {
      return Response.json({ error: 'Missing required fields (username, playerName, salary, years).' }, { status: 400 });
    }
    const reactions = await generateAuctionReaction({
      eventType: 'bid',
      seed: `${username}|${playerName}|${salary}|${years}`,
      teamName: username,
      playerName,
      salary: Number(salary),
      years: Number(years),
      contractPoints: null,
    });

    return Response.json({ reactions }, { status: 200 });
  } catch (e) {
    return Response.json({ reactions: [], error: e.message }, { status: 500 });
  }
}
