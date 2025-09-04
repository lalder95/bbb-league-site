'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DraftPicksFetcher from '../../../components/draft/DraftPicksFetcher';
import { getLeagueRosters } from '../myTeamApi';

export default function DraftPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Hooks must be declared unconditionally and before any returns
  const [leagueId, setLeagueId] = useState(null);
  const [leagueRosters, setLeagueRosters] = useState({});
  const [showMineOnly, setShowMineOnly] = useState(false);

  // Redirect in an effect
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  // Find BBB league (always declare the effect; guard its body)
  useEffect(() => {
    async function findBBBLeague() {
      if (!session?.user?.sleeperId) return;
      try {
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;

        const userLeaguesResponse = await fetch(
          `https://api.sleeper.app/v1/user/${session.user.sleeperId}/leagues/nfl/${currentSeason}`
        );
        const userLeagues = await userLeaguesResponse.json();

        let bbbLeagues = userLeagues.filter(
          league =>
            league.name &&
            (league.name.includes('Budget Blitz Bowl') ||
              league.name.includes('budget blitz bowl') ||
              league.name.includes('BBB') ||
              (league.name.toLowerCase().includes('budget') && league.name.toLowerCase().includes('blitz')))
        );
        if (bbbLeagues.length === 0 && userLeagues.length > 0) bbbLeagues = [userLeagues[0]];
        const mostRecentLeague = bbbLeagues.sort((a, b) => Number(b.season) - Number(a.season))[0];
        setLeagueId(mostRecentLeague?.league_id || null);
      } catch {
        setLeagueId(null);
      }
    }
    findBBBLeague();
  }, [session?.user?.sleeperId]);

  // Load rosters for league (always declare effect; guard with leagueId)
  useEffect(() => {
    if (!leagueId) return;
    (async () => {
      try {
        const rosters = await getLeagueRosters(leagueId);
        setLeagueRosters(prev => ({ ...prev, [leagueId]: rosters || [] }));
      } catch {
        setLeagueRosters(prev => ({ ...prev, [leagueId]: [] }));
      }
    })();
  }, [leagueId]);

  // Only now gate rendering to avoid conditional hooks above
  if (status === 'loading' || status === 'unauthenticated') return null;

  return (
    <div>
      <DraftPicksFetcher
        leagueId={leagueId}
        rosters={leagueRosters[leagueId] || []}
        render={(picksByOwner, loading, error, rosterIdToDisplayName) => {
          const allPicks = Object.values(picksByOwner).flat();

          const picksByYear = {};
          allPicks.forEach(pick => {
            const year = pick.season || pick.year || pick.draftYear || 'Unknown';
            const round = pick.round || 'Unknown';
            if (!picksByYear[year]) picksByYear[year] = {};
            if (!picksByYear[year][round]) picksByYear[year][round] = [];
            picksByYear[year][round].push(pick);
          });
          const sortedYears = Object.keys(picksByYear).sort();

          let myRosterId = null;
          if (session?.user?.sleeperId && Array.isArray(leagueRosters[leagueId])) {
            const myRoster = (leagueRosters[leagueId] || []).find(r => r.owner_id === session.user.sleeperId);
            if (myRoster) myRosterId = myRoster.roster_id;
          }

          return (
            <div>
              <h2 className="text-2xl font-bold mb-6 text-white text-center">All League Draft Picks</h2>
              <div className="flex items-center gap-3 mb-4">
                <label className="flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showMineOnly}
                    onChange={e => setShowMineOnly(e.target.checked)}
                    className="form-checkbox h-5 w-5 text-[#FF4B1F] rounded focus:ring-[#FF4B1F] border-white/20"
                  />
                  <span className="ml-2 text-white/80 font-semibold">Show Only My Picks</span>
                </label>
              </div>
              {loading && <div className="text-white/60 italic text-center">Loading draft picks...</div>}
              {error && <div className="text-red-400 text-center mb-4">Error: {error}</div>}
              {!loading && allPicks.length === 0 && <div className="text-white/60 italic text-center">No draft picks found for this league.</div>}
              {!loading && allPicks.length > 0 && (
                <div className="space-y-8">
                  {sortedYears.map(year => (
                    <div key={year} className="bg-black/30 rounded-xl border border-white/10 p-6 shadow-lg">
                      <h3 className="text-xl font-bold text-[#FF4B1F] mb-4">{year} Draft Picks</h3>
                      <div className="flex flex-wrap gap-6">
                        {Object.keys(picksByYear[year])
                          .sort((a, b) => parseInt(a) - parseInt(b))
                          .map(round => (
                            <div key={round} className="bg-white/10 rounded px-4 py-2 text-white/90 font-semibold min-w-[120px]">
                              <div className="text-[#1FDDFF] font-bold mb-1">Round {round}</div>
                              <ul className="list-disc list-inside text-left mx-auto" style={{ maxWidth: 400 }}>
                                {picksByYear[year][round]
                                  .filter(pick => !showMineOnly || (myRosterId && pick.owner_id === myRosterId))
                                  .map((pick, idx) => {
                                    const isMine = myRosterId && pick.owner_id === myRosterId;
                                    return (
                                      <li key={idx} style={isMine ? { color: '#FF4B1F', fontWeight: 'bold' } : {}}>
                                        Pick {pick.pick_no || pick.pick_id || '-'}
                                        {pick.owner_id ? (
                                          <span className="ml-2" style={isMine ? { color: '#FF4B1F' } : { color: 'rgba(255,255,255,0.6)' }}>
                                            Owner: {rosterIdToDisplayName[pick.owner_id] || pick.owner_id}
                                          </span>
                                        ) : null}
                                        {pick.original_owner_id && pick.owner_id !== pick.original_owner_id ? (
                                          <span className="ml-2 text-white/60 text-xs">
                                            (Originally from {rosterIdToDisplayName[pick.original_owner_id] || pick.original_owner_id})
                                          </span>
                                        ) : null}
                                      </li>
                                    );
                                  })}
                              </ul>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}