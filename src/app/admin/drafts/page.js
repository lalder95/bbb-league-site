'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function DraftsListPage() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/drafts')
      .then(res => res.json())
      .then(data => {
        setDrafts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        setError('Failed to load drafts.');
        setLoading(false);
      });
  }, []);

  function downloadDraftJson(draft) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(draft, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `draft-${draft.draftId}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }

  return (
    <main className="min-h-screen bg-[#001A2B] text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-[#FF4B1F]">Drafts</h1>
          <Link
            href="/admin/drafts/create"
            className="px-4 py-2 bg-[#FF4B1F] rounded text-white hover:bg-[#FF4B1F]/80 transition-colors"
          >
            + Create Draft
          </Link>
        </div>
        {loading ? (
          <div>Loading...</div>
        ) : error ? (
          <div className="text-red-400">{error}</div>
        ) : drafts.length === 0 ? (
          <div>No drafts found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-white/10 rounded">
              <thead>
                <tr>
                  <th className="py-2 px-3 text-left">Draft ID</th>
                  <th className="py-2 px-3 text-left">Start Date</th>
                  <th className="py-2 px-3 text-left">State</th>
                  <th className="py-2 px-3 text-left">Teams</th>
                  <th className="py-2 px-3 text-left">Players</th>
                  <th className="py-2 px-3 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {drafts.map(draft => (
                  <tr key={draft.draftId} className="border-b border-white/10 hover:bg-black/20">
                    <td className="py-2 px-3">{draft.draftId}</td>
                    <td className="py-2 px-3">{draft.startDate ? new Date(draft.startDate).toLocaleString() : '-'}</td>
                    <td className="py-2 px-3">{draft.state}</td>
                    <td className="py-2 px-3">{draft.users?.map(u => u.username).join(', ')}</td>
                    <td className="py-2 px-3">{draft.players?.length ?? 0}</td>
                    <td className="py-2 px-3">
                      <button
                        className="px-2 py-1 bg-blue-600 rounded text-white hover:bg-blue-700"
                        onClick={() => downloadDraftJson(draft)}
                      >
                        Download JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}