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
        const currentYear = new Date().getFullYear();
        let draftYear = currentYear + 1; // fallback

        const upcomingDraft = draftsData.find((draft) => draft.status === 'upcoming');

        if (upcomingDraft) {
          draftYear = upcomingDraft.start_time
            ? new Date(Number(upcomingDraft.start_time)).getFullYear()
            : currentYear;
          setDraftInfo(upcomingDraft);

          // For upcoming drafts, we might not have picks yet
          try {
            const picksResponse = await fetch(
              `https://api.sleeper.app/v1/draft/${upcomingDraft.draft_id}/picks`
            );
            if (picksResponse.ok) {
              const picksData = await picksResponse.json();
              setDraftPicks(picksData);
            }
          } catch {
            // expected pre-draft
          }

          // Process the draft order
          if (upcomingDraft.draft_order) {
            const draftOrderArray = Object.entries(upcomingDraft.draft_order).map(
              ([userId, slot]) => ({
                userId,
                slot,
                teamName:
                  usersData.find((u) => u.user_id === userId)?.display_name || 'Unknown Team',
                rosterId: rostersData.find((r) => r.owner_id === userId)?.roster_id,
              })
            );
            const sortedDraftOrder = draftOrderArray.sort((a, b) => a.slot - b.slot);
            setDraftOrder(sortedDraftOrder);
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
              const uiOrder = (json.draft_order || [])
                .map((e) => ({
                  slot: e.slot,
                  rosterId: e.roster_id,
                  userId: e.owner_id,
                  teamName: e.teamName || 'Unknown Team',
                  maxpf: typeof e.maxpf === 'number' ? e.maxpf : undefined,
                  avatarUrl: e.avatarUrl || null,
                }))
                .sort((a, b) => a.slot - b.slot);
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
          const season = stateJson?.season || new Date().getFullYear();
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
      isMobile,
      draftYearToShow,
      getTeamNameWrapper,
    ]
  );

  return <DraftDataContext.Provider value={value}>{children}</DraftDataContext.Provider>;
}
