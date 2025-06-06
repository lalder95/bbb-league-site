'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ActivityBadges from './components/ActivityBadges';
import { getAllTimeBudgetBlitzBowlLeagues, getAllLeagueTransactions, getUserLeagues } from './myTeamApi';

export default function MyTeam() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activity, setActivity] = useState({
    trades: 0,
    playersAdded: 0,
    draftPicks: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    async function fetchActivity() {
      // Use sleeperId for Sleeper API calls!
      if (!session?.user?.sleeperId) return;
      console.log("Session user object:", session.user);
      setLoading(true);

      // Get all BBB leagues for this user from 2024 to current
      const allLeagues = [];
      const currentYear = new Date().getFullYear();
      for (let season = 2024; season <= currentYear; season++) {
        const leagues = await getUserLeagues(session.user.sleeperId, season);
        console.log(`Leagues for ${season}:`, leagues.map(l => l.name));
        const bbbLeagues = leagues.filter(league => league.name === "Budget Blitz Bowl");
        allLeagues.push(...bbbLeagues);
      }
      console.log("Filtered BBB leagues:", allLeagues);

      let trades = 0;
      let playersAdded = 0;
      // let draftPicks = 0; // To implement if you want to aggregate draft picks

      // Aggregate across all leagues
      for (const league of allLeagues) {
        const transactions = await getAllLeagueTransactions(league.league_id);
        console.log(`Transactions for league ${league.league_id}:`, transactions);
        trades += transactions.filter(tx => tx.type === 'trade').length;
        playersAdded += transactions.filter(tx => tx.type === 'add').length;
        // Add draft pick aggregation here if needed
      }

      setActivity({
        trades,
        playersAdded,
        draftPicks: 0, // Update if you implement draft pick aggregation
      });
      setLoading(false);
    }
    if (status === 'authenticated') {
      fetchActivity();
    }
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
          <ActivityBadges
            trades={activity.trades}
            playersAdded={activity.playersAdded}
            draftPicks={activity.draftPicks}
          />
        )}
      </div>
    </main>
  );
}