'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AdminAnnouncementsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
    }
  }, [session, status, router]);

  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serverNow, setServerNow] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ message: '', link: '', startAt: '', endAt: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  async function loadAll() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/announcements', { cache: 'no-store' });
      const data = await res.json();
      setItems(data.announcements || []);
    } catch (e) {
      // noop
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/debug/now', { cache: 'no-store' });
        const data = await res.json();
        if (mounted) setServerNow(data);
      } catch (e) {
        // noop
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      if (!message || !startAt || !endAt) {
        setError('Message, start and end are required');
        return;
      }
      // datetime-local returns local time; send ISO
      const payload = {
        message,
        link: link || '',
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
      };
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to create announcement');
        return;
      }
      setSuccess('Announcement created');
      setMessage(''); setLink(''); setStartAt(''); setEndAt('');
      // Optimistically prepend the new announcement from response
      if (data.announcement) {
        setItems(prev => [data.announcement, ...prev]);
        setPage(1);
      } else {
        await loadAll();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Helper to fetch server "now" ISO
  async function getServerNowIso() {
    try {
      const res = await fetch('/api/debug/now', { cache: 'no-store' });
      const data = await res.json();
      return data?.nowIso || new Date().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  function toLocalInputValue(dateLike) {
    try {
      const d = new Date(dateLike);
      if (isNaN(d.getTime())) return '';
      const pad = n => String(n).padStart(2, '0');
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const hh = pad(d.getHours());
      const mi = pad(d.getMinutes());
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
    } catch {
      return '';
    }
  }

  function beginEdit(a) {
    setEditingId(a._id);
    setEditValues({
      message: a.message || '',
      link: a.link || '',
      startAt: toLocalInputValue(a.startAt),
      endAt: toLocalInputValue(a.endAt),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({ message: '', link: '', startAt: '', endAt: '' });
  }

  async function saveEdit(id) {
    try {
      setSavingEdit(true);
      const payload = {
        message: editValues.message,
        link: editValues.link || '',
        startAt: editValues.startAt ? new Date(editValues.startAt).toISOString() : undefined,
        endAt: editValues.endAt ? new Date(editValues.endAt).toISOString() : undefined,
      };
      // Optimistic update
      const prevItems = items;
      setItems(curr => curr.map(x => x._id === id ? {
        ...x,
        message: payload.message,
        link: payload.link,
        startAt: payload.startAt ? payload.startAt : x.startAt,
        endAt: payload.endAt ? payload.endAt : x.endAt,
      } : x));

      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to update announcement');
        // Revert
        setItems(prevItems);
        return;
      }
      cancelEdit();
    } catch (e) {
      setError(e.message);
      // Revert if network error
      await loadAll();
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteItem(id) {
    if (!confirm('Delete this announcement? This cannot be undone.')) return;
    try {
      // Optimistic remove
      const prevItems = items;
      setItems(curr => curr.filter(x => x._id !== id));

      const res = await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to delete announcement');
        // Revert
        setItems(prevItems);
        return;
      }
      if (editingId === id) cancelEdit();
    } catch (e) {
      setError(e.message);
      await loadAll();
    }
  }

  async function quickSetNow(id, field) {
    try {
      const nowIso = await getServerNowIso();
      // Optimistic
      const prevItems = items;
      setItems(curr => curr.map(x => x._id === id ? { ...x, [field]: nowIso } : x));
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: nowIso }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to update announcement');
        setItems(prevItems);
      }
    } catch (e) {
      setError(e.message);
      await loadAll();
    }
  }

  if (status === 'loading') return <div className="p-8">Loading...</div>;

  return (
    <main className="min-h-screen bg-[#001A2B] text-white p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-[#FF4B1F] mb-6">Announcements</h1>

        <form onSubmit={onSubmit} className="bg-black/30 border border-white/10 rounded-lg p-4 space-y-4">
          {error && <div className="text-red-400 text-sm">{error}</div>}
          {success && <div className="text-green-400 text-sm">{success}</div>}
          {serverNow && (
            <div className="text-xs text-white/60">Server time: {new Date(serverNow.nowIso).toLocaleString()} (offset {serverNow.tzOffsetMinutes}min)</div>
          )}

          <div>
            <label className="block text-sm mb-1">Message</label>
            <textarea
              className="w-full bg-black/40 border border-white/10 rounded p-2"
              rows={3}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Announcement message"
              required
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Link (optional)</label>
            <input
              type="url"
              className="w-full bg-black/40 border border-white/10 rounded p-2"
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Start</label>
              <input
                type="datetime-local"
                className="w-full bg-black/40 border border-white/10 rounded p-2"
                value={startAt}
                onChange={e => setStartAt(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm mb-1">End</label>
              <input
                type="datetime-local"
                className="w-full bg-black/40 border border-white/10 rounded p-2"
                value={endAt}
                onChange={e => setEndAt(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Create Announcement'}
          </button>
        </form>

        <div className="mt-8 bg-black/30 border border-white/10 rounded-lg p-4">
          <h2 className="font-bold mb-3">Existing Announcements</h2>
          {loading ? (
            <div>Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-white/60 text-sm">No announcements yet.</div>
          ) : (
            <>
              <div className="space-y-3">
              {items
                .slice((page - 1) * pageSize, page * pageSize)
                .map(a => {
                const now = Date.now();
                const start = Date.parse(a.startAt);
                const end = Date.parse(a.endAt);
                const active = isFinite(start) && isFinite(end) && start <= now && end >= now;
                return (
                  <div key={a._id} className={`p-3 rounded border ${active ? 'border-green-500/40 bg-green-500/10' : 'border-white/10 bg-black/20'}`}>
                    {editingId === a._id ? (
                      <div className="space-y-2">
                        <div className="text-xs text-white/60">Editing announcement</div>
                        <textarea
                          className="w-full bg-black/40 border border-white/10 rounded p-2"
                          rows={3}
                          value={editValues.message}
                          onChange={e => setEditValues(v => ({ ...v, message: e.target.value }))}
                        />
                        <input
                          type="url"
                          className="w-full bg-black/40 border border-white/10 rounded p-2"
                          placeholder="https://example.com"
                          value={editValues.link}
                          onChange={e => setEditValues(v => ({ ...v, link: e.target.value }))}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input
                            type="datetime-local"
                            className="w-full bg-black/40 border border-white/10 rounded p-2"
                            value={editValues.startAt}
                            onChange={e => setEditValues(v => ({ ...v, startAt: e.target.value }))}
                          />
                          <input
                            type="datetime-local"
                            className="w-full bg-black/40 border border-white/10 rounded p-2"
                            value={editValues.endAt}
                            onChange={e => setEditValues(v => ({ ...v, endAt: e.target.value }))}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="px-3 py-2 rounded bg-[#FF4B1F] hover:bg-[#FF4B1F]/80 disabled:opacity-60"
                            disabled={savingEdit}
                            onClick={() => saveEdit(a._id)}
                            type="button"
                          >
                            {savingEdit ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            className="px-3 py-2 rounded bg-black/40 border border-white/10 hover:bg-black/50"
                            type="button"
                            onClick={cancelEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{a.message}</div>
                          <div className="text-xs text-white/60">
                            {new Date(a.startAt).toLocaleString()} → {new Date(a.endAt).toLocaleString()}
                          </div>
                          {a.link && (
                            <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#FFB199] underline">{a.link}</a>
                          )}
                          <div className="mt-2 flex gap-2">
                            <button
                              className="px-3 py-1.5 rounded bg-[#FF4B1F] hover:bg-[#FF4B1F]/80 text-sm"
                              type="button"
                              onClick={() => beginEdit(a)}
                            >
                              Edit
                            </button>
                            <button
                              className="px-3 py-1.5 rounded bg-red-600/80 hover:bg-red-600 text-sm"
                              type="button"
                              onClick={() => deleteItem(a._id)}
                            >
                              Delete
                            </button>
                            <button
                              className="px-3 py-1.5 rounded bg-emerald-600/80 hover:bg-emerald-600 text-sm"
                              type="button"
                              onClick={() => quickSetNow(a._id, 'startAt')}
                            >
                              Activate now
                            </button>
                            <button
                              className="px-3 py-1.5 rounded bg-amber-600/80 hover:bg-amber-600 text-sm"
                              type="button"
                              onClick={() => quickSetNow(a._id, 'endAt')}
                            >
                              End now
                            </button>
                          </div>
                        </div>
                        <div className={`text-xs ${active ? 'text-green-400' : 'text-white/50'}`}>{active ? 'Active' : 'Inactive'}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
              {/* Pagination controls */}
              <div className="mt-4 flex items-center justify-between text-sm text-white/70">
                <div>
                  Page {page} of {Math.max(1, Math.ceil(items.length / pageSize))}
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1 rounded bg-black/40 border border-white/10 disabled:opacity-50"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Prev
                  </button>
                  <button
                    className="px-3 py-1 rounded bg-black/40 border border-white/10 disabled:opacity-50"
                    onClick={() => setPage(p => Math.min(Math.ceil(items.length / pageSize) || 1, p + 1))}
                    disabled={page >= (Math.ceil(items.length / pageSize) || 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
