'use client';
import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import PositionSpendingChart from './PositionSpendingChart';
import FutureCapChart from './FutureCapChart';
import PlayerProfileModal from './PlayerProfileModal';

export default function MyTeam() {
  console.log("MyTeam component initialized");
  
  const { data: session, status } = useSession();
  const router = useRouter();
  
  console.log("Initial session and status:", { 
    status, 
    hasSession: !!session,
    userName: session?.user?.name,
    sleeperId: session?.user?.sleeperId
  });
  
  // States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teamData, setTeamData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [ktcValues, setKtcValues] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [contracts, setContracts] = useState([]);
  const [filterPosition, setFilterPosition] = useState('All');
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // Redirect if not logged in
  useEffect(() => {
    console.log("Auth status check useEffect triggered", { 
      status, 
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      isUnauthenticated: status === 'unauthenticated'
    });
    
    if (status === 'unauthenticated') {
      console.log("User not authenticated, redirecting to login");
      router.push('/login');
    }
  }, [status, router]);

  // Fetch team and player data
  useEffect(() => {
    console.log("Data fetch useEffect triggered", { 
      status, 
      hasSleeperID: !!session?.user?.sleeperId,
      sleeperId: session?.user?.sleeperId 
    });
    
    if (status === 'authenticated' && session?.user?.sleeperId) {
      console.log("Starting data fetching processes with sleeperId:", session.user.sleeperId);
      fetchTeamData();
      fetchPlayerContracts();
      fetchKtcValues();
    } else if (status === 'authenticated' && !session?.user?.sleeperId) {
      console.log("User is authenticated but has no Sleeper ID");
      setError("Your account doesn't have a Sleeper ID configured. Please contact an admin.");
      setLoading(false);
    }
  }, [session, status]);

  // Function to fetch team data from Sleeper API
  const fetchTeamData = async () => {
    console.log("fetchTeamData started");
    try {
      setLoading(true);
      
      // Get current NFL state
      console.log("Fetching NFL state");
      const stateResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
      if (!stateResponse.ok) {
        console.error("NFL state fetch failed", stateResponse.status);
        throw new Error('Failed to fetch NFL state');
      }
      const stateData = await stateResponse.json();
      console.log("NFL state fetched successfully", stateData);
      const currentSeason = stateData.season;
      
      // Get user's leagues
      console.log(`Fetching leagues for user ${session.user.sleeperId} and season ${currentSeason}`);
      const leaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${session.user.sleeperId}/leagues/nfl/${currentSeason}`);
      if (!leaguesResponse.ok) {
        console.error("Leagues fetch failed", leaguesResponse.status);
        throw new Error('Failed to fetch leagues');
      }
      const leagues = await leaguesResponse.json();
      console.log(`Found ${leagues.length} leagues for user`);
      
      // Find the BBB league
      console.log("Searching for BBB league among user's leagues");
      const bbbLeague = leagues.find(league => 
        league.name && (
          league.name.includes('Budget Blitz Bowl') || 
          league.name.includes('budget blitz bowl') ||
          league.name.includes('BBB') ||
          (league.name.toLowerCase().includes('budget') && 
          league.name.toLowerCase().includes('blitz'))
        )
      );
      
      if (!bbbLeague) {
        console.error("BBB League not found in user's leagues");
        throw new Error('BBB League not found');
      }
      console.log("BBB League found:", bbbLeague.name);
      
      // Get league rosters
      console.log(`Fetching rosters for league ${bbbLeague.league_id}`);
      const rostersResponse = await fetch(`https://api.sleeper.app/v1/league/${bbbLeague.league_id}/rosters`);
      if (!rostersResponse.ok) {
        console.error("Rosters fetch failed", rostersResponse.status);
        throw new Error('Failed to fetch rosters');
      }
      const rosters = await rostersResponse.json();
      console.log(`Found ${rosters.length} rosters in league`);
      
      // Find user's roster
      console.log(`Looking for roster with owner_id ${session.user.sleeperId}`);
      const userRoster = rosters.find(roster => roster.owner_id === session.user.sleeperId);
      if (!userRoster) {
        console.error("User's roster not found in league");
        throw new Error('Your roster not found in this league');
      }
      console.log("User's roster found", {
        roster_id: userRoster.roster_id,
        playerCount: userRoster.players?.length || 0
      });
      
      // Get all players data for reference
      console.log("Fetching all NFL players data");
      const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
      if (!playersResponse.ok) {
        console.error("Players fetch failed", playersResponse.status);
        throw new Error('Failed to fetch players');
      }
      const allPlayers = await playersResponse.json();
      console.log("All players data fetched successfully");
      
      // Process user's players
      console.log("Processing user's players");
      const userPlayers = userRoster.players?.map(playerId => {
        const playerData = allPlayers[playerId];
        return {
          id: playerId, // This is the key ID for matching
          name: playerData ? `${playerData.first_name} ${playerData.last_name}` : 'Unknown Player',
          position: playerData?.position || 'N/A',
          team: playerData?.team || 'N/A',
          number: playerData?.number || '',
          status: playerData?.status || 'Unknown',
          injuryStatus: playerData?.injury_status || '',
          age: playerData?.age || '',
          experience: playerData?.years_exp || 0
        };
      }) || [];
      
      console.log(`Processed ${userPlayers.length} players from user's roster`);
      
      console.log("Setting team data and players");
      setTeamData({
        league: bbbLeague,
        roster: userRoster,
      });
      
      setPlayers(userPlayers);
      console.log("Setting loading to false after successful data fetch");
      setLoading(false);
    } catch (err) {
      console.error('Error in fetchTeamData:', err);
      setError(err.message);
      console.log("Setting loading to false after error");
      setLoading(false);
    }
  };

  // Fetch player contracts from the CSV
  const fetchPlayerContracts = async () => {
    console.log("fetchPlayerContracts started");
    try {
      console.log("Fetching contracts CSV from GitHub");
      const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
      if (!response.ok) {
        console.error("Contracts CSV fetch failed", response.status);
        throw new Error('Failed to fetch contracts CSV');
      }
      const text = await response.text();
      console.log("Contracts CSV fetched successfully, parsing data");
      
      // Parse CSV
      const parseResult = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true // Convert numeric values automatically
      });
      
      if (parseResult.errors && parseResult.errors.length > 0) {
        console.warn("CSV parsing had errors:", parseResult.errors);
      }
      
      const data = parseResult.data;
      console.log(`Parsed ${data.length} contract records`);
      
      // Debug: Log the first contract to see structure
      if (data.length > 0) {
        console.log("First contract object structure:", JSON.stringify(data[0], null, 2));
        
        // Check for Player ID field
        if (data[0]['Player ID'] === undefined) {
          console.warn("Contract CSV missing 'Player ID' field");
          console.log("Available fields:", Object.keys(data[0]));
        } else {
          console.log("Player ID field found!");
        }
      }
      
      console.log("Contract CSV sample:", data.slice(0, 2));
      console.log("Current user:", session?.user);
      
      // Get the users from the league to find team ownership
      if (teamData && teamData.league) {
        console.log(`Fetching users for league ${teamData.league.league_id} to match team`);
        const usersResponse = await fetch(`https://api.sleeper.app/v1/league/${teamData.league.league_id}/users`);
        if (usersResponse.ok) {
          const users = await usersResponse.json();
          const currentUser = users.find(user => user.user_id === session.user.sleeperId);
          console.log("Current user in league:", currentUser);
          
          if (currentUser && currentUser.metadata && currentUser.metadata.team_name) {
            // Filter contracts by team name from Sleeper
            console.log(`Filtering contracts by team name: ${currentUser.metadata.team_name}`);
            const userContracts = data.filter(contract => {
              return contract.TeamDisplayName === currentUser.metadata.team_name;
            });
            
            console.log(`Found ${userContracts.length} contracts for user by team name match`);
            setContracts(userContracts);
            return;
          }
        } else {
          console.warn("Could not fetch league users:", usersResponse.status);
        }
      } else {
        console.log("No teamData available yet for team name matching");
      }
      
      // Fallback: try to match by username or display name
      console.log("Falling back to username matching for contracts");
      const userContracts = data.filter(contract => {
        // Try various matching strategies
        const username = session?.user?.name || '';
        console.log(`Trying to match contracts with username: ${username}`);
        
        return (
          // Direct match
          (contract.TeamDisplayName && contract.TeamDisplayName === username) ||
          // Case-insensitive match
          (contract.TeamDisplayName && contract.TeamDisplayName.toLowerCase() === username.toLowerCase()) ||
          // Try different fields
          (contract.TeamName && contract.TeamName.toLowerCase() === username.toLowerCase()) ||
          (contract.TeamOwner && contract.TeamOwner.toLowerCase() === username.toLowerCase())
        );
      });
      
      console.log(`Found ${userContracts.length} contracts for user by username match`);
      setContracts(userContracts);
    } catch (err) {
      console.error('Error fetching contract data:', err);
      // Don't set error as this isn't critical for the page to function
      console.log("Contract fetching failed but continuing");
    }
  };

  // Fetch KTC values
  const fetchKtcValues = async () => {
    console.log("fetchKtcValues started");
    try {
      console.log("Fetching KTC player values from GitHub");
      const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/Players.csv');
      if (!response.ok) {
        console.error("KTC CSV fetch failed", response.status);
        throw new Error('Failed to fetch KTC CSV');
      }
      const text = await response.text();
      console.log("KTC CSV fetched successfully, parsing data");
      
      // Parse CSV
      const parseResult = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true // Convert numeric values automatically
      });
      
      if (parseResult.errors && parseResult.errors.length > 0) {
        console.warn("CSV parsing had errors:", parseResult.errors);
      }
      
      const data = parseResult.data;
      console.log(`Parsed ${data.length} KTC value records`);
      
      // Debug: Log to check for PlayerID field
      if (data.length > 0) {
        console.log("First KTC data structure:", JSON.stringify(data[0], null, 2));
        
        // Check for PlayerID field
        if (data[0]['PlayerID'] === undefined) {
          console.warn("KTC CSV missing 'PlayerID' field");
          console.log("Available fields:", Object.keys(data[0]));
        } else {
          console.log("PlayerID field found in KTC data!");
        }
      }
      
      console.log("KTC CSV sample:", data.slice(0, 2));
      
      // Create a map of player IDs to KTC values
      console.log("Creating KTC value map by PlayerID");
      const ktcMap = {};
      data.forEach(player => {
        // Use the PlayerID field for mapping
        if (player.PlayerID) {
          ktcMap[player.PlayerID] = {
            value: player['KTC Value'] || 0,
            rank: player['Rank'] || 'N/A',
            positionRank: player['Position-Owner'] || 'N/A'
          };
        }
        
        // Also map by name as a fallback
        if (player.Name) {
          ktcMap[player.Name] = {
            value: player['KTC Value'] || 0,
            rank: player['Rank'] || 'N/A',
            positionRank: player['Position-Owner'] || 'N/A'
          };
        }
      });
      
      console.log(`Created KTC map with ${Object.keys(ktcMap).length} entries`);
      setKtcValues(ktcMap);
    } catch (err) {
      console.error('Error fetching KTC values:', err);
      // Don't set error here as it's not critical
      console.log("KTC fetching failed but continuing");
    }
  };

  // Handle sort
  const handleSort = (key) => {
    console.log(`Sorting by ${key}`);
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  // Get sorted players
  const getSortedPlayers = () => {
    const filtered = filterPosition === 'All' 
      ? players 
      : players.filter(player => player.position === filterPosition);
      
    return [...filtered].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];
      
      // Handle KTC value sorting
      if (sortConfig.key === 'ktcValue') {
        aValue = ktcValues[a.id]?.value || ktcValues[a.name]?.value || 0;
        bValue = ktcValues[b.id]?.value || ktcValues[b.name]?.value || 0;
      }
      
      // Handle contract values
      if (sortConfig.key === 'contractValue') {
        const aContract = getPlayerContract(a);
        const bContract = getPlayerContract(b);
        
        aValue = aContract ? parseFloat(aContract.CurYear) || 0 : 0;
        bValue = bContract ? parseFloat(bContract.CurYear) || 0 : 0;
      }
      
      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  // Get contract for a player using ID-based matching
  const getPlayerContract = (player) => {
    console.log(`Trying to find contract for player: ${player.name} (ID: ${player.id})`);
    
    // First try to match by Player ID
    const contractByID = contracts.find(contract => {
      const contractPlayerId = contract['Player ID'];
      return contractPlayerId && contractPlayerId.toString() === player.id;
    });
    
    if (contractByID) {
      console.log(`Contract found by ID match for ${player.name}:`, contractByID);
      return contractByID;
    }
    
    console.log(`No contract found by ID for ${player.name} (ID: ${player.id})`);
    return null;
  };

  // Format contract value
  const formatContractValue = (value) => {
    if (!value) return '-';
    return `$${parseFloat(value).toFixed(1)}`;
  };

  // Get position style
  const getPositionStyle = (position) => {
    switch (position) {
      case 'QB':
        return 'border-l-4 border-l-red-500';
      case 'RB':
        return 'border-l-4 border-l-blue-500';
      case 'WR':
        return 'border-l-4 border-l-green-500';
      case 'TE':
        return 'border-l-4 border-l-purple-500';
      default:
        return 'border-l-4 border-l-gray-500';
    }
  };

  console.log("Render phase - current state:", { 
    loading, 
    error, 
    hasTeamData: !!teamData,
    playerCount: players.length,
    contractCount: contracts.length
  });

  // Loading state
  if (loading) {
    console.log("Rendering loading state");
    return (
      <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
      </div>
    );
  }

  // Error state
  if (error) {
    console.log("Rendering error state", { error });
    return (
      <div className="min-h-screen bg-[#001A2B] text-white p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-[#FF4B1F] mb-4">My Team</h1>
          <div className="bg-red-500/20 border border-red-500/50 text-white p-4 rounded-lg">
            <h2 className="text-xl font-bold mb-2">Error Loading Your Team</h2>
            <p>{error}</p>
            {error.includes('Sleeper') && (
              <p className="mt-4">
                Your Sleeper ID may not be correctly configured. Please contact an admin.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  console.log("Rendering main content");
  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className="bg-black/30 p-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className="h-16 w-16 transition-transform hover:scale-105"
            />
            <h1 className="text-3xl font-bold text-[#FF4B1F]">My Team</h1>
          </div>
          {teamData && (
            <div>
              <h2 className="text-xl font-medium">{session?.user?.name}'s Roster</h2>
              <p className="text-white/70">{teamData.league.name} - {teamData.league.season} Season</p>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Team Summary Card */}
        {teamData && (
          <div className="bg-black/30 rounded-lg border border-white/10 p-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Team Record</h3>
                <div className="bg-black/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold">{teamData.roster.settings?.wins || 0}-{teamData.roster.settings?.losses || 0}{teamData.roster.settings?.ties > 0 ? `-${teamData.roster.settings.ties}` : ''}</div>
                  <div className="text-sm text-white/70">Current Season</div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">Team Value</h3>
                <div className="bg-black/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold">{players.reduce((sum, player) => {
                    const ktcValue = ktcValues[player.id]?.value || ktcValues[player.name]?.value;
                    return sum + (parseInt(ktcValue) || 0);
                  }, 0).toLocaleString()}</div>
                  <div className="text-sm text-white/70">Total KTC Value</div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">Salary Cap</h3>
                <div className="bg-black/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold">${contracts.reduce((sum, contract) => {
                    return sum + (parseFloat(contract.CurYear) || 0);
                  }, 0).toFixed(1)}</div>
                  <div className="text-sm text-white/70">Current Year Cap Hit</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Position Filter and Legend */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            {['All', 'QB', 'RB', 'WR', 'TE'].map(pos => (
              <button
                key={pos}
                onClick={() => setFilterPosition(pos)}
                className={`px-4 py-2 rounded ${
                  filterPosition === pos 
                    ? 'bg-[#FF4B1F] text-white' 
                    : 'bg-black/30 text-white/70 hover:bg-black/40'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
          
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500"></div>
              <span>QB</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500"></div>
              <span>RB</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500"></div>
              <span>WR</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-500"></div>
              <span>TE</span>
            </div>
          </div>
        </div>

        {/* Players Table */}
        <div className="overflow-x-auto rounded-lg border border-white/10 shadow-xl bg-black/20">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-black/40 border-b border-white/10">
                {[
                  { key: 'name', label: 'Player Name' },
                  { key: 'position', label: 'Pos' },
                  { key: 'team', label: 'Team' },
                  { key: 'age', label: 'Age' },
                  { key: 'ktcValue', label: 'KTC Value' },
                  { key: 'contractValue', label: 'Current Salary' },
                  { key: 'futureValue', label: 'Future Salary' }
                ].map(({ key, label }) => (
                  <th 
                    key={key}
                    onClick={() => handleSort(key)}
                    className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {label}
                      {sortConfig.key === key && (
                        <span className="text-[#FF4B1F]">
                          {sortConfig.direction === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {getSortedPlayers().map((player) => {
                const playerContract = getPlayerContract(player);
                const ktcData = ktcValues[player.id] || ktcValues[player.name];
                
                return (
                  <tr 
                    key={player.id}
                    className={`hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${getPositionStyle(player.position)} cursor-pointer`}
                    onClick={() => setSelectedPlayer(player)}
                  >
                    <td className="p-3 font-medium">
                      <div>
                        {player.name}
                        {player.injuryStatus && (
                          <span className="ml-2 text-xs text-red-400">{player.injuryStatus}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">{player.position}</td>
                    <td className="p-3">{player.team}</td>
                    <td className="p-3">{player.age || '-'}</td>
                    <td className="p-3">
                      {ktcData ? (
                        <div>
                          <div className="font-bold">{ktcData.value || '-'}</div>
                          <div className="text-xs text-white/70">
                            {ktcData.positionRank ? `${ktcData.positionRank}` : '-'}
                          </div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="p-3 text-green-400 font-medium">
                      {playerContract ? formatContractValue(playerContract.CurYear) : '-'}
                    </td>
                    <td className="p-3">
                      {playerContract ? (
                        <div className="flex gap-2">
                          {parseFloat(playerContract.Year2) > 0 && (
                            <span className="text-yellow-400">${parseFloat(playerContract.Year2).toFixed(1)}</span>
                          )}
                          {parseFloat(playerContract.Year3) > 0 && (
                            <span className="text-orange-400">${parseFloat(playerContract.Year3).toFixed(1)}</span>
                          )}
                          {parseFloat(playerContract.Year4) > 0 && (
                            <span className="text-red-400">${parseFloat(playerContract.Year4).toFixed(1)}</span>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {players.length === 0 && (
          <div className="bg-black/30 rounded-lg border border-white/10 p-8 text-center">
            <h2 className="text-xl font-bold mb-2">No Players Found</h2>
            <p className="text-white/70">
              We couldn't find any players on your roster. This might happen if you're not in the BBB league or if your Sleeper ID is not correctly configured.
            </p>
          </div>
        )}

        {/* Contract Charts Section */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4 text-[#FF4B1F]">Contract Breakdown</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-black/30 rounded-lg border border-white/10 p-6">
              <h3 className="text-lg font-semibold mb-4">Position Spending</h3>
              <div className="h-[300px]">
                <PositionSpendingChart contracts={contracts} />
              </div>
            </div>
            
            <div className="bg-black/30 rounded-lg border border-white/10 p-6">
              <h3 className="text-lg font-semibold mb-4">Future Cap Commitments</h3>
              <div className="h-[300px]">
                <FutureCapChart contracts={contracts} />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Player Profile Modal */}
      {selectedPlayer && (
        <PlayerProfileModal
          player={selectedPlayer}
          contract={getPlayerContract(selectedPlayer)}
          ktcData={ktcValues[selectedPlayer.id] || ktcValues[selectedPlayer.name]}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </main>
  );
}