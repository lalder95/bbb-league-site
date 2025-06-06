'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ActivityBadges from './components/ActivityBadges';
import TeamPedigreeBadges from './components/TeamPedigreeBadges';
import {
  getAllLeagueTransactions,
  getUserLeagues,
  getLeagueDrafts,
  getDraftPicks,
  getLeagueRosters,
  getLeagueStandings,
  getPlayoffResults
} from './myTeamApi';

function groupByYear(items, getYear) {
  return items.reduce((acc, item) => {
    const year = getYear(item);
    if (!acc[year]) acc[year] = [];
    acc[year].push(item);
    return acc;
  }, {});
}

export default function MyTeam() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activity, setActivity] = useState({
    trades: 0,
    playersAdded: 0,
    rookiesDrafted: 0,
  });
  const [loading, setLoading] = useState(true);
  const [leagueRosters, setLeagueRosters] = useState({});
  const loaded = useRef(false);

  // Player map from BBB_Contracts.csv
  const [playerMap, setPlayerMap] = useState({});

  // Team Pedigree state (replace with real values as needed)
  const [pedigree, setPedigree] = useState({
    championships: 0,
    divisionTitles: 0,
    allTimeRecord: "0-0",
    allTimeWinPct: "0.0%",
    playoffAppearances: 0,
    playoffRecord: "0-0",
    playoffWinPct: "0.0%",
  });

  useEffect(() => {
    // Load player map from BBB_Contracts.csv (same logic as player-contracts page)
    async function fetchPlayerMap() {
      const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
      const text = await response.text();
      const rows = text.split('\n');
      const headers = rows[0].split(',');
      const idIdx = headers.findIndex(h => h.trim().toLowerCase() === 'playerid' || h.trim().toLowerCase() === 'player_id');
      const nameIdx = headers.findIndex(h => h.trim().toLowerCase() === 'playername' || h.trim().toLowerCase() === 'player_name');
      const map = {};
      rows.slice(1).forEach(row => {
        const values = row.split(',');
        if (values[idIdx] && values[nameIdx]) {
          map[values[idIdx].trim()] = values[nameIdx].trim();
        }
      });
      setPlayerMap(map);
    }
    fetchPlayerMap();
  }, []);

  function getPlayerName(id) {
    return playerMap[String(id)] || id;
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

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

      // Fetch rosters for each league to map user to roster_id and get manager names
      const rostersMap = {};
      for (const league of allLeagues) {
        const rosters = await getLeagueRosters(league.league_id);
        rostersMap[league.league_id] = rosters;
      }
      setLeagueRosters(rostersMap);

      let trades = [];
      let playersAdded = [];
      let rookiesDrafted = [];

      // Pedigree stats
      let championships = 0;
      let divisionTitles = 0;
      let allTimeWins = 0;
      let allTimeLosses = 0;
      let playoffAppearances = 0;
      let playoffWins = 0;
      let playoffLosses = 0;

      for (const league of allLeagues) {
        const transactions = await getAllLeagueTransactions(league.league_id);

        // Trades
        trades.push(...transactions.filter(tx => tx.type === 'trade').map(tx => ({
          ...tx,
          league_id: league.league_id
        })));

        // Players Added
        playersAdded.push(
          ...transactions.filter(
            tx =>
              tx.status === "complete" &&
              (tx.type === "waiver" || tx.type === "free_agent")
          )
        );

        // Draft picks (exclude 2024)
        const drafts = await getLeagueDrafts(league.league_id);
        for (const draft of drafts) {
          if (draft.season === "2024") continue;
          const picks = await getDraftPicks(draft.draft_id);
          rookiesDrafted.push(
            ...picks
              .filter(pick => pick.picked_by === session.user.sleeperId)
              .map(pick => ({
                ...pick,
                season: draft.season,
                round: pick.round,
                pick_no: pick.pick_no,
                player_id: pick.player_id,
                metadata: pick.metadata,
              }))
          );
        }

        // --- PEDIGREE CALCULATIONS ---
        // 1. Standings for all-time record and division titles
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

        // 2. Playoff results for championships, playoff appearances, playoff record
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

      // Calculate win percentages
      const allTimeGames = allTimeWins + allTimeLosses;
      const allTimeWinPct = allTimeGames > 0 ? ((allTimeWins / allTimeGames) * 100).toFixed(1) + "%" : "0.0%";
      const playoffGames = playoffWins + playoffLosses;
      const playoffWinPct = playoffGames > 0 ? ((playoffWins / playoffGames) * 100).toFixed(1) + "%" : "0.0%";

      setActivity({
        trades: trades.length,
        playersAdded: playersAdded.length,
        rookiesDrafted: rookiesDrafted.length,
      });

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

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      {/* Header Banner */}
      <div className="bg-black/30 p-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className="h-16 w-16 transition-transform hover:scale-105"
            />
            <h1 className="text-3xl font-bold text-[#FF4B1F]">My Team</h1>
          </div>
          <div className="hidden md:block">
            <div className="text-white/70">
              {session?.user?.name || 'My Team'}
            </div>
          </div>
        </div>
      </div>

      {/* Badges Section */}
      <div className="max-w-7xl mx-auto p-6">
        <h2 className="text-2xl font-bold mb-4 text-white">Team Activity</h2>
        {loading ? (
          <div className="text-white/60">Loading activity...</div>
        ) : (
          <>
            <ActivityBadges
              trades={activity.trades}
              playersAdded={activity.playersAdded}
              draftPicks={activity.rookiesDrafted}
              draftLabel="Rookies Drafted"
            />
            <div className="mt-8">
              <h2 className="text-2xl font-bold mb-4 text-white">Team Pedigree</h2>
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
          </>
        )}
      </div>
    </main>
  );
}