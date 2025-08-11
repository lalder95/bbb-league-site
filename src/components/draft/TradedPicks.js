'use client';
import React, { useState } from 'react';
import { getTeamName, findTradeForPick, formatTradeDate } from '@/utils/draftUtils';

const TradedPicks = ({ tradedPicks, tradeHistory, users, rosters, draftYearToShow }) => {
  const [selectedTradePick, setSelectedTradePick] = useState(null);

  // Use draftYearToShow for the first year, then +1, +2
  const baseYear = Number(draftYearToShow) || new Date().getFullYear() + 1;
  const futureYears = [baseYear, baseYear + 1, baseYear + 2].map(String);

  // Group picks by year and round
  const picksByYear = {};
  futureYears.forEach(year => {
    // First filter by year
    const yearPicks = tradedPicks.filter(pick => pick.season === year);
    
    // Group by round
    const roundsInYear = Array.from(new Set(yearPicks.map(pick => pick.round)))
      .sort((a, b) => a - b); // Sort rounds numerically
    
    picksByYear[year] = roundsInYear.map(round => {
      // Get all picks for this round and sort by original owner name
      const roundPicks = yearPicks.filter(pick => pick.round === round)
        .sort((a, b) => {
          const teamA = getTeamName(a.roster_id, rosters, users).toLowerCase();
          const teamB = getTeamName(b.roster_id, rosters, users).toLowerCase();
          return teamA.localeCompare(teamB);
        });
      
      return {
        round,
        picks: roundPicks
      };
    });
  });
  
  // Render trade details modal
  const TradeDetailsModal = () => {
    if (!selectedTradePick) return null;
    
    const trade = findTradeForPick(selectedTradePick, tradeHistory);
    
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-[#001A2B] border border-white/10 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
          <div className="sticky top-0 bg-[#001A2B] border-b border-white/10 p-4 flex justify-between items-center">
            <h3 className="text-xl font-bold text-[#FF4B1F]">Trade Details</h3>
            <button 
              onClick={() => setSelectedTradePick(null)}
              className="text-white/70 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="p-4">
            <div className="mb-6">
              <div className="text-white/70 mb-1">Pick</div>
              <div className="text-xl font-bold">
                Round {selectedTradePick.round} ({selectedTradePick.season})
              </div>
              <div className="flex flex-col sm:flex-row sm:gap-2 mt-2">
                <div>
                  <span className="text-white/70">Original Owner:</span>{' '}
                  <span className="font-medium">{getTeamName(selectedTradePick.roster_id, rosters, users)}</span>
                </div>
                <div className="hidden sm:block text-white/70">→</div>
                <div>
                  <span className="text-white/70">Current Owner:</span>{' '}
                  <span className="font-medium">{getTeamName(selectedTradePick.owner_id, rosters, users)}</span>
                </div>
              </div>
            </div>
            
            {trade ? (
              <>
                <div className="mb-4">
                  <div className="text-white/70 mb-1">Trade Date</div>
                  <div>{formatTradeDate(trade.created)}</div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {trade.roster_ids.map((rosterId, rosterIndex) => (
                    <div key={rosterIndex} className="bg-black/20 p-4 rounded-lg">
                      <h4 className="font-bold mb-3 text-[#FF4B1F]">{getTeamName(rosterId, rosters, users)} Received</h4>
                      
                      {/* Display draft picks received */}
                      {trade.draft_picks.filter(pick => pick.owner_id === rosterId).length > 0 && (
                        <div className="mb-3">
                          <div className="text-white/70 mb-1">Draft Picks</div>
                          <ul className="space-y-1">
                            {trade.draft_picks.filter(pick => pick.owner_id === rosterId).map((pick, pickIndex) => (
                              <li key={pickIndex} className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-[#FF4B1F]" />
                                <span>{getTeamName(pick.roster_id, rosters, users)}'s Round {pick.round} ({pick.season})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {/* Display players received - if we had player data */}
                      {trade.adds && Object.entries(trade.adds).filter(([playerId, teamId]) => teamId === rosterId).length > 0 && (
                        <div>
                          <div className="text-white/70 mb-1">Players</div>
                          <div className="italic text-white/50">Player data not available</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="bg-black/20 p-4 rounded-lg text-center">
                <div className="text-white/70">
                  Detailed trade information is not available for this pick.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="bg-black/20 p-6 rounded-lg">
      <h3 className="text-xl font-bold mb-4">Traded Draft Picks</h3>
      
      {tradedPicks.length === 0 ? (
        <div className="text-center text-white/70 py-4">
          No traded picks found.
        </div>
      ) : (
        <div className="space-y-6">
          {futureYears.map(year => (
            <div key={year}>
              <h4 className="text-lg font-semibold mb-3 text-[#FF4B1F]">{year} Draft</h4>
              
              {picksByYear[year] && picksByYear[year].length > 0 ? (
                <div className="space-y-4">
                  {picksByYear[year].map(roundData => (
                    <div key={`round-${roundData.round}`} className="bg-black/10 p-4 rounded-lg">
                      <h5 className="font-medium mb-3">Round {roundData.round}</h5>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="py-2 text-left">Original Owner</th>
                              <th className="py-2 text-left">Current Owner</th>
                              <th className="py-2 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {roundData.picks.map((pick, index) => (
                              <tr 
                                key={index} 
                                className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                                onClick={() => setSelectedTradePick(pick)}
                              >
                                <td className="py-3">{getTeamName(pick.roster_id, rosters, users)}</td>
                                <td className="py-3">{getTeamName(pick.owner_id, rosters, users)}</td>
                                <td className="py-3 text-right">
                                  <button 
                                    className="text-[#FF4B1F] hover:underline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTradePick(pick);
                                    }}
                                  >
                                    View Trade
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-white/70 py-4 bg-black/10 rounded">
                  No traded picks found for {year}.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      <TradeDetailsModal />
    </div>
  );
};

export default TradedPicks;