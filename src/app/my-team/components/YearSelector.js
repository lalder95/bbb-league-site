'use client';
import React from 'react';

const YearSelector = ({ years, labels, selectedYear, onChange }) => {
  return (
    <div className="flex items-center gap-2 bg-black/20 p-1 rounded-full">
      {years.map((year, index) => (
        <button
          key={year}
          className={`px-3 py-1 text-sm rounded-full transition-colors ${
            selectedYear === year 
              ? 'bg-[#FF4B1F] text-white' 
              : 'text-white/70 hover:bg-black/30'
          }`}
          onClick={() => onChange(year)}
        >
          {labels ? labels[index] : year}
        </button>
      ))}
    </div>
  );
};

export default YearSelector;