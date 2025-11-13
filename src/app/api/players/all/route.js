export async function GET() {
  const res = await fetch('https://api.sleeper.app/v1/players/nfl');
  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch players from Sleeper' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const data = await res.json();

  // Transform the object into an array and pick only the fields you need
  const players = Object.values(data)
    .filter(p => p.player_id && p.full_name && p.position) // Only valid players
    .map(p => ({
      playerId: p.player_id,
      playerName: p.full_name,
      position: p.position,
      team: p.team || null
    }));

  return new Response(JSON.stringify(players), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}