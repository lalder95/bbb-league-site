'use client';
import React from 'react';

const DraftHeader = ({ draftInfo, draftYear }) => {
  return (
    <>
      <div className="bg-black/30 p-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className="h-16 w-16 transition-transform hover:scale-105"
            />
            <h1 className="text-3xl font-bold text-[#FF4B1F]">Draft Center</h1>
          </div>
          
          <div className="hidden md:block">
            <div className="text-white/70">
              Next Rookie Draft: <span className="font-bold text-white">May 1st, {draftYear}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Draft Info Banner */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-gradient-to-r from-[#FF4B1F]/20 to-transparent p-6 rounded-lg mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">{draftYear} Rookie Draft</h2>
              <p className="text-white/70">
                The annual rookie draft is a critical opportunity to acquire young talent at rookie contract prices. 
                Choose wisely as these players could be cornerstone pieces of your franchise.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center bg-black/30 p-3 rounded-lg min-w-[100px]">
                <div className="text-xs text-white/70">Draft Date</div>
                <div className="font-bold text-lg">MAY 1</div>
              </div>
              <div className="text-center bg-black/30 p-3 rounded-lg min-w-[100px]">
                <div className="text-xs text-white/70">Rounds</div>
                <div className="font-bold text-lg">{draftInfo?.settings?.rounds || "---"}</div>
              </div>
              <div className="text-center bg-black/30 p-3 rounded-lg min-w-[100px]">
                <div className="text-xs text-white/70">Format</div>
                <div className="font-bold text-lg">{draftInfo?.type ? draftInfo.type.charAt(0).toUpperCase() + draftInfo.type.slice(1) : "---"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default DraftHeader;