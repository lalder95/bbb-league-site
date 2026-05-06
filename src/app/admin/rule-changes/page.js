'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AdminRuleChangesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
    }
  }, [session, status, router]);

  const currentYear = new Date().getFullYear();

  const [description, setDescription] = useState('');
  const [effectiveYear, setEffectiveYear] = useState(String(currentYear + 1));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ description: '', effectiveYear: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  async function loadAll() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/rule-changes', { cache: 'no-store' });
      const data = await res.json();
      setItems(data.ruleChanges || []);
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      if (!description || !effectiveYear) {
        setError('Description and effective year are required');
        return;
      }
      const res = await fetch('/api/admin/rule-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, effectiveYear: parseInt(effectiveYear, 10) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to create rule change');
        return;
      }
      setSuccess('Rule change added');
      setDescription('');
      setEffectiveYear(String(currentYear + 1));
      if (data.ruleChange) {
        setItems(prev => [...prev, data.ruleChange].sort((a, b) => a.effectiveYear - b.effectiveYear));
      } else {
        await loadAll();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(item) {
    setEditingId(item._id);
    setEditValues({ description: item.description, effectiveYear: String(item.effectiveYear) });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({ description: '', effectiveYear: '' });
  }

  async function saveEdit(id) {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/rule-changes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: editValues.description,
          effectiveYear: parseInt(editValues.effectiveYear, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to save');
        return;
      }
      setItems(prev =>
        prev
          .map(i => i._id === id ? { ...i, ...editValues, effectiveYear: parseInt(editValues.effectiveYear, 10) } : i)
          .sort((a, b) => a.effectiveYear - b.effectiveYear)
      );
      cancelEdit();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteItem(id) {
    if (!confirm('Delete this rule change?')) return;
    try {
      const res = await fetch(`/api/admin/rule-changes/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to delete');
        return;
      }
      setItems(prev => prev.filter(i => i._id !== id));
    } catch (err) {
      alert(err.message);
    }
  }

  if (status === 'loading') {
    return <div className="min-h-screen bg-[#001A2B] text-white flex items-center justify-center">Loading...</div>;
  }

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className="bg-black/30 p-6 border-b border-white/10">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-[#FF4B1F]">Upcoming Rule Changes</h1>
          <p className="text-white/60 mt-1">Manage rule changes displayed on the Rules page</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Add new rule change */}
        <form onSubmit={onSubmit} className="bg-black/30 rounded-lg border border-white/10 p-6 space-y-4">
          <h2 className="text-xl font-bold text-[#FF4B1F]">Add Rule Change</h2>

          {error && <div className="text-red-400 text-sm">{error}</div>}
          {success && <div className="text-green-400 text-sm">{success}</div>}

          <div>
            <label className="block text-sm text-white/70 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4B1F]/60"
              placeholder="Describe the rule change..."
              required
            />
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-1">Effective Year</label>
            <input
              type="number"
              value={effectiveYear}
              onChange={e => setEffectiveYear(e.target.value)}
              className="w-32 bg-black/40 border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4B1F]/60"
              min={currentYear}
              max={currentYear + 10}
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add Rule Change'}
          </button>
        </form>

        {/* Existing rule changes */}
        <div className="bg-black/30 rounded-lg border border-white/10 p-6">
          <h2 className="text-xl font-bold text-[#FF4B1F] mb-4">Existing Rule Changes</h2>
          {loading ? (
            <p className="text-white/50">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-white/50">No rule changes yet.</p>
          ) : (
            <div className="space-y-3">
              {items.map(item => (
                <div key={item._id} className="border border-white/10 rounded-lg p-4">
                  {editingId === item._id ? (
                    <div className="space-y-3">
                      <textarea
                        value={editValues.description}
                        onChange={e => setEditValues(v => ({ ...v, description: e.target.value }))}
                        rows={3}
                        className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4B1F]/60"
                      />
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          value={editValues.effectiveYear}
                          onChange={e => setEditValues(v => ({ ...v, effectiveYear: e.target.value }))}
                          className="w-28 bg-black/40 border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4B1F]/60"
                          min={currentYear}
                          max={currentYear + 10}
                        />
                        <button
                          onClick={() => saveEdit(item._id)}
                          disabled={savingEdit}
                          className="px-4 py-1.5 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors text-sm disabled:opacity-50"
                        >
                          {savingEdit ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-4 py-1.5 bg-white/10 rounded hover:bg-white/20 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <span className="inline-block text-xs font-bold text-[#FF4B1F] bg-[#FF4B1F]/10 border border-[#FF4B1F]/30 rounded px-2 py-0.5 mb-2">
                          {item.effectiveYear} Season
                        </span>
                        <p className="text-white/90">{item.description}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => startEdit(item)}
                          className="px-3 py-1 text-sm bg-white/10 rounded hover:bg-white/20 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteItem(item._id)}
                          className="px-3 py-1 text-sm bg-red-900/40 rounded hover:bg-red-900/60 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
