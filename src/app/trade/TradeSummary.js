import React from 'react';

const TradeSummary = ({ teamA, teamB, selectedPlayersA, selectedPlayersB, tradeValidation, onClose }) => {
  // Helper function to format salary value with color
  const formatSalary = (value) => {
    return `$${value.toFixed(1)}`;
  };

  // Get validation colors for cap space
  const getCapSpaceColor = (value) => {
    if (value < 0) return "text-red-500 font-bold";
    if (value < 50) return "text-[#FF4B1F] font-bold";
    if (value < 100) return "text-yellow-400";
    return "text-green-400";
  };

  // Calculate total contract value for each team's players
  const calculateTotalValue = (players) => {
    return players.reduce((sum, player) => sum + (parseFloat(player.curYear) || 0), 0);
  };

  const teamAValue = calculateTotalValue(selectedPlayersA);
  const teamBValue = calculateTotalValue(selectedPlayersB);
  
  // Format team names to capitalize first letter
  const formatTeamName = (name) => {
    if (!name) return 'Team';
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
      <div className="bg-[#001A2B] border border-white/10 rounded-lg max-w-4xl w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#FF4B1F]/20 to-transparent p-4 border-b border-white/10">
          <h2 className="text-2xl font-bold text-[#FF4B1F]">Trade Summary</h2>
          <p className="text-white/70 text-sm mt-1">
            Review the details of this trade before finalizing
          </p>
        </div>

        {/* Trade Status Banner */}
        <div className={`px-4 py-3 ${
          !tradeValidation.isValid ? 'bg-red-500/20 border-b border-red-500/50' :
          tradeValidation.isClose ? 'bg-yellow-500/20 border-b border-yellow-500/50' :
          'bg-green-500/20 border-b border-green-500/50'
        }`}>
          <div className="font-bold flex items-center">
            {!tradeValidation.isValid ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Invalid Trade: Insufficient cap space
              </>
            ) : tradeValidation.isClose ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Warning: Teams will be close to cap
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Valid Trade
              </>
            )}
          </div>
        </div>

        {/* Trade Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Team A Side */}
            <div className="bg-black/30 rounded-lg border border-white/10 p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-[#FF4B1F]/20 flex items-center justify-center text-xl font-bold">
                  {formatTeamName(teamA)?.charAt(0) || 'A'}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{formatTeamName(teamA)} Receives</h3>
                  <p className="text-white/70 text-sm">
                    {selectedPlayersB.length} player{selectedPlayersB.length !== 1 ? 's' : ''} • ${teamBValue.toFixed(1)} cap value
                  </p>
                </div>
              </div>

              {/* Players received */}
              <div className="space-y-2 mb-6">
                {selectedPlayersB.length > 0 ? (
                  selectedPlayersB.map((player, index) => (
                    <div key={index} className="bg-black/20 rounded p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-full rounded-full ${
                          player.position === 'QB' ? 'bg-red-500' :
                          player.position === 'RB' ? 'bg-blue-500' :
                          player.position === 'WR' ? 'bg-green-500' :
                          player.position === 'TE' ? 'bg-purple-500' :
                          'bg-gray-500'
                        }`}></div>
                        <div>
                          <div className="font-semibold">{player.playerName}</div>
                          <div className="text-xs text-white/70 flex gap-2">
                            <span className="bg-black/30 px-1.5 py-0.5 rounded">{player.position}</span>
                            {player.team && <span>{player.team}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-green-400 font-bold">${parseFloat(player.curYear).toFixed(1)}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-2 text-white/50 italic">No players in this trade</div>
                )}
              </div>

              {/* Cap Space Impact */}
              <div>
                <h4 className="font-semibold text-sm border-b border-white/10 pb-1 mb-2">Cap Space After Trade</h4>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-black/20 p-2 rounded">
                    <div className="text-xs text-white/70">Year 1</div>
                    <div className={getCapSpaceColor(tradeValidation.impactA.after.curYear)}>
                      {formatSalary(tradeValidation.impactA.after.curYear)}
                    </div>
                  </div>
                  <div className="bg-black/20 p-2 rounded">
                    <div className="text-xs text-white/70">Year 2</div>
                    <div className={getCapSpaceColor(tradeValidation.impactA.after.year2)}>
                      {formatSalary(tradeValidation.impactA.after.year2)}
                    </div>
                  </div>
                  <div className="bg-black/20 p-2 rounded">
                    <div className="text-xs text-white/70">Year 3</div>
                    <div className={getCapSpaceColor(tradeValidation.impactA.after.year3)}>
                      {formatSalary(tradeValidation.impactA.after.year3)}
                    </div>
                  </div>
                  <div className="bg-black/20 p-2 rounded">
                    <div className="text-xs text-white/70">Year 4</div>
                    <div className={getCapSpaceColor(tradeValidation.impactA.after.year4)}>
                      {formatSalary(tradeValidation.impactA.after.year4)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Team B Side */}
            <div className="bg-black/30 rounded-lg border border-white/10 p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-[#3b82f6]/20 flex items-center justify-center text-xl font-bold">
                  {formatTeamName(teamB)?.charAt(0) || 'B'}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{formatTeamName(teamB)} Receives</h3>
                  <p className="text-white/70 text-sm">
                    {selectedPlayersA.length} player{selectedPlayersA.length !== 1 ? 's' : ''} • ${teamAValue.toFixed(1)} cap value
                  </p>
                </div>
              </div>

              {/* Players received */}
              <div className="space-y-2 mb-6">
                {selectedPlayersA.length > 0 ? (
                  selectedPlayersA.map((player, index) => (
                    <div key={index} className="bg-black/20 rounded p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-full rounded-full ${
                          player.position === 'QB' ? 'bg-red-500' :
                          player.position === 'RB' ? 'bg-blue-500' :
                          player.position === 'WR' ? 'bg-green-500' :
                          player.position === 'TE' ? 'bg-purple-500' :
                          'bg-gray-500'
                        }`}></div>
                        <div>
                          <div className="font-semibold">{player.playerName}</div>
                          <div className="text-xs text-white/70 flex gap-2">
                            <span className="bg-black/30 px-1.5 py-0.5 rounded">{player.position}</span>
                            {player.team && <span>{player.team}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-green-400 font-bold">${parseFloat(player.curYear).toFixed(1)}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-2 text-white/50 italic">No players in this trade</div>
                )}
              </div>

              {/* Cap Space Impact */}
              <div>
                <h4 className="font-semibold text-sm border-b border-white/10 pb-1 mb-2">Cap Space After Trade</h4>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-black/20 p-2 rounded">
                    <div className="text-xs text-white/70">Year 1</div>
                    <div className={getCapSpaceColor(tradeValidation.impactB.after.curYear)}>
                      {formatSalary(tradeValidation.impactB.after.curYear)}
                    </div>
                  </div>
                  <div className="bg-black/20 p-2 rounded">
                    <div className="text-xs text-white/70">Year 2</div>
                    <div className={getCapSpaceColor(tradeValidation.impactB.after.year2)}>
                      {formatSalary(tradeValidation.impactB.after.year2)}
                    </div>
                  </div>
                  <div className="bg-black/20 p-2 rounded">
                    <div className="text-xs text-white/70">Year 3</div>
                    <div className={getCapSpaceColor(tradeValidation.impactB.after.year3)}>
                      {formatSalary(tradeValidation.impactB.after.year3)}
                    </div>
                  </div>
                  <div className="bg-black/20 p-2 rounded">
                    <div className="text-xs text-white/70">Year 4</div>
                    <div className={getCapSpaceColor(tradeValidation.impactB.after.year4)}>
                      {formatSalary(tradeValidation.impactB.after.year4)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer with legend and buttons */}
          <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-xs text-white/70 flex flex-wrap gap-x-4 gap-y-2">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-red-500 mr-1 rounded-full"></div>
                <span>QB</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 mr-1 rounded-full"></div>
                <span>RB</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 mr-1 rounded-full"></div>
                <span>WR</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-purple-500 mr-1 rounded-full"></div>
                <span>TE</span>
              </div>
            </div>
            
            <div className="flex gap-3">
              {!tradeValidation.isValid && (
                <button 
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded hover:bg-red-500/30 transition-colors"
                >
                  Invalid Trade
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeSummary;