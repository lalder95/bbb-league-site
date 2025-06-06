'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ActivityBadges from './components/ActivityBadges';
import { getAllLeagueTransactions, getUserLeagues, getLeagueDrafts, getDraftPicks } from './myTeamApi';

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

  // For details modal/section
  const [showDetail, setShowDetail] = useState(null); // 'trades' | 'playersAdded' | 'rookiesDrafted' | null
  const [tradeDetails, setTradeDetails] = useState({});
  const [playersAddedDetails, setPlayersAddedDetails] = useState({});
  const [rookiesDraftedDetails, setRookiesDraftedDetails] = useState({});

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    async function fetchActivity() {
      if (!session?.user?.sleeperId) return;
      setLoading(true);

      const allLeagues = [];
      const currentYear = new Date().getFullYear();
      for (let season = 2024; season <= currentYear; season++) {
        const leagues = await getUserLeagues(session.user.sleeperId, season);
        const bbbLeagues = leagues.filter(league => league.name === "Budget Blitz Bowl");
        allLeagues.push(...bbbLeagues);
      }

      let trades = [];
      let playersAdded = [];
      let rookiesDrafted = [];

      for (const league of allLeagues) {
        const transactions = await getAllLeagueTransactions(league.league_id);

        // Trades
        trades.push(...transactions.filter(tx => tx.type === 'trade'));

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
      }

      setActivity({
        trades: trades.length,
        playersAdded: playersAdded.length,
        rookiesDrafted: rookiesDrafted.length,
      });

      // Group details by year
      setTradeDetails(groupByYear(trades, tx => new Date(tx.created).getFullYear()));
      setPlayersAddedDetails(groupByYear(playersAdded, tx => tx.leg ? 2024 + (tx.leg - 1) : 'Unknown'));
      setRookiesDraftedDetails(groupByYear(rookiesDrafted, pick => pick.season));

      setLoading(false);
    }
    if (status === 'authenticated') {
      fetchActivity();
    }
  }, [session, status]);

  // Render details for each badge
  function renderDetails() {
    if (showDetail === 'trades') {
      return (
        <div className="bg-black/80 p-4 rounded mt-4">
          <h3 className="font-bold text-lg mb-2">Trades Made (by Year)</h3>
          {Object.keys(tradeDetails).length === 0 && <div>No trades found.</div>}
          {Object.entries(tradeDetails).map(([year, txs]) => (
            <div key={year} className="mb-2">
              <div className="font-semibold">{year}</div>
              <ul className="ml-4 list-disc">
                {txs.map(tx => {
                  // Only show player IDs from adds
                  const addedPlayers = tx.adds ? Object.keys(tx.adds) : [];
                  return (
                    <li key={tx.transaction_id}>
                      Trade ID: {tx.transaction_id} (Week {tx.leg})<br />
                      Players Added: {addedPlayers.length > 0 ? addedPlayers.join(', ') : 'N/A'}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      );
    }
    if (showDetail === 'playersAdded') {
      return (
        <div className="bg-black/80 p-4 rounded mt-4">
          <h3 className="font-bold text-lg mb-2">Players Added (by Year)</h3>
          {Object.keys(playersAddedDetails).length === 0 && <div>No players added found.</div>}
          {Object.entries(playersAddedDetails).map(([year, txs]) => (
            <div key={year} className="mb-2">
              <div className="font-semibold">{year}</div>
              <ul className="ml-4 list-disc">
                {txs.map(tx => (
                  <li key={tx.transaction_id}>
                    {tx.adds
                      ? Object.keys(tx.adds).join(', ')
                      : 'Unknown Player'} (Week {tx.leg})
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    }
    if (showDetail === 'rookiesDrafted') {
      return (
        <div className="bg-black/80 p-4 rounded mt-4">
          <h3 className="font-bold text-lg mb-2">Rookies Drafted (by Year)</h3>
          {Object.keys(rookiesDraftedDetails).length === 0 && <div>No rookies drafted found.</div>}
          {Object.entries(rookiesDraftedDetails).map(([year, picks]) => (
            <div key={year} className="mb-2">
              <div className="font-semibold">{year}</div>
              <ul className="ml-4 list-disc">
                {picks.map(pick => (
                  <li key={pick.pick_no}>
                    {pick.metadata?.first_name || ''} {pick.metadata?.last_name || ''} 
                    {pick.round ? ` - Round ${pick.round}` : ''} 
                    {pick.pick_no ? `, Pick ${pick.pick_no}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    }
    return null;
  }

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
              onTradesClick={() => setShowDetail('trades')}
              onPlayersAddedClick={() => setShowDetail('playersAdded')}
              onDraftPicksClick={() => setShowDetail('rookiesDrafted')}
              draftLabel="Rookies Drafted"
            />
            {renderDetails()}
            {showDetail && (
              <button
                className="mt-4 px-4 py-2 bg-[#FF4B1F] text-white rounded"
                onClick={() => setShowDetail(null)}
              >
                Close
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}