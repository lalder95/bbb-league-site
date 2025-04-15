'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ScatterChart, Scatter, LabelList, LineChart, Line, AreaChart, Area
} from 'recharts';
import Papa from 'papaparse';

// Import custom components
import PositionFilter from './components/PositionFilter';
import PlayerProfileModal from './components/PlayerProfileModal';
import TeamComparisonModal from './components/TeamComparisonModal';
import DraftCapitalCard from './components/DraftCapitalCard';
import YearSelector from './components/YearSelector';
import StatCard from './components/StatCard';
import LoadingState from './components/LoadingState';
import ErrorState from './components/ErrorState';

export default function MyTeam() {
  // Session and router
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teamData, setTeamData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [ktcValues, setKtcValues] = useState({});
  const [allTeamContracts, setAllTeamContracts] = useState({});
  const [allTeamPlayers, setAllTeamPlayers] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedYear, setSelectedYear] = useState('curYear');
  const [filterPosition, setFilterPosition] = useState('All');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [showTeamComparison, setShowTeamComparison] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [leagueAverages, setLeagueAverages] = useState({
    capSpent: { curYear: 0, year2: 0, year3: 0, year4: 0 },
    positionSpend: { QB: 0, RB: 0, WR: 0, TE: 0 },
    teamAge: 0,
    ktcValue: 0
  });
  const [records, setRecords] = useState({
    current: { wins: 0, losses: 0, ties: 0 },
    allTime: { wins: 0, losses: 0, ties: 0 }
  });
  const [draftCapital, setDraftCapital] = useState([]);

  // Years mapping for display
  const yearMapping = {
    curYear: 'Year 1',
    year2: 'Year 2',
    year3: 'Year 3',
    year4: 'Year 4'
  };

  // Redirect if not logged in
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Fetch team and player data
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.sleeperId) {
      fetchTeamData();
      fetchAllLeagueData();
      fetchPlayerContracts();
      fetchKtcValues();
      fetchRecords();
      fetchDraftCapital();
    } else if (status === 'authenticated' && !session?.user?.sleeperId) {
      setError("Your account doesn't have a Sleeper ID configured. Please contact an admin.");
      setLoading(false);
    }
  }, [session, status]);

  // Function to fetch team data from Sleeper API
  const fetchTeamData = async () => {
    try {
      // Get current NFL state
      const stateResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
      if (!stateResponse.ok) throw new Error('Failed to fetch NFL state');
      const stateData = await stateResponse.json();
      const currentSeason = stateData.season;
      
      // Get user's leagues for current season
      const leaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${session.user.sleeperId}/leagues/nfl/${currentSeason}`);
      if (!leaguesResponse.ok) throw new Error('Failed to fetch leagues');
      const leagues = await leaguesResponse.json();
      
      // Find the BBB league
      const bbbLeague = leagues.find(league => 
        league.name && (
          league.name.includes('Budget Blitz Bowl') || 
          league.name.includes('budget blitz bowl') ||
          league.name.includes('BBB') ||
          (league.name.toLowerCase().includes('budget') && 
          league.name.toLowerCase().includes('blitz'))
        )
      );
      
      if (!bbbLeague) throw new Error('BBB League not found');
      
      // Get league rosters
      const rostersResponse = await fetch(`https://api.sleeper.app/v1/league/${bbbLeague.league_id}/rosters`);
      if (!rostersResponse.ok) throw new Error('Failed to fetch rosters');
      const rosters = await rostersResponse.json();
      
      // Find user's roster
      const userRoster = rosters.find(roster => roster.owner_id === session.user.sleeperId);
      if (!userRoster) throw new Error('Your roster not found in this league');
      
      // Get all players data for reference
      const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
      if (!playersResponse.ok) throw new Error('Failed to fetch players');
      const allPlayers = await playersResponse.json();
      
      // Process user's players
      const userPlayers = userRoster.players?.map(playerId => {
        const playerData = allPlayers[playerId];
        return {
          id: playerId,
          name: playerData ? `${playerData.first_name} ${playerData.last_name}` : 'Unknown Player',
          position: playerData?.position || 'N/A',
          team: playerData?.team || 'N/A',
          number: playerData?.number || '',
          status: playerData?.status || 'Unknown',
          injuryStatus: playerData?.injury_status || '',
          age: playerData?.age || 0,
          experience: playerData?.years_exp || 0
        };
      }) || [];
      
      setTeamData({
        league: bbbLeague,
        roster: userRoster,
      });
      
      setPlayers(userPlayers);
      
      // Set current record
      setRecords(prev => ({
        ...prev,
        current: {
          wins: userRoster.settings?.wins || 0,
          losses: userRoster.settings?.losses || 0,
          ties: userRoster.settings?.ties || 0
        }
      }));
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Fetch data for all teams in the league
  const fetchAllLeagueData = async () => {
    try {
      // This would follow similar pattern to fetchTeamData but collect data for all teams
      // For now, we'll use simulated data
      
      // In a real implementation, you would:
      // 1. Get all rosters for the league
      // 2. Get all contract data by team
      // 3. Calculate league averages for comparison
      
      // Simulated data
      const teamContracts = {};
      const teamPlayers = {};
      
      // Random data for 12 teams
      const teams = ["Team1", "Team2", "Team3", "Team4", "Team5", "Team6", 
                     "Team7", "Team8", "Team9", "Team10", "Team11", "Team12"];
      
      teams.forEach(team => {
        teamContracts[team] = {
          capSpent: {
            curYear: Math.random() * 250 + 50,
            year2: Math.random() * 200 + 50,
            year3: Math.random() * 150 + 30,
            year4: Math.random() * 100 + 20
          },
          positionSpend: {
            QB: Math.random() * 60 + 10,
            RB: Math.random() * 70 + 20,
            WR: Math.random() * 80 + 30,
            TE: Math.random() * 40 + 10
          },
          playerCount: Math.floor(Math.random() * 10) + 20,
          averageAge: Math.random() * 5 + 24
        };
        
        teamPlayers[team] = Array(teamContracts[team].playerCount)
          .fill(0)
          .map((_, i) => ({
            id: `${team}-player-${i}`,
            name: `Player ${i+1}`,
            position: ["QB", "RB", "WR", "TE"][Math.floor(Math.random() * 4)],
            age: Math.floor(Math.random() * 12) + 22,
            value: Math.floor(Math.random() * 5000) + 1000,
            contract: {
              curYear: Math.random() * 20 + 1,
              year2: Math.random() * 15,
              year3: Math.random() * 10,
              year4: Math.random() * 5
            }
          }));
      });
      
      setAllTeamContracts(teamContracts);
      setAllTeamPlayers(teamPlayers);
      
      // Calculate league averages
      const capSpentTotal = { curYear: 0, year2: 0, year3: 0, year4: 0 };
      const positionSpendTotal = { QB: 0, RB: 0, WR: 0, TE: 0 };
      let ageTotal = 0;
      let valueTotal = 0;
      let playerCount = 0;
      
      Object.values(teamContracts).forEach(team => {
        capSpentTotal.curYear += team.capSpent.curYear;
        capSpentTotal.year2 += team.capSpent.year2;
        capSpentTotal.year3 += team.capSpent.year3;
        capSpentTotal.year4 += team.capSpent.year4;
        
        positionSpendTotal.QB += team.positionSpend.QB;
        positionSpendTotal.RB += team.positionSpend.RB;
        positionSpendTotal.WR += team.positionSpend.WR;
        positionSpendTotal.TE += team.positionSpend.TE;
        
        ageTotal += team.averageAge;
      });
      
      Object.values(teamPlayers).forEach(teamPlayerList => {
        playerCount += teamPlayerList.length;
        teamPlayerList.forEach(player => {
          valueTotal += player.value;
        });
      });
      
      setLeagueAverages({
        capSpent: {
          curYear: capSpentTotal.curYear / teams.length,
          year2: capSpentTotal.year2 / teams.length,
          year3: capSpentTotal.year3 / teams.length,
          year4: capSpentTotal.year4 / teams.length
        },
        positionSpend: {
          QB: positionSpendTotal.QB / teams.length,
          RB: positionSpendTotal.RB / teams.length,
          WR: positionSpendTotal.WR / teams.length,
          TE: positionSpendTotal.TE / teams.length
        },
        teamAge: ageTotal / teams.length,
        ktcValue: valueTotal / playerCount
      });
      
    } catch (err) {
      console.error('Error fetching league data:', err);
      // Continue even if this fails
    }
  };

  // Fetch player contracts from the CSV
  const fetchPlayerContracts = async () => {
    try {
      const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
      if (!response.ok) throw new Error('Failed to fetch contracts CSV');
      const text = await response.text();
      
      // Parse CSV
      const parseResult = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true
      });
      
      const data = parseResult.data;
      
      // Get current username and filter contracts
      const username = session?.user?.name || '';
      const userContracts = data.filter(contract => {
        return (
          contract.TeamDisplayName === username ||
          contract.TeamDisplayName?.toLowerCase() === username.toLowerCase() ||
          contract.TeamName?.toLowerCase() === username.toLowerCase() ||
          contract.TeamOwner?.toLowerCase() === username.toLowerCase()
        );
      });
      
      setContracts(userContracts);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching contract data:', err);
      setLoading(false);
    }
  };

  // Fetch KTC values
  const fetchKtcValues = async () => {
    try {
      const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/Players.csv');
      if (!response.ok) throw new Error('Failed to fetch KTC CSV');
      const text = await response.text();
      
      // Parse CSV
      const parseResult = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true
      });
      
      const data = parseResult.data;
      
      // Create a map of player IDs to KTC values
      const ktcMap = {};
      data.forEach(player => {
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
      
      setKtcValues(ktcMap);
    } catch (err) {
      console.error('Error fetching KTC values:', err);
    }
  };

  // Fetch records (current handled in fetchTeamData, this would get all-time)
  const fetchRecords = async () => {
    try {
      // In a real implementation, you would fetch historical records
      // Simulated data for now
      setRecords(prev => ({
        ...prev,
        allTime: {
          wins: 42,
          losses: 28,
          ties: 2
        }
      }));
    } catch (err) {
      console.error('Error fetching records:', err);
    }
  };

  // Fetch draft capital
  const fetchDraftCapital = async () => {
    try {
      // In a real implementation, you would:
      // 1. Fetch upcoming draft picks owned by the team
      // 2. Calculate their capital value
      // 3. Calculate their salary cap implications
      
      // Simulated data for now
      const simulatedDraftPicks = [
        { year: 2025, round: 1, pick: 6, originalTeam: 'Team3', value: 800, salaryCap: 10 },
        { year: 2025, round: 2, pick: 5, originalTeam: 'Team7', value: 400, salaryCap: 4 },
        { year: 2025, round: 3, pick: 12, originalTeam: 'Own', value: 200, salaryCap: 2 },
        { year: 2025, round: 4, pick: 12, originalTeam: 'Own', value: 100, salaryCap: 1 },
        { year: 2026, round: 1, pick: null, originalTeam: 'Own', value: 700, salaryCap: 10 },
        { year: 2026, round: 1, pick: null, originalTeam: 'Team9', value: 700, salaryCap: 10 },
        { year: 2026, round: 2, pick: null, originalTeam: 'Own', value: 350, salaryCap: 4 },
        { year: 2026, round: 3, pick: null, originalTeam: 'Own', value: 175, salaryCap: 2 }
      ];
      
      setDraftCapital(simulatedDraftPicks);
    } catch (err) {
      console.error('Error fetching draft capital:', err);
    }
  };

  // Get contract for a player using ID-based matching
  const getPlayerContract = (player) => {
    // Match by Player ID
    const contractByID = contracts.find(contract => {
      const contractPlayerId = contract['Player ID'];
      return contractPlayerId && contractPlayerId.toString() === player.id;
    });
    
    return contractByID || null;
  };

  // Calculate team cap metrics
  const calculateTeamCapMetrics = useMemo(() => {
    if (!contracts.length) return null;

    // Calculate by position
    const positionSpend = { QB: 0, RB: 0, WR: 0, TE: 0, Other: 0 };
    const yearlySpend = { curYear: 0, year2: 0, year3: 0, year4: 0 };
    const positionCount = { QB: 0, RB: 0, WR: 0, TE: 0, Other: 0 };
    let totalAge = 0;
    let playerCount = 0;
    let totalKtcValue = 0;
    
    // Top players by KTC value
    const playersByKtc = [];
    
    contracts.forEach(contract => {
      const pos = contract.Position || 'Other';
      const posKey = ['QB', 'RB', 'WR', 'TE'].includes(pos) ? pos : 'Other';
      
      // Current year spend
      positionSpend[posKey] += parseFloat(contract.CurYear) || 0;
      yearlySpend.curYear += parseFloat(contract.CurYear) || 0;
      yearlySpend.year2 += parseFloat(contract.Year2) || 0;
      yearlySpend.year3 += parseFloat(contract.Year3) || 0;
      yearlySpend.year4 += parseFloat(contract.Year4) || 0;
      
      // Count positions
      positionCount[posKey]++;
      
      // Age calculation
      if (contract.Age) {
        totalAge += contract.Age;
        playerCount++;
      }
      
      // KTC value
      const ktcData = ktcValues[contract['Player ID']] || ktcValues[contract.PlayerName];
      const ktcValue = ktcData?.value || 0;
      totalKtcValue += ktcValue;
      
      // Add to players by KTC
      playersByKtc.push({
        id: contract['Player ID'],
        name: contract.PlayerName,
        position: posKey,
        ktcValue: ktcValue,
        salary: parseFloat(contract.CurYear) || 0,
        valueRatio: ktcValue / (parseFloat(contract.CurYear) || 1)
      });
    });
    
    // Sort by KTC value
    playersByKtc.sort((a, b) => b.ktcValue - a.ktcValue);
    
    // Calculate cap remaining
    const capRemaining = {
      curYear: 300 - yearlySpend.curYear,
      year2: 300 - yearlySpend.year2,
      year3: 300 - yearlySpend.year3,
      year4: 300 - yearlySpend.year4
    };
    
    // Cap percentage by position
    const positionCapPercent = {
      QB: (positionSpend.QB / yearlySpend.curYear) * 100 || 0,
      RB: (positionSpend.RB / yearlySpend.curYear) * 100 || 0,
      WR: (positionSpend.WR / yearlySpend.curYear) * 100 || 0,
      TE: (positionSpend.TE / yearlySpend.curYear) * 100 || 0,
      Other: (positionSpend.Other / yearlySpend.curYear) * 100 || 0
    };
    
    // Average age
    const averageAge = playerCount > 0 ? totalAge / playerCount : 0;
    
    // Value to cost ratio
    const valuePerDollarSpent = yearlySpend.curYear > 0 ? totalKtcValue / yearlySpend.curYear : 0;
    
    return {
      positionSpend,
      yearlySpend,
      capRemaining,
      positionCapPercent,
      positionCount,
      averageAge,
      totalKtcValue,
      valuePerDollarSpent,
      playersByKtc
    };
  }, [contracts, ktcValues]);

  // Calculate players by age group
  const playersByAgeGroup = useMemo(() => {
    const ageGroups = { "21-23": 0, "24-26": 0, "27-29": 0, "30+": 0 };
    const positionAge = { QB: 0, RB: 0, WR: 0, TE: 0 };
    const positionCount = { QB: 0, RB: 0, WR: 0, TE: 0 };
    
    players.forEach(player => {
      if (player.age) {
        // Add to age groups
        if (player.age <= 23) ageGroups["21-23"]++;
        else if (player.age <= 26) ageGroups["24-26"]++;
        else if (player.age <= 29) ageGroups["27-29"]++;
        else ageGroups["30+"]++;
        
        // Add to position age
        if (['QB', 'RB', 'WR', 'TE'].includes(player.position)) {
          positionAge[player.position] += player.age;
          positionCount[player.position]++;
        }
      }
    });
    
    // Calculate average age by position
    const avgPositionAge = {
      QB: positionCount.QB > 0 ? positionAge.QB / positionCount.QB : 0,
      RB: positionCount.RB > 0 ? positionAge.RB / positionCount.RB : 0,
      WR: positionCount.WR > 0 ? positionAge.WR / positionCount.WR : 0,
      TE: positionCount.TE > 0 ? positionAge.TE / positionCount.TE : 0
    };
    
    return { ageGroups, avgPositionAge };
  }, [players]);

  // Prepare data for year-over-year cap chart
  const yearlyCapData = useMemo(() => {
    if (!calculateTeamCapMetrics) return [];
    
    return [
      { name: 'Year 1', value: calculateTeamCapMetrics.yearlySpend.curYear, remaining: calculateTeamCapMetrics.capRemaining.curYear },
      { name: 'Year 2', value: calculateTeamCapMetrics.yearlySpend.year2, remaining: calculateTeamCapMetrics.capRemaining.year2 },
      { name: 'Year 3', value: calculateTeamCapMetrics.yearlySpend.year3, remaining: calculateTeamCapMetrics.capRemaining.year3 },
      { name: 'Year 4', value: calculateTeamCapMetrics.yearlySpend.year4, remaining: calculateTeamCapMetrics.capRemaining.year4 }
    ];
  }, [calculateTeamCapMetrics]);

  // Prepare data for position spending pie chart
  const positionCapData = useMemo(() => {
    if (!calculateTeamCapMetrics) return [];
    
    return [
      { name: 'QB', value: calculateTeamCapMetrics.positionSpend.QB },
      { name: 'RB', value: calculateTeamCapMetrics.positionSpend.RB },
      { name: 'WR', value: calculateTeamCapMetrics.positionSpend.WR },
      { name: 'TE', value: calculateTeamCapMetrics.positionSpend.TE },
      { name: 'Other', value: calculateTeamCapMetrics.positionSpend.Other }
    ].filter(item => item.value > 0);
  }, [calculateTeamCapMetrics]);

  // Prepare data for age distribution chart
  const ageDistributionData = useMemo(() => {
    if (!playersByAgeGroup) return [];
    
    return [
      { name: '21-23', value: playersByAgeGroup.ageGroups["21-23"] },
      { name: '24-26', value: playersByAgeGroup.ageGroups["24-26"] },
      { name: '27-29', value: playersByAgeGroup.ageGroups["27-29"] },
      { name: '30+', value: playersByAgeGroup.ageGroups["30+"] }
    ].filter(item => item.value > 0);
  }, [playersByAgeGroup]);

  // League comparison data for selected metrics
  const leagueComparisonData = useMemo(() => {
    if (!calculateTeamCapMetrics || !leagueAverages) return [];
    
    const userTeamName = session?.user?.name || 'Your Team';
    
    return [
      {
        name: 'Cap Spent',
        [userTeamName]: calculateTeamCapMetrics.yearlySpend.curYear,
        'League Avg': leagueAverages.capSpent.curYear
      },
      {
        name: 'QB Spend',
        [userTeamName]: calculateTeamCapMetrics.positionSpend.QB,
        'League Avg': leagueAverages.positionSpend.QB
      },
      {
        name: 'RB Spend',
        [userTeamName]: calculateTeamCapMetrics.positionSpend.RB,
        'League Avg': leagueAverages.positionSpend.RB
      },
      {
        name: 'WR Spend',
        [userTeamName]: calculateTeamCapMetrics.positionSpend.WR,
        'League Avg': leagueAverages.positionSpend.WR
      },
      {
        name: 'TE Spend',
        [userTeamName]: calculateTeamCapMetrics.positionSpend.TE,
        'League Avg': leagueAverages.positionSpend.TE
      },
      {
        name: 'Avg Age',
        [userTeamName]: calculateTeamCapMetrics.averageAge,
        'League Avg': leagueAverages.teamAge
      }
    ];
  }, [calculateTeamCapMetrics, leagueAverages, session]);

  // Value vs Cost scatter plot data
  const valueVsCostData = useMemo(() => {
    if (!calculateTeamCapMetrics) return [];
    
    return calculateTeamCapMetrics.playersByKtc
      .filter(player => player.salary > 0 && player.ktcValue > 0)
      .map(player => ({
        name: player.name,
        position: player.position,
        salary: player.salary,
        value: player.ktcValue,
        ratio: player.valueRatio
      }));
  }, [calculateTeamCapMetrics]);

  // Format salary value for display
  const formatSalary = (value) => {
    return `$${value.toFixed(1)}`;
  };

  // Format KTC value for display
  const formatKtcValue = (value) => {
    return value.toLocaleString();
  };

  // Format record for display
  const formatRecord = (record) => {
    return `${record.wins}-${record.losses}${record.ties > 0 ? `-${record.ties}` : ''}`;
  };

  // Format percentage for display
  const formatPercent = (value) => {
    return `${value.toFixed(1)}%`;
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

  // Get color by position
  const getPositionColor = (position) => {
    switch (position) {
      case 'QB': return '#ef4444'; // red
      case 'RB': return '#3b82f6'; // blue
      case 'WR': return '#22c55e'; // green
      case 'TE': return '#a855f7'; // purple
      default: return '#6b7280';   // gray
    }
  };

  // Handle sort for player tables
  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  // Get sorted and filtered players
  const getSortedPlayers = () => {
    const filtered = filterPosition === 'All' 
      ? players 
      : players.filter(player => player.position === filterPosition);
      
    return [...filtered].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];
      
      // Handle KTC value sorting
      if (sortConfig.key === 'ktcValue') {
        const aKtc = ktcValues[a.id]?.value || ktcValues[a.name]?.value || 0;
        const bKtc = ktcValues[b.id]?.value || ktcValues[b.name]?.value || 0;
        aValue = aKtc;
        bValue = bKtc;
      }
      
      // Handle contract values
      if (sortConfig.key === 'salary') {
        const aContract = getPlayerContract(a);
        const bContract = getPlayerContract(b);
        
        aValue = aContract ? parseFloat(aContract.CurYear) || 0 : 0;
        bValue = bContract ? parseFloat(bContract.CurYear) || 0 : 0;
      }
      
      // Handle value ratio sorting
      if (sortConfig.key === 'valueRatio') {
        const aContract = getPlayerContract(a);
        const bContract = getPlayerContract(b);
        const aKtc = ktcValues[a.id]?.value || ktcValues[a.name]?.value || 0;
        const bKtc = ktcValues[b.id]?.value || ktcValues[b.name]?.value || 0;
        
        const aSalary = aContract ? parseFloat(aContract.CurYear) || 1 : 1;
        const bSalary = bContract ? parseFloat(bContract.CurYear) || 1 : 1;
        
        aValue = aKtc / aSalary;
        bValue = bKtc / bSalary;
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

  // Custom Tooltip for Charts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/80 border border-white/20 rounded p-2 text-sm">
          <p className="font-bold">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {entry.value.toFixed(1)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Loading state
  if (loading) {
    return <LoadingState />;
  }

  // Error state
  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <main className="min-h-screen bg-[#001A2B] text-white pb-16">
      <div className="bg-black/30 p-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className="h-16 w-16 transition-transform hover:scale-105"
            />
            <div>
              <h1 className="text-3xl font-bold text-[#FF4B1F]">My Team</h1>
              <p className="text-white/70">{teamData?.league?.name || 'Budget Blitz Bowl'} - {teamData?.league?.season || '2024'} Season</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-xl font-bold">{session?.user?.name || 'My Team'}</div>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-white/70">Current: </span>
                <span className="font-bold">{formatRecord(records.current)}</span>
              </div>
              <div>
                <span className="text-white/70">All-Time: </span>
                <span className="font-bold">{formatRecord(records.allTime)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard 
            title="Cap Space" 
            value={formatSalary(calculateTeamCapMetrics?.capRemaining.curYear || 0)} 
            description={`${formatSalary(calculateTeamCapMetrics?.yearlySpend.curYear || 0)} used`}
            icon="💰"
            onClick={() => setActiveTab('salary')}
          />
          <StatCard 
            title="Avg. Age" 
            value={calculateTeamCapMetrics?.averageAge.toFixed(1) || '0'} 
            description={`${players.length} players`}
            icon="⏳"
            onClick={() => setActiveTab('age')}
          />
          <StatCard 
            title="Total KTC Value"

            value={formatKtcValue(calculateTeamCapMetrics?.totalKtcValue || 0)}
            description="Team value"
            icon="📈"
            onClick={() => setActiveTab('value')}
          />
          <StatCard 
            title="Value Per $" 
            value={(calculateTeamCapMetrics?.valuePerDollarSpent || 0).toFixed(1)} 
            description="KTC points per dollar"
            icon="⚖️"
            onClick={() => setActiveTab('value')}
          />
        </div>

        {/* Main content tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6 bg-black/20 p-1 rounded-lg">
            <TabsTrigger value="overview" className="data-[state=active]:bg-[#FF4B1F]">
              Overview
            </TabsTrigger>
            <TabsTrigger value="salary" className="data-[state=active]:bg-[#FF4B1F]">
              Salary Cap
            </TabsTrigger>
            <TabsTrigger value="value" className="data-[state=active]:bg-[#FF4B1F]">
              Team Value
            </TabsTrigger>
            <TabsTrigger value="age" className="data-[state=active]:bg-[#FF4B1F]">
              Age Analysis
            </TabsTrigger>
            <TabsTrigger value="drafts" className="data-[state=active]:bg-[#FF4B1F]">
              Draft Capital
            </TabsTrigger>
            <TabsTrigger value="league" className="data-[state=active]:bg-[#FF4B1F]">
              League Comparison
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab Content */}
          <TabsContent value="overview" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Team Charts */}
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Yearly Cap Distribution</CardTitle>
                    <CardDescription>Cap space allocation per year</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={yearlyCapData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                        <XAxis dataKey="name" stroke="#fff" />
                        <YAxis stroke="#fff" domain={[0, 300]} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Bar dataKey="value" name="Cap Used" fill="#FF4B1F" />
                        <Bar dataKey="remaining" name="Cap Available" fill="#22c55e" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Position Spending</CardTitle>
                      <CardDescription>Cap allocation by position</CardDescription>
                    </CardHeader>
                    <CardContent className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={positionCapData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ name, value, percent }) => `${name}: ${percent.toFixed(0)}%`}
                          >
                            {positionCapData.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={getPositionColor(entry.name)} 
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => formatSalary(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Age Distribution</CardTitle>
                      <CardDescription>Player age groups</CardDescription>
                    </CardHeader>
                    <CardContent className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={ageDistributionData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                          <XAxis dataKey="name" stroke="#fff" />
                          <YAxis stroke="#fff" />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="value" name="Players" fill="#3b82f6">
                            <LabelList dataKey="value" position="top" fill="#fff" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </div>
              
              {/* KTC Value Leaders */}
              <div>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Top KTC Value Players</CardTitle>
                    <CardDescription>Your most valuable players</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-y-auto max-h-[600px]">
                    <div className="space-y-2">
                      {calculateTeamCapMetrics?.playersByKtc.slice(0, 10).map((player, index) => (
                        <div 
                          key={index} 
                          className={`flex items-center justify-between p-3 rounded-lg bg-black/20 ${getPositionStyle(player.position)} cursor-pointer hover:bg-black/30`}
                          onClick={() => setSelectedPlayer({
                            id: player.id,
                            name: player.name,
                            position: player.position,
                            ktcValue: player.ktcValue,
                            salary: player.salary,
                            valueRatio: player.valueRatio
                          })}
                        >
                          <div className="flex items-center gap-2">
                            <div className="text-lg font-bold text-white/50">#{index + 1}</div>
                            <div>
                              <div className="font-bold">{player.name}</div>
                              <div className="text-xs text-white/70 flex items-center gap-1">
                                <span className={`px-1.5 py-0.5 rounded text-xs bg-black/30 text-${getPositionColor(player.position).slice(1)}`}>
                                  {player.position}
                                </span>
                                <span>${player.salary.toFixed(1)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold">{formatKtcValue(player.ktcValue)}</div>
                            <div className="text-xs text-white/70">KTC value</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                  <CardFooter className="border-t border-white/10 flex justify-between">
                    <button 
                      className="text-[#FF4B1F] hover:text-[#FF4B1F]/80 text-sm"
                      onClick={() => setActiveTab('value')}
                    >
                      View All Players
                    </button>
                    <button 
                      className="text-white/70 hover:text-white text-sm"
                      onClick={() => setShowTeamComparison(true)}
                    >
                      Compare to League
                    </button>
                  </CardFooter>
                </Card>
              </div>
            </div>
            
            {/* Draft Capital Overview */}
            <div className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Draft Capital Overview</CardTitle>
                  <CardDescription>Your upcoming draft picks and their values</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <DraftCapitalCard picks={draftCapital.filter(p => p.year === 2025)} year="2025" />
                    <DraftCapitalCard picks={draftCapital.filter(p => p.year === 2026)} year="2026" />
                  </div>
                </CardContent>
                <CardFooter className="border-t border-white/10">
                  <button 
                    className="text-[#FF4B1F] hover:text-[#FF4B1F]/80 text-sm"
                    onClick={() => setActiveTab('drafts')}
                  >
                    View Full Draft Capital Analysis
                  </button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>

          {/* Salary Cap Tab Content */}
          <TabsContent value="salary" className="mt-0">
            <div className="grid grid-cols-1 gap-6">
              {/* Cap Space Summary */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Salary Cap Space</CardTitle>
                      <CardDescription>Yearly cap space breakdown</CardDescription>
                    </div>
                    <YearSelector 
                      years={Object.keys(yearMapping)} 
                      labels={Object.values(yearMapping)}
                      selectedYear={selectedYear}
                      onChange={setSelectedYear}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">Total Cap</div>
                      <div className="text-2xl font-bold">$300.0</div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">Cap Used</div>
                      <div className="text-2xl font-bold text-[#FF4B1F]">
                        {formatSalary(calculateTeamCapMetrics?.yearlySpend[selectedYear] || 0)}
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">Cap Available</div>
                      <div className="text-2xl font-bold text-green-400">
                        {formatSalary(calculateTeamCapMetrics?.capRemaining[selectedYear] || 0)}
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">Cap Percentage Used</div>
                      <div className="text-2xl font-bold">
                        {formatPercent((calculateTeamCapMetrics?.yearlySpend[selectedYear] / 300) * 100 || 0)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Yearly Cap Chart */}
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={yearlyCapData}
                          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                          <XAxis dataKey="name" stroke="#fff" />
                          <YAxis stroke="#fff" domain={[0, 300]} />
                          <Tooltip content={<CustomTooltip />} />
                          <Area 
                            type="monotone" 
                            dataKey="value" 
                            stackId="1" 
                            stroke="#FF4B1F" 
                            fill="#FF4B1F" 
                            name="Cap Used"
                          />
                          <Area 
                            type="monotone" 
                            dataKey="remaining" 
                            stackId="1" 
                            stroke="#22c55e" 
                            fill="#22c55e" 
                            name="Cap Available"
                          />
                          <Legend />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Position Breakdown */}
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            {
                              name: 'QB',
                              value: calculateTeamCapMetrics?.positionSpend.QB || 0,
                              pct: calculateTeamCapMetrics?.positionCapPercent.QB || 0
                            },
                            {
                              name: 'RB',
                              value: calculateTeamCapMetrics?.positionSpend.RB || 0,
                              pct: calculateTeamCapMetrics?.positionCapPercent.RB || 0
                            },
                            {
                              name: 'WR',
                              value: calculateTeamCapMetrics?.positionSpend.WR || 0,
                              pct: calculateTeamCapMetrics?.positionCapPercent.WR || 0
                            },
                            {
                              name: 'TE',
                              value: calculateTeamCapMetrics?.positionSpend.TE || 0,
                              pct: calculateTeamCapMetrics?.positionCapPercent.TE || 0
                            }
                          ]}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                          <XAxis dataKey="name" stroke="#fff" />
                          <YAxis stroke="#fff" />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar 
                            dataKey="value" 
                            name="Cap Spent"
                          >
                            {['QB', 'RB', 'WR', 'TE'].map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={getPositionColor(entry)} 
                              />
                            ))}
                            <LabelList 
                              dataKey="pct" 
                              position="top" 
                              formatter={(value) => `${value.toFixed(1)}%`}
                              fill="#fff"
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Player Cap Table */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                      <CardTitle>Player Salaries</CardTitle>
                      <CardDescription>Detailed salary information by player</CardDescription>
                    </div>
                    <PositionFilter 
                      currentFilter={filterPosition}
                      onFilterChange={setFilterPosition}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-lg border border-white/10 shadow-xl bg-black/20">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-black/40 border-b border-white/10">
                          <th 
                            className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => handleSort('name')}
                          >
                            Player Name
                            {sortConfig.key === 'name' && (
                              <span className="ml-1 text-[#FF4B1F]">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </th>
                          <th 
                            className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => handleSort('position')}
                          >
                            Position
                            {sortConfig.key === 'position' && (
                              <span className="ml-1 text-[#FF4B1F]">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </th>
                          <th 
                            className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => handleSort('salary')}
                          >
                            Year 1
                            {sortConfig.key === 'salary' && (
                              <span className="ml-1 text-[#FF4B1F]">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </th>
                          <th className="p-3 text-left">Year 2</th>
                          <th className="p-3 text-left">Year 3</th>
                          <th className="p-3 text-left">Year 4</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSortedPlayers().map((player) => {
                          const contract = getPlayerContract(player);
                          return (
                            <tr 
                              key={player.id}
                              className={`hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${getPositionStyle(player.position)} cursor-pointer`}
                              onClick={() => setSelectedPlayer(player)}
                            >
                              <td className="p-3 font-medium">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-semibold">{player.name}</div>
                                  {player.injuryStatus && (
                                    <span className="text-xs text-red-400">{player.injuryStatus}</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="bg-black/30 text-xs px-1.5 py-0.5 rounded inline-block font-medium">
                                  {player.position}
                                </div>
                              </td>
                              <td className="p-3 text-green-400 font-medium">
                                {contract ? formatSalary(parseFloat(contract.CurYear) || 0) : '-'}
                              </td>
                              <td className="p-3 text-yellow-400 font-medium">
                                {contract && contract.Year2 ? formatSalary(parseFloat(contract.Year2) || 0) : '-'}
                              </td>
                              <td className="p-3 text-orange-400 font-medium">
                                {contract && contract.Year3 ? formatSalary(parseFloat(contract.Year3) || 0) : '-'}
                              </td>
                              <td className="p-3 text-red-400 font-medium">
                                {contract && contract.Year4 ? formatSalary(parseFloat(contract.Year4) || 0) : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Team Value Tab Content */}
          <TabsContent value="value" className="mt-0">
            <div className="grid grid-cols-1 gap-6">
              {/* Value Overview */}
              <Card>
                <CardHeader>
                  <CardTitle>Team Value Analysis</CardTitle>
                  <CardDescription>KTC value and return on investment</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">Total KTC Value</div>
                      <div className="text-2xl font-bold text-blue-400">
                        {formatKtcValue(calculateTeamCapMetrics?.totalKtcValue || 0)}
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">Value Per $ Spent</div>
                      <div className="text-2xl font-bold text-green-400">
                        {(calculateTeamCapMetrics?.valuePerDollarSpent || 0).toFixed(1)}
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">League Value Rank</div>
                      <div className="text-2xl font-bold text-[#FF4B1F]">
                        3rd
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">Value vs Avg</div>
                      <div className="text-2xl font-bold text-yellow-400">
                        +12%
                      </div>
                    </div>
                  </div>

                  {/* Value vs Cost Chart */}
                  <div className="h-96 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart
                        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                        <XAxis 
                          type="number" 
                          dataKey="salary" 
                          name="Salary" 
                          stroke="#fff" 
                          label={{ value: 'Current Salary ($)', position: 'insideBottom', offset: -10, fill: '#fff' }}
                        />
                        <YAxis 
                          type="number" 
                          dataKey="value" 
                          name="KTC Value"
                          stroke="#fff"
                          label={{ value: 'KTC Value', angle: -90, position: 'insideLeft', fill: '#fff' }}
                        />
                        <Tooltip
                          formatter={(value, name) => {
                            if (name === 'KTC Value') return [formatKtcValue(value), name];
                            return [formatSalary(value), name];
                          }}
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-black/80 border border-white/20 rounded p-2 text-sm">
                                  <p className="font-bold">{data.name}</p>
                                  <p className="text-white">Position: {data.position}</p>
                                  <p className="text-green-400">Salary: {formatSalary(data.salary)}</p>
                                  <p className="text-blue-400">KTC Value: {formatKtcValue(data.value)}</p>
                                  <p className="text-yellow-400">Value Ratio: {data.ratio.toFixed(1)}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Legend />
                        {valueVsCostData.map((entry, index) => (
                          <Scatter 
                            key={index} 
                            name={entry.position} 
                            data={[entry]} 
                            fill={getPositionColor(entry.position)}
                          />
                        ))}
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Player Value Table */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                      <CardTitle>Player Values</CardTitle>
                      <CardDescription>KTC value and salary cap analysis</CardDescription>
                    </div>
                    <PositionFilter 
                      currentFilter={filterPosition}
                      onFilterChange={setFilterPosition}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-lg border border-white/10 shadow-xl bg-black/20">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-black/40 border-b border-white/10">
                          <th 
                            className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => handleSort('name')}
                          >
                            Player Name
                            {sortConfig.key === 'name' && (
                              <span className="ml-1 text-[#FF4B1F]">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </th>
                          <th 
                            className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => handleSort('position')}
                          >
                            Pos
                            {sortConfig.key === 'position' && (
                              <span className="ml-1 text-[#FF4B1F]">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </th>
                          <th 
                            className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => handleSort('ktcValue')}
                          >
                            KTC Value
                            {sortConfig.key === 'ktcValue' && (
                              <span className="ml-1 text-[#FF4B1F]">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </th>
                          <th 
                            className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => handleSort('salary')}
                          >
                            Salary
                            {sortConfig.key === 'salary' && (
                              <span className="ml-1 text-[#FF4B1F]">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </th>
                          <th 
                            className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => handleSort('valueRatio')}
                          >
                            Value Ratio
                            {sortConfig.key === 'valueRatio' && (
                              <span className="ml-1 text-[#FF4B1F]">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSortedPlayers().map((player) => {
                          const contract = getPlayerContract(player);
                          const ktcData = ktcValues[player.id] || ktcValues[player.name];
                          const ktcValue = ktcData?.value || 0;
                          const salary = contract ? parseFloat(contract.CurYear) || 0 : 0;
                          const valueRatio = salary > 0 ? ktcValue / salary : 0;
                          
                          return (
                            <tr 
                              key={player.id}
                              className={`hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${getPositionStyle(player.position)} cursor-pointer`}
                              onClick={() => setSelectedPlayer(player)}
                            >
                              <td className="p-3 font-medium">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-semibold">{player.name}</div>
                                  {player.injuryStatus && (
                                    <span className="text-xs text-red-400">{player.injuryStatus}</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="bg-black/30 text-xs px-1.5 py-0.5 rounded inline-block font-medium">
                                  {player.position}
                                </div>
                              </td>
                              <td className="p-3 font-medium text-blue-400">
                                {formatKtcValue(ktcValue)}
                              </td>
                              <td className="p-3 font-medium text-green-400">
                                {formatSalary(salary)}
                              </td>
                              <td className="p-3 font-medium text-yellow-400">
                                {valueRatio.toFixed(1)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Age Analysis Tab Content */}
          <TabsContent value="age" className="mt-0">
            <div className="grid grid-cols-1 gap-6">
              {/* Age Overview */}
              <Card>
                <CardHeader>
                  <CardTitle>Team Age Analysis</CardTitle>
                  <CardDescription>Age distribution and roster breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">Average Age</div>
                      <div className="text-2xl font-bold">
                        {calculateTeamCapMetrics?.averageAge.toFixed(1) || '0'}
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">QB Average Age</div>
                      <div className="text-2xl font-bold">
                        {playersByAgeGroup?.avgPositionAge.QB.toFixed(1) || '0'}
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">Skill Position Avg</div>
                      <div className="text-2xl font-bold">
                        {((playersByAgeGroup?.avgPositionAge.RB + 
                           playersByAgeGroup?.avgPositionAge.WR + 
                           playersByAgeGroup?.avgPositionAge.TE) / 3).toFixed(1) || '0'}
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">League Age Rank</div>
                      <div className="text-2xl font-bold">
                        5th Youngest
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Age Distribution Chart */}
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={ageDistributionData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ name, value, percent }) => `${name}: ${percent.toFixed(0)}%`}
                          >
                            {ageDistributionData.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={['#22c55e', '#3b82f6', '#eab308', '#ef4444'][index % 4]} 
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Position Age Comparison */}
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            {
                              name: 'QB',
                              age: playersByAgeGroup?.avgPositionAge.QB || 0,
                              league: 28.4
                            },
                            {
                              name: 'RB',
                              age: playersByAgeGroup?.avgPositionAge.RB || 0,
                              league: 25.2
                            },
                            {
                              name: 'WR',
                              age: playersByAgeGroup?.avgPositionAge.WR || 0,
                              league: 26.1
                            },
                            {
                              name: 'TE',
                              age: playersByAgeGroup?.avgPositionAge.TE || 0,
                              league: 27.3
                            }
                          ]}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                          <XAxis dataKey="name" stroke="#fff" />
                          <YAxis stroke="#fff" domain={[20, 35]} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Bar dataKey="age" name="Your Team" fill="#FF4B1F">
                            <LabelList dataKey="age" position="top" formatter={value => value.toFixed(1)} />
                          </Bar>
                          <Bar dataKey="league" name="League Avg" fill="#3b82f6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Player Age Table */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                      <CardTitle>Player Ages</CardTitle>
                      <CardDescription>Age breakdown by player</CardDescription>
                    </div>
                    <PositionFilter 
                      currentFilter={filterPosition}
                      onFilterChange={setFilterPosition}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-lg border border-white/10 shadow-xl bg-black/20">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-black/40 border-b border-white/10">
                          <th 
                            className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => handleSort('name')}
                          >
                            Player Name
                            {sortConfig.key === 'name' && (
                              <span className="ml-1 text-[#FF4B1F]">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </th>
                          <th 
                            className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => handleSort('position')}
                          >
                            Position
                            {sortConfig.key === 'position' && (
                              <span className="ml-1 text-[#FF4B1F]">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </th>
                          <th 
                            className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => handleSort('age')}
                          >
                            Age
                            {sortConfig.key === 'age' && (
                              <span className="ml-1 text-[#FF4B1F]">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </th>
                          <th 
                            className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => handleSort('experience')}
                          >
                            Experience
                            {sortConfig.key === 'experience' && (
                              <span className="ml-1 text-[#FF4B1F]">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </th>
                          <th className="p-3 text-left">Age Category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSortedPlayers().map((player) => {
                          let ageCategory = '';
                          if (player.age <= 23) ageCategory = 'Young';
                          else if (player.age <= 26) ageCategory = 'Prime';
                          else if (player.age <= 29) ageCategory = 'Veteran';
                          else ageCategory = 'Aging';
                          
                          return (
                            <tr 
                              key={player.id}
                              className={`hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${getPositionStyle(player.position)} cursor-pointer`}
                              onClick={() => setSelectedPlayer(player)}
                            >
                              <td className="p-3 font-medium">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-semibold">{player.name}</div>
                                  {player.injuryStatus && (
                                    <span className="text-xs text-red-400">{player.injuryStatus}</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="bg-black/30 text-xs px-1.5 py-0.5 rounded inline-block font-medium">
                                  {player.position}
                                </div>
                              </td>
                              <td className="p-3 font-medium">
                                {player.age || '-'}
                              </td>
                              <td className="p-3">
                                {player.experience} {player.experience === 1 ? 'year' : 'years'}
                              </td>
                              <td className="p-3">
                                <div className={`text-xs px-2 py-1 rounded inline-block font-medium ${
                                  ageCategory === 'Young' ? 'bg-green-500/20 text-green-400' :
                                  ageCategory === 'Prime' ? 'bg-blue-500/20 text-blue-400' :
                                  ageCategory === 'Veteran' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                  {ageCategory}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Draft Capital Tab Content */}
          <TabsContent value="drafts" className="mt-0">
            <div className="grid grid-cols-1 gap-6">
              {/* Draft Overview */}
              <Card>
                <CardHeader>
                  <CardTitle>Draft Capital Analysis</CardTitle>
                  <CardDescription>Your future draft picks and their values</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">Total Draft Value</div>
                      <div className="text-2xl font-bold">
                        {formatKtcValue(draftCapital.reduce((sum, pick) => sum + pick.value, 0))}
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">2025 Draft Picks</div>
                      <div className="text-2xl font-bold">
                        {draftCapital.filter(p => p.year === 2025).length}
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">2026 Draft Picks</div>
                      <div className="text-2xl font-bold">
                        {draftCapital.filter(p => p.year === 2026).length}
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg">
                      <div className="text-white/70 text-sm">Cap Commitment</div>
                      <div className="text-2xl font-bold text-[#FF4B1F]">
                        {formatSalary(draftCapital.reduce((sum, pick) => sum + pick.salaryCap, 0))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 2025 Draft Capital */}
                    <Card>
                      <CardHeader>
                        <CardTitle>2025 Draft Capital</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="bg-black/40 border-b border-white/10">
                                <th className="p-3 text-left">Round</th>
                                <th className="p-3 text-left">Pick</th>
                                <th className="p-3 text-left">Original Team</th>
                                <th className="p-3 text-right">Value</th>
                                <th className="p-3 text-right">Cap</th>
                              </tr>
                            </thead>
                            <tbody>
                              {draftCapital.filter(p => p.year === 2025).map((pick, index) => (
                                <tr 
                                  key={index}
                                  className="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                                >
                                  <td className="p-3 font-medium">{pick.round}</td>
                                  <td className="p-3">{pick.pick || 'TBD'}</td>
                                  <td className="p-3">{pick.originalTeam}</td>
                                  <td className="p-3 text-right text-blue-400 font-medium">
                                    {formatKtcValue(pick.value)}
                                  </td>
                                  <td className="p-3 text-right text-green-400 font-medium">
                                    {formatSalary(pick.salaryCap)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>

                    {/* 2026 Draft Capital */}
                    <Card>
                      <CardHeader>
                        <CardTitle>2026 Draft Capital</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="bg-black/40 border-b border-white/10">
                                <th className="p-3 text-left">Round</th>
                                <th className="p-3 text-left">Pick</th>
                                <th className="p-3 text-left">Original Team</th>
                                <th className="p-3 text-right">Value</th>
                                <th className="p-3 text-right">Cap</th>
                              </tr>
                            </thead>
                            <tbody>
                              {draftCapital.filter(p => p.year === 2026).map((pick, index) => (
                                <tr 
                                  key={index}
                                  className="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                                >
                                  <td className="p-3 font-medium">{pick.round}</td>
                                  <td className="p-3">{pick.pick || 'TBD'}</td>
                                  <td className="p-3">{pick.originalTeam}</td>
                                  <td className="p-3 text-right text-blue-400 font-medium">
                                    {formatKtcValue(pick.value)}
                                  </td>
                                  <td className="p-3 text-right text-green-400 font-medium">
                                    {formatSalary(pick.salaryCap)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>

              {/* Draft Pick Value Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Draft Pick Value Chart</CardTitle>
                  <CardDescription>KTC values for draft picks</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={[
                          { pick: "1.01", value: 10000, salary: 14 },
                          { pick: "1.02", value: 9600, salary: 12 },
                          { pick: "1.03", value: 9200, salary: 12 },
                          { pick: "1.04", value: 8800, salary: 10 },
                          { pick: "1.05", value: 8400, salary: 10 },
                          { pick: "1.06", value: 8000, salary: 10 },
                          { pick: "1.07", value: 7600, salary: 8 },
                          { pick: "1.08", value: 7200, salary: 8 },
                          { pick: "1.09", value: 6800, salary: 8 },
                          { pick: "1.10", value: 6400, salary: 6 },
                          { pick: "1.11", value: 6000, salary: 6 },
                          { pick: "1.12", value: 5600, salary: 6 },
                          { pick: "2.01", value: 5200, salary: 4 },
                          { pick: "2.06", value: 4400, salary: 4 },
                          { pick: "2.12", value: 3600, salary: 4 },
                          { pick: "3.01", value: 3400, salary: 2 },
                          { pick: "3.06", value: 2800, salary: 2 },
                          { pick: "3.12", value: 2200, salary: 2 },
                          { pick: "4.01", value: 2000, salary: 1 },
                          { pick: "4.06", value: 1500, salary: 1 },
                          { pick: "4.12", value: 1000, salary: 1 }
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                        <XAxis dataKey="pick" stroke="#fff" />
                        <YAxis yAxisId="left" stroke="#3b82f6" domain={[0, 10000]} />
                        <YAxis yAxisId="right" orientation="right" stroke="#22c55e" domain={[0, 15]} />
                        <Tooltip />
                        <Legend />
                        <Line 
                          yAxisId="left" 
                          type="monotone" 
                          dataKey="value" 
                          name="KTC Value" 
                          stroke="#3b82f6" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 7 }}
                        />
                        <Line 
                          yAxisId="right" 
                          type="monotone" 
                          dataKey="salary" 
                          name="Cap Cost ($)" 
                          stroke="#22c55e" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 7 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* League Comparison Tab Content */}
          <TabsContent value="league" className="mt-0">
            <div className="grid grid-cols-1 gap-6">
              {/* Comparison Charts */}
              <Card>
                <CardHeader>
                  <CardTitle>League Comparison</CardTitle>
                  <CardDescription>How your team compares to others in the league</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Team Metrics Comparison */}
                    <div className="h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={leagueComparisonData}
                          layout="vertical"
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" horizontal={false} />
                          <XAxis type="number" stroke="#fff" />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            stroke="#fff" 
                            width={100}
                          />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Bar 
                            dataKey={session?.user?.name || 'Your Team'} 
                            name="Your Team" 
                            fill="#FF4B1F" 
                          />
                          <Bar dataKey="League Avg" name="League Average" fill="#3b82f6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* League Rankings */}
                    <div className="h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            {
                              name: "Team9",
                              value: 62300,
                              isUser: false
                            },
                            {
                              name: "Team3",
                              value: 58700,
                              isUser: false
                            },
                            {
                              name: session?.user?.name || 'Your Team',
                              value: calculateTeamCapMetrics?.totalKtcValue || 50000,
                              isUser: true
                            },
                            {
                              name: "Team7",
                              value: 49200,
                              isUser: false
                            },
                            {
                              name: "Team5",
                              value: 47800,
                              isUser: false
                            },
                            {
                              name: "Team2",
                              value: 46500,
                              isUser: false
                            },
                            {
                              name: "Team11",
                              value: 45100,
                              isUser: false
                            },
                            {
                              name: "Team1",
                              value: 44700,
                              isUser: false
                            },
                            {
                              name: "Team8",
                              value: 42900,
                              isUser: false
                            },
                            {
                              name: "Team6",
                              value: 41300,
                              isUser: false
                            },
                            {
                              name: "Team4",
                              value: 39800,
                              isUser: false
                            },
                            {
                              name: "Team10",
                              value: 38500,
                              isUser: false
                            }
                          ].sort((a, b) => b.value - a.value)}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                          <XAxis dataKey="name" stroke="#fff" />
                          <YAxis stroke="#fff" />
                          <Tooltip 
                            formatter={(value) => [formatKtcValue(value), "Team Value"]}
                          />
                          <Bar dataKey="value" name="Team Value">
                            {[...Array(12)].map((_, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={data => data.payload.isUser ? '#FF4B1F' : '#3b82f6'}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Team Detail Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>Team Details Comparison</CardTitle>
                  <CardDescription>Team-by-team breakdown and comparisons</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-lg border border-white/10 shadow-xl bg-black/20">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-black/40 border-b border-white/10">
                          <th className="p-3 text-left">Team</th>
                          <th className="p-3 text-center">Cap Used</th>
                          <th className="p-3 text-center">Avg Age</th>
                          <th className="p-3 text-center">QB Spend</th>
                          <th className="p-3 text-center">RB Spend</th>
                          <th className="p-3 text-center">WR Spend</th>
                          <th className="p-3 text-center">TE Spend</th>
                          <th className="p-3 text-center">KTC Value</th>
                          <th className="p-3 text-center">Value/$</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(allTeamContracts).map((teamName) => {
                          const team = allTeamContracts[teamName];
                          const teamPlayers = allTeamPlayers[teamName] || [];
                          const totalKtcValue = teamPlayers.reduce((sum, player) => sum + player.value, 0);
                          const valuePerDollar = team.capSpent.curYear > 0 ? totalKtcValue / team.capSpent.curYear : 0;
                          const isCurrentTeam = teamName === session?.user?.name;
                          
                          return (
                            <tr 
                              key={teamName}
                              className={`hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${isCurrentTeam ? 'bg-[#FF4B1F]/10' : ''}`}
                            >
                              <td className="p-3 font-medium">
                                {isCurrentTeam ? (
                                  <div className="flex items-center gap-2">
                                    <span>{teamName}</span>
                                    <span className="bg-[#FF4B1F]/20 text-[#FF4B1F] text-xs px-2 py-0.5 rounded">You</span>
                                  </div>
                                ) : (
                                  teamName
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {formatSalary(team.capSpent.curYear)}
                              </td>
                              <td className="p-3 text-center">
                                {team.averageAge.toFixed(1)}
                              </td>
                              <td className="p-3 text-center">
                                {formatSalary(team.positionSpend.QB)}
                              </td>
                              <td className="p-3 text-center">
                                {formatSalary(team.positionSpend.RB)}
                              </td>
                              <td className="p-3 text-center">
                                {formatSalary(team.positionSpend.WR)}
                              </td>
                              <td className="p-3 text-center">
                                {formatSalary(team.positionSpend.TE)}
                              </td>
                              <td className="p-3 text-center font-medium text-blue-400">
                                {formatKtcValue(totalKtcValue)}
                              </td>
                              <td className="p-3 text-center font-medium text-green-400">
                                {valuePerDollar.toFixed(1)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
                <CardFooter className="border-t border-white/10">
                  <button 
                    className="text-[#FF4B1F] hover:text-[#FF4B1F]/80 text-sm"
                    onClick={() => setShowTeamComparison(true)}
                  >
                    Open Detailed Comparison
                  </button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Player Profile Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#001A2B] border border-white/10 rounded-lg max-w-2xl w-full shadow-2xl">
            <div className="bg-gradient-to-r from-[#FF4B1F]/20 to-transparent p-4 border-b border-white/10 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">{selectedPlayer.name}</h2>
                <p className="text-white/70 text-sm">
                  {selectedPlayer.position} • {selectedPlayer.team || 'N/A'} • Age: {selectedPlayer.age || 'N/A'}
                </p>
              </div>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Player Contract */}
                <div className="bg-black/20 p-4 rounded-lg">
                  <h3 className="font-bold mb-4">Contract Details</h3>
                  
                  {(() => {
                    const contract = getPlayerContract(selectedPlayer);
                    if (!contract) {
                      return (
                        <div className="text-white/70 italic">
                          No contract information available
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-white/70">Year 1:</span>
                          <span className="font-bold text-green-400">
                            {formatSalary(parseFloat(contract.CurYear) || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/70">Year 2:</span>
                          <span className="font-bold text-yellow-400">
                            {contract.Year2 ? formatSalary(parseFloat(contract.Year2) || 0) : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/70">Year 3:</span>
                          <span className="font-bold text-orange-400">
                            {contract.Year3 ? formatSalary(parseFloat(contract.Year3) || 0) : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/70">Year 4:</span>
                          <span className="font-bold text-red-400">
                            {contract.Year4 ? formatSalary(parseFloat(contract.Year4) || 0) : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-white/10 pt-2 mt-2">
                          <span className="text-white/70">Contract Type:</span>
                          <span className="font-bold">
                            {contract.ContractType || 'Standard'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/70">Final Year:</span>
                          <span className="font-bold">
                            {contract.ContractFinalYear || 'N/A'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                {/* Player Value */}
                <div className="bg-black/20 p-4 rounded-lg">
                  <h3 className="font-bold mb-4">Player Value</h3>
                  
                  {(() => {
                    const ktcData = ktcValues[selectedPlayer.id] || ktcValues[selectedPlayer.name];
                    const contract = getPlayerContract(selectedPlayer);
                    const ktcValue = ktcData?.value || 0;
                    const salary = contract ? parseFloat(contract.CurYear) || 0 : 0;
                    const valueRatio = salary > 0 ? ktcValue / salary : 0;
                    
                    if (!ktcData) {
                      return (
                        <div className="text-white/70 italic">
                          No value information available
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-white/70">KTC Value:</span>
                          <span className="font-bold text-blue-400">
                            {formatKtcValue(ktcValue)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/70">Overall Rank:</span>
                          <span className="font-bold">
                            {ktcData.rank || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/70">Position Rank:</span>
                          <span className="font-bold">
                            {ktcData.positionRank || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-white/10 pt-2 mt-2">
                          <span className="text-white/70">Current Salary:</span>
                          <span className="font-bold text-green-400">
                            {formatSalary(salary)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/70">Value Per $:</span>
                          <span className="font-bold text-yellow-400">
                            {valueRatio.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              
              {/* Player Stats & Information */}
              <div className="mt-6 bg-black/20 p-4 rounded-lg">
                <h3 className="font-bold mb-4">Player Information</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div className="flex justify-between">
                    <span className="text-white/70">Age:</span>
                    <span>{selectedPlayer.age || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Experience:</span>
                    <span>{selectedPlayer.experience || 0} {selectedPlayer.experience === 1 ? 'year' : 'years'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Status:</span>
                    <span>{selectedPlayer.status || 'Active'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Injury:</span>
                    <span className={selectedPlayer.injuryStatus ? 'text-red-400' : ''}>
                      {selectedPlayer.injuryStatus || 'Healthy'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Team:</span>
                    <span>{selectedPlayer.team || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Jersey #:</span>
                    <span>{selectedPlayer.number || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setSelectedPlayer(null)}
                className="px-4 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Team Comparison Modal */}
      {showTeamComparison && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#001A2B] border border-white/10 rounded-lg max-w-6xl w-full h-[80vh] shadow-2xl flex flex-col">
            <div className="bg-gradient-to-r from-[#FF4B1F]/20 to-transparent p-4 border-b border-white/10 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Team Comparison</h2>
                <p className="text-white/70 text-sm">
                  Compare your team against others in the league
                </p>
              </div>
              <button
                onClick={() => setShowTeamComparison(false)}
                className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="space-y-6">
                {/* Cap Space Comparison */}
                <div>
                  <h3 className="text-xl font-bold mb-4">Cap Space Utilization</h3>
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={Object.keys(allTeamContracts).map(team => ({
                          name: team,
                          used: allTeamContracts[team].capSpent.curYear,
                          remaining: 300 - allTeamContracts[team].capSpent.curYear,
                          isCurrentTeam: team === session?.user?.name
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                        <XAxis dataKey="name" stroke="#fff" />
                        <YAxis stroke="#fff" domain={[0, 300]} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Bar 
                          dataKey="used" 
                          stackId="a" 
                          name="Cap Used"
                          fill="#3b82f6"
                        >
                          {Object.keys(allTeamContracts).map((team, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={team === session?.user?.name ? '#FF4B1F' : '#3b82f6'} 
                            />
                          ))}
                        </Bar>
                        <Bar 
                          dataKey="remaining" 
                          stackId="a" 
                          name="Cap Available" 
                          fill="#22c55e" 
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                {/* Position Spending Comparison */}
                <div>
                  <h3 className="text-xl font-bold mb-4">Position Spending by Team</h3>
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={Object.keys(allTeamContracts).map(team => ({
                          name: team,
                          QB: allTeamContracts[team].positionSpend.QB,
                          RB: allTeamContracts[team].positionSpend.RB,
                          WR: allTeamContracts[team].positionSpend.WR,
                          TE: allTeamContracts[team].positionSpend.TE,
                          isCurrentTeam: team === session?.user?.name
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                        <XAxis dataKey="name" stroke="#fff" />
                        <YAxis stroke="#fff" />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Bar dataKey="QB" name="QB" fill="#ef4444" />
                        <Bar dataKey="RB" name="RB" fill="#3b82f6" />
                        <Bar dataKey="WR" name="WR" fill="#22c55e" />
                        <Bar dataKey="TE" name="TE" fill="#a855f7" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                {/* Age Comparison */}
                <div>
                  <h3 className="text-xl font-bold mb-4">Team Age Comparison</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={Object.keys(allTeamContracts).map(team => ({
                          name: team,
                          age: allTeamContracts[team].averageAge,
                          isCurrentTeam: team === session?.user?.name
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                        <XAxis dataKey="name" stroke="#fff" />
                        <YAxis stroke="#fff" domain={[20, 30]} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="age" name="Average Age">
                          {Object.keys(allTeamContracts).map((team, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={team === session?.user?.name ? '#FF4B1F' : '#3b82f6'} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                {/* Value Comparison */}
                <div>
                  <h3 className="text-xl font-bold mb-4">Team Value and Value Per Dollar</h3>
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={Object.keys(allTeamContracts).map(team => {
                          const teamPlayers = allTeamPlayers[team] || [];
                          const totalValue = teamPlayers.reduce((sum, player) => sum + player.value, 0);
                          const valuePerDollar = allTeamContracts[team].capSpent.curYear > 0 
                            ? totalValue / allTeamContracts[team].capSpent.curYear 
                            : 0;
                          
                          return {
                            name: team,
                            value: totalValue / 1000, // Scale down for visibility
                            valuePerDollar: valuePerDollar,
                            isCurrentTeam: team === session?.user?.name
                          };
                        })}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                        <XAxis dataKey="name" stroke="#fff" />
                        <YAxis yAxisId="left" stroke="#3b82f6" />
                        <YAxis yAxisId="right" orientation="right" stroke="#22c55e" />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Bar 
                          yAxisId="left" 
                          dataKey="value" 
                          name="KTC Value (thousands)" 
                        >
                          {Object.keys(allTeamContracts).map((team, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={team === session?.user?.name ? '#FF4B1F' : '#3b82f6'} 
                            />
                          ))}
                        </Bar>
                        <Bar 
                          yAxisId="right" 
                          dataKey="valuePerDollar" 
                          name="Value Per $" 
                          fill="#22c55e" 
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setShowTeamComparison(false)}
                className="px-4 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}