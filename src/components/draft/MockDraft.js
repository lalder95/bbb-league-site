'use client';
import React, { useState, useEffect } from 'react';
import { parseMarkdown } from '@/utils/mockDraftUtils';

const MockDraft = ({ rosters, users, draftInfo, draftOrder }) => {
  // Mock draft data - in a real app, this would come from a database
  const [mockDrafts, setMockDrafts] = useState([]);

  const [selectedDraft, setSelectedDraft] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  // Find active mock draft on component mount
  // Load drafts from API and showArchived preference on mount
  useEffect(() => {
    (async () => {
      try {
        const archivedPref = typeof window !== 'undefined' ? window.localStorage.getItem('bbb.mockDrafts.showArchived') : null;
        if (archivedPref !== null) setShowArchived(archivedPref === 'true');
        // Clean up legacy local-only drafts
        if (typeof window !== 'undefined') {
          try { window.localStorage.removeItem('bbb.mockDrafts'); } catch (_) {}
        }
        const res = await fetch('/api/mock-drafts?includeArchived=true', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.drafts)) setMockDrafts(json.drafts);
        }
      } catch (_) {}
    })();
  }, []);

  // Auto-select active draft when drafts change
  useEffect(() => {
    const activeDraft = mockDrafts.find(draft => draft.active);
    if (activeDraft) {
      setSelectedDraft(activeDraft);
    } else if (selectedDraft) {
      // If the selected draft was deleted, clear selection
      const stillExists = mockDrafts.some(d => d.id === selectedDraft.id);
      if (!stillExists) setSelectedDraft(null);
    }
  }, [mockDrafts]);

  // No longer persisting drafts locally; they live in Mongo via API

  // Persist Show Archived preference
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('bbb.mockDrafts.showArchived', showArchived ? 'true' : 'false');
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }, [showArchived]);

  // Mock Draft List
  const MockDraftList = () => (
    <div className="bg-black/20 p-6 rounded-lg">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-[#FF4B1F]">Mock Draft Articles</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowArchived(a => !a)}
            className="px-3 py-1 rounded-lg bg-black/30 text-white/70 hover:text-white border border-white/10 hover:border-white/30 text-sm"
          >
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
        </div>
      </div>
      
      {(mockDrafts.filter(d => showArchived ? true : !d.archived)).length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mockDrafts
            .filter(d => showArchived ? true : !d.archived)
            .map(draft => (
            <div 
              key={draft.id}
              className={`
                bg-black/30 p-4 rounded-lg border cursor-pointer transition-colors
                ${draft.active 
                  ? 'border-[#FF4B1F]/60 border-2' 
                  : 'border-white/10 hover:border-white/30'
                }
              `}
              onClick={() => setSelectedDraft(draft)}
            >
              <h4 className="text-lg font-bold mb-2">{draft.title}</h4>
              <div className="flex justify-between text-sm text-white/70 mb-3">
                <div>By {draft.author}</div>
                <div>{new Date(draft.date).toLocaleDateString()}</div>
              </div>
              <p className="text-white/80 line-clamp-2">{draft.description}</p>
              {draft.active && (
                <div className="mt-2 text-xs inline-flex items-center px-2 py-1 rounded-full bg-[#FF4B1F]/20 text-[#FF4B1F]">
                  Current
                </div>
              )}
              {draft.archived && (
                <div className="mt-2 text-xs inline-flex items-center px-2 py-1 rounded-full bg-white/10 text-white/70">
                  Archived
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-white/70 py-6">
          <p>No mock drafts have been created yet.</p>
          <p className="mt-2">Check back later for mock draft articles.</p>
        </div>
      )}
    </div>
  );

  // Mock Draft Detail View
  const MockDraftDetail = () => {
    if (!selectedDraft) return null;
    
    return (
      <div className="bg-black/20 p-6 rounded-lg mt-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-2xl font-bold text-[#FF4B1F]">{selectedDraft.title}</h3>
            <div className="text-white/70 mt-1">
              Published {new Date(selectedDraft.date).toLocaleDateString()} by {selectedDraft.author}
            </div>
          </div>
        </div>
        
        <div className="bg-black/10 p-6 rounded-lg">
          <div 
            className="draft-content prose prose-invert max-w-none prose-headings:text-[#FF4B1F] prose-strong:text-white" 
            dangerouslySetInnerHTML={{ __html: parseMarkdown(selectedDraft.content, users) }} 
          />
        </div>
      </div>
    );
  };

  // Main Component Render
  return (
    <div className="bg-black/20 p-6 rounded-lg">
      <h3 className="text-xl font-bold mb-6 text-[#FF4B1F]">Mock Draft Center</h3>

      <>
        <MockDraftList />
        <MockDraftDetail />
      </>

      {!selectedDraft && mockDrafts.length === 0 && (
        <div className="bg-black/30 p-8 rounded-lg text-center mt-8">
          <h3 className="text-xl font-bold mb-4">No Mock Drafts Available</h3>
          <p className="text-white/70">
            We don't have any mock draft articles yet. Mock drafts will appear here to help you prepare for the upcoming rookie draft.
          </p>
        </div>
      )}
    </div>
  );
};

export default MockDraft;