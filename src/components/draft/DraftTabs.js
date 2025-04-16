'use client';
import React from 'react';

const DraftTabs = ({ activeTab, setActiveTab }) => {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      <button
        onClick={() => setActiveTab('draft-order')}
        className={`px-4 py-2 rounded ${
          activeTab === 'draft-order' 
            ? 'bg-[#FF4B1F] text-white' 
            : 'bg-black/30 text-white/70 hover:bg-black/40'
        }`}
      >
        Draft Order
      </button>
      <button
        onClick={() => setActiveTab('traded-picks')}
        className={`px-4 py-2 rounded ${
          activeTab === 'traded-picks' 
            ? 'bg-[#FF4B1F] text-white' 
            : 'bg-black/30 text-white/70 hover:bg-black/40'
        }`}
      >
        Traded Picks
      </button>
      <button
        onClick={() => setActiveTab('past-drafts')}
        className={`px-4 py-2 rounded ${
          activeTab === 'past-drafts' 
            ? 'bg-[#FF4B1F] text-white' 
            : 'bg-black/30 text-white/70 hover:bg-black/40'
        }`}
      >
        Past Drafts
      </button>
      <button
        onClick={() => setActiveTab('rookie-salaries')}
        className={`px-4 py-2 rounded ${
          activeTab === 'rookie-salaries' 
            ? 'bg-[#FF4B1F] text-white' 
            : 'bg-black/30 text-white/70 hover:bg-black/40'
        }`}
      >
        Rookie Salaries
      </button>
      <button
        onClick={() => setActiveTab('mock-draft')}
        className={`px-4 py-2 rounded ${
          activeTab === 'mock-draft' 
            ? 'bg-[#FF4B1F] text-white' 
            : 'bg-black/30 text-white/70 hover:bg-black/40'
        }`}
      >
        Mock Draft
      </button>
    </div>
  );
};

export default DraftTabs;