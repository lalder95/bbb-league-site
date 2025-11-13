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

    // Cache policy: past seasons monthly, current or future hourly
    const nowYear = new Date().getFullYear();
    const revalidateSeconds = Number(season) < nowYear ? 30 * 24 * 60 * 60 : 60 * 60; // 30d or 1h
    const cacheHeaders = {
      'Content-Type': 'application/json',
      'Cache-Control': `public, s-maxage=${revalidateSeconds}, stale-while-revalidate=${revalidateSeconds}`
    };

    // Sleeper user id that owns BBB leagues (same as used in history page)
    const USER_ID = '456973480269705216';

    // Find BBB leagues for this season
  const leaguesRes = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${season}`, { next: { revalidate: revalidateSeconds } });
    if (!leaguesRes.ok) throw new Error('Failed to fetch leagues for season');
    const leagues = await leaguesRes.json();
    const bbbLeagues = leagues.filter(league => {
      const name = (league.name || '').toLowerCase();
      return name.includes('budget blitz bowl') || name.includes('bbb') || (name.includes('budget') && name.includes('blitz'));
    });
    if (bbbLeagues.length === 0) {
      return new Response(JSON.stringify({ season, trades: [] }), { status: 200 });
    }

    // Cache of rookie draft info by season (across any BBB league for that season)
  const draftInfoCache = new Map(); // key: `${baseLeagueId}|${season}` -> { league_id, rosterToSlot: Map<roster_id, slot>, picksLookup: Map<'slot|round', pick> }

    // Helper: fetch rookie (linear) draft info for a given season, cache by season
    // Helper: fetch a league meta record
    async function getLeagueMeta(leagueId) {
      const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`, { next: { revalidate: revalidateSeconds } });
      if (!res.ok) return null;
      return res.json();
    }

    // Resolve the specific league in this league's lineage that corresponds to a target season
    async function resolveLeagueForSeason(baseLeagueId, seasonStr) {
      const target = Number(seasonStr);
      let currentId = baseLeagueId;
      const visited = new Set();
      for (let i = 0; i < 10; i++) { // safety bound
        if (!currentId || visited.has(currentId)) break;
        visited.add(currentId);
        const meta = await getLeagueMeta(currentId);
        if (!meta) break;
        const curSeason = Number(meta.season);
        if (curSeason === target) return meta.league_id || currentId;
        if (curSeason < target && meta.next_league_id) { currentId = meta.next_league_id; continue; }
        if (curSeason > target && meta.previous_league_id) { currentId = meta.previous_league_id; continue; }
        break;
      }
      // Fallback: scan user's leagues for the target season and select the one whose previous chain links back to baseLeagueId
      try {
        const leaguesRes2 = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${seasonStr}`);
        if (leaguesRes2.ok) {
          const leagues2 = await leaguesRes2.json();
          const bbbCandidates = (Array.isArray(leagues2) ? leagues2 : []).filter(l => {
            const name = (l.name || '').toLowerCase();
            return name.includes('budget blitz bowl') || name.includes('bbb') || (name.includes('budget') && name.includes('blitz'));
          });
          // Try to find a candidate whose previous_league_id chain reaches baseLeagueId
          for (const cand of bbbCandidates) {
            let cid = cand.league_id;
            const seen = new Set();
            for (let j = 0; j < 10; j++) {
              if (!cid || seen.has(cid)) break;
              seen.add(cid);
              const m = await getLeagueMeta(cid);
              if (!m) break;
              if (m.league_id === baseLeagueId) return cand.league_id;
              if (!m.previous_league_id) break;
              cid = m.previous_league_id;
            }
          }
          // As a last resort, pick a candidate with same total_rosters as the base league
          const baseMeta = await getLeagueMeta(baseLeagueId);
          const baseRosters = Number(baseMeta?.total_rosters) || 0;
          const approx = bbbCandidates.find(l => Number(l.total_rosters) === baseRosters);
          if (approx) return approx.league_id;
        }
      } catch {}
      return baseLeagueId; // ultimate fallback
    }

    async function ensureRookieDraftInfoForSeasonAndLeague(seasonStr, baseLeagueId) {
      const key = `${baseLeagueId}|${seasonStr}`;
      if (draftInfoCache.has(key)) return draftInfoCache.get(key);

      const leagueIdForSeason = await resolveLeagueForSeason(baseLeagueId, seasonStr);

      // Fetch rosters and drafts in that resolved league+season
      const [rostersRes2, draftsRes2] = await Promise.all([
        fetch(`https://api.sleeper.app/v1/league/${leagueIdForSeason}/rosters`, { next: { revalidate: revalidateSeconds } }),
        fetch(`https://api.sleeper.app/v1/league/${leagueIdForSeason}/drafts`, { next: { revalidate: revalidateSeconds } })
      ]);
      if (!rostersRes2.ok || !draftsRes2.ok) { draftInfoCache.set(key, null); return null; }
  const [rosters2, drafts2] = await Promise.all([rostersRes2.json(), draftsRes2.json()]);
      const rosterOwnerMap2 = new Map(rosters2.map(r => [r.roster_id, r.owner_id]));
  // IMPORTANT: Only consider the linear draft for the requested season
  const linearDraft = (Array.isArray(drafts2) ? drafts2 : []).find(d => d.type === 'linear' && String(d.season) === String(seasonStr));
      if (!linearDraft) { draftInfoCache.set(key, null); return null; }

      // Prefer fetching the full draft object to reliably get draft_order
      let draftOrder = {};
      try {
  const draftObjRes = await fetch(`https://api.sleeper.app/v1/draft/${linearDraft.draft_id}`, { next: { revalidate: revalidateSeconds } });
        if (draftObjRes.ok) {
          const draftObj = await draftObjRes.json();
          draftOrder = draftObj?.draft_order || {};
        } else {
          draftOrder = linearDraft.draft_order || {};
        }
      } catch {
        draftOrder = linearDraft.draft_order || {};
      }

      // Fetch all picks for this draft, build lookup by slot|round
      let picksLookup = new Map();
      let dpicks2 = [];
      try {
  const picksRes2 = await fetch(`https://api.sleeper.app/v1/draft/${linearDraft.draft_id}/picks`, { next: { revalidate: revalidateSeconds } });
        if (picksRes2.ok) {
          dpicks2 = await picksRes2.json();
          picksLookup = new Map(
            dpicks2.map(p => [
              `${Number(p.draft_slot)}|${Number(p.round)}`,
              p
            ])
          );
        }
      } catch {}

      // Build roster -> slot map primarily from draft_order (user_id -> slot)
      const rosterToSlot = new Map();
      for (const [rid, ownerUserId] of rosterOwnerMap2.entries()) {
        const slot = draftOrder[ownerUserId];
        if (slot) rosterToSlot.set(Number(rid), Number(slot));
      }

      // Fallback: derive slot by choosing the most frequent draft_slot across rounds for that roster_id
      if (rosterToSlot.size < rosterOwnerMap2.size && Array.isArray(dpicks2) && dpicks2.length) {
        const freq = new Map(); // rid -> Map<slot, count>
        for (const p of dpicks2) {
          const rid = Number(p.roster_id);
          const slot = Number(p.draft_slot);
          if (!rid || !slot) continue;
          if (!freq.has(rid)) freq.set(rid, new Map());
          const m = freq.get(rid);
          m.set(slot, (m.get(slot) || 0) + 1);
        }
        for (const [rid, counts] of freq.entries()) {
          if (rosterToSlot.has(rid)) continue;
          let bestSlot = null, bestCount = -1;
          for (const [slot, count] of counts.entries()) {
            if (count > bestCount) { bestSlot = slot; bestCount = count; }
          }
          if (bestSlot) rosterToSlot.set(rid, Number(bestSlot));
        }
      }

      const info = { league_id: leagueIdForSeason, draft_id: linearDraft.draft_id, draft_order: draftOrder, rosterToSlot, picksLookup };
      draftInfoCache.set(key, info);
      return info;
    }

    // Aggregate trades from all BBB leagues of the season
    const allTrades = [];

    for (const league of bbbLeagues) {
      // Fetch users & rosters for name mapping
      const [usersRes, rostersRes] = await Promise.all([
        fetch(`https://api.sleeper.app/v1/league/${league.league_id}/users`, { next: { revalidate: revalidateSeconds } }),
        fetch(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`, { next: { revalidate: revalidateSeconds } })
      ]);
      if (!usersRes.ok || !rostersRes.ok) continue;
      const users = await usersRes.json();
      const rosters = await rostersRes.json();
      const userMap = new Map(users.map(u => [u.user_id, u]));
      const rosterOwnerMap = new Map(rosters.map(r => [r.roster_id, r.owner_id]));

      // Rookie draft enrichment (to show the actual drafted player on traded picks)
      // Fetch all drafts for this league and build a lookup for linear drafts by season
      const draftInfoBySeason = new Map();
      try {
  const draftsRes = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/drafts`, { next: { revalidate: revalidateSeconds } });
        if (draftsRes.ok) {
          const drafts = await draftsRes.json();
          const linearDrafts = Array.isArray(drafts) ? drafts.filter(d => d.type === 'linear') : [];
          for (const d of linearDrafts) {
            // Build a lookup of picks for this draft keyed by (season|slot|round)
            let picksLookup = new Map();
            try {
              const picksRes = await fetch(`https://api.sleeper.app/v1/draft/${d.draft_id}/picks`, { next: { revalidate: revalidateSeconds } });
              if (picksRes.ok) {
                const dpicks = await picksRes.json();
                picksLookup = new Map(
                  dpicks.map(p => [
                    `${String(d.season)}|${Number(p.draft_slot)}|${Number(p.round)}`,
                    p
                  ])
                );
              }
            } catch {}

            // Map roster_id -> draft_slot using this draft's draft_order and the league's roster->owner mapping
            const rosterToSlot = new Map();
            const dorder = d.draft_order || {};
            for (const [rid, ownerUserId] of rosterOwnerMap.entries()) {
              const slot = dorder[ownerUserId];
              if (slot) rosterToSlot.set(Number(rid), Number(slot));
            }

            draftInfoBySeason.set(String(d.season), {
              draft_id: d.draft_id,
              draft_order: dorder,
              rosterToSlot,
              picksLookup
            });
          }
        }
      } catch {}

  // Iterate weeks 1-18; stop early after 2 consecutive empty weeks (post-season end)
      let consecutiveEmpty = 0;
      for (let week = 1; week <= 18; week++) {
  const txRes = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/transactions/${week}`, { next: { revalidate: revalidateSeconds } });
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

          // Ensure rookie draft info for any seasons referenced by these picks (supports cross-year picks)
          const pickSeasons = new Set(picks.map(p => String(p.season)));
          for (const ps of pickSeasons) {
            // Swallow errors; enrichment is best-effort
            try { await ensureRookieDraftInfoForSeasonAndLeague(ps, league.league_id); } catch {}
          }

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

            // Attempt to enrich with drafted player (only if that season's rookie draft exists)
            let drafted = null;
            let matchDebug = {
              season: String(p.season),
              base_league_id: league.league_id,
              resolved_league_id: null,
              slot_roster_id: slotRosterId ?? null,
              computed_slot: null,
              round: Number(p.round),
              lookup_key: null,
              found: false,
              reason: null,
            };
            const di = draftInfoCache.get(`${league.league_id}|${String(p.season)}`);
            if (di) {
              matchDebug.resolved_league_id = di.league_id;
              const slotNum = di.rosterToSlot.get(Number(slotRosterId));
              matchDebug.computed_slot = slotNum || null;
              if (slotNum) {
                const key = `${Number(slotNum)}|${Number(p.round)}`;
                matchDebug.lookup_key = key;
                const result = di.picksLookup.get(key);
                if (result && result.player_id) {
                  const md = result.metadata || {};
                  const first = md.first_name || '';
                  const last = md.last_name || '';
                  drafted = {
                    player_id: String(result.player_id),
                    name: `${first}${first && last ? ' ' : ''}${last}` || String(result.player_id),
                    position: md.position || '',
                    team: md.team || ''
                  };
                  matchDebug.found = true;
                } else {
                  matchDebug.reason = 'no_pick_result_for_slot_round';
                }
              } else {
                matchDebug.reason = 'slot_not_mapped_via_draft_order_or_fallback';
              }
            } else {
              matchDebug.lookup_key = null;
              matchDebug.reason = 'no_draft_info_for_season_league';
            }

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
              slot_owner_name: slotOwner?.display_name || slotOwnerUserId || 'Unknown',
              drafted_player: drafted,
              match_debug: matchDebug
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

    return new Response(JSON.stringify({ season, trades: allTrades }), { status: 200, headers: cacheHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

function ownerMapLookup(ownerId, userMap) {
  if (!ownerId) return null;
  return userMap.get(ownerId) || null;
}