'use client';
import React from 'react';

const TeamPicksModal = ({ selectedTeam, teamPicks, draftYearToShow, onClose }) => {
  if (!selectedTeam) return null;

  const totalObligation = teamPicks.currentPicks.reduce((sum, pick) => sum + pick.salary, 0);
  const totalPicks = teamPicks.currentPicks.length;
  const roundCounts = teamPicks.currentPicks.reduce((acc, p) => {
    acc[p.round] = (acc[p.round] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#001A2B] border border-white/10 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#001A2B] border-b border-white/10 p-4 flex justify-between items-center">
          <h3 className="text-xl font-bold text-[#FF4B1F]">{selectedTeam} Draft Picks</h3>
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-4">
          <div className="mb-6 p-4 bg-black/20 rounded-lg">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
              <div>
                <h4 className="text-lg font-semibold">Draft Capital Summary</h4>
                <p className="text-white/70">Showing all picks currently owned by {selectedTeam} for the {draftYearToShow} draft</p>
              </div>
              <div className="mt-4 md:mt-0 text-right">
                <div className="text-white/70">Total Picks:</div>
                <div className="text-xl font-semibold">{totalPicks}</div>
                <div className="mt-2 text-white/70">Total Cap Obligation:</div>
                <div className="text-2xl font-bold text-green-400">${totalObligation}</div>
              </div>
            </div>
            {/* Per-round summary */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-sm">
              {[1,2,3,4,5,6,7].map(r => (
                <div key={r} className="bg-black/10 rounded px-2 py-1 flex items-center justify-between">
                  <span className="text-white/70">R{r}</span>
                  <span className="font-semibold">{roundCounts[r] || 0}</span>
                </div>
              ))}
            </div>
          </div>
          
          {teamPicks.currentPicks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-black/20 border-b border-white/10">
                    <th className="py-3 px-4 text-left">Pick</th>
                    <th className="py-3 px-4 text-left">Original Owner</th>
                    <th className="py-3 px-4 text-left">Pick Type</th>
                    <th className="py-3 px-4 text-right">Salary</th>
                  </tr>
                </thead>
                <tbody>
                  {teamPicks.currentPicks
                    .sort((a, b) => {
                      // First sort by round
                      if (a.round !== b.round) return a.round - b.round;
                      // Then by pick position within the round
                      return a.pickPosition - b.pickPosition;
                    })
                    .map((pick, index) => (
                      <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 px-4 font-semibold">{pick.pickNumber}</td>
                        <td className="py-3 px-4">{pick.originalOwner}</td>
                        <td className="py-3 px-4">
                          {pick.originalOwner === selectedTeam ? (
                            <span className="text-blue-400">Own Pick</span>
                          ) : (
                            <span className="text-yellow-400">Acquired via Trade</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-green-400">${pick.salary}</td>
                      </tr>
                    ))
                  }
                  <tr className="bg-black/30 font-bold">
                    <td colSpan="3" className="py-3 px-4 text-right">Total Cap Obligation:</td>
                    <td className="py-3 px-4 text-right text-green-400">${totalObligation}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-white/70 bg-black/10 rounded-lg">
              No draft picks currently owned by {selectedTeam}.
            </div>
          )}
          
          <div className="mt-6 text-sm text-white/70">
            <h5 className="font-semibold mb-1">Notes:</h5>
            <ul className="list-disc pl-6">
              <li>First round pick salaries vary based on draft position</li>
              <li>1.01: $14 | 1.02-1.03: $12 | 1.04-1.06: $10 | 1.07-1.09: $8 | 1.10-1.12: $6</li>
              <li>Second round picks cost $4</li>
              <li>Third round picks cost $2</li>
              <li>All other round picks cost $1</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamPicksModal;