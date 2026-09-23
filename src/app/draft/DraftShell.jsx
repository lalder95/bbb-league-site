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
      <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,75,31,0.16),transparent_36%),linear-gradient(180deg,#071826_0%,#04111d_100%)] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.07),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(255,75,31,0.08),transparent_28%)]" />
        <div className="relative flex min-h-screen items-center justify-center">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-5 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#FF4B1F]/30 border-t-[#FF4B1F]" />
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-[#FFB39F]">Draft Center</div>
                <div className="text-white/70">Loading rookie draft data...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#071826_0%,#04111d_100%)] p-6 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-red-500/25 bg-red-500/10 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.35)]">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200/80">Draft Center</div>
            <h1 className="mt-2 text-3xl font-black text-white">Error loading draft data</h1>
            <p className="mt-3 max-w-2xl text-white/70">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,75,31,0.14),transparent_32%),linear-gradient(180deg,#071826_0%,#04111d_100%)] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_70%)]" />
      <DraftHeader draftInfo={draftInfo} draftYear={draftYearToShow} />

      <div className={`relative mx-auto max-w-7xl ${isMobile ? 'px-3 pb-4 pt-3' : 'px-6 pb-8 pt-2'}`}>
        <div className={isMobile ? 'overflow-x-auto' : ''}>
          <DraftTabsNav activeTab={activeTab} isMobile={isMobile} />
        </div>

        <div className={isMobile ? 'mt-3' : 'mt-6'}>{children}</div>

        {showResources && (
          <div className={isMobile ? 'mt-4' : 'mt-6'}>
            <DraftResources isMobile={isMobile} />
            <DraftStrategyTips isMobile={isMobile} />
          </div>
        )}
      </div>
    </main>
  );
}
