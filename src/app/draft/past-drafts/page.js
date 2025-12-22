'use client';

import React from 'react';
import DraftShell from '../DraftShell';
import PastDrafts from '@/components/draft/PastDrafts';
import { useDraftData } from '../components/DraftDataProvider';

export default function PastDraftsPage() {
  const { pastDrafts, getTeamName, isMobile } = useDraftData();

  return (
    <DraftShell activeTab="past-drafts">
      <PastDrafts pastDrafts={pastDrafts} getTeamName={getTeamName} isMobile={isMobile} />
    </DraftShell>
  );
}
