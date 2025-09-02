'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import ActivityBadges from '../components/ActivityBadges';
import TeamPedigreeBadges from '../components/TeamPedigreeBadges';
import {
  getAllLeagueTransactions,
  getUserLeagues,
  getLeagueDrafts,
  getDraftPicks,
  getLeagueRosters,
  getLeagueStandings,
  getPlayoffResults
} from '../myTeamApi';

export default function BadgesPage() {
  const { data: session, status } = useSession();

  React.useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/login";
    }
  }, [status]);

  if (status === "loading") return null;

  const [activity, setActivity] = useState({ trades: 0, playersAdded: 0, rookiesDrafted: 0 });
  const [pedigree, setPedigree] = useState({
    championships: 0,
    divisionTitles: 0,
    allTimeRecord: '0-0',
    allTimeWinPct: '0.0%',
    playoffAppearances: 0,
    playoffRecord: '0-0',
    playoffWinPct: '0.0%',
  });
  const [loading, setLoading] = useState(true);
  const [leagueRosters, setLeagueRosters] = useState({});
  const loaded = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || loaded.current) return;
    loaded.current = true;

    async function fetchActivityAndPedigree() {
      if (!session?.user?.sleeperId) return;
      setLoading(true);

      const allLeagues = [];
      const currentYear = new Date().getFullYear();
      for (let season = 2024; season <= currentYear; season++) {
        const leagues = await getUserLeagues(session.user.sleeperId, season);
        const bbbLeagues = leagues.filter(league => league.name === "Budget Blitz Bowl");
        allLeagues.push(...bbbLeagues);
      }

      const rostersMap = {};
      for (const league of allLeagues) {
        const rosters = await getLeagueRosters(league.league_id);
        rostersMap[league.league_id] = rosters;
      }
      setLeagueRosters(rostersMap);

      let trades = [];
      let playersAdded = [];
      let rookiesDrafted = [];

      let championships = 0;
      let divisionTitles = 0;
      let allTimeWins = 0;
      let allTimeLosses = 0;
      let playoffAppearances = 0;
      let playoffWins = 0;
      let playoffLosses = 0;

      for (const league of allLeagues) {
        const transactions = await getAllLeagueTransactions(league.league_id);

        trades.push(...transactions.filter(tx => tx.type === 'trade').map(tx => ({ ...tx, league_id: league.league_id })));
        playersAdded.push(...transactions.filter(tx => tx.status === "complete" && (tx.type === "waiver" || tx.type === "free_agent")));

        const drafts = await getLeagueDrafts(league.league_id);
        for (const draft of drafts) {
          if (draft.season === "2024") continue;
          const picks = await getDraftPicks(draft.draft_id);
          rookiesDrafted.push(
            ...picks
              .filter(pick => pick.picked_by === session.user.sleeperId)
              .map(pick => ({ ...pick, season: draft.season, round: pick.round, pick_no: pick.pick_no, player_id: pick.player_id, metadata: pick.metadata }))
          );
        }

        const standings = await getLeagueStandings(league.league_id);
        const myRoster = (rostersMap[league.league_id] || []).find(r => r.owner_id === session.user.sleeperId);
        if (myRoster) {
          const myStanding = standings.find(s => s.roster_id === myRoster.roster_id);
          if (myStanding) {
            allTimeWins += myStanding.wins || 0;
            allTimeLosses += myStanding.losses || 0;
            if (myStanding.division_champ) divisionTitles += 1;
          }
        }

        const playoffResults = await getPlayoffResults(league.league_id);
        if (playoffResults && myRoster) {
          const myPlayoff = playoffResults.find(p => p.roster_id === myRoster.roster_id);
          if (myPlayoff) {
            playoffAppearances += myPlayoff.appearances || 0;
            playoffWins += myPlayoff.wins || 0;
            playoffLosses += myPlayoff.losses || 0;
            if (myPlayoff.champion) championships += 1;
          }
        }
      }

      const allTimeGames = allTimeWins + allTimeLosses;
      const allTimeWinPct = allTimeGames > 0 ? ((allTimeWins / allTimeGames) * 100).toFixed(1) + "%" : "0.0%";
      const playoffGames = playoffWins + playoffLosses;
      const playoffWinPct = playoffGames > 0 ? ((playoffWins / playoffGames) * 100).toFixed(1) + "%" : "0.0%";

      setActivity({ trades: trades.length, playersAdded: playersAdded.length, rookiesDrafted: rookiesDrafted.length });
      setPedigree({
        championships,
        divisionTitles,
        allTimeRecord: `${allTimeWins}-${allTimeLosses}`,
        allTimeWinPct,
        playoffAppearances,
        playoffRecord: `${playoffWins}-${playoffLosses}`,
        playoffWinPct,
      });

      setLoading(false);
    }
    fetchActivityAndPedigree();
  }, [session, status]);

  if (status === 'loading') return null;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-white">Team Pedigree</h2>
      {loading ? (
        <div className="text-white/60">Loading activity...</div>
      ) : (
        <>
          <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <div className="backdrop-blur-md bg-white/10 border border-gradient-to-br from-[#FF4B1F] to-[#1FDDFF] rounded-2xl shadow-2xl p-8 flex flex-col items-center transition-transform hover:scale-[1.03] hover:bg-white/20 duration-200">
              <TeamPedigreeBadges
                championships={pedigree.championships}
                divisionTitles={pedigree.divisionTitles}
                allTimeRecord={pedigree.allTimeRecord}
                allTimeWinPct={pedigree.allTimeWinPct}
                playoffAppearances={pedigree.playoffAppearances}
                playoffRecord={pedigree.playoffRecord}
                playoffWinPct={pedigree.playoffWinPct}
              />
            </div>
          </div>
          <div className="my-12 border-t border-white/10"></div>
          <div>
            <h2 className="text-2xl font-bold mb-4 text-white">Team Activity</h2>
            <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
              <div className="backdrop-blur-md bg-white/10 border border-gradient-to-br from-[#FF4B1F] to-[#1FDDFF] rounded-2xl shadow-2xl p-8 flex flex-col items-center transition-transform hover:scale-[1.03] hover:bg-white/20 duration-200">
                <ActivityBadges
                  trades={activity.trades}
                  playersAdded={activity.playersAdded}
                  draftPicks={activity.rookiesDrafted}
                  draftLabel="Rookies Drafted"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}