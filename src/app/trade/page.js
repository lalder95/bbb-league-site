'use client';
import React, { useState, useEffect } from 'react';
import TradeSummary from './TradeSummary';
import PlayerProfileCard from '../my-team/components/PlayerProfileCard';
import { AnimatePresence, motion } from 'framer-motion';

function TeamSection({ 
  side, 
  team, 
  setTeam,
  searchTerm, 
  setSearchTerm, 
  filteredPlayers, 
  selectedPlayers, 
  setSelectedPlayers,
  uniqueTeams,
  tradeValidation,
  impact
}) {
  // Animation: Track which player was just added
  const [justAddedId, setJustAddedId] = useState(null);

  // When a player is added, set justAddedId for animation
  const handleAddPlayer = (player) => {
    setSelectedPlayers([...selectedPlayers, player]);
    setJustAddedId(player.id);
    setTimeout(() => setJustAddedId(null), 600); // Match animation duration
  };

  return (
    <div className="flex-1 p-4">
      <div className="bg-black/30 rounded-lg border border-white/10 p-4">
        <h2 className="text-xl font-bold mb-4 text-[#FF4B1F]">Team {side}</h2>
        <select
          value={team}
          onChange={(e) => {
            setTeam(e.target.value);
            setSelectedPlayers([]);
          }}
          className="w-full p-2 mb-4 rounded bg-white/5 border border-white/10 text-white"
        >
          <option value="">Select Team</option>
          {uniqueTeams.map(team => (
            <option key={team} value={team}>{team}</option>
          ))}
        </select>

        {team && (
          <>
            <input
              type="text"
              placeholder="Search players..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full p-2 mb-4 rounded bg-white/5 border border-white/10 text-white"
            />

            <div className="mb-4">
              <h3 className="text-sm font-bold mb-2 text-white/70">Selected Players:</h3>
              <div className="space-y-2 bg-[#FF4B1F]/20 border-2 border-[#FF4B1F] rounded p-2 shadow-lg">
                {selectedPlayers.length === 0 && (
                  <div className="text-xs text-white/40 italic">No players selected.</div>
                )}
                <AnimatePresence>
                  {selectedPlayers.map(player => (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 30 }}
                      transition={{ type: "spring", stiffness: 3000, damping: 20 }}
                      className="relative flex flex-col items-center"
                    >
                      <div className="w-20 h-20 flex items-center justify-center">
                        <PlayerProfileCard playerId={player.id} imageExtension="png" />
                      </div>
                      <div className="mt-2 text-xs text-white font-semibold text-center">
                        {player.playerName}
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedPlayers(selectedPlayers.filter(p => p.id !== player.id));
                        }}
                        className="absolute top-2 right-2 text-red-400 hover:text-red-300 text-xs bg-black/60 rounded px-2 py-1"
                      >
                        Remove
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold mb-2 text-white/70">Available Players:</h3>
              <div className="max-h-60 overflow-y-auto space-y-1 bg-black/30 border-2 border-white/20 rounded p-2">
                {filteredPlayers.length === 0 && (
                  <div className="text-xs text-white/40 italic">No available players.</div>
                )}
                {filteredPlayers.map(player => (
                  <div
                    key={player.id}
                    className="cursor-pointer flex flex-col items-center"
                    onClick={() => handleAddPlayer(player)}
                  >
                    <div className="w-20 h-20 flex items-center justify-center">
                      <PlayerProfileCard playerId={player.id} imageExtension="png" />
                    </div>
                    <div className="mt-2 text-xs text-white font-semibold text-center">
                      {player.playerName}
                    </div>
                  </div>
                ))}
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
    </div>
  );
}

const CapImpactDisplay = ({ impact, label }) => (
  <div className="grid grid-cols-4 gap-2 text-sm">
    {Object.entries(impact).map(([year, value]) => (
      <div key={year} className="text-center">
        <div className="text-white/70">{year}</div>
        <div className={getValidationColor(value)}>
          {formatSalary(value)}
        </div>
      </div>
    ))}
  </div>
);

const formatSalary = (value) => `$${value.toFixed(1)}`;

const getValidationColor = (value) => {
  if (value < 0) return 'text-red-400';
  if (value < 50) return 'text-[#FF4B1F]';
  if (value < 100) return 'text-yellow-400';
  return 'text-green-400';
};

export default function Trade() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTermA, setSearchTermA] = useState('');
  const [searchTermB, setSearchTermB] = useState('');
  const [selectedPlayersA, setSelectedPlayersA] = useState([]);
  const [selectedPlayersB, setSelectedPlayersB] = useState([]);
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [showSummary, setShowSummary] = useState(false);

  // Fetch contract data (KTC from contracts CSV)
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch contract data
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
              id: values[0],
              playerName: values[1],
              team: values[33],
              position: values[21],
              nflTeam: values[22], // Make sure this is the correct index for NFL team
              status: status,
              contractType: values[2],
              contractFinalYear: values[5],
              curYear: isActive ? parseFloat(values[15]) || 0 : parseFloat(values[24]) || 0,
              year2: isActive ? parseFloat(values[16]) || 0 : parseFloat(values[25]) || 0,
              year3: isActive ? parseFloat(values[17]) || 0 : parseFloat(values[26]) || 0,
              year4: isActive ? parseFloat(values[18]) || 0 : parseFloat(values[27]) || 0,
              isActive: isActive,
              age: values[32],
              ktcValue: values[34],
              rfaEligible: values[37],
              franchiseTagEligible: values[38],
            };
          })
          .filter(player => player.status === 'Active');

        setPlayers(parsedData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const uniqueTeams = [...new Set(players.map(player => player.team))].sort();

  const filteredPlayersA = players
    .filter(player => 
      player.team === teamA &&
      player.playerName.toLowerCase().includes(searchTermA.toLowerCase()) &&
      !selectedPlayersA.some(selected => selected.id === player.id) &&
      !selectedPlayersB.some(selected => selected.id === player.id)
    )
    .sort((a, b) => a.playerName.localeCompare(b.playerName)); // Alphabetize by name

  const filteredPlayersB = players
    .filter(player => 
      player.team === teamB &&
      player.playerName.toLowerCase().includes(searchTermB.toLowerCase()) &&
      !selectedPlayersA.some(selected => selected.id === player.id) &&
      !selectedPlayersB.some(selected => selected.id === player.id)
    )
    .sort((a, b) => a.playerName.localeCompare(b.playerName)); // Alphabetize by name

  const calculateCapImpact = (playerList) => {
    return {
      curYear: playerList.reduce((sum, player) => sum + (parseFloat(player.curYear) || 0), 0),
      year2: playerList.reduce((sum, player) => sum + (parseFloat(player.year2) || 0), 0),
      year3: playerList.reduce((sum, player) => sum + (parseFloat(player.year3) || 0), 0),
      year4: playerList.reduce((sum, player) => sum + (parseFloat(player.year4) || 0), 0),
    };
  };

  const calculateTeamCapSpace = (teamName) => {
    const teamPlayers = players.filter(player => player.team === teamName);
    const capUsage = {
      curYear: teamPlayers.reduce((sum, player) => sum + (parseFloat(player.curYear) || 0), 0),
      year2: teamPlayers.reduce((sum, player) => sum + (parseFloat(player.year2) || 0), 0),
      year3: teamPlayers.reduce((sum, player) => sum + (parseFloat(player.year3) || 0), 0),
      year4: teamPlayers.reduce((sum, player) => sum + (parseFloat(player.year4) || 0), 0),
    };
    
    return {
      curYear: 300 - capUsage.curYear,
      year2: 300 - capUsage.year2,
      year3: 300 - capUsage.year3,
      year4: 300 - capUsage.year4,
    };
  };

  const calculateTradeImpact = (teamName, incomingPlayers, outgoingPlayers) => {
    const currentSpace = calculateTeamCapSpace(teamName);
    const incomingCap = calculateCapImpact(incomingPlayers);
    const outgoingCap = calculateCapImpact(outgoingPlayers);
    
    return {
      before: currentSpace,
      incoming: incomingCap,
      outgoing: outgoingCap,
      after: {
        curYear: currentSpace.curYear - incomingCap.curYear + outgoingCap.curYear,
        year2: currentSpace.year2 - incomingCap.year2 + outgoingCap.year2,
        year3: currentSpace.year3 - incomingCap.year3 + outgoingCap.year3,
        year4: currentSpace.year4 - incomingCap.year4 + outgoingCap.year4,
      }
    };
  };

  const validateTrade = () => {
    const impactA = calculateTradeImpact(teamA, selectedPlayersB, selectedPlayersA);
    const impactB = calculateTradeImpact(teamB, selectedPlayersA, selectedPlayersB);

    const isValid = Object.values(impactA.after).every(val => val >= 0) && 
                   Object.values(impactB.after).every(val => val >= 0);

    const isClose = Object.values(impactA.after).some(val => val >= 0 && val < 50) ||
                   Object.values(impactB.after).some(val => val >= 0 && val < 50);

    return {
      isValid,
      isClose,
      impactA,
      impactB
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
      </div>
    );
  }

  const tradeValidation = teamA && teamB ? validateTrade() : null;

  // Reset handler
  const handleReset = () => {
    setTeamA('');
    setTeamB('');
    setSelectedPlayersA([]);
    setSelectedPlayersB([]);
    setSearchTermA('');
    setSearchTermB('');
    setShowSummary(false);
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
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-white/10 border border-white/20 rounded text-white hover:bg-[#FF4B1F]/80 hover:text-white transition-colors"
          >
            Reset Trade
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {tradeValidation && (teamA && teamB) && (
          <div className={`mb-6 p-4 rounded-lg ${
            !tradeValidation.isValid ? 'bg-red-500/20 border border-red-500/50' :
            tradeValidation.isClose ? 'bg-yellow-500/20 border border-yellow-500/50' :
            'bg-green-500/20 border border-green-500/50'
          }`}>
            <div className="font-bold mb-2">
              {!tradeValidation.isValid ? 'Invalid Trade: Insufficient cap space' :
               tradeValidation.isClose ? 'Warning: Teams will be close to cap' :
               'Valid Trade'}
            </div>
            <button
              onClick={() => setShowSummary(true)}
              className="text-sm text-[#FF4B1F] hover:text-[#FF4B1F]/80"
            >
              View Trade Summary
            </button>
          </div>
        )}

        {showSummary && tradeValidation && (
          <TradeSummary 
            teamA={teamA}
            teamB={teamB}
            selectedPlayersA={selectedPlayersA}
            selectedPlayersB={selectedPlayersB}
            tradeValidation={tradeValidation}
            onClose={() => setShowSummary(false)}
          />
        )}

        <div className="flex flex-col md:flex-row gap-6">
          <TeamSection
            side="A"
            team={teamA}
            setTeam={setTeamA}
            searchTerm={searchTermA}
            setSearchTerm={setSearchTermA}
            filteredPlayers={filteredPlayersA}
            selectedPlayers={selectedPlayersA}
            setSelectedPlayers={setSelectedPlayersA}
            uniqueTeams={uniqueTeams}
            tradeValidation={tradeValidation}
            impact={tradeValidation?.impactA}
          />
          <TeamSection
            side="B"
            team={teamB}
            setTeam={setTeamB}
            searchTerm={searchTermB}
            setSearchTerm={setSearchTermB}
            filteredPlayers={filteredPlayersB}
            selectedPlayers={selectedPlayersB}
            setSelectedPlayers={setSelectedPlayersB}
            uniqueTeams={uniqueTeams}
            tradeValidation={tradeValidation}
            impact={tradeValidation?.impactB}
          />
        </div>
      </div>
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