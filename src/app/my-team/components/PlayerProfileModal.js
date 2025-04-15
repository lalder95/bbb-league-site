'use client';
import React from 'react';

const PlayerProfileModal = ({ player, onClose }) => {
  if (!player) return null;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-[#001A2B] border border-white/10 rounded-lg max-w-lg w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">{player.name}</h2>
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white"
          >
            Close
          </button>
        </div>
        
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="bg-black/30 p-3 rounded-lg text-center flex-1">
              <div className="text-xs text-white/70 mb-1">Position</div>
              <div className="text-lg font-bold">{player.position}</div>
            </div>
            
            <div className="bg-black/30 p-3 rounded-lg text-center flex-1">
              <div className="text-xs text-white/70 mb-1">KTC Value</div>
              <div className="text-lg font-bold text-blue-400">
                {player.ktcValue?.toLocaleString() || 'N/A'}
              </div>
            </div>
            
            <div className="bg-black/30 p-3 rounded-lg text-center flex-1">
              <div className="text-xs text-white/70 mb-1">Salary</div>
              <div className="text-lg font-bold text-green-400">
                ${player.salary?.toFixed(1) || 'N/A'}
              </div>
            </div>
          </div>
          
          {/* Additional player information would go here */}
          <p className="text-center text-white/70">
            Detailed player information would appear here.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PlayerProfileModal;