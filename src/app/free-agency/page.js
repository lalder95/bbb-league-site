'use client';
import { useState, useEffect } from 'react';
import PlayerProfileCard from '../my-team/components/PlayerProfileCard';

const USER_ID = '456973480269705216'; // Your Sleeper user ID

// Utility for position color
const positionColors = {
  QB: 'bg-[#8B5CF6]',
  RB: 'bg-[#10B981]',
  WR: 'bg-[#3B82F6]',
  TE: 'bg-[#F59E0B]',
};

function getPositionColor(pos) {
  return positionColors[pos] || 'bg-gray-500';
}

export default function FreeAgency() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState('2025');
  const [years, setYears] = useState([]);
  const [teamAvatars, setTeamAvatars] = useState({});
  const [leagueId, setLeagueId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'playerName', direction: 'asc' });
  // Set default sort for position tables to KTC descending
  const [positionSortConfig, setPositionSortConfig] = useState({ key: 'ktcValue', direction: 'desc' });
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

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
            return {
              playerId: values[0],
              playerName: values[1],
              position: values[21],
              contractType: values[2],
              status: values[14],
              team: values[33],
              contractFinalYear: values[5],
              age: values[32],
              ktcValue: values[34] ? parseInt(values[34], 10) : null,
              rfaEligible: values[37],
              franchiseTagEligible: values[38],
            };
          })
          .filter(player => player.status === 'Active'); // Only include active contracts
        setPlayers(parsedData);

        // Collect unique years for dropdown
        const uniqueYears = Array.from(new Set(parsedData.map(p => p.contractFinalYear).filter(Boolean)))
          .sort();
        setYears(uniqueYears);
        if (uniqueYears.length > 0) setYear(uniqueYears[0]);
      } catch (error) {
        // Optionally handle error
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Auto-detect league ID for avatars
  useEffect(() => {
    async function findBBBLeague() {
      try {
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;
        const userLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${currentSeason}`);
        const userLeagues = await userLeaguesResponse.json();
        let bbbLeagues = userLeagues.filter(league =>
          league.name && (
            league.name.includes('Budget Blitz Bowl') ||
            league.name.includes('budget blitz bowl') ||
            league.name.includes('BBB') ||
            (league.name.toLowerCase().includes('budget') && league.name.toLowerCase().includes('blitz'))
          )
        );
        if (bbbLeagues.length === 0 && userLeagues.length > 0) {
          bbbLeagues = [userLeagues[0]];
        }
        const mostRecentLeague = bbbLeagues.sort((a, b) => b.season - a.season)[0];
        setLeagueId(mostRecentLeague.league_id);
      } catch (err) {
        setLeagueId(null);
      }
    }
    findBBBLeague();
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
      } catch (e) {}
    }
    fetchAvatars();
  }, [leagueId]);

  // Filter for selected year (players who will become FA after this year)
  const faYear = (parseInt(year, 10) + 1).toString();
  const freeAgents = players.filter(
    p => p.contractFinalYear === year && p.playerName && p.team
  );

  // Sorting helper
  function sortPlayers(players, key, direction = sortConfig.direction) {
    return [...players].sort((a, b) => {
      let aValue = a[key];
      let bValue = b[key];``
      // Numeric sort for KTC and age
      if (key === 'ktcValue' || key === 'age') {
        // Always put nulls at the end regardless of direction
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        aValue = Number(aValue);
        bValue = Number(bValue);
      }
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Sorting helper for position tables
  function sortPlayersByPosition(players, key, direction) {
    return [...players].sort((a, b) => {
      let aValue = a[key];
      let bValue = b[key];
      if (key === 'ktcValue' || key === 'age') {
        aValue = aValue === null ? -1 : Number(aValue);
        bValue = bValue === null ? -1 : Number(bValue);
      }
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Sort handlers
  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  // Sorted data
  const sortedFreeAgents = sortPlayers(freeAgents, sortConfig.key);

  // For position and team breakdowns, sort by playerName
  const faByPosition = ['QB', 'RB', 'WR', 'TE'].map(pos => ({
    pos,
    players: sortPlayersByPosition(
      freeAgents.filter(p => p.position === pos),
      positionSortConfig.key,
      positionSortConfig.direction
    )
  }));

  const teams = Array.from(new Set(freeAgents.map(p => p.team))).sort();
  const faByTeam = teams.map(team => ({
    team,
    players: sortPlayers(
      freeAgents.filter(p => p.team === team),
      sortConfig.key,
      sortConfig.direction
    )
  }));

  if (loading) return (
    <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#001A2B] py-8 px-2">
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
            {/* Find the selected player object to get team name */}
            {(() => {
              const selectedPlayer = players.find(p => p.playerId === selectedPlayerId);
              const teamName = selectedPlayer ? selectedPlayer.team : undefined;
              return (
                <PlayerProfileCard
                  playerId={selectedPlayerId}
                  expanded={true}
                  className="w-56 h-80 sm:w-72 sm:h-[26rem] md:w-80 md:h-[30rem] max-w-full max-h-[90vh]"
                  teamName={teamName}
                  teamAvatars={teamAvatars}
                />
              );
            })()}
            <button
              className="absolute top-2 right-2 text-white bg-black/60 rounded-full px-3 py-1 hover:bg-black"
              onClick={() => setSelectedPlayerId(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#FF4B1F] to-[#FF6B35] rounded-xl shadow-lg p-8 text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white drop-shadow mb-2">
            Free Agency Preview
          </h1>
          <p className="text-lg md:text-xl text-white/90 font-medium">
            See which players will become free agents in upcoming years.
          </p>
        </div>

        {/* Year Selector */}
        <div className="flex flex-wrap items-center gap-4 mb-8">
          <label className="text-white/80 font-semibold">Show Free Agents After:</label>
          <select
            className="bg-black/40 border border-white/20 rounded px-4 py-2 text-white"
            value={year}
            onChange={e => setYear(e.target.value)}
          >
            {years.map(y => (
              <option key={y} value={y}>
                {y} Season (FA in {parseInt(y, 10) + 1})
              </option>
            ))}
          </select>
        </div>

        {/* Position Breakdown */}
        <section className="bg-black/40 border border-[#FF4B1F]/30 rounded-xl p-6 mb-10">
          <h2 className="text-2xl font-bold text-[#FF4B1F] mb-6">Free Agents by Position</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {faByPosition.map(({ pos, players }) => (
              <div key={pos} className="bg-white/5 rounded-lg p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold text-white ${getPositionColor(pos)}`}>{pos}</span>
                  <span className="font-semibold text-white">{pos} ({players.length})</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-white/80">
                    <thead>
                      <tr>
                        <th className="p-2 text-left cursor-pointer" onClick={() => setPositionSortConfig(prev => ({
                          key: 'playerName',
                          direction: prev.key === 'playerName' ? (prev.direction === 'asc' ? 'desc' : 'asc') : 'asc'
                        }))}>
                          Player {positionSortConfig.key === 'playerName' && (positionSortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className="p-2 text-left cursor-pointer" onClick={() => setPositionSortConfig(prev => ({
                          key: 'team',
                          direction: prev.key === 'team' ? (prev.direction === 'asc' ? 'desc' : 'asc') : 'asc'
                        }))}>
                          Team {positionSortConfig.key === 'team' && (positionSortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className="p-2 text-left cursor-pointer" onClick={() => setPositionSortConfig(prev => ({
                          key: 'rfaEligible',
                          direction: prev.key === 'rfaEligible' ? (prev.direction === 'asc' ? 'desc' : 'asc') : 'asc'
                        }))}>
                          RFA? {positionSortConfig.key === 'rfaEligible' && (positionSortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className="p-2 text-left cursor-pointer" onClick={() => setPositionSortConfig(prev => ({
                          key: 'franchiseTagEligible',
                          direction: prev.key === 'franchiseTagEligible' ? (prev.direction === 'asc' ? 'desc' : 'asc') : 'asc'
                        }))}>
                          Tag? {positionSortConfig.key === 'franchiseTagEligible' && (positionSortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className="p-2 text-left cursor-pointer" onClick={() => setPositionSortConfig(prev => ({
                          key: 'ktcValue',
                          direction: prev.key === 'ktcValue' ? (prev.direction === 'asc' ? 'desc' : 'asc') : 'desc'
                        }))}>
                          KTC {positionSortConfig.key === 'ktcValue' && (positionSortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-white/40 p-2">No free agents</td>
                        </tr>
                      )}
                      {players.map(p => (
                        <tr key={p.playerId + '-' + p.team}>
                          <td className="p-2 flex items-center gap-2">
                            <PlayerProfileCard
                              playerId={p.playerId}
                              contracts={[p]}
                              imageExtension="png"
                              className="!w-9 !h-9 min-w-[2.25rem] min-h-[2.25rem] max-w-[2.25rem] max-h-[2.25rem] rounded-full overflow-hidden shadow object-cover"
                            />
                            <span
                              className="underline cursor-pointer hover:text-[#FF4B1F]"
                              onClick={() => setSelectedPlayerId(p.playerId)}
                            >
                              {p.playerName}
                            </span>
                          </td>
                          <td className="p-2">{p.team}</td>
                          <td className="p-2">
                            {String(p.rfaEligible).toLowerCase() === 'true' ? (
                              <span className="text-green-400 font-bold">Yes</span>
                            ) : (
                              <span className="text-red-400">No</span>
                            )}
                          </td>
                          <td className="p-2">
                            {String(p.franchiseTagEligible).toLowerCase() === 'true' ? (
                              <span className="text-yellow-400 font-bold">Yes</span>
                            ) : (
                              <span className="text-gray-400">No</span>
                            )}
                          </td>
                          <td className="p-2">{p.ktcValue ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Team Breakdown */}
        <section className="bg-black/40 border border-white/10 rounded-xl p-6 mb-10">
          <h2 className="text-2xl font-bold text-[#FF4B1F] mb-6">Free Agents by Team</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {faByTeam.map(({ team, players }) => (
              <div key={team} className="bg-white/5 rounded-lg p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  {teamAvatars[team] ? (
                    <img
                      src={`https://sleepercdn.com/avatars/${teamAvatars[team]}`}
                      alt={team}
                      className="w-6 h-6 rounded-full"
                    />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-white/10 inline-block"></span>
                  )}
                  <span className="font-semibold text-white">{team}</span>
                  <span className="text-white/40 text-xs">({players.length})</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-white/80">
                    <thead>
                      <tr>
                        <th className="p-2 text-left cursor-pointer" onClick={() => handleSort('playerName')}>
                          Player {sortConfig.key === 'playerName' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className="p-2 text-left cursor-pointer" onClick={() => handleSort('position')}>
                          Pos {sortConfig.key === 'position' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className="p-2 text-left cursor-pointer" onClick={() => handleSort('rfaEligible')}>
                          RFA? {sortConfig.key === 'rfaEligible' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className="p-2 text-left cursor-pointer" onClick={() => handleSort('franchiseTagEligible')}>
                          Tag? {sortConfig.key === 'franchiseTagEligible' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                        <th className="p-2 text-left cursor-pointer" onClick={() => handleSort('ktcValue')}>
                          KTC {sortConfig.key === 'ktcValue' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-white/40 p-2">No free agents</td>
                        </tr>
                      )}
                      {players.map(p => (
                        <tr key={p.playerId + '-' + p.team}>
                          <td className="p-2 flex items-center gap-2">
                            <PlayerProfileCard
                              playerId={p.playerId}
                              contracts={[p]}
                              imageExtension="png"
                              className="!w-8 !h-8 min-w-[2rem] min-h-[2rem] max-w-[2rem] max-h-[2rem] rounded-full overflow-hidden shadow object-cover"
                            />
                            <span
                              className="underline cursor-pointer hover:text-[#FF4B1F]"
                              onClick={() => setSelectedPlayerId(p.playerId)}
                            >
                              {p.playerName}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold text-white ${getPositionColor(p.position)}`}>{p.position}</span>
                          </td>
                          <td className="p-2">
                            {String(p.rfaEligible).toLowerCase() === 'true' ? (
                              <span className="text-green-400 font-bold">Yes</span>
                            ) : (
                              <span className="text-red-400">No</span>
                            )}
                          </td>
                          <td className="p-2">
                            {String(p.franchiseTagEligible).toLowerCase() === 'true' ? (
                              <span className="text-yellow-400 font-bold">Yes</span>
                            ) : (
                              <span className="text-gray-400">No</span>
                            )}
                          </td>
                          <td className="p-2">{p.ktcValue ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Full Table */}
        <section className="bg-black/30 border border-white/10 rounded-xl p-8 mb-10">
          <h2 className="text-2xl font-bold text-[#FF4B1F] mb-4">All Free Agents ({faYear})</h2>
          <div className="overflow-x-auto rounded-lg border border-white/10 shadow-xl bg-black/20">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-black/40 border-b border-white/10">
                  <th className="p-3"></th>
                  <th className="p-3 text-left text-white cursor-pointer" onClick={() => handleSort('playerName')}>
                    <div className="flex items-center gap-2">
                      Player Name
                      {sortConfig.key === 'playerName' && (
                        <span className="text-[#FF4B1F]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="p-3 text-left text-white cursor-pointer" onClick={() => handleSort('team')}>
                    <div className="flex items-center gap-2">
                      Team
                      {sortConfig.key === 'team' && (
                        <span className="text-[#FF4B1F]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="p-3 text-left text-white cursor-pointer" onClick={() => handleSort('position')}>
                    <div className="flex items-center gap-2">
                      Pos
                      {sortConfig.key === 'position' && (
                        <span className="text-[#FF4B1F]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="p-3 text-left text-white cursor-pointer" onClick={() => handleSort('age')}>
                    <div className="flex items-center gap-2">
                      Age
                      {sortConfig.key === 'age' && (
                        <span className="text-[#FF4B1F]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="p-3 text-center text-white cursor-pointer" onClick={() => handleSort('ktcValue')}>
                    <div className="flex items-center gap-2">
                      KTC
                      {sortConfig.key === 'ktcValue' && (
                        <span className="text-[#FF4B1F]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="p-3 text-center text-white cursor-pointer" onClick={() => handleSort('rfaEligible')}>
                    <div className="flex items-center gap-2">
                      RFA?
                      {sortConfig.key === 'rfaEligible' && (
                        <span className="text-[#FF4B1F]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="p-3 text-center text-white cursor-pointer" onClick={() => handleSort('franchiseTagEligible')}>
                    <div className="flex items-center gap-2">
                      Tag?
                      {sortConfig.key === 'franchiseTagEligible' && (
                        <span className="text-[#FF4B1F]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="text-white">
                {sortedFreeAgents.map((p, idx) => (
                  <tr
                    key={p.playerId + '-' + p.team}
                    className="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                  >
                    {/* PlayerProfileCard column */}
                    <td className="p-3">
                      <div className="w-8 h-8 flex-shrink-0">
                        <PlayerProfileCard
                          playerId={p.playerId}
                          expanded={false}
                          className="w-8 h-8 rounded-full overflow-hidden shadow"
                        />
                      </div>
                    </td>
                    {/* Player Name column */}
                    <td
                      className="p-3 font-medium text-white underline cursor-pointer hover:text-[#FF4B1F]"
                      onClick={() => setSelectedPlayerId(p.playerId)}
                    >
                      {p.playerName}
                    </td>
                    {/* Team column */}
                    <td className="p-3 flex items-center gap-2 text-white">
                      {teamAvatars[p.team] ? (
                        <img
                          src={`https://sleepercdn.com/avatars/${teamAvatars[p.team]}`}
                          alt={p.team}
                          className="w-5 h-5 rounded-full mr-2"
                        />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-white/10 mr-2 inline-block"></span>
                      )}
                      {p.team}
                    </td>
                    {/* Position column */}
                    <td className="p-3 text-white">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold text-white ${getPositionColor(p.position)}`}>{p.position}</span>
                    </td>
                    {/* Age column */}
                    <td className="p-3 text-white">{p.age}</td>
                    {/* KTC column */}
                    <td className="p-3 text-center text-white">{p.ktcValue ?? '-'}</td>
                    {/* RFA? icon */}
                    <td className="p-3 text-center">
                      {String(p.rfaEligible).toLowerCase() === 'true' ? (
                        <span
                          title="This Player will enter RFA when this contract expires."
                          className="text-yellow-400 font-bold"
                          aria-label="RFA Eligible"
                        >
                          Yes
                        </span>
                      ) : (
                        <span
                          title="This player will NOT enter RFA."
                          className="text-red-400 font-bold"
                          aria-label="Not RFA Eligible"
                        >
                          No
                        </span>
                      )}
                    </td>
                    {/* Franchise Tag Eligible? icon */}
                    <td className="p-3 text-center">
                      {String(p.franchiseTagEligible).toLowerCase() === 'true' ? (
                        <span
                          title="This player is Franchise Tag eligible."
                          className="text-yellow-400 font-bold"
                          aria-label="Franchise Tag Eligible"
                        >
                          Yes
                        </span>
                      ) : (
                        <span
                          title="This player is NOT Franchise Tag eligible."
                          className="text-gray-400 font-bold"
                          aria-label="Not Franchise Tag Eligible"
                        >
                          No
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {sortedFreeAgents.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-white/60">
                      No free agents for this year.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}