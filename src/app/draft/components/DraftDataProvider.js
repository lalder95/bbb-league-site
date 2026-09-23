'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getTeamName } from '@/utils/draftUtils';

const DraftDataContext = createContext(null);

export function useDraftData() {
  const ctx = useContext(DraftDataContext);
  if (!ctx) {
    throw new Error('useDraftData must be used within a <DraftDataProvider />');
  }
  return ctx;
}

export default function DraftDataProvider({ children }) {
  // State declarations
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [leagueId, setLeagueId] = useState(null);
  const [leagueSeason, setLeagueSeason] = useState(null);
  const [draftInfo, setDraftInfo] = useState(null);
  const [draftPicks, setDraftPicks] = useState([]);
  const [tradedPicks, setTradedPicks] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [pastDrafts, setPastDrafts] = useState([]);
  const [rosters, setRosters] = useState([]);
  const [users, setUsers] = useState([]);
  const [draftOrder, setDraftOrder] = useState([]);
  const [isMobile, setIsMobile] = useState(false);
  const [draftYearToShow, setDraftYearToShow] = useState(null);

  // Sleeper User ID - this should be your league commissioner's Sleeper ID
  const USER_ID = '456973480269705216';

  // Mobile detection
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const standingsRows = useMemo(() => {
    return (rosters || [])
      .map((roster) => {
        const user = (users || []).find((entry) => entry.user_id === roster.owner_id);
        return {
          rosterId: roster.roster_id,
          teamName: user?.display_name || user?.team_name || `Team ${roster.roster_id}`,
          avatar: user?.avatar || null,
          wins: Number(roster.settings?.wins) || 0,
          losses: Number(roster.settings?.losses) || 0,
          ties: Number(roster.settings?.ties) || 0,
          pointsFor: Number(roster.settings?.fpts) || 0,
          pointsAgainst: Number(roster.settings?.fpts_against) || 0,
        };
      })
      .sort((left, right) => {
        if (left.wins !== right.wins) return right.wins - left.wins;
        if (left.pointsFor !== right.pointsFor) return right.pointsFor - left.pointsFor;
        return Number(left.rosterId) - Number(right.rosterId);
      });
  }, [rosters, users]);

  const buildDraftOrderEntries = (orderRows, rostersArg = rosters, usersArg = users) => {
    return (Array.isArray(orderRows) ? orderRows : [])
      .map((entry) => {
        const currentRosterId = Number(entry.roster_id ?? entry.current_roster_id ?? entry.original_roster_id);
        const originalRosterId = Number(entry.original_roster_id ?? entry.roster_id ?? entry.current_roster_id);
        const currentRoster = (rostersArg || []).find((roster) => Number(roster.roster_id) === currentRosterId) || null;
        const originalRoster = (rostersArg || []).find((roster) => Number(roster.roster_id) === originalRosterId) || null;
        const currentUser = (usersArg || []).find((user) => user.user_id === currentRoster?.owner_id) || null;
        const originalUser = (usersArg || []).find((user) => user.user_id === originalRoster?.owner_id) || null;

        return {
          slot: Number(entry.slot),
          rosterId: currentRosterId,
          originalRosterId,
          teamName: originalUser?.display_name || originalUser?.team_name || `Team ${originalRosterId}`,
          originalTeamName: originalUser?.display_name || originalUser?.team_name || `Team ${originalRosterId}`,
          currentTeamName: currentUser?.display_name || currentUser?.team_name || `Team ${currentRosterId}`,
          avatarUrl: originalUser?.avatar ? `https://sleepercdn.com/avatars/thumbs/${originalUser.avatar}` : null,
          currentAvatarUrl: currentUser?.avatar ? `https://sleepercdn.com/avatars/thumbs/${currentUser.avatar}` : null,
          maxpf: typeof entry.maxpf === 'number' ? entry.maxpf : undefined,
          wins: typeof entry.wins === 'number' ? entry.wins : Number(currentRoster?.settings?.wins) || 0,
          losses: typeof entry.losses === 'number' ? entry.losses : Number(currentRoster?.settings?.losses) || 0,
          ties: typeof entry.ties === 'number' ? entry.ties : Number(currentRoster?.settings?.ties) || 0,
          fpts: typeof entry.fpts === 'number' ? entry.fpts : Number(currentRoster?.fpts) || 0,
        };
      })
      .sort((left, right) => Number(left.slot) - Number(right.slot));
  };

  // First, find the correct BBB league
  useEffect(() => {
    async function findBBBLeague() {
      try {
        setLoading(true);

        // Get current NFL season
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        if (!seasonResponse.ok) throw new Error('Failed to fetch NFL state');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;
        setLeagueSeason(currentSeason);

        // Get user's leagues for the current season
        const userLeaguesResponse = await fetch(
          `https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${currentSeason}`
        );
        if (!userLeaguesResponse.ok) throw new Error('Failed to fetch user leagues');
        const userLeagues = await userLeaguesResponse.json();

        // Try more flexible matching for "Budget Blitz Bowl" in current season
        let bbbLeagues = userLeagues.filter(
          (league) =>
            league.name &&
            (league.name.includes('Budget Blitz Bowl') ||
              league.name.includes('budget blitz bowl') ||
              league.name.includes('BBB') ||
              (league.name.toLowerCase().includes('budget') &&
                league.name.toLowerCase().includes('blitz')))
        );

        // If no matching leagues found in current season, try previous season
        if (bbbLeagues.length === 0) {
          const prevSeason = (parseInt(currentSeason) - 1).toString();
          const prevSeasonResponse = await fetch(
            `https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${prevSeason}`
          );

          if (prevSeasonResponse.ok) {
            const prevSeasonLeagues = await prevSeasonResponse.json();
            const prevBBBLeagues = prevSeasonLeagues.filter(
              (league) =>
                league.name &&
                (league.name.includes('Budget Blitz Bowl') ||
                  league.name.includes('budget blitz bowl') ||
                  league.name.includes('BBB') ||
                  (league.name.toLowerCase().includes('budget') &&
                    league.name.toLowerCase().includes('blitz')))
            );

            if (prevBBBLeagues.length > 0) {
              bbbLeagues = prevBBBLeagues;
            }
          }
        }

        if (bbbLeagues.length === 0) {
          throw new Error('No Budget Blitz Bowl leagues found');
        }

        // Sort by season and take the most recent
        const mostRecentLeague = bbbLeagues.sort((a, b) => b.season - a.season)[0];
        setLeagueId(mostRecentLeague.league_id);
      } catch (err) {
        setError(err?.message || 'Error finding BBB league');
        setLoading(false);
      }
    }

    findBBBLeague();
  }, []);

  // Once we have the league ID, fetch draft-related data
  useEffect(() => {
    if (!leagueId) return;

    async function fetchDraftData() {
      try {
        const getLeagueYear = async () => {
          const yrFromState = Number(leagueSeason);
          if (Number.isFinite(yrFromState) && yrFromState > 2000) return yrFromState;
          try {
            const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
            if (seasonResponse.ok) {
              const seasonState = await seasonResponse.json();
              const yr = Number(seasonState?.season);
              if (Number.isFinite(yr) && yr > 2000) {
                setLeagueSeason(String(yr));
                return yr;
              }
            }
          } catch {
            // ignore
          }
          return new Date().getFullYear();
        };

        const pickActiveDraft = (drafts) => {
          if (!Array.isArray(drafts) || drafts.length === 0) return null;

          const nonComplete = drafts.filter((d) => d?.status && d.status !== 'complete');
          if (nonComplete.length === 0) return null;

          const statusPriority = {
            drafting: 0,
            in_progress: 1,
            paused: 2,
            pre_draft: 3,
            upcoming: 4,
          };

          return nonComplete
            .slice()
            .sort((a, b) => {
              const pa = statusPriority[String(a.status)] ?? 99;
              const pb = statusPriority[String(b.status)] ?? 99;
              if (pa !== pb) return pa - pb;
              return Number(b.start_time || 0) - Number(a.start_time || 0);
            })[0];
        };

        // Fetch league users
        const usersResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
        if (!usersResponse.ok) throw new Error('Failed to fetch users');
        const usersData = await usersResponse.json();
        setUsers(usersData);

        // Fetch rosters
        const rostersResponse = await fetch(
          `https://api.sleeper.app/v1/league/${leagueId}/rosters`
        );
        if (!rostersResponse.ok) throw new Error('Failed to fetch rosters');
        const rostersData = await rostersResponse.json();
        setRosters(rostersData);

        // Fetch traded picks
        const tradedPicksResponse = await fetch(
          `https://api.sleeper.app/v1/league/${leagueId}/traded_picks`
        );
        if (!tradedPicksResponse.ok) throw new Error('Failed to fetch traded picks');
        const tradedPicksData = await tradedPicksResponse.json();
        setTradedPicks(tradedPicksData);

        // Fetch all drafts for this league
        const draftsResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/drafts`);
        if (!draftsResponse.ok) throw new Error('Failed to fetch drafts');
        const draftsData = await draftsResponse.json();

        // Process past drafts
        const processedDrafts = [];
        for (const draft of draftsData) {
          try {
            const picksResponse = await fetch(
              `https://api.sleeper.app/v1/draft/${draft.draft_id}/picks`
            );
            if (picksResponse.ok) {
              const picksData = await picksResponse.json();
              processedDrafts.push({
                ...draft,
                picks: picksData,
              });
            }
          } catch {
            // ignore per-draft pick fetch errors
          }
        }
        setPastDrafts(processedDrafts);

        // --- DRAFT YEAR LOGIC ---
        const leagueYear = await getLeagueYear();
        const hasNonCompleteDraft =
          Array.isArray(draftsData) && draftsData.some((d) => d?.status && d.status !== 'complete');
        const draftYear = hasNonCompleteDraft ? leagueYear : leagueYear + 1;

        const activeDraft = pickActiveDraft(draftsData);

        if (activeDraft) {
          setDraftInfo(activeDraft);

          // For upcoming drafts, we might not have picks yet
          try {
            const picksResponse = await fetch(
              `https://api.sleeper.app/v1/draft/${activeDraft.draft_id}/picks`
            );
            if (picksResponse.ok) {
              const picksData = await picksResponse.json();
              setDraftPicks(picksData);
            }
          } catch {
            // expected pre-draft
          }

          // Prefer the calculated order so we can keep original-owner metadata.
          try {
            const orderRes = await fetch(`/api/debug/draft-order?leagueId=${leagueId}`, { cache: 'no-store' });
            if (orderRes.ok) {
              const orderJson = await orderRes.json();
              setDraftOrder(buildDraftOrderEntries(orderJson?.draft_order || [], rostersData, usersData));
            } else if (activeDraft.draft_order) {
              const draftOrderArray = Object.entries(activeDraft.draft_order).map(([userId, slot]) => {
                const roster = rostersData.find((r) => r.owner_id === userId);
                const user = usersData.find((u) => u.user_id === userId);
                return {
                  slot,
                  rosterId: roster?.roster_id,
                  originalRosterId: roster?.roster_id,
                  teamName: user?.display_name || user?.team_name || 'Unknown Team',
                  originalTeamName: user?.display_name || user?.team_name || 'Unknown Team',
                  currentTeamName: user?.display_name || user?.team_name || 'Unknown Team',
                  avatarUrl: user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null,
                  currentAvatarUrl: user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null,
                };
              });
              setDraftOrder(draftOrderArray.sort((a, b) => a.slot - b.slot));
            }
          } catch {
            if (activeDraft.draft_order) {
              const draftOrderArray = Object.entries(activeDraft.draft_order).map(([userId, slot]) => {
                const roster = rostersData.find((r) => r.owner_id === userId);
                const user = usersData.find((u) => u.user_id === userId);
                return {
                  slot,
                  rosterId: roster?.roster_id,
                  originalRosterId: roster?.roster_id,
                  teamName: user?.display_name || user?.team_name || 'Unknown Team',
                  originalTeamName: user?.display_name || user?.team_name || 'Unknown Team',
                  currentTeamName: user?.display_name || user?.team_name || 'Unknown Team',
                  avatarUrl: user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null,
                  currentAvatarUrl: user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null,
                };
              });
              setDraftOrder(draftOrderArray.sort((a, b) => a.slot - b.slot));
            }
          }
        } else {
          setDraftInfo({
            draft_year: draftYear,
          });

          // Fallback: compute order from server debug API to avoid heavy client-side calls
          try {
            const resp = await fetch(`/api/debug/draft-order?leagueId=${leagueId}`, {
              cache: 'no-store',
            });
            if (resp.ok) {
              const json = await resp.json();
              const uiOrder = buildDraftOrderEntries(json.draft_order || [], rostersData, usersData);
              setDraftOrder(uiOrder);
            }
          } catch {
            // ignore
          }
        }

        setDraftYearToShow(draftYear);

        // Fetch enriched trade history via our API
        try {
          const stateRes = await fetch('https://api.sleeper.app/v1/state/nfl');
          const stateJson = await stateRes.json();
          const season = stateJson?.season || String(leagueYear);
          const tradesRes = await fetch(`/api/history/trades?season=${season}`);
          if (tradesRes.ok) {
            const tradesJson = await tradesRes.json();
            const enrichedTrades = Array.isArray(tradesJson?.trades) ? tradesJson.trades : [];
            setTradeHistory(enrichedTrades);
          }
        } catch {
          // ignore
        }

        setLoading(false);
      } catch (err) {
        setError(err?.message || 'Error fetching draft data');
        setLoading(false);
      }
    }

    fetchDraftData();
  }, [leagueId]);

  const getTeamNameWrapper = useMemo(() => {
    return (rosterId) => getTeamName(rosterId, rosters, users);
  }, [rosters, users]);

  const value = useMemo(
    () => ({
      loading,
      error,
      leagueId,
      draftInfo,
      draftPicks,
      tradedPicks,
      tradeHistory,
      pastDrafts,
      rosters,
      users,
      draftOrder,
      standingsRows,
      isMobile,
      draftYearToShow,
      getTeamName: getTeamNameWrapper,
    }),
    [
      loading,
      error,
      leagueId,
      draftInfo,
      draftPicks,
      tradedPicks,
      tradeHistory,
      pastDrafts,
      rosters,
      users,
      draftOrder,
      standingsRows,
      isMobile,
      draftYearToShow,
      getTeamNameWrapper,
    ]
  );

  return <DraftDataContext.Provider value={value}>{children}</DraftDataContext.Provider>;
}
