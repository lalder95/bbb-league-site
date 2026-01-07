'use client';
import React, { useState, useEffect } from 'react';
import { parseMarkdown } from '@/utils/mockDraftUtils';
import { useSession } from 'next-auth/react';

const MockDraft = ({ rosters, users, draftInfo, draftOrder }) => {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
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
        await refreshDrafts();
      } catch (_) {}
    })();
  }, []);

  async function refreshDrafts() {
    const res = await fetch('/api/mock-drafts?includeArchived=true', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.drafts)) setMockDrafts(json.drafts);
    }
  }

  async function handleArchiveToggle(draft, nextArchived) {
    if (!isAdmin) return;
    const ok = window.confirm(nextArchived ? `Archive "${draft.title}"?` : `Unarchive "${draft.title}"?`);
    if (!ok) return;
    try {
      const res = await fetch('/api/admin/mock-drafts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id || draft._id, archived: !!nextArchived, active: nextArchived ? false : draft.active }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to update draft');
      }
      await refreshDrafts();
    } catch (e) {
      window.alert(e?.message || String(e));
    }
  }

  async function handleDelete(draft) {
    if (!isAdmin) return;
    const ok = window.confirm(`Delete "${draft.title}"? This cannot be undone.`);
    if (!ok) return;
    try {
      const id = encodeURIComponent(draft.id || draft._id);
      const res = await fetch(`/api/admin/mock-drafts?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to delete draft');
      }
      // If we deleted the selected one, clear selection.
      if (selectedDraft && (selectedDraft.id === draft.id || selectedDraft._id === draft._id)) {
        setSelectedDraft(null);
      }
      await refreshDrafts();
    } catch (e) {
      window.alert(e?.message || String(e));
    }
  }

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
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-lg font-bold mb-2">{draft.title}</h4>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleArchiveToggle(draft, !draft.archived); }}
                      className="px-2 py-1 rounded bg-black/40 border border-white/10 text-xs text-white/80 hover:border-white/30 hover:text-white"
                      title={draft.archived ? 'Unarchive' : 'Archive'}
                    >
                      {draft.archived ? 'Unarchive' : 'Archive'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(draft); }}
                      className="px-2 py-1 rounded bg-red-500/15 border border-red-400/30 text-xs text-red-200 hover:border-red-300 hover:text-red-100"
                      title="Delete"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
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

    const debug = selectedDraft?.meta?.generationDebug;
    const debugPicks = Array.isArray(debug?.picks) ? debug.picks : [];
    const debugFallbackCount = debugPicks.filter(p => p?.usedFallback).length;
    const debugTemplateUnique = new Set(debugPicks.map(p => p?.templateId).filter(Boolean)).size;
    const debugLeadInUnique = new Set(debugPicks.map(p => p?.leadInCategory).filter(Boolean)).size;
    
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

        {isAdmin && (
          <div className="mt-6">
            <details className="bg-black/10 border border-white/10 rounded-lg">
              <summary className="cursor-pointer select-none px-4 py-3 text-white/90 font-semibold flex items-center justify-between">
                <span>Generation Debug (admin only)</span>
                <span className="text-xs text-white/60">Stored in Mongo</span>
              </summary>

              <div className="px-4 pb-4 pt-2 text-sm text-white/80">
                {!debug ? (
                  <div className="text-white/70">
                    No `meta.generationDebug` found on this draft document (older draft or generated before debug capture).
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                      <div className="bg-black/20 border border-white/10 rounded p-3">
                        <div className="text-white/60 text-xs">Model</div>
                        <div className="text-white">{debug.model || selectedDraft?.meta?.model || 'Unknown'}</div>
                      </div>
                      <div className="bg-black/20 border border-white/10 rounded p-3">
                        <div className="text-white/60 text-xs">Fallback picks</div>
                        <div className="text-white">{debugFallbackCount} / {debugPicks.length || 0}</div>
                      </div>
                      <div className="bg-black/20 border border-white/10 rounded p-3">
                        <div className="text-white/60 text-xs">Uniqueness</div>
                        <div className="text-white">
                          {debugTemplateUnique} templates • {debugLeadInUnique} lead-in categories
                        </div>
                      </div>
                    </div>

                    {debugPicks.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border border-white/10 rounded-lg overflow-hidden">
                          <thead className="bg-black/30 text-white/80">
                            <tr>
                              <th className="text-left px-3 py-2 border-b border-white/10">Pick</th>
                              <th className="text-left px-3 py-2 border-b border-white/10">Team</th>
                              <th className="text-left px-3 py-2 border-b border-white/10">Band</th>
                              <th className="text-left px-3 py-2 border-b border-white/10">Persona</th>
                              <th className="text-left px-3 py-2 border-b border-white/10">Lead-in</th>
                              <th className="text-left px-3 py-2 border-b border-white/10">Template</th>
                              <th className="text-left px-3 py-2 border-b border-white/10">Fallback</th>
                              <th className="text-left px-3 py-2 border-b border-white/10">Raw (preview)</th>
                              <th className="text-left px-3 py-2 border-b border-white/10">Sanitized (preview)</th>
                            </tr>
                          </thead>
                          <tbody className="bg-black/10">
                            {debugPicks.map((p, idx) => (
                              <tr key={`${p.pickNumber || idx}-${idx}`} className={idx % 2 === 0 ? 'bg-black/10' : 'bg-black/20'}>
                                <td className="align-top px-3 py-2 border-b border-white/5 text-white/90 whitespace-nowrap">{p.pickNumber}</td>
                                <td className="align-top px-3 py-2 border-b border-white/5 whitespace-nowrap">{p.teamName}</td>
                                <td className="align-top px-3 py-2 border-b border-white/5 whitespace-nowrap">{p.qualityBand || '-'}</td>
                                <td className="align-top px-3 py-2 border-b border-white/5 whitespace-nowrap">{p.persona || '-'}</td>
                                <td className="align-top px-3 py-2 border-b border-white/5 whitespace-nowrap">{p.leadInCategory || '-'}</td>
                                <td className="align-top px-3 py-2 border-b border-white/5">
                                  <div className="text-white/80">{p.templateId || '-'}</div>
                                  {p.templatePreview ? (
                                    <div className="text-white/60 mt-1 max-w-[520px]">{p.templatePreview}</div>
                                  ) : null}
                                </td>
                                <td className="align-top px-3 py-2 border-b border-white/5 whitespace-nowrap">
                                  {p.usedFallback ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-red-500/15 border border-red-400/30 text-red-200">Yes</span>
                                  ) : (
                                    <span className="text-white/60">No</span>
                                  )}
                                </td>
                                <td className="align-top px-3 py-2 border-b border-white/5">
                                  <div className="text-white/70 max-w-[520px]">{p.rawReasonPreview || '-'}</div>
                                  {p.parseError ? (
                                    <div className="text-red-200/80 mt-1">{p.parseError}</div>
                                  ) : null}
                                </td>
                                <td className="align-top px-3 py-2 border-b border-white/5">
                                  <div className="text-white/70 max-w-[520px]">{p.sanitizedReasonPreview || '-'}</div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-white/70">No debug picks recorded.</div>
                    )}
                  </>
                )}
              </div>
            </details>
          </div>
        )}
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