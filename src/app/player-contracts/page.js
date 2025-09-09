'use client';
import React, { useState, useEffect } from 'react';
import PlayerProfileCard from '../my-team/components/PlayerProfileCard';
import EscapeKeyListener from './EscapeKeyListener';
import SwipeDownListener from './SwipeDownListener';
import Image from 'next/image'; // Add this import

const USER_ID = '456973480269705216'; // Your Sleeper user ID

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[\s.'-]/g, "_") // replace spaces, dots, apostrophes, hyphens with underscore
    .replace(/[^a-z0-9_]/g, ""); // remove any other non-alphanumeric/underscore
}

export default function Home() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilters, setPositionFilters] = useState(new Set());
  const [statusFilters, setStatusFilters] = useState(new Set());
  const [teamFilters, setTeamFilters] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ key: 'playerName', direction: 'asc' });
  const [showPositionDropdown, setShowPositionDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [teamAvatars, setTeamAvatars] = useState({});
  const [leagueId, setLeagueId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(50);

  // --- STEP 1: Safelist all avatar sizes for Tailwind production builds ---
  // This ensures all avatar sizes are included in the final CSS bundle.
  // You can place this anywhere in your component.
  // It will not render anything visible, but will keep the classes in production.
  const tailwindSafelist = (
    <div className="hidden">
      w-8 h-8 w-20 h-20 w-28 h-28 w-36 h-36 sm:w-32 sm:h-32 sm:w-40 sm:h-40
    </div>
  );
  // --- END STEP 1 ---

  // Responsive
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-detect league ID (copied from home page)
  useEffect(() => {
    async function findBBBLeague() {
      try {
        // Get current NFL season
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;

        // Get user's leagues for the current season
        const userLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${currentSeason}`);
        const userLeagues = await userLeaguesResponse.json();

        // Try flexible matching for "Budget Blitz Bowl"
        let bbbLeagues = userLeagues.filter(league =>
          league.name && (
            league.name.includes('Budget Blitz Bowl') ||
            league.name.includes('budget blitz bowl') ||
            league.name.includes('BBB') ||
            (league.name.toLowerCase().includes('budget') && league.name.toLowerCase().includes('blitz'))
          )
        );

        // If not found, try previous season
        if (bbbLeagues.length === 0) {
          const prevSeason = (parseInt(currentSeason) - 1).toString();
          const prevSeasonResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${prevSeason}`);
          if (prevSeasonResponse.ok) {
            const prevSeasonLeagues = await prevSeasonResponse.json();
            const prevBBBLeagues = prevSeasonLeagues.filter(league =>
              league.name && (
                league.name.includes('Budget Blitz Bowl') ||
                league.name.includes('budget blitz bowl') ||
                league.name.includes('BBB') ||
                (league.name.toLowerCase().includes('budget') && league.name.toLowerCase().includes('blitz'))
              )
            );
            if (prevBBBLeagues.length > 0) {
              bbbLeagues = prevBBBLeagues;
            } else if (userLeagues.length > 0) {
              bbbLeagues = [userLeagues[0]];
            } else if (prevSeasonLeagues.length > 0) {
              bbbLeagues = [prevSeasonLeagues[0]];
            }
          } else if (userLeagues.length > 0) {
            bbbLeagues = [userLeagues[0]];
          }
        }

        // Sort by season and take the most recent
        const mostRecentLeague = bbbLeagues.sort((a, b) => b.season - a.season)[0];
        setLeagueId(mostRecentLeague.league_id);
      } catch (err) {
        setLeagueId(null);
      }
    }
    findBBBLeague();
  }, []);

  // Fetch contract data
  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
        const text = await response.text();
        const rows = text.split('\n');
        const parsedData = rows.slice(1)
          .filter(row => row.trim())
          .map(row => {
            const values = row.split(',');
            const status = values[14];
            const isActive = status === 'Active';
            return {
              playerId: values[0],
              playerName: values[1],
              position: values[21],
              contractType: values[2],
              status: status,
              team: values[33], // TeamDisplayName
              curYear: isActive ? parseFloat(values[15]) || 0 : parseFloat(values[24]) || 0,
              year2: isActive ? parseFloat(values[16]) || 0 : parseFloat(values[25]) || 0,
              year3: isActive ? parseFloat(values[17]) || 0 : parseFloat(values[26]) || 0,
              year4: isActive ? parseFloat(values[18]) || 0 : parseFloat(values[27]) || 0,
              isDeadCap: !isActive,
              contractFinalYear: values[5],
              age: values[32],
              ktcValue: values[34] ? parseInt(values[34], 10) : null, // <-- Parse as integer
              rfaEligible: values[37],
              franchiseTagEligible: values[38],
            };
          });
        setPlayers(parsedData);
      } catch (error) {
        // Optionally handle error
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Fetch avatars using detected leagueId
  useEffect(() => {
    if (!leagueId) return;
    async function fetchAvatars() {
      try {
        const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
        const users = await res.json();
        const avatarMap = {};
        users.forEach(user => {
          avatarMap[user.display_name] = user.avatar;
        });
        setTeamAvatars(avatarMap);
      } catch (e) {
        // Optionally handle error
      }
    }
    fetchAvatars();
  }, [leagueId]);

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  const getPositionStyles = (position) => {
    switch (position?.toUpperCase()) {
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

  const getContractTypeColor = (type) => {
    switch (type.toLowerCase()) {
      case 'base':
        return 'bg-[#FF4B1F] bg-opacity-20 text-white';
      case 'waiver':
        return 'bg-white bg-opacity-10 text-white';
      default:
        return 'bg-gray-800 text-white';
    }
  };

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'text-[#FF4B1F]';
      case 'expired':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
    }
  };

  const formatSalary = (value, isDeadCap = false) => {
    if (!value || value === 0) return '-';
    return `$${value.toFixed(1)}${isDeadCap ? '*' : ''}`;
  };

  const getSalaryColor = (value, isDeadCap) => {
    if (!value || value === 0) return '';
    return isDeadCap ? 'text-red-400' : 'text-green-400';
  };

  const uniqueTeams = [...new Set(players.map(player => player.team))].sort();

  const toggleFilter = (value, filterSet, setFilterSet) => {
    const newFilters = new Set(filterSet);
    if (newFilters.has(value)) {
      newFilters.delete(value);
    } else {
      newFilters.add(value);
    }
    setFilterSet(newFilters);
  };

  // Filter and sort players (do not remove duplicates)
  const filteredAndSortedPlayers = players
    .filter(player =>
      player.playerName.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (positionFilters.size === 0 || positionFilters.has(player.position)) &&
      (statusFilters.size === 0 || statusFilters.has(player.status)) &&
      (teamFilters.size === 0 || teamFilters.has(player.team)) &&
      (player.curYear !== 0 || player.year2 !== 0 || player.year3 !== 0 || player.year4 !== 0)
    )
    .sort((a, b) => {
      const key = sortConfig.key;
      let aVal = a[key];
      let bVal = b[key];

      // Special handling for KTC and numeric columns
      const numericKeys = ['curYear', 'ktcValue', 'year2', 'year3', 'year4', 'age', 'contractFinalYear'];
      if (numericKeys.includes(key)) {
        aVal = aVal === null || aVal === undefined || isNaN(Number(aVal)) ? -Infinity : Number(aVal);
        bVal = bVal === null || bVal === undefined || isNaN(Number(bVal)) ? -Infinity : Number(bVal);
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // Fallback for string comparison (case-insensitive)
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
        if (sortConfig.direction === 'asc') {
          return aVal.localeCompare(bVal);
        } else {
          return bVal.localeCompare(aVal);
        }
      }

      // Fallback for other types
      if (sortConfig.direction === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

  const visiblePlayers = filteredAndSortedPlayers.slice(0, visibleCount);

  const handleShowMore = () => {
    setVisibleCount((prev) => prev + 50);
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (!event.target.closest('.dropdown-container')) {
        setShowPositionDropdown(false);
        setShowStatusDropdown(false);
        setShowTeamDropdown(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      {tailwindSafelist}
      <div className={`${isMobile ? 'p-4' : 'p-6'} bg-black/30 border-b border-white/10`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className={isMobile ? "h-12 w-12 transition-transform hover:scale-105" : "h-16 w-16 transition-transform hover:scale-105"}
            />
            <h1 className={isMobile ? "text-2xl font-bold text-[#FF4B1F]" : "text-3xl font-bold text-[#FF4B1F]"}>Player Contracts</h1>
          </div>
        </div>
      </div>

      {/* Player Card Modal */}
      {selectedPlayerId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setSelectedPlayerId(null)}
        >
          <div
            className="bg-transparent p-0 rounded-lg shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <PlayerProfileCard
              playerId={selectedPlayerId}
              expanded={true}
              className="w-56 h-80 sm:w-72 sm:h-[26rem] md:w-80 md:h-[30rem] max-w-full max-h-[90vh]"
              teamAvatars={teamAvatars}
              teamName={(() => {
                const player = players.find(p => String(p.playerId) === String(selectedPlayerId));
                return player ? player.team : '';
              })()}
              // Pass a close handler so the in-card red X can collapse the modal
              onExpandClick={() => setSelectedPlayerId(null)}
            />
            <button
              className="absolute top-2 right-2 text-white bg-black/60 rounded-full px-3 py-1 hover:bg-black"
              onClick={() => setSelectedPlayerId(null)}
            >
              ×
            </button>
          </div>
          <EscapeKeyListener onEscape={() => setSelectedPlayerId(null)} />
          <SwipeDownListener onSwipeDown={() => setSelectedPlayerId(null)} />
        </div>
      )}

      {/* Escape key closes modal */}
      {selectedPlayerId && (
        <EscapeKeyListener onEscape={() => setSelectedPlayerId(null)} />
      )}

      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6 flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Search for a player..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="p-3 rounded bg-white/5 border border-white/10 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#FF4B1F] focus:border-transparent transition-all w-full md:w-64"
          />

          <div className="relative w-full md:w-64 dropdown-container">
            <div 
              onClick={(e) => {
                e.stopPropagation();
                setShowPositionDropdown(!showPositionDropdown);
                setShowStatusDropdown(false);
                setShowTeamDropdown(false);
              }}
              className="p-3 rounded bg-white/5 border border-white/10 text-white min-h-[45px] cursor-pointer"
            >
              <div className="flex flex-wrap gap-1">
                {Array.from(positionFilters).map(pos => (
                  <span key={pos} className="bg-[#FF4B1F] px-2 py-1 rounded text-sm flex items-center gap-1">
                    {pos}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFilter(pos, positionFilters, setPositionFilters);
                      }}
                      className="ml-1 hover:text-white/80"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {positionFilters.size === 0 && <span className="text-white/50">Select Positions...</span>}
              </div>
            </div>
            {showPositionDropdown && (
              <div className="absolute mt-1 w-full bg-[#001A2B] border border-white/10 rounded shadow-xl z-20">
                {['QB', 'RB', 'WR', 'TE'].map(pos => (
                  <div
                    key={pos}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFilter(pos, positionFilters, setPositionFilters);
                    }}
                    className={`p-2 cursor-pointer hover:bg-white/5 ${positionFilters.has(pos) ? 'bg-[#FF4B1F] bg-opacity-20' : ''}`}
                  >
                    {pos}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relative w-full md:w-64 dropdown-container">
            <div 
              onClick={(e) => {
                e.stopPropagation();
                setShowStatusDropdown(!showStatusDropdown);
                setShowPositionDropdown(false);
                setShowTeamDropdown(false);
              }}
              className="p-3 rounded bg-white/5 border border-white/10 text-white min-h-[45px] cursor-pointer"
            >
              <div className="flex flex-wrap gap-1">
                {Array.from(statusFilters).map(status => (
                  <span key={status} className="bg-[#FF4B1F] px-2 py-1 rounded text-sm flex items-center gap-1">
                    {status}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFilter(status, statusFilters, setStatusFilters);
                      }}
                      className="ml-1 hover:text-white/80"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {statusFilters.size === 0 && <span className="text-white/50">Select Status...</span>}
              </div>
            </div>
            {showStatusDropdown && (
              <div className="absolute mt-1 w-full bg-[#001A2B] border border-white/10 rounded shadow-xl z-20">
                {['Active', 'Expired'].map(status => (
                  <div
                    key={status}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFilter(status, statusFilters, setStatusFilters);
                    }}
                    className={`p-2 cursor-pointer hover:bg-white/5 ${statusFilters.has(status) ? 'bg-[#FF4B1F] bg-opacity-20' : ''}`}
                  >
                    {status}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relative w-full md:w-64 dropdown-container">
            <div 
              onClick={(e) => {
                e.stopPropagation();
                setShowTeamDropdown(!showTeamDropdown);
                setShowPositionDropdown(false);
                setShowStatusDropdown(false);
              }}
              className="p-3 rounded bg-white/5 border border-white/10 text-white min-h-[45px] cursor-pointer"
            >
              <div className="flex flex-wrap gap-1">
                {Array.from(teamFilters).map(team => (
                  <span key={team} className="bg-[#FF4B1F] px-2 py-1 rounded text-sm flex items-center gap-1">
                    {team}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFilter(team, teamFilters, setTeamFilters);
                      }}
                      className="ml-1 hover:text-white/80"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {teamFilters.size === 0 && <span className="text-white/50">Select Teams...</span>}
              </div>
            </div>
            {showTeamDropdown && (
              <div className="absolute mt-1 w-full bg-[#001A2B] border border-white/10 rounded shadow-xl z-20 max-h-48 overflow-y-auto">
                {uniqueTeams.map(team => (
                  <div
                    key={team}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFilter(team, teamFilters, setTeamFilters);
                    }}
                    className={`p-2 cursor-pointer hover:bg-white/5 ${teamFilters.has(team) ? 'bg-[#FF4B1F] bg-opacity-20' : ''}`}
                  >
                    {team}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {isMobile && (
          <div className="flex items-center gap-2 mb-4 px-2">
            <label htmlFor="mobile-sort" className="text-lg font-semibold">Sort by:</label>
            <select
              id="mobile-sort"
              value={sortConfig.key}
              onChange={e => setSortConfig({ ...sortConfig, key: e.target.value })}
              className="bg-black/40 border border-white/10 rounded px-6 py-3 text-white text-lg"
              style={{ minWidth: 220, minHeight: 48 }}
            >
              <option value="playerName">Player Name</option>
              <option value="team">Team</option>
              <option value="contractType">Contract Type</option>
              <option value="curYear">Salary</option>
              <option value="ktcValue">KTC</option>
              <option value="rfaEligible">RFA?</option>
              <option value="franchiseTagEligible">FT?</option>
              <option value="contractFinalYear">Final Year</option>
            </select>
            <button
              onClick={() =>
                setSortConfig({
                  ...sortConfig,
                  direction: sortConfig.direction === 'asc' ? 'desc' : 'asc'
                })
              }
              className="ml-2 px-5 py-3 rounded bg-[#FF4B1F] text-white text-lg"
              title="Toggle sort direction"
              style={{ minHeight: 48 }}
            >
              {sortConfig.direction === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-4">
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
          <div className="flex items-center gap-2 ml-8">
            <span className="text-green-400">$1.0</span>
            <span>= Active Cap</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">$1.0*</span>
            <span>= Dead Cap</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-white/10 shadow-xl bg-black/20">
          {!isMobile ? (
            <>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-black/40 border-b border-white/10">
                    {[ 
                      { key: 'profile', label: '' }, // PlayerProfileCard column
                      { key: 'playerName', label: 'Player Name' },
                      { key: 'team', label: 'Team' },
                      { key: 'contractType', label: 'Contract Type' },
                      { key: 'curYear', label: 'Salary' }, // Renamed from "Cur Year"
                      { key: 'ktcValue', label: <span title="KeepTradeCut Value">KTC</span> },
                      { key: 'rfaEligible', label: <span title="Restricted Free Agent Eligible">RFA?</span> },
                      { key: 'franchiseTagEligible', label: <span title="Franchise Tag Eligible">FT?</span> },
                      { key: 'contractFinalYear', label: 'Final Year' }
                    ].map(({ key, label }) => {
                      // Only make sortable columns have pointer and click handler
                      const isSortable = !['profile'].includes(key);
                      return (
                        <th
                          key={key}
                          onClick={isSortable ? (e) => { e.stopPropagation(); handleSort(key); } : undefined}
                          className={`p-3 text-left transition-colors ${isSortable ? 'cursor-pointer hover:bg-white/5' : ''}`}
                          style={isSortable ? { userSelect: 'none' } : {}}
                        >
                          <div className="flex items-center gap-2">
                            {label}
                            {sortConfig.key === key && isSortable && (
                              <span className="text-[#FF4B1F]">
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visiblePlayers.map((player) => (
                    <tr
                      key={player.contractId || `${player.playerId}-${player.contractFinalYear || ''}`}
                      className={`hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${getPositionStyles(player.position)}`}
                    >
                      {/* PlayerProfileCard column */}
                      <td
                        className="p-3 align-middle"
                        style={{ width: '40px', minWidth: '40px', cursor: 'pointer' }}
                        onClick={() => setSelectedPlayerId(player.playerId)}
                        title="View Player Card"
                      >
                        <PlayerProfileCard
                          playerId={player.playerId}
                          expanded={false}
                          className="w-8 h-8 rounded-full overflow-hidden shadow object-cover m-0 p-0"
                        />
                      </td>
                      {/* Player Name column */}
                      <td
                        className={`p-3 font-medium ${getStatusColor(player.status)} cursor-pointer underline`}
                        onClick={() => setSelectedPlayerId(player.playerId)}
                      >
                        {player.playerName}
                      </td>
                      {/* Team column */}
                      <td className="p-3 align-middle">
                        <div className="flex items-center gap-2">
                          {teamAvatars[player.team] ? (
                            <Image
                              src={`https://sleepercdn.com/avatars/${teamAvatars[player.team]}`}
                              alt={player.team}
                              width={20}
                              height={20}
                              className="rounded-full mr-2"
                            />
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-white/10 mr-2 inline-block"></span>
                          )}
                          {player.team}
                        </div>
                      </td>
                      <td className={`p-3 ${getContractTypeColor(player.contractType)}`}>
                        {player.contractType}
                      </td>
                      <td className={`p-3 ${getSalaryColor(player.curYear, player.isDeadCap)}`}>
                        {formatSalary(player.curYear, player.isDeadCap)}
                      </td>
                      {/* KTC Value column */}
                      <td className="p-3 text-center">
                        {player.ktcValue ? player.ktcValue : '-'}
                      </td>
                      {/* RFA? icon */}
                      <td className="p-3 text-center">
                        {String(player.rfaEligible).toLowerCase() === 'true' ? (
                          <span
                            title="This Player will enter RFA when this contract expires."
                            className="text-green-400"
                            aria-label="RFA Eligible"
                          >
                            ✔️
                          </span>
                        ) : (
                          <span
                            title="This player will NOT enter RFA."
                            className="text-red-400"
                            aria-label="Not RFA Eligible"
                          >
                            ❌
                          </span>
                        )}
                      </td>
                      {/* Franchise Tag Eligible? icon */}
                      <td className="p-3 text-center">
                        {String(player.franchiseTagEligible).toLowerCase() === 'true' ? (
                          <span
                            title="This player is Franchise Tag eligible."
                            className="text-green-400"
                            aria-label="Franchise Tag Eligible"
                          >
                            ✔️
                          </span>
                        ) : (
                          <span
                            title="This player is NOT Franchise Tag eligible."
                            className="text-red-400"
                            aria-label="Not Franchise Tag Eligible"
                          >
                            ❌
                          </span>
                        )}
                      </td>
                      <td className="p-3">{player.contractFinalYear}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleCount < filteredAndSortedPlayers.length && (
                <div className="flex justify-center py-4">
                  <button
                    onClick={handleShowMore}
                    className="px-4 py-2 rounded bg-[#FF4B1F] text-white font-semibold hover:bg-[#e03e0f] transition"
                  >
                    Show More
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-col gap-4 p-2">
                {visiblePlayers.map((player) => (
                  <div
                    key={player.contractId || `${player.playerId}-${player.contractFinalYear || ''}`}
                    className={`bg-black/60 rounded-lg shadow p-4 border-l-4 ${getPositionStyles(player.position)} flex gap-4 items-center`}
                  >
                    <div className="flex flex-col items-center justify-center">
                      <PlayerProfileCard
                        playerId={player.playerId}
                        expanded={false}
                        className="w-36 h-36 sm:w-40 sm:h-40 rounded-full overflow-hidden shadow object-cover m-0 p-0 cursor-pointer"
                        onClick={() => setSelectedPlayerId(player.playerId)}
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-2">
                      {/* Name & Position */}
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`font-bold text-lg underline cursor-pointer ${getStatusColor(player.status)}`}
                          onClick={() => setSelectedPlayerId(player.playerId)}
                        >
                          {player.playerName}
                        </span>
                        <span className="text-xs px-2 py-1 rounded ml-2 bg-[#222] text-[#FF4B1F]">
                          {player.position}
                        </span>
                      </div>
                      {/* Team Block */}
                      <div className="flex items-center gap-2 bg-white/5 rounded px-2 py-1">
                        {teamAvatars[player.team] ? (
                          <Image
                            src={`https://sleepercdn.com/avatars/${teamAvatars[player.team]}`}
                            alt={player.team}
                            width={20}
                            height={20}
                            className="rounded-full"
                          />
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-white/10 inline-block"></span>
                        )}
                        <span className="font-medium">{player.team}</span>
                      </div>
                      {/* Contract Block */}
                      <div className="flex flex-wrap gap-2 bg-white/5 rounded px-2 py-1">
                        <span className={`px-2 py-1 rounded ${getContractTypeColor(player.contractType)}`}>
                          {player.contractType}
                        </span>
                        <span className={getSalaryColor(player.curYear, player.isDeadCap)}>
                          Salary: {formatSalary(player.curYear, player.isDeadCap)}
                        </span>
                        <span>
                          Final Year: <span className="font-semibold">{player.contractFinalYear}</span>
                        </span>
                      </div>
                      {/* Value Block */}
                      <div className="flex items-center gap-2 bg-white/5 rounded px-2 py-1">
                        <span>KTC:</span>
                        <span className="font-semibold">{player.ktcValue ? player.ktcValue : '-'}</span>
                      </div>
                      {/* Eligibility Block */}
                      <div className="flex items-center gap-4 bg-white/5 rounded px-2 py-1">
                        <span>
                          RFA?{' '}
                          {String(player.rfaEligible).toLowerCase() === 'true' ? (
                            <span className="text-green-400" title="RFA Eligible">✔️</span>
                          ) : (
                            <span className="text-red-400" title="Not RFA Eligible">❌</span>
                          )}
                        </span>
                        <span>
                          FT?{' '}
                          {String(player.franchiseTagEligible).toLowerCase() === 'true' ? (
                            <span className="text-green-400" title="Franchise Tag Eligible">✔️</span>
                          ) : (
                            <span className="text-red-400" title="Not Franchise Tag Eligible">❌</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {visibleCount < filteredAndSortedPlayers.length && (
                <div className="flex justify-center py-4">
                  <button
                    onClick={handleShowMore}
                    className="px-4 py-2 rounded bg-[#FF4B1F] text-white font-semibold hover:bg-[#e03e0f] transition"
                  >
                    Show More
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}