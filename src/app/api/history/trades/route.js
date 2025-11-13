// API Route: /api/history/trades
// Returns trade history for a given BBB league season (aggregated across all BBB leagues that match naming convention)
// Query params:
//   season=YYYY (required)
// Optional future params: team=<user_id>
// This performs multiple Sleeper API calls (users, rosters, weekly transactions) and filters for type==='trade'.
// To avoid huge payloads, we only iterate weeks until an empty transactions response is observed twice consecutively.
// NOTE: Sleeper transaction endpoint requires a week number; trades can occur in any week including playoffs.

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season');
    if (!season) return new Response(JSON.stringify({ error: 'season query param required' }), { status: 400 });

    // Sleeper user id that owns BBB leagues (same as used in history page)
    const USER_ID = '456973480269705216';

    // Find BBB leagues for this season
    const leaguesRes = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${season}`);
    if (!leaguesRes.ok) throw new Error('Failed to fetch leagues for season');
    const leagues = await leaguesRes.json();
    const bbbLeagues = leagues.filter(league => {
      const name = (league.name || '').toLowerCase();
      return name.includes('budget blitz bowl') || name.includes('bbb') || (name.includes('budget') && name.includes('blitz'));
    });
    if (bbbLeagues.length === 0) {
      return new Response(JSON.stringify({ season, trades: [] }), { status: 200 });
    }

    // Aggregate trades from all BBB leagues of the season
    const allTrades = [];

    for (const league of bbbLeagues) {
      // Fetch users & rosters for name mapping
      const [usersRes, rostersRes] = await Promise.all([
        fetch(`https://api.sleeper.app/v1/league/${league.league_id}/users`),
        fetch(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`)
      ]);
      if (!usersRes.ok || !rostersRes.ok) continue;
      const users = await usersRes.json();
      const rosters = await rostersRes.json();
      const userMap = new Map(users.map(u => [u.user_id, u]));
      const rosterOwnerMap = new Map(rosters.map(r => [r.roster_id, r.owner_id]));

      // Iterate weeks 1-18; stop early after 2 consecutive empty weeks (post-season end)
      let consecutiveEmpty = 0;
      for (let week = 1; week <= 18; week++) {
        const txRes = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/transactions/${week}`);
        if (!txRes.ok) continue;
        const transactions = await txRes.json();
        const tradeTx = transactions.filter(t => t.type === 'trade');
        if (tradeTx.length === 0) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 2) break; // assume no more trades
          continue;
        } else {
          consecutiveEmpty = 0;
        }

        for (const trade of tradeTx) {
          // Each trade contains roster_ids, adds, drops, draft_picks
          const baseRosterIds = Array.isArray(trade.roster_ids) ? trade.roster_ids : [];
          const adds = trade.adds || {}; // { player_id: roster_id }
          const drops = trade.drops || {}; // { player_id: roster_id }
          const picks = Array.isArray(trade.draft_picks) ? trade.draft_picks : [];

          // Collect ALL roster ids involved: original roster_ids + adds targets + drops sources + pick new owners + pick previous owners
          const rosterSet = new Set(baseRosterIds.map(r => Number(r)));
          Object.values(adds).forEach(rid => rosterSet.add(Number(rid)));
          Object.values(drops).forEach(rid => rosterSet.add(Number(rid)));
          picks.forEach(p => {
            // Sleeper draft_picks schema:
            //  - p.roster_id: the original draft slot's roster (whose pick it is)
            //  - p.owner_id: roster id that will own the pick after this trade (to)
            //  - p.previous_owner_id: roster id that owned the pick before this trade (from)
            if (p.owner_id !== undefined && p.owner_id !== null) rosterSet.add(Number(p.owner_id));
            if (p.previous_owner_id !== undefined && p.previous_owner_id !== null) rosterSet.add(Number(p.previous_owner_id));
            // Do NOT add p.roster_id here: the slot owner may be a third party not involved in the trade.
          });

          // Build player movement array (each player should have exactly one to and one from side in trade)
          const playerMoves = Object.keys({ ...adds, ...drops }).map(pid => ({
            player_id: pid,
            to_roster_id: adds[pid] ? Number(adds[pid]) : null,
            from_roster_id: drops[pid] ? Number(drops[pid]) : null,
          }));

          // Build team list including any roster referenced only by picks
          const tradeTeams = Array.from(rosterSet).map(rid => {
            const ownerId = rosterOwnerMap.get(rid);
            const owner = ownerMapLookup(ownerId, userMap);
            return {
              roster_id: rid,
              owner_id: ownerId || null,
              owner_name: owner?.display_name || ownerId || 'Unknown'
            };
          });

          // Normalize pick direction using Sleeper semantics
          const formattedPicks = picks.map(p => {
            const toRosterId = p.owner_id; // new owner roster id
            const fromRosterId = p.previous_owner_id; // previous owner roster id
            const slotRosterId = p.roster_id; // the draft slot's original team

            const toOwnerUserId = rosterOwnerMap.get(toRosterId);
            const fromOwnerUserId = rosterOwnerMap.get(fromRosterId);
            const slotOwnerUserId = rosterOwnerMap.get(slotRosterId);

            const toOwner = ownerMapLookup(toOwnerUserId, userMap);
            const fromOwner = ownerMapLookup(fromOwnerUserId, userMap);
            const slotOwner = ownerMapLookup(slotOwnerUserId, userMap);

            return {
              season: p.season,
              round: p.round,
              // For backward-compatibility, keep 'roster_id' as the NEW owner roster id ("to")
              roster_id: toRosterId,
              owner_id: toOwnerUserId || null,
              owner_name: toOwner?.display_name || toOwnerUserId || 'Unknown',
              // Keep 'previous_owner_id' as the FROM roster id
              previous_owner_id: fromRosterId || null,
              previous_owner_name: fromOwner?.display_name || fromOwnerUserId || fromRosterId || 'Unknown',
              // Provide explicit fields for clarity
              to_roster_id: toRosterId,
              to_owner_id: toOwnerUserId || null,
              to_owner_name: toOwner?.display_name || toOwnerUserId || 'Unknown',
              from_roster_id: fromRosterId || null,
              from_owner_id: fromOwnerUserId || null,
              from_owner_name: fromOwner?.display_name || fromOwnerUserId || 'Unknown',
              slot_roster_id: slotRosterId || null,
              slot_owner_id: slotOwnerUserId || null,
              slot_owner_name: slotOwner?.display_name || slotOwnerUserId || 'Unknown'
            };
          });

          allTrades.push({
            trade_id: trade.transaction_id,
            league_id: league.league_id,
            season: league.season,
            week,
            status: trade.status,
            teams: tradeTeams,
            players: playerMoves,
            picks: formattedPicks,
            created: trade.created || null,
            waiver_budget: trade.waiver_budget || null,
            raw: trade // include full raw Sleeper transaction for debugging
          });
        }
      }
    }

    // Sort oldest -> newest chronologically
    allTrades.sort((a, b) => {
      if (a.season !== b.season) return a.season - b.season;
      if (a.week !== b.week) return a.week - b.week;
      return (a.created || 0) - (b.created || 0);
    });

    return new Response(JSON.stringify({ season, trades: allTrades }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

function ownerMapLookup(ownerId, userMap) {
  if (!ownerId) return null;
  return userMap.get(ownerId) || null;
}