'use client';

import React from 'react';
import DraftOrder from '@/components/draft/DraftOrder';
import DraftShell from './DraftShell';
import { useDraftData } from './components/DraftDataProvider';

export default function DraftPage() {
  const { draftInfo, draftOrder, isMobile } = useDraftData();

  return (
    <DraftShell activeTab="draft-order" showResources>
      <DraftOrder draftInfo={draftInfo} draftOrder={draftOrder} isMobile={isMobile} />
    </DraftShell>
  );
}