'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ActivityBadges from './components/ActivityBadges';
import { getBudgetBlitzBowlLeagues, getAllLeagueTransactions } from './myTeamApi';

export default function MyTeam() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // State for activity badge data
  const [activity, setActivity] = useState({
    trades: 0,
    playersAdded: 0,
    draftPicks: 0,
  });
  const [loading, setLoading] = useState(true);

  // Redirect if not logged in
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Fetch activity data for the current user
  useEffect(() => {
    async function fetchActivity() {
      if (!session?.user?.id) return;
      setLoading(true);

      // Example: get all BBB leagues for this user for the current season
      const season = new Date().getFullYear();
      const leagues = await getBudgetBlitzBowlLeagues(session.user.id, season);

      // For demo, just use the first league (expand as needed)
      if (leagues.length === 0) {
        setLoading(false);
        return;
      }
      const leagueId = leagues[0].league_id;

      // Fetch all transactions for this league
      const transactions = await getAllLeagueTransactions(leagueId);

      // Calculate activity stats
      const trades = transactions.filter(tx => tx.type === 'trade').length;
      const playersAdded = transactions.filter(tx => tx.type === 'add').length;
      // Draft picks would require draft API, for now set to 0
      setActivity({
        trades,
        playersAdded,
        draftPicks: 0,
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