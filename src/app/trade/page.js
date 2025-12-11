'use client';
import React, { useState, useEffect } from 'react';
import TradeSummary from './TradeSummary';
import PlayerProfileCard from '../my-team/components/PlayerProfileCard';
import { AnimatePresence, motion } from 'framer-motion';
import SleeperImportModal from './components/SleeperImportModal';

const USER_ID = '456973480269705216'; // Your Sleeper user ID

function TeamSection({ 
  label,
  participant,
  setTeam,
  setSearchTerm,
  filteredPlayers,
  addPlayer,
  removePlayer,
  updateDestination,
  uniqueTeams,
  teamOptions,
  impact,
  teamAvatars,
  canRemove,
  onRemove,
  hideDestination = false,
  otherTeamName = '',
  // ratios and toggle from parent
  ktcPerDollar,
  usePositionRatios,
  positionRatios
}) {
  const [justAddedId, setJustAddedId] = useState(null);
  const [expandedCardId, setExpandedCardId] = useState(null);
  const [popupPlayer, setPopupPlayer] = useState(null);

  const handleAddPlayer = (player) => {
    addPlayer(player);
    setJustAddedId(player.id);
    setTimeout(() => setJustAddedId(null), 600);
  };

  return (
    <div className="flex-1 p-4">
      <div className="bg-black/30 rounded-lg border border-white/10 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[#FF4B1F]">{label}</h2>
          {canRemove && (
            <button
              onClick={onRemove}
              className="text-red-400 hover:text-red-300 text-sm bg-black/40 rounded px-2 py-1 border border-white/10"
              title="Remove team from trade"
            >
              Remove
            </button>
          )}
        </div>
        <select
          value={participant.team}
          onChange={(e) => {
            setTeam(e.target.value);
          }}
          className="w-full p-2 mb-4 rounded bg-[#0a1929] border border-white/10 text-white"
          style={{ color: 'white', backgroundColor: '#0a1929' }}
        >
          <option value="" style={{ color: '#FF4B1F', backgroundColor: '#0a1929' }}>Select Team</option>
          {uniqueTeams.map(team => (
            <option
              key={team}
              value={team}
              style={{ color: 'white', backgroundColor: '#0a1929' }}
            >
              {team}
            </option>
          ))}
        </select>

        {participant.team && (
          <>
            <input
              type="text"
              placeholder="Search players..."
              value={participant.searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full p-2 mb-4 rounded bg-white/5 border border-white/10 text-white"
            />

            <div className="mb-4">
              <h3 className="text-sm font-bold mb-2 text-white/70">Selected Players:</h3>
              <div className="space-y-2 bg-[#FF4B1F]/20 border-2 border-[#FF4B1F] rounded p-2 shadow-lg">
                {participant.selectedPlayers.length === 0 && (
                  <div className="text-xs text-white/40 italic">No players selected.</div>
                )}
                <AnimatePresence>
                  {participant.selectedPlayers.map((player, idx) => (
                    <React.Fragment key={player.uniqueKey}>
                      {idx > 0 && (
                        <div className="w-full border-t border-[#FF4B1F]/40 my-2"></div>
                      )}
                      <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 30 }}
                        transition={{ type: "spring", stiffness: 3000, damping: 20 }}
                        className="relative flex items-center gap-4"
                      >
                        {/* Card and info */}
                        <div className="flex flex-col items-center">
                          <div className="w-20 h-20 flex items-center justify-center relative">
                            <PlayerProfileCard
                              playerId={player.id}
                              imageExtension="png"
                              expanded={false}
                              className="w-12 h-12"
                              ktcPerDollar={ktcPerDollar}
                              usePositionRatios={usePositionRatios}
                              positionRatios={positionRatios}
                            />
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setPopupPlayer(player);
                              }}
                              className="absolute top-1 right-1 z-10 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                              style={{ fontSize: 16, lineHeight: 1 }}
                              aria-label="Show details"
                            >
                              i
                            </button>
                          </div>
                          <div className="mt-2 text-xs text-white font-semibold text-center">
                            {player.playerName}
                          </div>
                        </div>
                        {/* Bubbles */}
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-[#FF4B1F]/50 text-white">{player.playerName}</span>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-700/50 text-white">{player.position}</span>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-700/50 text-white">${player.curYear ? Number(player.curYear).toFixed(1) : "-"}</span>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-indigo-700/50 text-white">{player.contractType}</span>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-purple-700/50 text-white">
                            {teamAvatars[player.team] ? (
                              <img
                                src={`https://sleepercdn.com/avatars/${teamAvatars[player.team]}`}
                                alt={player.team}
                                className="w-4 h-4 rounded-full mr-1 inline-block"
                              />
                            ) : (
                              <span className="w-4 h-4 rounded-full bg-white/10 mr-1 inline-block"></span>
                            )}
                            {player.team}
                          </span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-yellow-700/50 text-white ${Number(player.age) >= 30 ? "animate-pulse" : ""}`}>Age: {player.age || "-"}</span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-cyan-700/50 text-white ${String(player.rfaEligible).toLowerCase() === "true" ? "animate-pulse" : ""}`}>RFA: {String(player.rfaEligible).toLowerCase() === "true" ? "✅" : "❌"}</span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-pink-700/50 text-white ${String(player.franchiseTagEligible).toLowerCase() === "false" ? "animate-pulse" : ""}`}>Tag: {String(player.franchiseTagEligible).toLowerCase() === "true" ? "✅" : "❌"}</span>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-teal-700/50 text-white">KTC: {player.ktcValue ? player.ktcValue : "-"}</span>
                          {/* Budget Value bubble */}
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-[#FF4B1F]/50 text-white">
                            BV: {(() => {
                              const ktc = parseFloat(player.ktcValue) || 0;
                              const sal = parseFloat(player.curYear) || 0;
                              const globalRatio = typeof ktcPerDollar === 'number' ? ktcPerDollar : 0;
                              const posKey = (player.position || 'UNKNOWN').toUpperCase();
                              const posRatio = usePositionRatios ? positionRatios?.[posKey] : null;
                              const appliedRatio = (posRatio != null ? posRatio : globalRatio) || 0;
                              const val = Math.round(ktc + sal * (-(appliedRatio)));
                              return isNaN(val) ? '-' : val;
                            })()}
                          </span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-orange-700/50 text-white ${String(player.contractFinalYear) === String(new Date().getFullYear()) ? "animate-pulse" : ""}`}>Final Year: {player.contractFinalYear || "-"}</span>
                          {/* Destination selector for multi-team trades only */}
                          {!hideDestination ? (
                            <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-semibold bg-black/40 text-white border border-white/10 ml-2">
                              To:
                              <select
                                className="bg-[#0a1929] text-white rounded px-1 py-0.5 border border-white/10"
                                value={player.toTeam || ''}
                                onChange={(e) => updateDestination(player.id, e.target.value)}
                              >
                                <option value="">Select team</option>
                                {teamOptions
                                  .filter(t => t !== participant.team)
                                  .map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                              </select>
                            </span>
                          ) : null}
                        </div>
                        {/* Remove button */}
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            removePlayer(player.id);
                          }}
                          className="ml-auto text-red-400 hover:text-red-300 text-xs bg-black/60 rounded px-2 py-1"
                        >
                          Remove
                        </button>
                      </motion.div>
                    </React.Fragment>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold mb-2 text-white/70">Available Players:</h3>
              <div className="max-h-60 overflow-y-auto bg-black/30 border-2 border-white/20 rounded p-2">
                {filteredPlayers.length === 0 && (
                  <div className="text-xs text-white/40 italic">No available players.</div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {filteredPlayers.map(player => (
                    <div
                      key={player.uniqueKey}
                      className="cursor-pointer flex flex-col items-center"
                      onClick={() => handleAddPlayer(player)}
                    >
                      <div className="w-16 h-16 flex items-center justify-center relative"> {/* changed from w-24 h-24 */}
                        <PlayerProfileCard
                          playerId={player.id}
                          imageExtension="png"
                          expanded={false}
                          className="w-14 h-14"
                        />
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setPopupPlayer(player);
                          }}
                          className="absolute top-1 right-1 z-10 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                          style={{ fontSize: 16, lineHeight: 1 }}
                          aria-label="Show details"
                        >
                          i
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-white font-semibold text-center">
                        {player.playerName}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {impact && (
              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="text-sm font-bold mb-2 text-white/70">Before Trade:</h3>
                  <CapImpactDisplay impact={impact.before} />
                </div>
                <div>
                  <h3 className="text-sm font-bold mb-2 text-white/70">After Trade:</h3>
                  <CapImpactDisplay impact={impact.after} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {popupPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setPopupPlayer(null)}
        >
          <div
            className="bg-transparent p-0 rounded-lg shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <PlayerProfileCard
              playerId={popupPlayer.id}
              imageExtension="png"
              expanded={true}
              className="w-56 h-80 sm:w-72 sm:h-[26rem] md:w-80 md:h-[30rem] max-w-full max-h-[90vh]"
              // Close handler for the in-card X
              onExpandClick={() => setPopupPlayer(null)}
            />
            <button
              className="absolute top-2 right-2 text-white bg-black/60 rounded-full px-3 py-1 hover:bg-black"
              onClick={() => setPopupPlayer(null)}
            >
              ×
            </button>
            <div className="mt-2 text-center text-lg font-bold text-white">
              {popupPlayer.playerName}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CapImpactDisplay = ({ impact, label }) => (
  <div className="grid grid-cols-4 gap-2 text-sm">
    {Object.entries(impact).map(([year, value]) => (
      <div key={year} className="text-center">
        <div className="text-white/70">{year}</div>
        <div className={getValidationColor(value?.remaining)}>
          {formatSalary(value?.remaining)}
        </div>
      </div>
    ))}
  </div>
);

const formatSalary = (value) => {
  const num = Number(value);
  if (isNaN(num)) return "$-";
  return `$${num.toFixed(1)}`;
};

const getValidationColor = (value) => {
  if (value < 0) return 'text-red-400';
  if (value < 50) return 'text-[#FF4B1F]';
  if (value < 100) return 'text-yellow-400';
  return 'text-green-400';
};

export default function Trade() {
  const [contracts, setContracts] = useState([]);
  const [fines, setFines] = useState({});
  const [loading, setLoading] = useState(true);
  // Multi-team participants: {id, team, searchTerm, selectedPlayers:[{...player, toTeam?:string}]}
  const [participants, setParticipants] = useState([
    { id: 1, team: '', searchTerm: '', selectedPlayers: [] },
    { id: 2, team: '', searchTerm: '', selectedPlayers: [] },
  ]);
  const [showSummary, setShowSummary] = useState(false);
  const [teamAvatars, setTeamAvatars] = useState({});
  const [leagueId, setLeagueId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [showImport, setShowImport] = useState(false);
  // KTC-to-Salary ratio (KTC points per $1 of salary), computed on refresh
  const [ktcPerDollar, setKtcPerDollar] = useState(null);
  // Position-specific ratios (KTC per $1) for Active contracts
  const [positionRatios, setPositionRatios] = useState({});
  // Toggle to use position-specific ratios in Budget Value calculations
  const [usePositionRatios, setUsePositionRatios] = useState(false);
  // Debug info for ratio calculation
  const [ratioDebug, setRatioDebug] = useState({ totalActiveSalary: 0, totalActiveKtc: 0, activeCount: 0, sample: [] });
  const [showRatioDebug, setShowRatioDebug] = useState(false);

  // Auto-detect league ID (copied from home page)
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

  // Fetch contract data (KTC from contracts CSV)
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch contracts data
        const contractsResponse = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
        const contractsText = await contractsResponse.text();

        // Fetch fines data
        const finesResponse = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_TeamFines.csv');
        const finesText = await finesResponse.text();

        // Parse contracts
        const contractRows = contractsText.split('\n');
        const parsedContracts = contractRows.slice(1)
          .filter(row => row.trim())
          .map((row, index) => {
            const values = row.split(',');
            const status = values[14];
            return {
              // stable unique key per CSV row
              uniqueKey: `${values[0]}-${values[5]}-${values[2]}-${values[14]}-${index}`,
              id: values[0],
              playerName: values[1],
              contractType: values[2],
              team: values[33],
              status,
              isActive: status === 'Active',
              curYear: parseFloat(values[15]) || 0,
              year2: parseFloat(values[16]) || 0,
              year3: parseFloat(values[17]) || 0,
              year4: parseFloat(values[18]) || 0,
              deadCurYear: parseFloat(values[24]) || 0,
              deadYear2: parseFloat(values[25]) || 0,
              deadYear3: parseFloat(values[26]) || 0,
              deadYear4: parseFloat(values[27]) || 0,
              position: values[21],
              nflTeam: values[22],
              contractFinalYear: values[5],
              age: values[32],
              ktcValue: values[34],
              rfaEligible: values[37],
              franchiseTagEligible: values[38],
            };
          });
      setContracts(parsedContracts);
      // Compute KTC-per-dollar ratio using global totals across Active contracts
      try {
        const activeContracts = parsedContracts.filter(c => c.isActive || c.status === 'Active');
        const totalActiveSalary = activeContracts.reduce((sum, c) => sum + (parseFloat(c.curYear) || 0), 0);
        const totalActiveKtc = activeContracts.reduce((sum, c) => sum + (parseFloat(c.ktcValue) || 0), 0);
        const ratio = totalActiveSalary > 0 ? (totalActiveKtc / totalActiveSalary) : 0;
        setKtcPerDollar(ratio);

        // Compute per-position ratios (KTC/$)
        const byPos = activeContracts.reduce((acc, c) => {
          const pos = (c.position || 'UNKNOWN').toUpperCase();
          const sal = parseFloat(c.curYear) || 0;
          const ktc = parseFloat(c.ktcValue) || 0;
          if (!acc[pos]) acc[pos] = { salary: 0, ktc: 0, count: 0 };
          acc[pos].salary += sal;
          acc[pos].ktc += ktc;
          acc[pos].count += 1;
          return acc;
        }, {});
        const posRatios = Object.keys(byPos).reduce((acc, pos) => {
          const { salary, ktc } = byPos[pos];
          acc[pos] = salary > 0 ? (ktc / salary) : 0;
          return acc;
        }, {});
        setPositionRatios(posRatios);
        setRatioDebug({
          totalActiveSalary,
          totalActiveKtc,
          activeCount: activeContracts.length,
          sample: activeContracts.slice(0, 10).map(c => ({
            playerName: c.playerName,
            team: c.team,
            curYear: parseFloat(c.curYear) || 0,
            ktcValue: parseFloat(c.ktcValue) || 0,
          })),
        });
      } catch (e) {
        setKtcPerDollar(0);
        setRatioDebug({ totalActiveSalary: 0, totalActiveKtc: 0, activeCount: 0, sample: [] });
      }

      // Parse fines
      const finesRows = finesText.split('\n');
      const finesObj = finesRows.slice(1)
        .filter(row => row.trim())
        .reduce((acc, row) => {
          const [team, year1, year2, year3, year4] = row.split(',');
          acc[team] = {
            curYear: parseFloat(year1) || 0,
            year2: parseFloat(year2) || 0,
            year3: parseFloat(year3) || 0,
            year4: parseFloat(year4) || 0,
          };
          return acc;
        }, {});
      setFines(finesObj);

      // Only show active players for selection
      setPlayers(parsedContracts.filter(player => player.isActive));
    } catch (error) {
      console.error('Error fetching data:', error);
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
        if (!users || !Array.isArray(users)) return;
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

  const uniqueTeams = [...new Set(players.map(player => player.team))].sort();

  // Utility: set team for a participant and clear their selections
  const setParticipantTeam = (id, team) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, team, selectedPlayers: [], searchTerm: '' } : p));
  };

  const setParticipantSearch = (id, term) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, searchTerm: term } : p));
  };

  const addParticipant = () => {
    setParticipants(prev => {
      const nextId = prev.length ? Math.max(...prev.map(p => p.id)) + 1 : 1;
      return [...prev, { id: nextId, team: '', searchTerm: '', selectedPlayers: [] }];
    });
  };

  const removeParticipant = (id) => {
    setParticipants(prev => prev.filter(p => p.id !== id));
  };

  const addPlayerToParticipant = (id, player) => {
    setParticipants(prev => prev.map(p => {
      if (p.id !== id) return p;
      if (p.selectedPlayers.some(sp => sp.id === player.id)) return p;
      return { ...p, selectedPlayers: [...p.selectedPlayers, { ...player, toTeam: '' }] };
    }));
  };

  const removePlayerFromParticipant = (id, playerId) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, selectedPlayers: p.selectedPlayers.filter(sp => sp.id !== playerId) } : p));
  };

  const updatePlayerDestination = (id, playerId, toTeam) => {
    setParticipants(prev => prev.map(p => p.id === id ? {
      ...p,
      selectedPlayers: p.selectedPlayers.map(sp => sp.id === playerId ? { ...sp, toTeam } : sp)
    } : p));
  };

  // Global set of selected player ids to prevent duplicates
  const selectedIds = new Set(participants.flatMap(p => p.selectedPlayers.map(sp => sp.id)));

  // Build filtered list per participant
  const getFilteredPlayers = (participant) => {
    return players
      .filter(player =>
        player.team === participant.team &&
        player.playerName.toLowerCase().includes((participant.searchTerm || '').toLowerCase()) &&
        !selectedIds.has(player.id)
      )
      .sort((a, b) => a.playerName.localeCompare(b.playerName));
  };

  const calculateCapImpact = (playerList) => {
    return {
      curYear: playerList.reduce((sum, player) => sum + (parseFloat(player.curYear) || 0), 0),
      year2: playerList.reduce((sum, player) => sum + (parseFloat(player.year2) || 0), 0),
      year3: playerList.reduce((sum, player) => sum + (parseFloat(player.year3) || 0), 0),
      year4: playerList.reduce((sum, player) => sum + (parseFloat(player.year4) || 0), 0),
    };
  };

  // Calculate cap space for a team (match Salary Cap page)
  const calculateTeamCapSpace = (teamName, excludeIds = []) => {
    const teamContracts = contracts.filter(
      c => c.team === teamName && !excludeIds.includes(c.id)
    );
    const cap = {
      curYear: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
      year2: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
      year3: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
      year4: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 }
    };
    teamContracts.forEach(c => {
      cap.curYear.active += c.curYear;
      cap.curYear.dead += c.deadCurYear;
      cap.year2.active += c.year2;
      cap.year2.dead += c.deadYear2;
      cap.year3.active += c.year3;
      cap.year3.dead += c.deadYear3;
      cap.year4.active += c.year4;
      cap.year4.dead += c.deadYear4;
    });
    const teamFines = fines[teamName] || { curYear: 0, year2: 0, year3: 0, year4: 0 };
    cap.curYear.fines = teamFines.curYear;
    cap.year2.fines = teamFines.year2;
    cap.year3.fines = teamFines.year3;
    cap.year4.fines = teamFines.year4;
    ['curYear', 'year2', 'year3', 'year4'].forEach(year => {
      cap[year].remaining = cap[year].total - cap[year].active - cap[year].dead - cap[year].fines;
    });
    return cap;
  };

  // Calculate trade impact using new cap logic
  const calculateTradeImpact = (teamName, incomingPlayers, outgoingPlayers) => {
    // Exclude outgoing players from team, add incoming
    const excludeIds = outgoingPlayers.map(p => p.id);
    const before = calculateTeamCapSpace(teamName);
    // Simulate after trade: remove outgoing, add incoming
    const afterContracts = contracts
      .filter(c => c.team === teamName && !excludeIds.includes(c.id))
      .concat(incomingPlayers.map(p => contracts.find(c => c.id === p.id)).filter(Boolean));
    // Calculate after cap
    const afterCap = {
      curYear: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
      year2: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
      year3: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
      year4: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 }
    };
    afterContracts.forEach(c => {
      afterCap.curYear.active += c.curYear;
      afterCap.curYear.dead += c.deadCurYear;
      afterCap.year2.active += c.year2;
      afterCap.year2.dead += c.deadYear2;
      afterCap.year3.active += c.year3;
      afterCap.year3.dead += c.deadYear3;
      afterCap.year4.active += c.year4;
      afterCap.year4.dead += c.deadYear4;
    });
    const teamFines = fines[teamName] || { curYear: 0, year2: 0, year3: 0, year4: 0 };
    afterCap.curYear.fines = teamFines.curYear;
    afterCap.year2.fines = teamFines.year2;
    afterCap.year3.fines = teamFines.year3;
    afterCap.year4.fines = teamFines.year4;
    ['curYear', 'year2', 'year3', 'year4'].forEach(year => {
      afterCap[year].remaining = afterCap[year].total - afterCap[year].active - afterCap[year].dead - afterCap[year].fines;
    });
    return {
      before: {
        curYear: before.curYear,
        year2: before.year2,
        year3: before.year3,
        year4: before.year4,
      },
      after: {
        curYear: afterCap.curYear,
        year2: afterCap.year2,
        year3: afterCap.year3,
        year4: afterCap.year4,
      }
    };
  };

  // Build incoming/outgoing for each team from destinations
  const buildTeamFlows = () => {
    const teamToIncoming = {};
    const teamToOutgoing = {};
    const teams = participants.map(p => p.team).filter(Boolean);
    const uniqueActiveTeamsLocal = [...new Set(teams)];
    const isTwoTeamTradeLocal = uniqueActiveTeamsLocal.length === 2;
    participants.forEach(p => {
      if (!p.team) return;
      teamToIncoming[p.team] = [];
      teamToOutgoing[p.team] = p.selectedPlayers.map(sp => ({ ...sp }));
    });
    participants.forEach(p => {
      p.selectedPlayers.forEach(sp => {
        let dest = sp.toTeam;
        if (!dest && isTwoTeamTradeLocal && p.team) {
          dest = uniqueActiveTeamsLocal.find(t => t !== p.team);
        }
        if (dest && teamToIncoming[dest]) {
          teamToIncoming[dest].push({ ...sp });
        }
      });
    });
    return { teamToIncoming, teamToOutgoing };
  };

  const validateTrade = () => {
    const { teamToIncoming, teamToOutgoing } = buildTeamFlows();
    const teams = participants.map(p => p.team).filter(Boolean);
    const impactsByTeam = {};
    teams.forEach(teamName => {
      const incoming = teamToIncoming[teamName] || [];
      const outgoing = teamToOutgoing[teamName] || [];
      impactsByTeam[teamName] = calculateTradeImpact(teamName, incoming, outgoing);
    });

    const remainders = [];
    const curYearNegatives = [];
    const futureNegatives = [];
    const closeList = [];
    const yearKeys = [
      { key: 'curYear', label: 'Y1' },
      { key: 'year2', label: 'Y2' },
      { key: 'year3', label: 'Y3' },
      { key: 'year4', label: 'Y4' },
    ];
    teams.forEach(teamName => {
      const imp = impactsByTeam[teamName];
      yearKeys.forEach(({ key }) => remainders.push(imp.after[key].remaining));
      // Collect detailed warnings
      if (imp.after.curYear.remaining < 0) {
        curYearNegatives.push({ team: teamName, remaining: imp.after.curYear.remaining });
      }
      const yearsNeg = [];
      ['year2','year3','year4'].forEach(k => {
        const val = imp.after[k].remaining;
        if (val < 0) yearsNeg.push({ year: k === 'year2' ? 'Y2' : k === 'year3' ? 'Y3' : 'Y4', remaining: val });
      });
      if (yearsNeg.length) futureNegatives.push({ team: teamName, years: yearsNeg });
      yearKeys.forEach(({ key, label }) => {
        const val = imp.after[key].remaining;
        if (val >= 0 && val < 50) closeList.push({ team: teamName, year: label, remaining: val });
      });
    });
    const isInvalidCurYear = teams.some(teamName => impactsByTeam[teamName].after.curYear.remaining < 0);
    const isFutureYearOverCap = teams.some(teamName => (
      impactsByTeam[teamName].after.year2.remaining < 0 ||
      impactsByTeam[teamName].after.year3.remaining < 0 ||
      impactsByTeam[teamName].after.year4.remaining < 0
    ));
    const isClose = remainders.some(val => val >= 0 && val < 50);

    // Ensure all selected players have destinations and those destinations are valid existing teams (not self)
  const currentTeamsSet = new Set(teams);
  const isTwoTeamLocal = [...currentTeamsSet].length === 2;
  const anyMissing = isTwoTeamLocal ? false : participants.some(p => p.selectedPlayers.some(sp => !sp.toTeam));
    const anyInvalid = participants.some(p => p.selectedPlayers.some(sp => sp.toTeam && (!currentTeamsSet.has(sp.toTeam) || sp.toTeam === p.team)));
    const unassigned = anyMissing || anyInvalid;

    return {
      isValid: !isInvalidCurYear && !isFutureYearOverCap && !unassigned,
      isInvalidCurYear,
      isFutureYearOverCap,
      isClose,
      unassigned,
      impactsByTeam,
      details: {
        curYearNegatives,
        futureNegatives,
        closeList,
      }
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
      </div>
    );
  }

  const haveAtLeastTwoTeams = participants.filter(p => p.team).length >= 2;
  const activeTeams = participants.map(p => p.team).filter(Boolean);
  const uniqueActiveTeams = [...new Set(activeTeams)];
  const isTwoTeamTrade = uniqueActiveTeams.length === 2;
  const tradeValidation = haveAtLeastTwoTeams ? validateTrade() : null;

  // Reset handler
  const handleReset = () => {
    setParticipants([
      { id: 1, team: '', searchTerm: '', selectedPlayers: [] },
      { id: 2, team: '', searchTerm: '', selectedPlayers: [] },
    ]);
    setShowSummary(false);
  };

  // Apply handler from import modal
  const handleApplyImport = (importParticipants) => {
    // sanitize
    const cleaned = (importParticipants || [])
      .filter(p => p && p.team)
      .map((p, idx) => ({
        id: idx + 1,
        team: p.team,
        searchTerm: '',
        selectedPlayers: Array.isArray(p.selectedPlayers) ? p.selectedPlayers : [],
      }));
    if (cleaned.length >= 2) {
      setParticipants(cleaned);
      setShowSummary(false);
    }
    setShowImport(false);
  };

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
            <h1 className="text-3xl font-bold text-[#FF4B1F]">Trade Calculator</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded text-white hover:bg-white/20"
            >
              Import Sleeper Screenshot
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded text-white hover:bg-[#FF4B1F]/80 hover:text-white transition-colors"
            >
              Reset Trade
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Ratio Debug Controls */}
        <div className="mb-4 flex items-center justify-between">
          <div className="text-white/60 text-xs">Ratio: {ktcPerDollar != null ? ktcPerDollar.toFixed(6) : 'n/a'}</div>
          <button
            onClick={() => setShowRatioDebug(v => !v)}
            className="px-3 py-1.5 bg-white/10 border border-white/20 rounded text-white hover:bg-white/20 text-xs"
          >
            {showRatioDebug ? 'Hide Ratio Debug' : 'Show Ratio Debug'}
          </button>
        </div>
        {/* Toggle for using position-specific ratios */}
        <div className="mb-4 flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-white/80">
            <input
              type="checkbox"
              checked={usePositionRatios}
              onChange={(e) => setUsePositionRatios(e.target.checked)}
            />
            Use position-specific ratios for Budget Value
          </label>
          {usePositionRatios && (
            <span className="text-[10px] text-white/60">Uses ratio by player position (e.g., QB/RB/WR/TE). Falls back to global ratio if position is missing.</span>
          )}
        </div>
        {showRatioDebug && (
          <div className="mb-6 p-4 rounded-lg bg-black/30 border border-white/10">
            <div className="font-bold text-[#FF4B1F] mb-2">KTC-to-Salary Ratio Debug</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-black/20 border border-white/10 rounded p-2">
                <div className="text-white/70">Active Contracts</div>
                <div className="text-white font-semibold">{ratioDebug.activeCount}</div>
              </div>
              <div className="bg-black/20 border border-white/10 rounded p-2">
                <div className="text-white/70">Total Active Salary (Y1)</div>
                <div className="text-white font-semibold">${ratioDebug.totalActiveSalary.toFixed(1)}</div>
              </div>
              <div className="bg-black/20 border border-white/10 rounded p-2">
                <div className="text-white/70">Total Active KTC</div>
                <div className="text-white font-semibold">{Math.round(ratioDebug.totalActiveKtc)}</div>
              </div>
              <div className="bg-black/20 border border-white/10 rounded p-2">
                <div className="text-white/70">Ratio (KTC per $1)</div>
                <div className="text-white font-semibold">{ktcPerDollar != null ? ktcPerDollar.toFixed(6) : '-'}</div>
              </div>
            </div>
            {/* Position ratios table */}
            <div className="mt-3 text-xs text-white/70">Position ratios (KTC per $1):</div>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.keys(positionRatios).sort().map((pos) => (
                <div key={pos} className="bg-black/20 border border-white/10 rounded p-2 flex items-center justify-between">
                  <div className="text-white/80 font-semibold">{pos}</div>
                  <div className="text-white text-xs">{positionRatios[pos].toFixed(6)}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-white/70">Sample rows (first 10):</div>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              {ratioDebug.sample.map((s, i) => (
                <div key={i} className="bg-black/20 border border-white/10 rounded p-2 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white truncate">{s.playerName}</div>
                    <div className="text-white/60 text-xs truncate">{s.team}</div>
                  </div>
                  <div className="text-white text-xs">Y1: ${s.curYear.toFixed(1)}</div>
                  <div className="text-white text-xs ml-3">KTC: {Math.round(s.ktcValue)}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-white/60">
              Formula: Ratio = (Σ Active KTC) / (Σ Active Year 1 Salary). Budget Value = KTC + Salary × (−Ratio).
            </div>
          </div>
        )}
        {tradeValidation && haveAtLeastTwoTeams && (
          <div className={`mb-6 p-4 rounded-lg ${
            tradeValidation.isInvalidCurYear ? 'bg-red-500/20 border border-red-500/50' :
            tradeValidation.isFutureYearOverCap ? 'bg-yellow-500/20 border border-yellow-500/50' :
            tradeValidation.isClose ? 'bg-yellow-500/20 border border-yellow-500/50' :
            'bg-green-500/20 border border-green-500/50'
          }`}>
            <div className="font-bold mb-2">
              {tradeValidation.unassigned
                ? 'Assign a destination team for all selected players to evaluate this trade'
                : tradeValidation.isInvalidCurYear
                ? 'Over cap this year'
                : tradeValidation.isFutureYearOverCap
                ? 'Over cap in future year(s)'
                : tradeValidation.isClose
                ? 'Near the cap threshold'
                : 'Valid Trade'}
            </div>
            {!tradeValidation.unassigned && (
              <div className="text-sm text-white/80 space-y-1">
                {tradeValidation.details?.curYearNegatives?.length > 0 && (
                  <div>
                    Current year over cap: {tradeValidation.details.curYearNegatives.map((d, i) => `${d.team} ($${Math.abs(d.remaining).toFixed(1)} over)`).join(', ')}
                  </div>
                )}
                {tradeValidation.details?.futureNegatives?.length > 0 && (
                  <div>
                    Future years over cap: {tradeValidation.details.futureNegatives.map((d) => `${d.team} (${d.years.map(y => `${y.year} -$${Math.abs(y.remaining).toFixed(1)}`).join(', ')})`).join('; ')}
                  </div>
                )}
                {tradeValidation.details?.closeList?.length > 0 && (
                  <div>
                    Close to cap (&lt;$50 remaining): {(() => {
                      // Group by team
                      const byTeam = tradeValidation.details.closeList.reduce((acc, c) => {
                        acc[c.team] = acc[c.team] || [];
                        acc[c.team].push(c);
                        return acc;
                      }, {});
                      return Object.entries(byTeam).map(([team, arr]) => `${team} (${arr.map(a => `${a.year} $${a.remaining.toFixed(1)}`).join(', ')})`).join('; ');
                    })()}
                  </div>
                )}
              </div>
            )}
            {/* Trade Totals removed per request */}
            <button
              disabled={tradeValidation.unassigned}
              onClick={() => setShowSummary(true)}
              className={`text-sm ${tradeValidation.unassigned ? 'text-white/30 cursor-not-allowed' : 'text-[#FF4B1F] hover:text-[#FF4B1F]/80'}`}
            >
              View Trade Summary
            </button>
          </div>
        )}

        {showSummary && tradeValidation && (
          <TradeSummary
            participants={participants}
            impactsByTeam={tradeValidation.impactsByTeam}
            onClose={() => setShowSummary(false)}
            teamAvatars={teamAvatars}
            salaryKtcRatio={ktcPerDollar}
            positionRatios={positionRatios}
            usePositionRatios={usePositionRatios}
          />
        )}

        <div className="flex items-center justify-between mb-4">
          <div className="text-white/70 text-sm">Teams in trade: {participants.filter(p => p.team).length}</div>
          <button
            onClick={addParticipant}
            className="px-3 py-1.5 bg-white/10 border border-white/20 rounded text-white hover:bg-white/20"
          >
            + Add Team
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {participants.map((p, idx) => {
            const filtered = getFilteredPlayers(p);
            const teamOptions = participants.map(pp => pp.team).filter(Boolean);
            const impact = p.team && tradeValidation ? tradeValidation.impactsByTeam?.[p.team] : null;
            const otherTeam = isTwoTeamTrade && p.team ? uniqueActiveTeams.find(t => t !== p.team) : '';
            return (
              <TeamSection
                key={p.id}
                label={`Team ${idx + 1}`}
                participant={p}
                setTeam={(team) => setParticipantTeam(p.id, team)}
                setSearchTerm={(term) => setParticipantSearch(p.id, term)}
                filteredPlayers={filtered}
                addPlayer={(player) => addPlayerToParticipant(p.id, player)}
                removePlayer={(playerId) => removePlayerFromParticipant(p.id, playerId)}
                updateDestination={(playerId, toTeam) => updatePlayerDestination(p.id, playerId, toTeam)}
                uniqueTeams={uniqueTeams.filter(t => !participants.some(pp => pp.id !== p.id && pp.team === t))}
                teamOptions={teamOptions}
                impact={impact}
                teamAvatars={teamAvatars}
                canRemove={participants.length > 2}
                onRemove={() => removeParticipant(p.id)}
                hideDestination={isTwoTeamTrade}
                otherTeamName={otherTeam}
                ktcPerDollar={ktcPerDollar}
                usePositionRatios={usePositionRatios}
                positionRatios={positionRatios}
              />
            );
          })}
        </div>
      </div>
      <SleeperImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onApply={handleApplyImport}
        allPlayers={players}
        teamOptions={uniqueTeams}
        teamAvatars={teamAvatars}
      />
    </main>
  );
}

// --- Add this CSS file in your project (src/app/trade/playerCardAnimations.css) ---
// .player-card-pop-enter {
//   opacity: 0;
//   transform: scale(0.95);
// }
// .player-card-pop-enter-active {
//   opacity: 1;
//   transform: scale(1.05);
//   transition: opacity 0.3s, transform 0.3s;
// }
// .player-card-pop-exit {
//   opacity: 1;
// }
// .player-card-pop-exit-active {
//   opacity: 0;
//   transition: opacity 0.3s;
// }
// -------------------------------------------------------------------------------