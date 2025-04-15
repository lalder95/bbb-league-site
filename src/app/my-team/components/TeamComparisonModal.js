'use client';
import React from 'react';

const TeamComparisonModal = ({ onClose, teamData, leagueData }) => {
  if (!teamData || !leagueData) return null;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-[#001A2B] border border-white/10 rounded-lg max-w-4xl w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-[#FF4B1F]">League Comparison</h2>
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white"
          >
            Close
          </button>
        </div>
        
        <div className="space-y-6">
          <p className="text-center text-white/70">
            Team comparison details would appear here.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TeamComparisonModal;