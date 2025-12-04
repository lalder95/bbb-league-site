'use client';
import React from 'react';
import { formatPickNumber } from '@/utils/draftUtils';

const PastDrafts = ({ pastDrafts, getTeamName }) => {
  if (pastDrafts.length === 0) {
    return (
      <div className="bg-black/20 p-6 rounded-lg text-center">
        <h3 className="text-xl font-bold mb-4">No Draft History Available</h3>
        <p className="text-white/70">There is no draft history available yet.</p>
      </div>
    );
  }
  
  // Only show the first draft that happened each calendar year.
  // Build a map of year -> earliest draft by created timestamp, then sort newest-first.
  const earliestDraftByYearMap = pastDrafts.reduce((acc, draft) => {
    const year = new Date(draft.created).getFullYear();
    const existing = acc.get(year);
    if (!existing || draft.created < existing.created) {
      acc.set(year, draft);
    }
    return acc;
  }, new Map());

  // Extract and sort by created (newest first)
  const sortedDrafts = Array.from(earliestDraftByYearMap.values()).sort(
    (a, b) => b.created - a.created
  );
  
  return (
    <div className="bg-black/20 p-6 rounded-lg">
      <h3 className="text-xl font-bold mb-6">Past Drafts</h3>
      
      <div className="space-y-4">
        {sortedDrafts.map((draft) => (
          <div key={draft.draft_id} className="border border-white/10 rounded-lg overflow-hidden">
            <div className="bg-black/30 p-4 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-bold">{draft.season} {draft.metadata?.name || 'Draft'}</h4>
                <div className="text-sm text-white/70">
                  {new Date(draft.created).toLocaleDateString()}
                </div>
              </div>
              <a
                href={`https://sleeper.com/draft/nfl/${draft.draft_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[#FF4B1F] hover:underline"
              >
                View on Sleeper
                <span aria-hidden>↗</span>
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PastDrafts;