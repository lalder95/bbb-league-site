'use client';
import React from 'react';
import Link from 'next/link';

const DraftResources = () => {
  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-6 text-[#FF4B1F]">Draft Resources</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-black/30 p-6 rounded-lg border border-white/10 hover:border-[#FF4B1F]/50 transition-colors">
          <h3 className="text-xl font-bold mb-3">Prospect Rankings</h3>
          <p className="text-white/70 mb-4">
            Research the top rookie prospects to prepare for your draft selections.
          </p>
          <a 
            href="https://www.fantasypros.com/nfl/rankings/rookies.php" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[#FF4B1F] hover:underline inline-flex items-center gap-1"
          >
            View Rankings
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
        
        <div className="bg-black/30 p-6 rounded-lg border border-white/10 hover:border-[#FF4B1F]/50 transition-colors">
          <h3 className="text-xl font-bold mb-3">Mock Draft Tool</h3>
          <p className="text-white/70 mb-4">
            Practice different draft strategies with our mock draft simulator.
          </p>
          <span className="text-[#FF4B1F]/50 inline-flex items-center gap-1">
            Coming Soon
          </span>
        </div>
        
        <div className="bg-black/30 p-6 rounded-lg border border-white/10 hover:border-[#FF4B1F]/50 transition-colors">
          <h3 className="text-xl font-bold mb-3">Trade Calculator</h3>
          <p className="text-white/70 mb-4">
            Evaluate potential draft pick trades using our trade calculator.
          </p>
          <Link 
            href="/trade" 
            className="text-[#FF4B1F] hover:underline inline-flex items-center gap-1"
          >
            Open Calculator
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DraftResources;