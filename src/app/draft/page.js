'use client';
import React, { useState, useEffect } from 'react';
import { getTeamName } from '@/utils/draftUtils';

// Import components
import DraftHeader from '@/components/draft/DraftHeader';
import DraftTabs from '@/components/draft/DraftTabs';
import DraftOrder from '@/components/draft/DraftOrder';
import TradedPicks from '@/components/draft/TradedPicks';
import PastDrafts from '@/components/draft/PastDrafts';
import RookieSalaries from '@/components/draft/RookieSalaries';
import MockDraft from '@/components/draft/MockDraft';
import DraftResources from '@/components/draft/DraftResources';
import DraftStrategyTips from '@/components/draft/DraftStrategyTips';

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
  const [draftOrder, setDraftOrder] = useState([]); // For storing the actual draft order
  const [isMobile, setIsMobile] = useState(false);

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

  // Helper function for components to get team names
  const getTeamNameWrapper = (rosterId) => {
    return getTeamName(rosterId, rosters, users);
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
      {/* Header and banner */}
      <DraftHeader draftInfo={draftInfo} />
      
      <div className={`max-w-7xl mx-auto ${isMobile ? 'p-2' : 'p-6'}`}>
        {/* Tab navigation */}
        <div className={isMobile ? 'overflow-x-auto' : ''}>
          <DraftTabs activeTab={activeTab} setActiveTab={setActiveTab} isMobile={isMobile} />
        </div>
        
        {/* Active Tab Content */}
        <div className={isMobile ? 'mt-2' : 'mt-6'}>
          {activeTab === 'draft-order' && 
            <DraftOrder draftInfo={draftInfo} draftOrder={draftOrder} isMobile={isMobile} />}
          
          {activeTab === 'traded-picks' && 
            <TradedPicks tradedPicks={tradedPicks} tradeHistory={tradeHistory} users={users} rosters={rosters} isMobile={isMobile} />}
          
          {activeTab === 'past-drafts' && 
            <PastDrafts pastDrafts={pastDrafts} getTeamName={getTeamNameWrapper} isMobile={isMobile} />}
          
          {activeTab === 'rookie-salaries' && 
            <RookieSalaries 
              rosters={rosters} 
              tradedPicks={tradedPicks} 
              draftInfo={draftInfo} 
              draftOrder={draftOrder} 
              getTeamName={getTeamNameWrapper}
              isMobile={isMobile}
            />}
          
          {activeTab === 'mock-draft' && 
            <MockDraft 
              rosters={rosters}
              users={users}
              draftInfo={draftInfo}
              draftOrder={draftOrder}
              isMobile={isMobile}
            />}
        </div>
        
        {/* Additional sections - only show on certain tabs */}
        {(activeTab === 'draft-order' || activeTab === 'rookie-salaries') && (
          <div className={isMobile ? 'mt-2' : 'mt-6'}>
            <DraftResources isMobile={isMobile} />
            <DraftStrategyTips isMobile={isMobile} />
          </div>
        )}
      </div>
    </main>
  );
}