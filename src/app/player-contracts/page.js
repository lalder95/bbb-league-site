'use client';
import React, { useState, useEffect } from 'react';
import PlayerProfileCard from '../my-team/components/PlayerProfileCard';

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

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
        const text = await response.text();

        const rows = text.split('\n');
        const headers = rows[0].split(',');

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
              age: values[31],
              ktcValue: values[32],
              rfaEligible: values[36],
              franchiseTagEligible: values[37],
            };
          });

        setPlayers(parsedData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

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

  const filteredAndSortedPlayers = [...players]
    .filter(player =>
      player.playerName.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (positionFilters.size === 0 || positionFilters.has(player.position)) &&
      (statusFilters.size === 0 || statusFilters.has(player.status)) &&
      (teamFilters.size === 0 || teamFilters.has(player.team)) &&
      (player.curYear !== 0 || player.year2 !== 0 || player.year3 !== 0 || player.year4 !== 0)
    )
    .sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      if (sortConfig.direction === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

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
            <PlayerProfileCard playerId={selectedPlayerId} contracts={players} />
            <button
              className="absolute top-2 right-2 text-white bg-black/60 rounded-full px-3 py-1 hover:bg-black"
              onClick={() => setSelectedPlayerId(null)}
            >
              ×
            </button>
          </div>
        </div>
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
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-black/40 border-b border-white/10">
                {{
                  key: 'team',
                  label: 'Team'
                },
                {
                  key: 'playerName',
                  label: 'Player Name'
                },
                {
                  key: 'contractType',
                  label: 'Contract Type'
                },
                {
                  key: 'curYear',
                  label: 'Cur Year'
                },
                {
                  key: 'year2',
                  label: 'Year 2'
                },
                {
                  key: 'year3',
                  label: 'Year 3'
                },
                {
                  key: 'year4',
                  label: 'Year 4'
                },
                {
                  key: 'contractFinalYear',
                  label: 'Final Year'
                }
                }.map(({ key, label }) => (
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
              {filteredAndSortedPlayers.map((player, index) => (
                <tr
                  key={index}
                  className={`hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${getPositionStyles(player.position)}`}
                >
                  <td className="p-3">{player.team}</td>
                  <td
                    className={`p-3 font-medium ${getStatusColor(player.status)} cursor-pointer underline`}
                    onClick={() => setSelectedPlayerId(player.playerId)}
                  >
                    {player.playerName}
                  </td>
                  <td className={`p-3 ${getContractTypeColor(player.contractType)}`}>
                    {player.contractType}
                  </td>
                  <td className={`p-3 ${getSalaryColor(player.curYear, player.isDeadCap)}`}>
                    {formatSalary(player.curYear, player.isDeadCap)}
                  </td>
                  <td className={`p-3 ${getSalaryColor(player.year2, player.isDeadCap)}`}>
                    {formatSalary(player.year2, player.isDeadCap)}
                  </td>
                  <td className={`p-3 ${getSalaryColor(player.year3, player.isDeadCap)}`}>
                    {formatSalary(player.year3, player.isDeadCap)}
                  </td>
                  <td className={`p-3 ${getSalaryColor(player.year4, player.isDeadCap)}`}>
                    {formatSalary(player.year4, player.isDeadCap)}
                  </td>
                  <td className="p-3">{player.contractFinalYear}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}