'use client';
import { useState, useEffect } from 'react';
import { Download, Pencil, Trash2, Plus } from 'lucide-react';
import { useSession } from 'next-auth/react';

const CURRENT_YEAR = new Date().getFullYear();

function groupByYear(entries) {
  const map = new Map();
  for (const entry of entries) {
    const year = entry.effectiveYear;
    if (!map.has(year)) map.set(year, []);
    map.get(year).push(entry);
  }
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
}

export default function Rules() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [windowHeight, setWindowHeight] = useState(800);
  const [isMobile, setIsMobile] = useState(false);
  const [ruleChanges, setRuleChanges] = useState([]);
  const [loadingChanges, setLoadingChanges] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [modalEntry, setModalEntry] = useState(null);
  const [modalTitle, setModalTitle] = useState('');
  const [modalDescription, setModalDescription] = useState('');
  const [modalYear, setModalYear] = useState(String(CURRENT_YEAR + 1));
  const [modalError, setModalError] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // Update dimensions on window resize
  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  async function loadChanges() {
    setLoadingChanges(true);
    try {
      const res = await fetch('/api/rule-changes', { cache: 'no-store' });
      const data = await res.json();
      setRuleChanges(data.ruleChanges || []);
    } catch {
      // noop
    } finally {
      setLoadingChanges(false);
    }
  }

  useEffect(() => { loadChanges(); }, []);

  const handleResize = () => {
    const availableHeight = window.innerHeight - 200;
    setWindowHeight(availableHeight > 400 ? availableHeight : 400);
    setIsMobile(window.innerWidth < 768);
  };

  function openAddModal() {
    setModalMode('add');
    setModalEntry(null);
    setModalTitle('');
    setModalDescription('');
    setModalYear(String(CURRENT_YEAR + 1));
    setModalError('');
    setModalOpen(true);
  }

  function openEditModal(entry) {
    setModalMode('edit');
    setModalEntry(entry);
    setModalTitle(entry.title || '');
    setModalDescription(entry.description || '');
    setModalYear(String(entry.effectiveYear));
    setModalError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setModalError('');
  }

  async function handleModalSubmit(e) {
    e.preventDefault();
    if (!modalTitle.trim() || !modalDescription.trim() || !modalYear) {
      setModalError('All fields are required.');
      return;
    }
    setModalSubmitting(true);
    setModalError('');
    try {
      const body = { title: modalTitle.trim(), description: modalDescription.trim(), effectiveYear: parseInt(modalYear, 10) };
      let res;
      if (modalMode === 'add') {
        res = await fetch('/api/admin/rule-changes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`/api/admin/rule-changes/${modalEntry._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        setModalError(data.error || 'Request failed.');
        return;
      }
      closeModal();
      await loadChanges();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setModalSubmitting(false);
    }
  }

  async function handleDelete(entry) {
    if (!confirm(`Delete "${entry.title || 'this rule change'}"?`)) return;
    try {
      const res = await fetch(`/api/admin/rule-changes/${entry._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to delete');
        return;
      }
      setRuleChanges(prev => prev.filter(r => r._id !== entry._id));
    } catch (err) {
      alert(err.message);
    }
  }

  const yearGroups = groupByYear(ruleChanges);

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className="bg-black/30 p-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className="h-16 w-16 transition-transform hover:scale-105"
            />
            <h1 className="text-3xl font-bold text-[#FF4B1F]">Rules & Resources</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Mobile Warning and Download Option */}
        {isMobile && (
          <div className="mb-4 bg-[#FF4B1F]/10 rounded-lg border border-[#FF4B1F]/30 p-4">
            <p className="mb-2">
              The rulebook may be difficult to read on mobile devices. 
              Consider downloading it for a better experience.
            </p>
            <a 
              href="/rulebook.pdf" 
              download
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors text-white"
            >
              <Download size={16} />
              <span>Download PDF</span>
            </a>
          </div>
        )}

        {/* Tabs for different viewing options */}
        <div className="mb-4 flex flex-wrap gap-2">
          <a 
            href="/rulebook.pdf" 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-4 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors text-white"
          >
            Open in New Tab
          </a>
          <a 
            href="/rulebook.pdf" 
            download
            className="px-4 py-2 bg-black/30 rounded hover:bg-black/40 transition-colors text-white"
          >
            Download PDF
          </a>
        </div>

        {/* PDF Viewer */}
        <div className="rounded-lg border border-white/10 shadow-xl bg-black/20 overflow-hidden">
          <iframe 
            src="/rulebook.pdf"
            className="w-full"
            style={{ height: `${windowHeight}px` }}
            title="BBB League Rulebook"
          />
        </div>

        {/* Upcoming Changes */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[#FF4B1F]">Upcoming Changes</h2>
            {isAdmin && (
              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors text-sm"
              >
                <Plus size={15} />
                Add Rule Change
              </button>
            )}
          </div>
          {loadingChanges ? (
            <p className="text-white/50 text-sm">Loading...</p>
          ) : yearGroups.length === 0 ? (
            <p className="text-white/50 text-sm">No upcoming rule changes at this time.</p>
          ) : (
            <div className="space-y-6">
              {yearGroups.map(([year, entries]) => (
                <div key={year}>
                  <h3 className="text-base font-bold text-white/60 uppercase tracking-wide mb-3">
                    {year} Season
                  </h3>
                  <div className="space-y-3">
                    {entries.map(rc => (
                      <div key={rc._id} className="bg-black/30 rounded-lg border border-white/10 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            {rc.title && (
                              <p className="font-semibold text-white mb-1">{rc.title}</p>
                            )}
                            <p className="text-white/80 text-sm">{rc.description}</p>
                          </div>
                          {isAdmin && (
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => openEditModal(rc)}
                                className="p-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                                title="Edit"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(rc)}
                                className="p-1.5 rounded bg-red-900/40 hover:bg-red-900/60 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Additional Resources */}
        <div className="mt-6">
          <h2 className="text-xl font-bold text-[#FF4B1F] mb-4">Additional Resources</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <a 
              href="/offseason"
              className="bg-black/30 p-4 rounded-lg border border-white/10 hover:border-[#FF4B1F]/50 transition-colors"
            >
              <h3 className="font-bold mb-2">Offseason Guide</h3>
              <p className="text-white/70">Key dates and deadlines for the offseason</p>
            </a>
            <a 
              href="/salary-cap"
              className="bg-black/30 p-4 rounded-lg border border-white/10 hover:border-[#FF4B1F]/50 transition-colors"
            >
              <h3 className="font-bold mb-2">Salary Cap</h3>
              <p className="text-white/70">Current team salary cap situations</p>
            </a>
            <a 
              href="/trade"
              className="bg-black/30 p-4 rounded-lg border border-white/10 hover:border-[#FF4B1F]/50 transition-colors"
            >
              <h3 className="font-bold mb-2">Trade Calculator</h3>
              <p className="text-white/70">Analyze and validate potential trades</p>
            </a>
          </div>
        </div>
      </div>

      {/* Admin Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#001A2B] border border-white/10 rounded-xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-white/10">
              <h2 className="text-xl font-bold text-[#FF4B1F]">
                {modalMode === 'add' ? 'Add Rule Change' : 'Edit Rule Change'}
              </h2>
            </div>
            <form onSubmit={handleModalSubmit} className="p-6 space-y-4">
              {modalError && (
                <div className="text-red-400 text-sm">{modalError}</div>
              )}
              <div>
                <label className="block text-sm text-white/70 mb-1">Title</label>
                <input
                  type="text"
                  value={modalTitle}
                  onChange={e => setModalTitle(e.target.value)}
                  className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4B1F]/60"
                  placeholder="Short title for the rule change..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Description</label>
                <textarea
                  value={modalDescription}
                  onChange={e => setModalDescription(e.target.value)}
                  rows={4}
                  className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4B1F]/60"
                  placeholder="Describe the rule change..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Effective Year</label>
                <input
                  type="number"
                  value={modalYear}
                  onChange={e => setModalYear(e.target.value)}
                  className="w-32 bg-black/40 border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4B1F]/60"
                  min={CURRENT_YEAR}
                  max={CURRENT_YEAR + 10}
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors disabled:opacity-50"
                >
                  {modalSubmitting ? 'Saving...' : modalMode === 'add' ? 'Add' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={modalSubmitting}
                  className="px-5 py-2 bg-white/10 rounded hover:bg-white/20 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}