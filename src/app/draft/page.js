'use client';
import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function DraftPage() {
  // State declarations
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [leagueId, setLeagueId] = useState(null);
  const [draftInfo, setDraftInfo] = useState(null);
  const [draftPicks, setDraftPicks] = useState([]);
  const [tradedPicks, setTradedPicks] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]); // For storing detailed trade history
  const [pastDrafts, setPastDrafts] = useState([]);
  const [rosters, setRosters] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('draft-order');
  const [selectedTradePick, setSelectedTradePick] = useState(null); // For trade details modal
  const [selectedTeam, setSelectedTeam] = useState(null); // For team picks details modal
  const [draftOrder, setDraftOrder] = useState([]); // For storing the actual draft order

  // Sleeper User ID - this should be your league commissioner's Sleeper ID
  const USER_ID = '456973480269705216';

  // First, find the correct BBB league
  useEffect(() => {
    async function findBBBLeague() {
      try {
        console.log('Starting league search...');
        setLoading(true);
        
        // Get current NFL season
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        if (!seasonResponse.ok) throw new Error('Failed to fetch NFL state');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;
        console.log('Current NFL season:', currentSeason);
        
        // Get user's leagues for the current season
        console.log('Fetching leagues for user:', USER_ID);
        const userLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${currentSeason}`);
        if (!userLeaguesResponse.ok) throw new Error('Failed to fetch user leagues');
        const userLeagues = await userLeaguesResponse.json();
        console.log('Found', userLeagues.length, 'leagues for current season');
        
        // Try more flexible matching for "Budget Blitz Bowl" in current season
        let bbbLeagues = userLeagues.filter(league => 
          league.name && (
            league.name.includes('Budget Blitz Bowl') || 
            league.name.includes('budget blitz bowl') ||
            league.name.includes('BBB') ||
            (league.name.toLowerCase().includes('budget') && 
            league.name.toLowerCase().includes('blitz'))
          )
        );
        
        console.log('Budget Blitz Bowl leagues found in current season:', bbbLeagues.length);
        
        // If no matching leagues found in current season, try previous season
        if (bbbLeagues.length === 0) {
          console.log('No matching leagues found in current season, trying previous season');
          const prevSeason = (parseInt(currentSeason) - 1).toString();
          const prevSeasonResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${prevSeason}`);
          
          if (prevSeasonResponse.ok) {
            const prevSeasonLeagues = await prevSeasonResponse.json();
            console.log('Previous season leagues found:', prevSeasonLeagues.length);
            
            // Search for Budget Blitz Bowl in previous season leagues
            const prevBBBLeagues = prevSeasonLeagues.filter(league => 
              league.name && (
                league.name.includes('Budget Blitz Bowl') || 
                league.name.includes('budget blitz bowl') ||
                league.name.includes('BBB') ||
                (league.name.toLowerCase().includes('budget') && 
                league.name.toLowerCase().includes('blitz'))
              )
            );
            
            console.log('Budget Blitz Bowl leagues found in previous season:', prevBBBLeagues.length);
            
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
        console.log('Selected league ID:', mostRecentLeague.league_id, 'Name:', mostRecentLeague.name);
        setLeagueId(mostRecentLeague.league_id);
      } catch (err) {
        console.error('Error finding BBB league:', err);
        setError(err.message);
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
        console.log('Fetching data for league ID:', leagueId);
        
        // Fetch league users
        const usersResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
        if (!usersResponse.ok) throw new Error('Failed to fetch users');
        const usersData = await usersResponse.json();
        setUsers(usersData);
        console.log('Users fetched:', usersData.length);
        
        // Fetch rosters
        const rostersResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
        if (!rostersResponse.ok) throw new Error('Failed to fetch rosters');
        const rostersData = await rostersResponse.json();
        setRosters(rostersData);
        console.log('Rosters fetched:', rostersData.length);
        
        // Fetch traded picks
        const tradedPicksResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`);
        if (!tradedPicksResponse.ok) throw new Error('Failed to fetch traded picks');
        const tradedPicksData = await tradedPicksResponse.json();
        setTradedPicks(tradedPicksData);
        console.log('Traded picks fetched:', tradedPicksData.length);
        
        // Fetch all drafts for this league
        const draftsResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/drafts`);
        if (!draftsResponse.ok) throw new Error('Failed to fetch drafts');
        const draftsData = await draftsResponse.json();
        console.log('Drafts fetched:', draftsData.length);
        
        // Process past drafts
        const processedDrafts = [];
        
        for (const draft of draftsData) {
          // Fetch draft picks for each past draft
          try {
            const picksResponse = await fetch(`https://api.sleeper.app/v1/draft/${draft.draft_id}/picks`);
            if (picksResponse.ok) {
              const picksData = await picksResponse.json();
              processedDrafts.push({
                ...draft,
                picks: picksData
              });
            }
          } catch (picksError) {
            console.warn(`Error fetching picks for draft ${draft.draft_id}:`, picksError);
          }
        }
        
        setPastDrafts(processedDrafts);
        
        // If there's an upcoming draft, fetch detailed info
        const upcomingDraft = draftsData.find(draft => draft.status === 'pre_draft');
        if (upcomingDraft) {
          setDraftInfo(upcomingDraft);
          console.log('Upcoming draft found:', upcomingDraft.draft_id);
          
          // For upcoming drafts, we might not have picks yet
          try {
            const picksResponse = await fetch(`https://api.sleeper.app/v1/draft/${upcomingDraft.draft_id}/picks`);
            if (picksResponse.ok) {
              const picksData = await picksResponse.json();
              setDraftPicks(picksData);
              console.log('Draft picks fetched:', picksData.length);
            }
          } catch (picksError) {
            console.warn('Error fetching picks for upcoming draft:', picksError);
            // This is expected for pre-draft status
          }

          // Process the draft order
          if (upcomingDraft.draft_order) {
            // Create an ordered array of draft slots
            const draftOrderArray = Object.entries(upcomingDraft.draft_order).map(([userId, slot]) => ({
              userId,
              slot,
              teamName: usersData.find(u => u.user_id === userId)?.display_name || `Unknown Team`,
              rosterId: rostersData.find(r => r.owner_id === userId)?.roster_id
            }));
            
            // Sort by slot
            const sortedDraftOrder = draftOrderArray.sort((a, b) => a.slot - b.slot);
            setDraftOrder(sortedDraftOrder);
            console.log('Draft order processed:', sortedDraftOrder);
          }
        } else {
          console.log('No upcoming draft found');
        }
        
        // Fetch transactions to get trade history
        // Note: We'll need to iterate through weeks to get a complete history
        const tradeTransactions = [];
        
        try {
          // We'll fetch transactions for the first several weeks to find trades
          for (let week = 1; week <= 17; week++) {
            const transactionsResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`);
            if (!transactionsResponse.ok) continue;
            
            const transactionsData = await transactionsResponse.json();
            const trades = transactionsData.filter(transaction => 
              transaction.type === 'trade' && transaction.status === 'complete'
            );
            
            tradeTransactions.push(...trades);
          }
          
          console.log('Trade transactions fetched:', tradeTransactions.length);
          setTradeHistory(tradeTransactions);
        } catch (transactionsError) {
          console.warn('Error fetching transactions:', transactionsError);
          // Continue even if we can't get trade history
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching draft data:', err);
        setError(err.message);
        setLoading(false);
      }
    }
    
    fetchDraftData();
  }, [leagueId]);

  // Helper function to get team name by roster_id
  const getTeamName = (rosterId) => {
    const roster = rosters.find(r => r.roster_id === parseInt(rosterId));
    if (!roster || !roster.owner_id) return `Team ${rosterId}`;
    
    const user = users.find(u => u.user_id === roster.owner_id);
    return user?.display_name || user?.metadata?.team_name || `Team ${rosterId}`;
  };

  // Helper function to get roster_id by team name
  const getRosterIdByTeamName = (teamName) => {
    const user = users.find(u => u.display_name === teamName || u.metadata?.team_name === teamName);
    if (!user) return null;
    
    const roster = rosters.find(r => r.owner_id === user.user_id);
    return roster?.roster_id || null;
  };

  // Helper function to format draft pick
  const formatPickNumber = (round, pick) => {
    return `${round}.${String(pick).padStart(2, '0')}`;
  };

  // Function to get rookie salary based on pick NUMBER, not roster_id
  const getRookieSalary = (round, pickPosition) => {
    // First round has specific values based on pick position
    if (round === 1) {
      if (pickPosition === 1) return 14;
      if (pickPosition >= 2 && pickPosition <= 3) return 12;
      if (pickPosition >= 4 && pickPosition <= 6) return 10;
      if (pickPosition >= 7 && pickPosition <= 9) return 8;
      if (pickPosition >= 10) return 6;
    }
    // Second round
    else if (round === 2) {
      return 4;
    }
    // Third round
    else if (round === 3) {
      return 2;
    }
    // Fourth through seventh rounds
    else if (round >= 4 && round <= 7) {
      return 1;
    }
    // Default case for any other rounds
    else {
      return 0;
    }
  };
  
  // Helper function to determine pick position based on roster_id and draft order
  const getPickPositionInRound = (round, rosterId) => {
    // If we have a draft order, use it
    if (draftOrder.length > 0) {
      const position = draftOrder.findIndex(item => item.rosterId === parseInt(rosterId)) + 1;
      return position > 0 ? position : (parseInt(rosterId) || 1); // Fallback to roster_id if not found
    }
    
    // Otherwise fall back to roster_id as a proxy (not ideal, but better than nothing)
    return parseInt(rosterId) || 1;
  };
  
  // Helper function to estimate draft positions from traded picks
  const estimateDraftPositions = () => {
    // Group picks by team
    const teamPicks = {};
    const currentYear = new Date().getFullYear().toString();
    
    // Initialize team picks based on rosters
    rosters.forEach(roster => {
      const teamName = getTeamName(roster.roster_id);
      teamPicks[teamName] = {
        originalPicks: [],
        currentPicks: []
      };
    });
    
    // Add original picks (each team gets one per round)
    rosters.forEach(roster => {
      const teamName = getTeamName(roster.roster_id);
      const rounds = draftInfo?.settings?.rounds || 5;
      
      for (let round = 1; round <= rounds; round++) {
        // Get pick position based on draft order (for first round primarily)
        const pickPosition = getPickPositionInRound(round, roster.roster_id);
        
        // Format pick number for display (e.g. "1.01")
        const pickNumber = formatPickNumber(round, pickPosition);
        
        teamPicks[teamName].originalPicks.push({
          round,
          pickPosition,
          pickNumber,
          originalOwner: teamName,
          currentOwner: teamName,
          salary: getRookieSalary(round, pickPosition)
        });
      }
    });
    
    // Update with traded picks
    tradedPicks.filter(pick => pick.season === currentYear).forEach(pick => {
      const originalOwner = getTeamName(pick.roster_id);
      const currentOwner = getTeamName(pick.owner_id);
      
      // Find the pick in the original owner's picks
      const originalOwnerPicks = teamPicks[originalOwner].originalPicks;
      const pickIndex = originalOwnerPicks.findIndex(p => 
        p.round === pick.round && p.currentOwner === originalOwner
      );
      
      if (pickIndex !== -1) {
        // Update the current owner while preserving pick position
        originalOwnerPicks[pickIndex].currentOwner = currentOwner;
      }
    });
    
    // Reorganize by current ownership
    rosters.forEach(roster => {
      const teamName = getTeamName(roster.roster_id);
      teamPicks[teamName].currentPicks = [];
    });
    
    // Gather all picks for their current owners
    Object.values(teamPicks).forEach(team => {
      team.originalPicks.forEach(pick => {
        if (teamPicks[pick.currentOwner]) {
          teamPicks[pick.currentOwner].currentPicks.push(pick);
        }
      });
    });
    
    return teamPicks;
  };

  // Render the draft order tab
  const renderDraftOrder = () => {
    if (!draftInfo || !draftOrder || draftOrder.length === 0) {
      return (
        <div className="bg-black/20 p-6 rounded-lg text-center">
          <h3 className="text-xl font-bold mb-4">Draft Order Not Yet Determined</h3>
          <p className="text-white/70">The draft order for the upcoming rookie draft has not been set yet. Check back closer to the draft date.</p>
          <p className="mt-4 font-semibold">Draft Date: May 1st</p>
        </div>
      );
    }
    
    return (
      <div className="bg-black/20 p-6 rounded-lg">
        <h3 className="text-xl font-bold mb-4">Rookie Draft Order</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-2 text-left">Pick</th>
                <th className="py-2 text-left">Team</th>
              </tr>
            </thead>
            <tbody>
              {draftOrder.length > 0 ? (
                draftOrder.map((entry, index) => (
                  <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-3 font-bold text-[#FF4B1F]">{entry.slot}</td>
                    <td className="py-3">{entry.teamName}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="2" className="py-4 text-center text-white/70">
                    Draft order not yet determined.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render the traded picks tab with clickable rows and trade details
  const renderTradedPicks = () => {
    const currentYear = new Date().getFullYear();
    const futureYears = [currentYear.toString(), (currentYear + 1).toString(), (currentYear + 2).toString()];
    
    // Group by year and round, then sort by original owner
    const picksByYear = {};
    futureYears.forEach(year => {
      // First filter by year
      const yearPicks = tradedPicks.filter(pick => pick.season === year);
      
      // Group by round
      const roundsInYear = Array.from(new Set(yearPicks.map(pick => pick.round)))
        .sort((a, b) => a - b); // Sort rounds numerically
      
      picksByYear[year] = roundsInYear.map(round => {
        // Get all picks for this round and sort by original owner name
        const roundPicks = yearPicks.filter(pick => pick.round === round)
          .sort((a, b) => {
            const teamA = getTeamName(a.roster_id).toLowerCase();
            const teamB = getTeamName(b.roster_id).toLowerCase();
            return teamA.localeCompare(teamB);
          });
        
        return {
          round,
          picks: roundPicks
        };
      });
    });
    
    // Find trade details for a given pick
    const findTradeForPick = (pick) => {
      // Look through trade history for this pick
      return tradeHistory.find(trade => 
        trade.draft_picks && trade.draft_picks.some(draftPick => 
          draftPick.season === pick.season && 
          draftPick.round === pick.round && 
          draftPick.roster_id === pick.roster_id &&
          draftPick.owner_id === pick.owner_id
        )
      );
    };
    
    // Format trade date
    const formatTradeDate = (timestamp) => {
      if (!timestamp) return 'Unknown';
      return new Date(timestamp).toLocaleDateString();
    };
    
    // Render trade details modal
    const renderTradeDetailsModal = () => {
      if (!selectedTradePick) return null;
      
      const trade = findTradeForPick(selectedTradePick);
      
      return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#001A2B] border border-white/10 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#001A2B] border-b border-white/10 p-4 flex justify-between items-center">
              <h3 className="text-xl font-bold text-[#FF4B1F]">Trade Details</h3>
              <button 
                onClick={() => setSelectedTradePick(null)}
                className="text-white/70 hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-4">
              <div className="mb-6">
                <div className="text-white/70 mb-1">Pick</div>
                <div className="text-xl font-bold">
                  Round {selectedTradePick.round} ({selectedTradePick.season})
                </div>
                <div className="flex flex-col sm:flex-row sm:gap-2 mt-2">
                  <div>
                    <span className="text-white/70">Original Owner:</span>{' '}
                    <span className="font-medium">{getTeamName(selectedTradePick.roster_id)}</span>
                  </div>
                  <div className="hidden sm:block text-white/70">→</div>
                  <div>
                    <span className="text-white/70">Current Owner:</span>{' '}
                    <span className="font-medium">{getTeamName(selectedTradePick.owner_id)}</span>
                  </div>
                </div>
              </div>
              
              {trade ? (
                <>
                  <div className="mb-4">
                    <div className="text-white/70 mb-1">Trade Date</div>
                    <div>{formatTradeDate(trade.created)}</div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    {trade.roster_ids.map((rosterId, rosterIndex) => (
                      <div key={rosterIndex} className="bg-black/20 p-4 rounded-lg">
                        <h4 className="font-bold mb-3 text-[#FF4B1F]">{getTeamName(rosterId)} Received</h4>
                        
                        {/* Display draft picks received */}
                        {trade.draft_picks.filter(pick => pick.owner_id === rosterId).length > 0 && (
                          <div className="mb-3">
                            <div className="text-white/70 mb-1">Draft Picks</div>
                            <ul className="space-y-1">
                              {trade.draft_picks.filter(pick => pick.owner_id === rosterId).map((pick, pickIndex) => (
                                <li key={pickIndex} className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-[#FF4B1F]" />
                                  <span>{getTeamName(pick.roster_id)}'s Round {pick.round} ({pick.season})</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Display players received - if we had player data */}
                        {trade.adds && Object.entries(trade.adds).filter(([playerId, teamId]) => teamId === rosterId).length > 0 && (
                          <div>
                            <div className="text-white/70 mb-1">Players</div>
                            <div className="italic text-white/50">Player data not available</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="bg-black/20 p-4 rounded-lg text-center">
                  <div className="text-white/70">
                    Detailed trade information is not available for this pick.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };
    
    return (
      <div className="bg-black/20 p-6 rounded-lg">
        <h3 className="text-xl font-bold mb-4">Traded Draft Picks</h3>
        
        {tradedPicks.length === 0 ? (
          <div className="text-center text-white/70 py-4">
            No traded picks found.
          </div>
        ) : (
          <div className="space-y-6">
            {futureYears.map(year => (
              <div key={year}>
                <h4 className="text-lg font-semibold mb-3 text-[#FF4B1F]">{year} Draft</h4>
                
                {picksByYear[year] && picksByYear[year].length > 0 ? (
                  <div className="space-y-4">
                    {picksByYear[year].map(roundData => (
                      <div key={`round-${roundData.round}`} className="bg-black/10 p-4 rounded-lg">
                        <h5 className="font-medium mb-3">Round {roundData.round}</h5>
                        
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="border-b border-white/10">
                                <th className="py-2 text-left">Original Owner</th>
                                <th className="py-2 text-left">Current Owner</th>
                                <th className="py-2 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {roundData.picks.map((pick, index) => (
                                <tr 
                                  key={index} 
                                  className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                                  onClick={() => setSelectedTradePick(pick)}
                                >
                                  <td className="py-3">{getTeamName(pick.roster_id)}</td>
                                  <td className="py-3">{getTeamName(pick.owner_id)}</td>
                                  <td className="py-3 text-right">
                                    <button 
                                      className="text-[#FF4B1F] hover:underline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTradePick(pick);
                                      }}
                                    >
                                      View Trade
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-white/70 py-4 bg-black/10 rounded">
                    No traded picks found for {year}.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        {renderTradeDetailsModal()}
      </div>
    );
  };

  // Render the past drafts tab
  const renderPastDrafts = () => {
    if (pastDrafts.length === 0) {
      return (
        <div className="bg-black/20 p-6 rounded-lg text-center">
          <h3 className="text-xl font-bold mb-4">No Draft History Available</h3>
          <p className="text-white/70">There is no draft history available yet.</p>
        </div>
      );
    }
    
    // Sort drafts by date (newest first)
    const sortedDrafts = [...pastDrafts].sort((a, b) => b.created - a.created);
    
    return (
      <div className="bg-black/20 p-6 rounded-lg">
        <h3 className="text-xl font-bold mb-6">Past Drafts</h3>
        
        <div className="space-y-8">
          {sortedDrafts.map((draft, draftIndex) => (
            <div key={draft.draft_id} className="border border-white/10 rounded-lg overflow-hidden">
              <div className="bg-black/30 p-4">
                <h4 className="text-lg font-bold">{draft.season} {draft.metadata?.name || 'Draft'}</h4>
                <div className="text-sm text-white/70">
                  {new Date(draft.created).toLocaleDateString()} • {draft.picks?.length || 0} selections
                </div>
              </div>
              
              {draft.picks && draft.picks.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-black/20">
                        <th className="py-2 px-3 text-left">Pick</th>
                        <th className="py-2 px-3 text-left">Team</th>
                        <th className="py-2 px-3 text-left">Player</th>
                        <th className="py-2 px-3 text-left">Position</th>
                        <th className="py-2 px-3 text-left">NFL Team</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.picks.slice(0, 12).map((pick, index) => (
                        <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-3 px-3 font-bold text-[#FF4B1F]">
                            {formatPickNumber(pick.round, pick.pick_no)}
                          </td>
                          <td className="py-3 px-3">
                            {getTeamName(pick.roster_id)}
                          </td>
                          <td className="py-3 px-3 font-medium">
                            {pick.metadata?.first_name} {pick.metadata?.last_name}
                          </td>
                          <td className="py-3 px-3">
                            {pick.metadata?.position}
                          </td>
                          <td className="py-3 px-3">
                            {pick.metadata?.team}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 text-center text-white/70">
                  No pick data available for this draft.
                </div>
              )}
              
              {draft.picks && draft.picks.length > 12 && (
                <div className="p-4 text-center">
                  <button className="text-[#FF4B1F] hover:underline">
                    View Full Draft Results
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render team picks detail modal
  const renderTeamPicksModal = () => {
    if (!selectedTeam) return null;

    const teamPicks = estimateDraftPositions()[selectedTeam];
    const totalObligation = teamPicks.currentPicks.reduce((sum, pick) => sum + pick.salary, 0);

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-[#001A2B] border border-white/10 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
          <div className="sticky top-0 bg-[#001A2B] border-b border-white/10 p-4 flex justify-between items-center">
            <h3 className="text-xl font-bold text-[#FF4B1F]">{selectedTeam} Draft Picks</h3>
            <button 
              onClick={() => setSelectedTeam(null)}
              className="text-white/70 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="p-4">
            <div className="mb-6 p-4 bg-black/20 rounded-lg">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                <div>
                  <h4 className="text-lg font-semibold">Draft Capital Summary</h4>
                  <p className="text-white/70">Showing all picks currently owned by {selectedTeam}</p>
                </div>
                <div className="mt-4 md:mt-0 text-right">
                  <div className="text-white/70">Total Cap Obligation:</div>
                  <div className="text-2xl font-bold text-green-400">${totalObligation}</div>
                </div>
              </div>
            </div>
            
            {teamPicks.currentPicks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-black/20 border-b border-white/10">
                      <th className="py-3 px-4 text-left">Pick</th>
                      <th className="py-3 px-4 text-left">Original Owner</th>
                      <th className="py-3 px-4 text-left">Pick Type</th>
                      <th className="py-3 px-4 text-right">Salary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamPicks.currentPicks
                      .sort((a, b) => {
                        // First sort by round
                        if (a.round !== b.round) return a.round - b.round;
                        // Then by original owner
                        return a.originalOwner.localeCompare(b.originalOwner);
                      })
                      .map((pick, index) => (
                        <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-3 px-4 font-semibold">{pick.pickNumber}</td>
                          <td className="py-3 px-4">{pick.originalOwner}</td>
                          <td className="py-3 px-4">
                            {pick.originalOwner === selectedTeam ? (
                              <span className="text-blue-400">Own Pick</span>
                            ) : (
                              <span className="text-yellow-400">Acquired via Trade</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-green-400">${pick.salary}</td>
                        </tr>
                      ))
                    }
                    <tr className="bg-black/30 font-bold">
                      <td colSpan="3" className="py-3 px-4 text-right">Total Cap Obligation:</td>
                      <td className="py-3 px-4 text-right text-green-400">${totalObligation}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-white/70 bg-black/10 rounded-lg">
                No draft picks currently owned by {selectedTeam}.
              </div>
            )}
            
            <div className="mt-6 text-sm text-white/70">
              <h5 className="font-semibold mb-1">Notes:</h5>
              <ul className="list-disc pl-6">
                <li>First round pick salaries vary based on draft position</li>
                <li>1.01: $14 | 1.02-1.03: $12 | 1.04-1.06: $10 | 1.07-1.09: $8 | 1.10-1.12: $6</li>
                <li>Second round picks cost $4</li>
                <li>Third round picks cost $2</li>
                <li>All other round picks cost $1</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render the rookie salaries tab
  const renderRookieSalaries = () => {
    const teamPicks = estimateDraftPositions();
    
    // Calculate total salary obligations
    const teamObligations = {};
    Object.entries(teamPicks).forEach(([teamName, picks]) => {
      const totalSalary = picks.currentPicks.reduce((sum, pick) => sum + pick.salary, 0);
      teamObligations[teamName] = totalSalary;
    });
    
    // Sort teams by name
    const sortedTeams = Object.keys(teamObligations).sort();
    
    return (
      <div className="bg-black/20 p-6 rounded-lg">
        <h3 className="text-xl font-bold mb-6">Rookie Salary Cap Obligations</h3>
        <p className="mb-6 text-white/70">
          This table shows the estimated salary cap commitments for each team based on their current draft picks.
          First round pick salaries are determined by draft position, while later rounds have fixed values.
          Click on any team to see a detailed breakdown of their picks.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Rookie Salary Table */}
          <div>
            <h4 className="text-lg font-semibold mb-3">Team Obligations</h4>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2 text-left">Team</th>
                    <th className="py-2 text-right">Total Obligation</th>
                    <th className="py-2 text-right">Draft Picks</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTeams.map((teamName, index) => (
                    <tr 
                      key={index} 
                      className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                      onClick={() => setSelectedTeam(teamName)}
                    >
                      <td className="py-3 font-medium">{teamName}</td>
                      <td className="py-3 text-right font-bold text-green-400">${teamObligations[teamName]}</td>
                      <td className="py-3 text-right">{teamPicks[teamName].currentPicks.length}</td>
                      <td className="py-3 text-right">
                        <button 
                          className="text-[#FF4B1F] hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTeam(teamName);
                          }}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Rookie Salary Scale */}
          <div>
            <h4 className="text-lg font-semibold mb-3">Rookie Salary Scale</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-500/20 p-4 rounded-lg">
                <h5 className="font-bold mb-2 text-blue-400">First Round</h5>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>1.01</span>
                    <span className="font-medium">$14</span>
                  </div>
                  <div className="flex justify-between">
                    <span>1.02-1.03</span>
                    <span className="font-medium">$12</span>
                  </div>
                  <div className="flex justify-between">
                    <span>1.04-1.06</span>
                    <span className="font-medium">$10</span>
                  </div>
                  <div className="flex justify-between">
                    <span>1.07-1.09</span>
                    <span className="font-medium">$8</span>
                  </div>
                  <div className="flex justify-between">
                    <span>1.10-1.12</span>
                    <span className="font-medium">$6</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-green-500/20 p-4 rounded-lg">
                <h5 className="font-bold mb-2 text-green-400">Second Round</h5>
                <div className="flex justify-between">
                  <span>All picks</span>
                  <span className="font-medium">$4</span>
                </div>
              </div>
              
              <div className="bg-yellow-500/20 p-4 rounded-lg">
                <h5 className="font-bold mb-2 text-yellow-500">Third Round</h5>
                <div className="flex justify-between">
                  <span>All picks</span>
                  <span className="font-medium">$2</span>
                </div>
              </div>
              
              <div className="bg-purple-500/20 p-4 rounded-lg col-span-3">
                <h5 className="font-bold mb-2 text-purple-400">Fourth through Seventh Rounds</h5>
                <div className="flex justify-between">
                  <span>All picks</span>
                  <span className="font-medium">$1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Team-by-Team Breakdown */}
        <div className="mt-8">
          <h4 className="text-lg font-semibold mb-3">Team-by-Team Breakdown</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedTeams.map((teamName, index) => (
              <div 
                key={index} 
                className="bg-black/30 p-4 rounded-lg border border-white/10 hover:border-[#FF4B1F]/30 transition-colors cursor-pointer"
                onClick={() => setSelectedTeam(teamName)}
              >
                <h5 className="font-bold mb-2 flex justify-between items-center">
                  <span>{teamName}</span>
                  <button className="text-xs text-[#FF4B1F] hover:underline">Details</button>
                </h5>
                <div className="text-sm mb-2">
                  <span className="text-white/70">Total Obligation:</span>{' '}
                  <span className="font-bold text-green-400">${teamObligations[teamName]}</span>
                </div>
                
                {teamPicks[teamName].currentPicks.length > 0 ? (
                  <div className="space-y-1 text-sm">
                    {teamPicks[teamName].currentPicks
                      .sort((a, b) => a.round !== b.round ? a.round - b.round : a.originalOwner.localeCompare(b.originalOwner))
                      .map((pick, pickIndex) => (
                        <div key={pickIndex} className="flex justify-between">
                          <span>{pick.pickNumber} ({pick.originalOwner !== teamName ? `via ${pick.originalOwner}` : 'Own'})</span>
                          <span className="font-medium">${pick.salary}</span>
                        </div>
                      ))
                    }
                  </div>
                ) : (
                  <div className="text-white/50 italic">No draft picks</div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Render the team picks detail modal */}
        {renderTeamPicksModal()}
      </div>
    );
  };

  // Render loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#001A2B] text-white p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-[#FF4B1F] mb-4">Draft Center</h1>
          <div className="bg-red-500/20 border border-red-500/50 text-white p-4 rounded-lg">
            <h2 className="text-xl font-bold mb-2">Error Loading Draft Data</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className="bg-black/30 p-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className="h-16 w-16 transition-transform hover:scale-105"
            />
            <h1 className="text-3xl font-bold text-[#FF4B1F]">Draft Center</h1>
          </div>
          
          <div className="hidden md:block">
            <div className="text-white/70">
              Next Rookie Draft: <span className="font-bold text-white">May 1st, 2025</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Draft Info Banner */}
        <div className="bg-gradient-to-r from-[#FF4B1F]/20 to-transparent p-6 rounded-lg mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">2025 Rookie Draft</h2>
              <p className="text-white/70">
                The annual rookie draft is a critical opportunity to acquire young talent at rookie contract prices. 
                Choose wisely as these players could be cornerstone pieces of your franchise.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center bg-black/30 p-3 rounded-lg min-w-[100px]">
                <div className="text-xs text-white/70">Draft Date</div>
                <div className="font-bold text-lg">MAY 1</div>
              </div>
              <div className="text-center bg-black/30 p-3 rounded-lg min-w-[100px]">
                <div className="text-xs text-white/70">Rounds</div>
                <div className="font-bold text-lg">{draftInfo?.settings?.rounds || "---"}</div>
              </div>
              <div className="text-center bg-black/30 p-3 rounded-lg min-w-[100px]">
                <div className="text-xs text-white/70">Format</div>
                <div className="font-bold text-lg">{draftInfo?.type ? draftInfo.type.charAt(0).toUpperCase() + draftInfo.type.slice(1) : "---"}</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveTab('draft-order')}
            className={`px-4 py-2 rounded ${
              activeTab === 'draft-order' 
                ? 'bg-[#FF4B1F] text-white' 
                : 'bg-black/30 text-white/70 hover:bg-black/40'
            }`}
          >
            Draft Order
          </button>
          <button
            onClick={() => setActiveTab('traded-picks')}
            className={`px-4 py-2 rounded ${
              activeTab === 'traded-picks' 
                ? 'bg-[#FF4B1F] text-white' 
                : 'bg-black/30 text-white/70 hover:bg-black/40'
            }`}
          >
            Traded Picks
          </button>
          <button
            onClick={() => setActiveTab('past-drafts')}
            className={`px-4 py-2 rounded ${
              activeTab === 'past-drafts' 
                ? 'bg-[#FF4B1F] text-white' 
                : 'bg-black/30 text-white/70 hover:bg-black/40'
            }`}
          >
            Past Drafts
          </button>
          <button
            onClick={() => setActiveTab('rookie-salaries')}
            className={`px-4 py-2 rounded ${
              activeTab === 'rookie-salaries' 
                ? 'bg-[#FF4B1F] text-white' 
                : 'bg-black/30 text-white/70 hover:bg-black/40'
            }`}
          >
            Rookie Salaries
          </button>
        </div>
        
        {/* Active Tab Content */}
        {activeTab === 'draft-order' && renderDraftOrder()}
        {activeTab === 'traded-picks' && renderTradedPicks()}
        {activeTab === 'past-drafts' && renderPastDrafts()}
        {activeTab === 'rookie-salaries' && renderRookieSalaries()}
        
        {/* Additional Features Section */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-6 text-[#FF4B1F]">Draft Resources</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-black/30 p-6 rounded-lg border border-white/10 hover:border-[#FF4B1F]/50 transition-colors">
              <h3 className="text-xl font-bold mb-3">Prospect Rankings</h3>
              <p className="text-white/70 mb-4">
                Research the top rookie prospects to prepare for your draft selections.
              </p>
              <a 
                href="https://www.fantasypros.com/nfl/rankings/rookies.php" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[#FF4B1F] hover:underline inline-flex items-center gap-1"
              >
                View Rankings
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
            
            <div className="bg-black/30 p-6 rounded-lg border border-white/10 hover:border-[#FF4B1F]/50 transition-colors">
              <h3 className="text-xl font-bold mb-3">Mock Draft Tool</h3>
              <p className="text-white/70 mb-4">
                Practice different draft strategies with our mock draft simulator.
              </p>
              <span className="text-[#FF4B1F]/50 inline-flex items-center gap-1">
                Coming Soon
              </span>
            </div>
            
            <div className="bg-black/30 p-6 rounded-lg border border-white/10 hover:border-[#FF4B1F]/50 transition-colors">
              <h3 className="text-xl font-bold mb-3">Trade Calculator</h3>
              <p className="text-white/70 mb-4">
                Evaluate potential draft pick trades using our trade calculator.
              </p>
              <a 
                href="/trade" 
                className="text-[#FF4B1F] hover:underline inline-flex items-center gap-1"
              >
                Open Calculator
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
        
        {/* Draft Strategy Tips */}
        <div className="mt-8 bg-black/30 p-6 rounded-lg border border-white/10">
          <h2 className="text-2xl font-bold mb-4 text-[#FF4B1F]">Rookie Draft Strategy Tips</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-bold mb-2">Salary Cap Considerations</h3>
              <p className="text-white/70">
                Rookie contracts are some of the most cost-effective options in a salary cap league. 
                Consider your cap situation when deciding between immediate contributors and long-term development projects.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-bold mb-2">Draft for Value</h3>
              <p className="text-white/70">
                In dynasty leagues, it's often better to draft the best player available rather than drafting for need. 
                Use the pick value chart to help maximize the return on your draft capital.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-bold mb-2">Trading Draft Picks</h3>
              <p className="text-white/70">
                Trading up can help you secure elite talent, while trading down can help you acquire more shots at finding value. 
                Consider the depth of the rookie class at positions of need when making trades.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-bold mb-2">Landing Spot Matters</h3>
              <p className="text-white/70">
                A player's NFL team significantly impacts their fantasy value. 
                Consider opportunity, coaching staff, offensive scheme, and surrounding talent when evaluating rookies.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}