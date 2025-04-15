'use client';
import React from 'react';

const PositionFilter = ({ currentFilter, onFilterChange }) => {
  const positions = ['All', 'QB', 'RB', 'WR', 'TE'];
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-white/70 text-sm">Position:</span>
      <div className="flex gap-1">
        {positions.map(pos => (
          <button
            key={pos}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              currentFilter === pos 
                ? 'bg-[#FF4B1F] text-white' 
                : 'bg-black/20 text-white/70 hover:bg-black/30'
            }`}
            onClick={() => onFilterChange(pos)}
          >
            {pos}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PositionFilter;