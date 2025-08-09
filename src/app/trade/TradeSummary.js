import React from 'react';
import PlayerProfileCard from '../my-team/components/PlayerProfileCard';

const TradeSummary = ({
  teamA,
  teamB,
  selectedPlayersA,
  selectedPlayersB,
  tradeValidation,
  onClose,
  teamAvatars // <-- add this line
}) => {
  // Helper function to format salary value
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

  // Get position color
  const getPositionColor = (position) => {
    switch (position) {
      case 'QB': return 'bg-red-500';
      case 'RB': return 'bg-blue-500';
      case 'WR': return 'bg-green-500';
      case 'TE': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  // Calculate total contract value for each team's players
  const calculateTotalValue = (players) => {
    return players.reduce((sum, player) => sum + (parseFloat(player.curYear) || 0), 0);
  };

  // Calculate total KTC value for each team's players
  const calculateTotalKTC = (players) => {
    return players.reduce((sum, player) => sum + (parseFloat(player.ktcValue) || 0), 0);
  };

  const teamAValue = calculateTotalValue(selectedPlayersA);
  const teamBValue = calculateTotalValue(selectedPlayersB);
  const teamAKTC = calculateTotalKTC(selectedPlayersA);
  const teamBKTC = calculateTotalKTC(selectedPlayersB);

  // Format team names to capitalize first letter
  const formatTeamName = (name) => {
    if (!name) return 'Team';
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  // Responsive check
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  // --- Custom trade validation for summary banner ---
  const year1A = tradeValidation.impactA.after.curYear;
  const year1B = tradeValidation.impactB.after.curYear;
  const otherYearsA = [
    tradeValidation.impactA.after.year2,
    tradeValidation.impactA.after.year3,
    tradeValidation.impactA.after.year4,
  ];
  const otherYearsB = [
    tradeValidation.impactB.after.year2,
    tradeValidation.impactB.after.year3,
    tradeValidation.impactB.after.year4,
  ];

  const isInvalid = year1A < 0 || year1B < 0;
  const isWarning =
    !isInvalid &&
    (
      otherYearsA.some((v) => v < 0) ||
      otherYearsB.some((v) => v < 0) ||
      year1A < 50 ||
      year1B < 50
    );

  // Helper for bar color
  const getBarColor = (delta) => {
    if (delta > 0) return "bg-green-500";
    if (delta < 0) return "bg-red-500";
    return "bg-gray-400";
  };

  // Helper for bar label
  const formatDelta = (delta) => {
    if (delta > 0) return `+$${Math.abs(delta).toFixed(1)}`;
    if (delta < 0) return `-$${Math.abs(delta).toFixed(1)}`;
    return "$0.0";
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-2 md:px-4">
      <div className="relative bg-[#001A2B] border border-white/10 rounded-lg max-w-4xl w-full shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#FF4B1F]/20 to-transparent p-4 border-b border-white/10">
          <h2 className={`${isMobile ? "text-xl" : "text-2xl"} font-bold text-[#FF4B1F]`}>Trade Summary</h2>
          <p className="text-white/70 text-sm mt-1">
            Review the details of this trade before finalizing
          </p>
        </div>

        {/* Trade Status Banner */}
        <div className={`px-4 py-3 ${
          isInvalid ? 'bg-red-500/20 border-b border-red-500/50' :
          isWarning ? 'bg-yellow-500/20 border-b border-yellow-500/50' :
          'bg-green-500/20 border-b border-green-500/50'
        }`}>
          <div className="font-bold flex items-center">
            {isInvalid ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Invalid Trade: One or Both teams would exceed the cap!
              </>
            ) : isWarning ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Warning: Cap space is negative in a future year or close to the limit
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
        <div className={`p-3 md:p-6`}>
          <div className={`grid ${isMobile ? "grid-cols-1 gap-4" : "grid-cols-2 gap-6"}`}>
            {/* Team A Side */}
            <div className="bg-black/30 rounded-lg border border-white/10 p-3 md:p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#FF4B1F]/20 flex items-center justify-center text-lg md:text-xl font-bold">
                  {formatTeamName(teamA)?.charAt(0) || 'A'}
                </div>
                <div>
                  <h3 className="font-bold text-base md:text-lg">{formatTeamName(teamA)} Receives</h3>
                  <p className="text-white/70 text-xs md:text-sm">
                    {selectedPlayersB.length} player{selectedPlayersB.length !== 1 ? 's' : ''} • ${teamBValue.toFixed(1)} cap value • KTC: {teamBKTC ? teamBKTC.toFixed(0) : 0}
                  </p>
                </div>
              </div>

              {/* Cap Space Impact - moved above players */}
              <div>
                <h4 className="font-semibold text-xs md:text-sm border-b border-white/10 pb-1 mb-2">Cap Space After Trade</h4>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {["curYear", "year2", "year3", "year4"].map((yearKey, idx) => {
                    const after = tradeValidation.impactA.after[yearKey];
                    const before = tradeValidation.impactA.before[yearKey];
                    const delta = after - before;
                    const barHeight = Math.min(Math.abs(delta) * 2, 48);
                    return (
                      <div key={yearKey} className="flex flex-col items-center justify-end">
                        {/* Cap value */}
                        <div className={getCapSpaceColor(after)}>
                          {formatSalary(after)}
                        </div>
                        {/* Bar */}
                        <div className="flex flex-col items-center justify-end h-16 w-full">
                          <div
                            className={`w-6 ${getBarColor(delta)} rounded transition-all`}
                            style={{
                              height: `${barHeight}px`,
                              marginTop: `${48 - barHeight}px`,
                              transition: "height 0.3s"
                            }}
                            title={formatDelta(delta)}
                          ></div>
                          <div className="text-xs mt-1 text-white/70">{formatDelta(delta)}</div>
                        </div>
                        {/* Year label */}
                        <div className="w-full text-xs text-center text-white/50 mt-1">
                          {["Year 1", "Year 2", "Year 3", "Year 4"][idx]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Players received - moved below cap space */}
              <div className="space-y-2 mb-4 md:mb-6 mt-6">
                {selectedPlayersB.length > 0 ? (
                  selectedPlayersB.map((player, index) => (
                    <div
                      key={index}
                      className="bg-black/20 rounded p-2 md:p-3 flex flex-row items-center gap-4"
                    >
                      {/* Player image in a larger fixed-size container */}
                      <div className="flex items-center justify-center" style={{ width: 72, height: 72, minWidth: 72, minHeight: 72 }}>
                        <PlayerProfileCard
                          playerId={player.id}
                          imageExtension="png"
                          expanded={false}
                          className="w-20 h-20 object-contain"
                        />
                      </div>
                      {/* Player info */}
                      <div className="flex-1 min-w-0">
                        {/* Line 1: Player Name */}
                        <div className="font-semibold text-base text-white truncate">{player.playerName}</div>
                        {/* Line 2: Position, Salary, Contract Type */}
                        <div className="flex flex-row flex-wrap items-center gap-3 mt-1 text-sm">
                          <span className="text-white/80 font-semibold">{player.position}</span>
                          <span className="text-white/80 font-semibold">${player.curYear ? Number(player.curYear).toFixed(1) : "-"}</span>
                          <span className="text-white/80 font-semibold">{player.contractType}</span>
                        </div>
                        {/* Line 3: Team */}
                        <div className="flex flex-row items-center gap-2 mt-1 text-sm">
                          {teamAvatars && teamAvatars[player.team] ? (
                            <img
                              src={`https://sleepercdn.com/avatars/${teamAvatars[player.team]}`}
                              alt={player.team}
                              className="w-5 h-5 rounded-full mr-1 inline-block"
                            />
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-white/10 mr-1 inline-block"></span>
                          )}
                          <span className="text-white/80 font-semibold">{player.team}</span>
                        </div>
                        {/* Line 4: Age, KTC Score */}
                        <div className="flex flex-row gap-6 mt-1 text-xs text-white/70">
                          <span>Age: {player.age || "-"}</span>
                          <span>KTC: {player.ktcValue ? player.ktcValue : "-"}</span>
                        </div>
                      </div>
                      {/* Salary */}
                      <div className="text-green-400 font-bold ml-4 text-lg">${parseFloat(player.curYear).toFixed(1)}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-2 text-white/50 italic">No players in this trade</div>
                )}
              </div>
            </div>

            {/* Team B Side */}
            <div className="bg-black/30 rounded-lg border border-white/10 p-3 md:p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#3b82f6]/20 flex items-center justify-center text-lg md:text-xl font-bold">
                  {formatTeamName(teamB)?.charAt(0) || 'B'}
                </div>
                <div>
                  <h3 className="font-bold text-base md:text-lg">{formatTeamName(teamB)} Receives</h3>
                  <p className="text-white/70 text-xs md:text-sm">
                    {selectedPlayersA.length} player{selectedPlayersA.length !== 1 ? 's' : ''} • ${teamAValue.toFixed(1)} cap value • KTC: {teamAKTC ? teamAKTC.toFixed(0) : 0}
                  </p>
                </div>
              </div>

              {/* Cap Space Impact - moved above players */}
              <div>
                <h4 className="font-semibold text-xs md:text-sm border-b border-white/10 pb-1 mb-2">Cap Space After Trade</h4>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {["curYear", "year2", "year3", "year4"].map((yearKey, idx) => {
                    const after = tradeValidation.impactB.after[yearKey];
                    const before = tradeValidation.impactB.before[yearKey];
                    const delta = after - before;
                    const barHeight = Math.min(Math.abs(delta) * 2, 48);
                    return (
                      <div key={yearKey} className="flex flex-col items-center justify-end">
                        {/* Cap value */}
                        <div className={getCapSpaceColor(after)}>
                          {formatSalary(after)}
                        </div>
                        {/* Bar */}
                        <div className="flex flex-col items-center justify-end h-16 w-full">
                          <div
                            className={`w-6 ${getBarColor(delta)} rounded transition-all`}
                            style={{
                              height: `${barHeight}px`,
                              marginTop: `${48 - barHeight}px`,
                              transition: "height 0.3s"
                            }}
                            title={formatDelta(delta)}
                          ></div>
                          <div className="text-xs mt-1 text-white/70">{formatDelta(delta)}</div>
                        </div>
                        {/* Year label */}
                        <div className="w-full text-xs text-center text-white/50 mt-1">
                          {["Year 1", "Year 2", "Year 3", "Year 4"][idx]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Players received - moved below cap space */}
              <div className="space-y-2 mb-4 md:mb-6 mt-6">
                {selectedPlayersA.length > 0 ? (
                  selectedPlayersA.map((player, index) => (
                    <div
                      key={index}
                      className="bg-black/20 rounded p-2 md:p-3 flex flex-row items-center gap-4"
                    >
                      {/* Player image in a larger fixed-size container */}
                      <div className="flex items-center justify-center" style={{ width: 72, height: 72, minWidth: 72, minHeight: 72 }}>
                        <PlayerProfileCard
                          playerId={player.id}
                          imageExtension="png"
                          expanded={false}
                          className="w-20 h-20 object-contain"
                        />
                      </div>
                      {/* Player info */}
                      <div className="flex-1 min-w-0">
                        {/* Line 1: Player Name */}
                        <div className="font-semibold text-base text-white truncate">{player.playerName}</div>
                        {/* Line 2: Position, Salary, Contract Type */}
                        <div className="flex flex-row flex-wrap items-center gap-3 mt-1 text-sm">
                          <span className="text-white/80 font-semibold">{player.position}</span>
                          <span className="text-white/80 font-semibold">${player.curYear ? Number(player.curYear).toFixed(1) : "-"}</span>
                          <span className="text-white/80 font-semibold">{player.contractType}</span>
                        </div>
                        {/* Line 3: Team */}
                        <div className="flex flex-row items-center gap-2 mt-1 text-sm">
                          {teamAvatars && teamAvatars[player.team] ? (
                            <img
                              src={`https://sleepercdn.com/avatars/${teamAvatars[player.team]}`}
                              alt={player.team}
                              className="w-5 h-5 rounded-full mr-1 inline-block"
                            />
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-white/10 mr-1 inline-block"></span>
                          )}
                          <span className="text-white/80 font-semibold">{player.team}</span>
                        </div>
                        {/* Line 4: Age, KTC Score */}
                        <div className="flex flex-row gap-6 mt-1 text-xs text-white/70">
                          <span>Age: {player.age || "-"}</span>
                          <span>KTC: {player.ktcValue ? player.ktcValue : "-"}</span>
                        </div>
                      </div>
                      {/* Salary */}
                      <div className="text-green-400 font-bold ml-4 text-lg">${parseFloat(player.curYear).toFixed(1)}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-2 text-white/50 italic">No players in this trade</div>
                )}
              </div>
            </div>
          </div>

          {/* Footer with legend and buttons */}
          <div className={`mt-4 md:mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 sticky bottom-0 bg-[#001A2B] py-3`}>
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
              {isInvalid && (
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
          {/* Extra padding for mobile to ensure button is accessible */}
          <div className="h-8 md:h-0" />
        </div>
      </div>
    </div>
  );
};

export default TradeSummary;