'use client';

import React from 'react';
import DraftShell from '../DraftShell';
import RookieSalaries from '@/components/draft/RookieSalaries';
import { useDraftData } from '../components/DraftDataProvider';

export default function RookieSalariesPage() {
  const { rosters, tradedPicks, draftInfo, draftOrder, getTeamName, isMobile, draftYearToShow } =
    useDraftData();

  return (
    <DraftShell activeTab="rookie-salaries" showResources>
      <RookieSalaries
        rosters={rosters}
        tradedPicks={tradedPicks}
        draftInfo={draftInfo}
        draftOrder={draftOrder}
        getTeamName={getTeamName}
        isMobile={isMobile}
        draftYearToShow={draftYearToShow}
      />
    </DraftShell>
  );
}
