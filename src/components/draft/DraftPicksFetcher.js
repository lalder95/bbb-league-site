import React, { useEffect, useState } from "react";

/**
 * Props:
 *   leagueId (string): Sleeper league_id
 *   rosters (array): Array of league rosters (to map roster_id to owner/team)
 *   baseYear (number|string, optional): First draft year to show; if omitted, derived from Sleeper state
 *   render (function): (picksByOwner, loading, error, rosterIdToDisplayName) => ReactNode
 *     - picksByOwner: { [owner_id]: [pick, ...] }
 *     - loading: boolean
 *     - error: string|null
 *     - rosterIdToDisplayName: { [roster_id]: displayName }
 */
export default function DraftPicksFetcher({ leagueId, rosters = [], baseYear, render }) {
  const [picksByOwner, setPicksByOwner] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rosterIdToDisplayName, setRosterIdToDisplayName] = useState({});

  // Helper: get all owners/roster_ids
  function getAllOwners() {
    if (rosters && rosters.length > 0) {
      return rosters.map(r => r.roster_id);
    }
    // fallback: 12 teams, roster_ids 1-12
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }

  useEffect(() => {
    if (!leagueId) return;
    setLoading(true);
    setError(null);
    setPicksByOwner({});
    setRosterIdToDisplayName({});
    async function fetchAndBuild() {
      try {
        // 1. Get traded picks
        const tradedRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`);
        if (!tradedRes.ok) throw new Error("Failed to fetch traded picks");
        const traded = await tradedRes.json();

        // 2. Get league users for display names
        const usersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
        if (!usersRes.ok) throw new Error("Failed to fetch league users");
        const users = await usersRes.json();

        // Build a map of roster_id -> manager display_name (prefer display_name, fallback to username)
        let rosterIdToDisplay = {};
        if (rosters && rosters.length > 0 && users && users.length > 0) {
          rosters.forEach(roster => {
            const user = users.find(u => u.user_id === roster.owner_id);
            let display =
              (user && user.display_name) ||
              (user && user.username) ||
              `Manager ${roster.roster_id}`;
            rosterIdToDisplay[roster.roster_id] = display;
          });
        } else {
          // fallback: just use roster_id
          getAllOwners().forEach(rid => {
            rosterIdToDisplay[rid] = `Manager ${rid}`;
          });
        }
        setRosterIdToDisplayName(rosterIdToDisplay);

        // 3. Determine which draft years to show (3 years)
        // Rule: default leagueYear + 1, unless any non-complete draft exists, then use leagueYear.
        let resolvedBaseYear = Number(baseYear);

        if (!Number.isFinite(resolvedBaseYear) || resolvedBaseYear < 2000) {
          try {
            const [stateRes, draftsRes] = await Promise.all([
              fetch('https://api.sleeper.app/v1/state/nfl'),
              fetch(`https://api.sleeper.app/v1/league/${leagueId}/drafts`),
            ]);

            let leagueYear = null;
            if (stateRes.ok) {
              const stateJson = await stateRes.json();
              const yr = Number(stateJson?.season);
              if (Number.isFinite(yr) && yr > 2000) leagueYear = yr;
            }

            let hasNonCompleteDraft = false;
            if (draftsRes.ok) {
              const draftsJson = await draftsRes.json();
              if (Array.isArray(draftsJson)) {
                hasNonCompleteDraft = draftsJson.some((d) => d?.status && d.status !== 'complete');
              }
            }

            if (Number.isFinite(leagueYear)) {
              resolvedBaseYear = hasNonCompleteDraft ? leagueYear : leagueYear + 1;
            }
          } catch {
            // ignore
          }
        }

        if (!Number.isFinite(resolvedBaseYear) || resolvedBaseYear < 2000) {
          resolvedBaseYear = new Date().getFullYear() + 1;
        }

        const years = [];
        for (let y = 0; y < 3; ++y) years.push(String(resolvedBaseYear + y));
        const rounds = [1, 2, 3, 4, 5, 6, 7];

        // 4. Get all owners/roster_ids
        const owners = getAllOwners();

        // 5. Build initial picks: each owner gets 1 pick per round per year
        let picks = [];
        for (const year of years) {
          for (const round of rounds) {
            for (const roster_id of owners) {
              picks.push({
                season: year,
                round,
                original_owner_id: roster_id,
                owner_id: roster_id, // will be updated if traded
              });
            }
          }
        }

        // 6. Apply trades
        traded.forEach(trade => {
          // Remove pick from previous owner, add to new owner
          // Find the pick with matching season, round, and original_owner_id
          const idx = picks.findIndex(
            p =>
              p.season === trade.season &&
              p.round === trade.round &&
              p.original_owner_id === trade.roster_id
          );
          if (idx !== -1) {
            picks[idx].owner_id = trade.owner_id;
            picks[idx].previous_owner_id = trade.previous_owner_id;
          }
        });

        // 7. Group picks by owner
        const byOwner = {};
        picks.forEach(pick => {
          if (!byOwner[pick.owner_id]) byOwner[pick.owner_id] = [];
          byOwner[pick.owner_id].push(pick);
        });

        setPicksByOwner(byOwner);
      } catch (err) {
        setError(err.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchAndBuild();
    // eslint-disable-next-line
  }, [leagueId, JSON.stringify(rosters), baseYear]);

  return render(picksByOwner, loading, error, rosterIdToDisplayName);
}