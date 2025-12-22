'use client';

import React from 'react';
import DraftDataProvider from './components/DraftDataProvider';

export default function DraftLayout({ children }) {
  return <DraftDataProvider>{children}</DraftDataProvider>;
}
