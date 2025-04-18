'use client';
import React, { useState, useEffect } from 'react';
import { sampleMockDrafts, parseMarkdown, getNewDraftTemplate } from '@/utils/mockDraftUtils';
import { useSession } from 'next-auth/react';

const MockDraft = ({ rosters, users, draftInfo, draftOrder }) => {
  // Get session info to check if user is admin
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  
  // Mock draft data - in a real app, this would come from a database
  const [mockDrafts, setMockDrafts] = useState(sampleMockDrafts);

  const [selectedDraft, setSelectedDraft] = useState(null);
  const [isWriting, setIsWriting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftContent, setDraftContent] = useState('');

  // Find active mock draft on component mount
  useEffect(() => {
    const activeDraft = mockDrafts.find(draft => draft.active);
    if (activeDraft) {
      setSelectedDraft(activeDraft);
    }
  }, [mockDrafts]);

  // Start new draft
  const handleNewDraft = () => {
    setDraftTitle('New Mock Draft');
    setDraftDescription('Draft analysis and predictions for the upcoming rookie draft.');
    setDraftContent(getNewDraftTemplate());
    setEditMode(false);
    setIsWriting(true);
    setSelectedDraft(null);
  };

  // Edit existing draft
  const handleEditDraft = (draft) => {
    setDraftTitle(draft.title);
    setDraftDescription(draft.description);
    setDraftContent(draft.content);
    setEditMode(true);
    setIsWriting(true);
    setSelectedDraft(draft);
  };

  // Save draft (would typically save to a database)
  const handleSaveDraft = () => {
    const currentDate = new Date().toISOString().split('T')[0];
    
    if (editMode && selectedDraft) {
      // Update existing draft
      const updatedDrafts = mockDrafts.map(draft => 
        draft.id === selectedDraft.id 
          ? { 
              ...draft, 
              title: draftTitle, 
              description: draftDescription, 
              content: draftContent,
              date: currentDate,
              active: true
            } 
          : { ...draft, active: false }
      );
      setMockDrafts(updatedDrafts);
      setSelectedDraft({ ...selectedDraft, title: draftTitle, description: draftDescription, content: draftContent, date: currentDate, active: true });
    } else {
      // Create new draft
      const newDraft = {
        id: Date.now().toString(),
        title: draftTitle,
        author: 'Commissioner', // In a real app, this would be the current user
        date: currentDate,
        description: draftDescription,
        content: draftContent,
        active: true
      };
      
      const updatedDrafts = mockDrafts.map(draft => ({ ...draft, active: false }));
      updatedDrafts.push(newDraft);
      setMockDrafts(updatedDrafts);
      setSelectedDraft(newDraft);
    }
    
    setIsWriting(false);
  };

  // Cancel draft editing/creation
  const handleCancelDraft = () => {
    setIsWriting(false);
  };

  // parseMarkdown is now imported from mockDraftUtils

  // Write/Edit Draft Form
  const WriteDraftForm = () => (
    <div className="bg-black/30 p-6 rounded-lg border border-white/10">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-[#FF4B1F]">
          {editMode ? 'Edit Mock Draft' : 'Create New Mock Draft'}
        </h3>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const previewElement = document.getElementById('draft-preview');
              if (previewElement) {
                previewElement.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="px-3 py-1 rounded-lg bg-black/30 text-white/70 hover:text-white border border-white/10 hover:border-white/30 text-sm"
          >
            Preview Below
          </button>
        </div>
      </div>
      
      {/* Markdown Guide */}
      <div className="bg-black/40 rounded-lg p-4 mb-6 text-sm">
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-bold text-white">Markdown Guide</h4>
          <span className="text-xs text-white/50">Use these formatting options in your draft</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <code className="bg-black/30 px-2 py-1 rounded"># Title</code>
            <span className="block text-white/70 text-xs">Main Heading</span>
          </div>
          <div>
            <code className="bg-black/30 px-2 py-1 rounded">## Subtitle</code>
            <span className="block text-white/70 text-xs">Subheading</span>
          </div>
          <div>
            <code className="bg-black/30 px-2 py-1 rounded">### 1.01 - Team</code>
            <span className="block text-white/70 text-xs">Pick heading</span>
          </div>
          <div>
            <code className="bg-black/30 px-2 py-1 rounded">**Bold Text**</code>
            <span className="block text-white/70 text-xs">Bold text</span>
          </div>
        </div>
        
        <div className="mt-3 text-white/70 text-xs">
          <p>For player projections, use this format:</p>
          <code className="block bg-black/30 px-2 py-1 rounded mt-1">
            ### 1.01 - Team Vikingsfan80<br/>
            **Projected Pick: Marvin Harrison Jr., WR, Ohio State**
          </code>
        </div>
      </div>
      
      <div className="space-y-6">
        <div>
          <label className="block mb-2 text-white/70">Title</label>
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:border-[#FF4B1F] focus:outline-none"
            placeholder="e.g., 2025 Mock Draft 1.0"
          />
        </div>
        
        <div>
          <label className="block mb-2 text-white/70">Description</label>
          <input
            type="text"
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:border-[#FF4B1F] focus:outline-none"
            placeholder="A brief description of your mock draft"
          />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block mb-2 text-white/70">Content</label>
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:border-[#FF4B1F] focus:outline-none h-96 font-mono"
              placeholder="Write your mock draft article here. Use Markdown formatting."
            />
          </div>
          
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-white/70">Live Preview</label>
              <span className="text-xs text-white/50">See how your draft will look</span>
            </div>
            <div id="draft-preview" className="border border-white/10 rounded-lg p-4 bg-black/20 h-96 overflow-y-auto">
              <div 
                className="draft-content prose prose-invert max-w-none prose-headings:text-[#FF4B1F] prose-strong:text-white" 
                dangerouslySetInnerHTML={{ __html: parseMarkdown(draftContent) }} 
              />
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-4 pt-4 border-t border-white/10">
          <button
            onClick={handleCancelDraft}
            className="px-4 py-2 rounded-lg border border-white/10 text-white/70 hover:text-white hover:border-white/30"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveDraft}
            className="px-4 py-2 rounded-lg bg-[#FF4B1F] text-white hover:bg-[#FF4B1F]/80"
            disabled={!draftTitle.trim() || !draftContent.trim()}
          >
            {editMode ? 'Update Draft' : 'Save Draft'}
          </button>
        </div>
      </div>
    </div>
  );

  // Mock Draft List
  const MockDraftList = () => (
    <div className="bg-black/20 p-6 rounded-lg">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-[#FF4B1F]">Mock Draft Articles</h3>
        {isAdmin && (
          <button
            onClick={handleNewDraft}
            className="px-4 py-2 rounded-lg bg-[#FF4B1F] text-white hover:bg-[#FF4B1F]/80 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            New Mock Draft
          </button>
        )}
      </div>
      
      {mockDrafts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mockDrafts.map(draft => (
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
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-white/70 py-6">
          <p>No mock drafts have been created yet.</p>
          <p className="mt-2">Create a new mock draft to get started!</p>
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
          {isAdmin && (
            <button
              onClick={() => handleEditDraft(selectedDraft)}
              className="px-3 py-1 rounded-lg bg-black/30 text-white/70 hover:text-white border border-white/10 hover:border-white/30 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
              Edit
            </button>
          )}
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
      
      {isWriting ? (
        <WriteDraftForm />
      ) : (
        <>
          <MockDraftList />
          <MockDraftDetail />
        </>
      )}
      
      {!selectedDraft && !isWriting && mockDrafts.length === 0 && (
        <div className="bg-black/30 p-8 rounded-lg text-center mt-8">
          <h3 className="text-xl font-bold mb-4">No Mock Drafts Available</h3>
          <p className="text-white/70 mb-6">
            We don't have any mock draft articles yet. Mock drafts will appear here to help you prepare for the upcoming rookie draft.
          </p>
          {isAdmin && (
            <button
              onClick={handleNewDraft}
              className="px-4 py-2 rounded-lg bg-[#FF4B1F] text-white hover:bg-[#FF4B1F]/80"
            >
              Create First Mock Draft
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default MockDraft;