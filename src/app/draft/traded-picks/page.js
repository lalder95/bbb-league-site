'use client';

import React from 'react';
import DraftShell from '../DraftShell';
import TradedPicks from '@/components/draft/TradedPicks';
import { useDraftData } from '../components/DraftDataProvider';

export default function TradedPicksPage() {
  const { tradedPicks, tradeHistory, users, rosters, isMobile, draftYearToShow } = useDraftData();

  return (
    <DraftShell activeTab="traded-picks">
      <TradedPicks
        tradedPicks={tradedPicks}
        tradeHistory={tradeHistory}
        users={users}
        rosters={rosters}
        isMobile={isMobile}
        draftYearToShow={draftYearToShow}
      />
    </DraftShell>
  );
}
