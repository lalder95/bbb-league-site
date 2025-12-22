'use client';

import React from 'react';
import DraftHeader from '@/components/draft/DraftHeader';
import DraftResources from '@/components/draft/DraftResources';
import DraftStrategyTips from '@/components/draft/DraftStrategyTips';
import DraftTabsNav from './components/DraftTabsNav';
import { useDraftData } from './components/DraftDataProvider';

export default function DraftShell({ activeTab, children, showResources = false }) {
  const { loading, error, draftInfo, draftYearToShow, isMobile } = useDraftData();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#001A2B] text-white p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-[#FF4B1F] mb-4">Draft Center</h1>
          <div className="bg-red-500/20 border border-red-500/50 text-white p-4 rounded-lg">
            <h2 className="text-xl font-bold mb-2">Error Loading Draft Data</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <DraftHeader draftInfo={draftInfo} draftYear={draftYearToShow} />

      <div className={`max-w-7xl mx-auto ${isMobile ? 'p-2' : 'p-6'}`}>
        <div className={isMobile ? 'overflow-x-auto' : ''}>
          <DraftTabsNav activeTab={activeTab} isMobile={isMobile} />
        </div>

        <div className={isMobile ? 'mt-2' : 'mt-6'}>{children}</div>

        {showResources && (
          <div className={isMobile ? 'mt-2' : 'mt-6'}>
            <DraftResources isMobile={isMobile} />
            <DraftStrategyTips isMobile={isMobile} />
          </div>
        )}
      </div>
    </main>
  );
}
