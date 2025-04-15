'use client';
import React from 'react';

const DraftCapitalCard = ({ picks, year }) => {
  if (!picks || picks.length === 0) {
    return (
      <div className="bg-black/20 p-4 rounded-lg">
        <h3 className="font-bold mb-2">{year} Draft Picks</h3>
        <p className="text-white/70 text-sm">No draft picks for this year.</p>
      </div>
    );
  }
  
  // Calculate total value
  const totalValue = picks.reduce((sum, pick) => sum + pick.value, 0);
  
  return (
    <div className="bg-black/20 p-4 rounded-lg">
      <h3 className="font-bold mb-2">{year} Draft Picks</h3>
      <div className="space-y-2">
        {picks.map((pick, index) => (
          <div key={index} className="flex justify-between items-center bg-black/30 p-2 rounded">
            <div>
              <span className="font-medium">Round {pick.round}</span>
              {pick.pick && <span className="ml-1 text-white/70">Pick {pick.pick}</span>}
              {pick.originalTeam !== 'Own' && (
                <span className="ml-1 text-xs bg-[#FF4B1F]/20 text-[#FF4B1F] px-1 py-0.5 rounded">
                  via {pick.originalTeam}
                </span>
              )}
            </div>
            <div className="text-blue-400 font-medium">
              {pick.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-2 border-t border-white/10 flex justify-between">
        <span className="text-white/70">Total Value:</span>
        <span className="font-bold text-blue-400">{totalValue.toLocaleString()}</span>
      </div>
    </div>
  );
};

export default DraftCapitalCard;