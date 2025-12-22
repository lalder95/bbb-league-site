'use client';

import React from 'react';
import DraftShell from '../DraftShell';
import MockDraft from '@/components/draft/MockDraft';
import { useDraftData } from '../components/DraftDataProvider';

export default function MockDraftPage() {
  const { rosters, users, draftInfo, draftOrder, isMobile } = useDraftData();

  return (
    <DraftShell activeTab="mock-draft">
      <MockDraft
        rosters={rosters}
        users={users}
        draftInfo={draftInfo}
        draftOrder={draftOrder}
        isMobile={isMobile}
      />
    </DraftShell>
  );
}
