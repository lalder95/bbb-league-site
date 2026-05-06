'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  List,
  NotebookPen,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  UserRound,
  Plus,
  Search,
} from 'lucide-react';
import PlayerProfileCard from '../components/PlayerProfileCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const POSITION_COLORS = {
  QB: 'bg-red-500/20 text-red-300',
  RB: 'bg-blue-500/20 text-blue-300',
  WR: 'bg-green-500/20 text-green-300',
  TE: 'bg-purple-500/20 text-purple-300',
};
function positionPill(pos) {
  return `inline-flex items-center rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide ${POSITION_COLORS[pos] || 'bg-white/10 text-white/60'}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[1.25rem] border border-dashed border-white/15 bg-black/20 px-8 py-16 text-center">
      <Icon className="h-9 w-9 text-white/20" strokeWidth={1.5} />
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-white/35">{title}</p>
      {body ? <p className="max-w-xs text-[0.78rem] text-white/25">{body}</p> : null}
    </div>
  );
}

function MiniAvatar({ playerId }) {
  return (
    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/40">
      <PlayerProfileCard
        playerId={playerId}
        expanded={false}
        avatarOnly={true}
        className="h-8 w-8"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ListCard
// ---------------------------------------------------------------------------

function ListCard({ list, playerPool, onDeleteList, onRenameList, onRemovePlayer, onOpenProfile, onAddPlayer }) {
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const inputRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (renaming && inputRef.current) inputRef.current.focus();
  }, [renaming]);

  useEffect(() => {
    if (addingPlayer && searchRef.current) searchRef.current.focus();
  }, [addingPlayer]);

  function handleRenameSubmit() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== list.name) {
      onRenameList(list.normalizedName, trimmed);
    }
    setRenaming(false);
  }

  const existingIds = new Set(list.players.map((p) => p.playerId));
  const filtered = playerSearch.trim().length >= 1
    ? (playerPool || []).filter((p) => {
        const q = playerSearch.toLowerCase();
        return p.name.toLowerCase().includes(q) && !existingIds.has(String(p.id));
      }).slice(0, 8)
    : [];

  const previewPlayers = list.players.slice(0, 6);
  const overflow = list.players.length - 6;

  return (
    <div className="flex flex-col rounded-[1.25rem] border border-white/10 bg-black/25 shadow-[0_4px_24px_rgba(0,0,0,0.25)] transition-all">
      {/* Card header */}
      <div className="flex items-start gap-3 px-4 py-4">
        {/* Title + rename */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {renaming ? (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') { setRenaming(false); setRenameValue(list.name); }
                }}
                className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-sm font-bold text-white outline-none ring-[1.5px] ring-[#f7a37c]/60"
              />
              <button onClick={handleRenameSubmit} className="text-green-400 hover:text-green-300"><Check className="h-4 w-4" /></button>
              <button onClick={() => { setRenaming(false); setRenameValue(list.name); }} className="text-white/40 hover:text-white/70"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-black uppercase tracking-[0.1em] text-white">{list.name}</span>
              <button onClick={() => setRenaming(true)} className="shrink-0 text-white/30 hover:text-white/70 transition-colors" title="Rename list">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/35">
            {list.players.length} {list.players.length === 1 ? 'player' : 'players'}
          </span>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {confirmDelete ? (
            <>
              <span className="text-[0.65rem] text-white/50">Delete list?</span>
              <button onClick={() => onDeleteList(list.normalizedName)} className="text-red-400 hover:text-red-300 transition-colors" title="Confirm delete">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-white/40 hover:text-white/70 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
            onClick={() => setConfirmDelete(true)} className="text-white/25 hover:text-red-400 transition-colors" title="Delete list">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => { setAddingPlayer((v) => !v); setPlayerSearch(''); setExpanded(true); }}
            className="text-white/25 hover:text-[#f7a37c] transition-colors"
            title="Add player to list"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-white/30 hover:text-white/70 transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Add player search */}
      {addingPlayer && (
        <div className="border-t border-white/8 px-4 pb-3 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <input
              ref={searchRef}
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder="Search players..."
              className="w-full rounded-lg border border-white/15 bg-white/5 py-1.5 pl-8 pr-3 text-sm text-white placeholder-white/25 outline-none focus:ring-[1.5px] focus:ring-[#f7a37c]/60"
            />
          </div>
          {filtered.length > 0 && (
            <div className="mt-1.5 flex flex-col rounded-lg border border-white/10 bg-[#0a1622] overflow-hidden">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onAddPlayer(list.normalizedName, String(p.id), { playerName: p.name, position: p.position });
                    setPlayerSearch('');
                    setAddingPlayer(false);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/6 transition-colors"
                >
                  <span className="text-sm font-semibold text-white">{p.name}</span>
                  <span className={`w-fit ${positionPill(p.position)}`}>{p.position}</span>
                </button>
              ))}
            </div>
          )}
          {playerSearch.trim().length >= 1 && filtered.length === 0 && (
            <p className="mt-2 text-center text-[0.7rem] text-white/30">No matching players</p>
          )}
        </div>
      )}

      {/* Preview thumbnails (collapsed) */}
      {!expanded && list.players.length > 0 && (
        <div
          className="flex cursor-pointer items-center gap-1.5 px-4 pb-4"
          onClick={() => setExpanded(true)}
        >
          {previewPlayers.map((p) => (
            <MiniAvatar key={p.playerId} playerId={p.playerId} />
          ))}
          {overflow > 0 && (
            <span className="ml-1 text-[0.65rem] font-bold text-white/35">+{overflow}</span>
          )}
        </div>
      )}

      {/* Expanded player rows */}
      {expanded && (
        <div className="flex flex-col divide-y divide-white/5 border-t border-white/8 px-2 pb-2">
          {list.players.length === 0 ? (
            <p className="px-2 py-4 text-center text-[0.75rem] text-white/30">No players in this list.</p>
          ) : (
            list.players.map((p) => (
              <div key={p.playerId} className="flex items-center gap-3 px-2 py-2.5">
                <MiniAvatar playerId={p.playerId} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-bold text-white">{p.playerName}</span>
                  <span className={`mt-0.5 w-fit ${positionPill(p.position)}`}>{p.position || '—'}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => onOpenProfile(p.playerId)}
                    className="rounded-full px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-wide text-white/40 transition-colors hover:bg-white/8 hover:text-white/80"
                  >
                    View
                  </button>
                  <button
                    onClick={() => onRemovePlayer(list.normalizedName, p.playerId)}
                    className="rounded-full p-1 text-white/25 transition-colors hover:text-red-400"
                    title="Remove from list"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NoteCard
// ---------------------------------------------------------------------------

function NoteCard({ note, onDelete, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isLong = note.note.length > 160;

  return (
    <div className="flex gap-3 rounded-[1.25rem] border border-white/10 bg-black/25 px-4 py-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
      <MiniAvatar playerId={note.playerId} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-black text-white">{note.playerName}</span>
            <span className={`mt-0.5 w-fit ${positionPill(note.position)}`}>{note.position || '—'}</span>
          </div>
          <span className="shrink-0 text-[0.6rem] text-white/25">{timeAgo(note.updatedAt)}</span>
        </div>
        <p
          className={`mt-1 text-[0.78rem] leading-relaxed text-white/65 ${!expanded && isLong ? 'line-clamp-3' : ''}`}
        >
          {note.note}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 w-fit text-[0.65rem] font-semibold text-[#f7a37c]/70 hover:text-[#f7a37c] transition-colors"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => onEdit(note.playerId)}
            className="rounded-full px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-wide text-white/40 transition-colors hover:bg-white/8 hover:text-white/80"
          >
            Edit
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[0.62rem] text-white/45">Delete note?</span>
              <button onClick={() => onDelete(note.playerId)} className="text-red-400 hover:text-red-300 transition-colors">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-white/35 hover:text-white/70 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-full px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-wide text-white/25 transition-colors hover:text-red-400"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function NotesAndListsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState('lists');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playerPool, setPlayerPool] = useState([]);

  // New list creation
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [createError, setCreateError] = useState('');
  const newListInputRef = useRef(null);

  // Modal
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [openToTab, setOpenToTab] = useState('overview');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login?callbackUrl=/my-team/notes-and-lists');
    }
  }, [status, router]);

  // Load player pool from server-side API (parses contracts CSV, deduped)
  useEffect(() => {
    fetch('/api/players/list')
      .then((r) => r.json())
      .then((players) => Array.isArray(players) ? setPlayerPool(players) : null)
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/user/notes-and-lists', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') fetchData();
  }, [status, fetchData]);

  // ---- actions ----

  async function handleDeleteNote(playerId) {
    await fetch(`/api/user/player-notes?playerId=${encodeURIComponent(playerId)}`, { method: 'DELETE' });
    setData((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.playerId !== playerId) }));
  }

  async function handleEditNote(playerId) {
    setOpenToTab('notes');
    setSelectedPlayerId(playerId);
  }

  async function handleDeleteList(normalizedName) {
    await fetch('/api/user/player-list', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ normalizedName }),
    });
    setData((prev) => ({ ...prev, lists: prev.lists.filter((l) => l.normalizedName !== normalizedName) }));
  }

  async function handleRenameList(normalizedName, newName) {
    const res = await fetch('/api/user/player-list', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ normalizedName, newName }),
    });
    if (res.ok) {
      const { name: updatedName, normalizedName: updatedKey } = await res.json();
      setData((prev) => ({
        ...prev,
        lists: prev.lists.map((l) =>
          l.normalizedName === normalizedName
            ? { ...l, name: updatedName, normalizedName: updatedKey }
            : l
        ),
      }));
    }
  }

  async function handleRemovePlayer(normalizedName, playerId) {
    await fetch('/api/user/player-list', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ normalizedName, playerId }),
    });
    setData((prev) => ({
      ...prev,
      lists: prev.lists.map((l) =>
        l.normalizedName === normalizedName
          ? { ...l, players: l.players.filter((p) => p.playerId !== playerId) }
          : l
      ),
    }));
  }

  async function handleCreateList() {
    const trimmed = newListName.trim();
    if (!trimmed) return;
    setCreateError('');
    const res = await fetch('/api/user/player-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    const json = await res.json();
    if (!res.ok) {
      setCreateError(json.error || 'Failed to create list');
      return;
    }
    setData((prev) => ({
      ...prev,
      lists: [...(prev?.lists || []), { name: json.name, normalizedName: json.normalizedName, players: [], updatedAt: new Date().toISOString() }]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    }));
    setNewListName('');
    setCreatingList(false);
  }

  async function handleAddPlayer(normalizedName, playerId, playerMeta) {
    const res = await fetch('/api/user/player-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ normalizedName, playerId, playerName: playerMeta.playerName || '', position: playerMeta.position || '' }),
    });
    if (res.ok) {
      setData((prev) => ({
        ...prev,
        lists: prev.lists.map((l) =>
          l.normalizedName === normalizedName && !l.players.find((p) => p.playerId === playerId)
            ? { ...l, players: [...l.players, { playerId, playerName: playerMeta.playerName, position: playerMeta.position }] }
            : l
        ),
      }));
    }
  }

  // Auto-focus new list input
  useEffect(() => {
    if (creatingList && newListInputRef.current) newListInputRef.current.focus();
  }, [creatingList]);

  function closeModal() {
    setSelectedPlayerId(null);
    setOpenToTab('overview');
    fetchData(); // re-fetch in case notes were edited inside the card
  }

  // ---- render ----

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/40 text-sm tracking-widest uppercase">
        Loading…
      </div>
    );
  }

  if (!session) return null;

  const tabs = [
    { id: 'lists', label: 'Lists', icon: List, count: data?.lists?.length ?? 0 },
    { id: 'notes', label: 'Notes', icon: NotebookPen, count: data?.notes?.length ?? 0 },
  ];

  return (
    <div className="min-h-screen bg-[#060e18] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-black uppercase tracking-[0.12em] text-white">
            Notes &amp; Lists
          </h1>
          <p className="mt-1 text-[0.78rem] text-white/40">
            Manage your scouting notes and custom player lists.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.18em] transition-colors ${
                  active
                    ? 'bg-[#f7a37c]/20 text-[#f7a37c]'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {t.count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[0.55rem] font-black ${active ? 'bg-[#f7a37c]/30 text-[#f7a37c]' : 'bg-white/10 text-white/40'}`}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Lists tab */}
        {activeTab === 'lists' && (
          <>
            {/* Create list row */}
            <div className="mb-5 flex items-center gap-3">
              {creatingList ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    ref={newListInputRef}
                    value={newListName}
                    onChange={(e) => { setNewListName(e.target.value); setCreateError(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateList();
                      if (e.key === 'Escape') { setCreatingList(false); setNewListName(''); setCreateError(''); }
                    }}
                    placeholder="List name..."
                    className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-bold text-white placeholder-white/25 outline-none focus:ring-[1.5px] focus:ring-[#f7a37c]/60"
                  />
                  <button onClick={handleCreateList} className="text-green-400 hover:text-green-300 transition-colors" title="Save">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => { setCreatingList(false); setNewListName(''); setCreateError(''); }} className="text-white/40 hover:text-white/70 transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                  {createError && <span className="text-[0.68rem] text-red-400">{createError}</span>}
                </div>
              ) : (
                <button
                  onClick={() => setCreatingList(true)}
                  className="flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.15em] text-white/50 transition-colors hover:border-[#f7a37c]/40 hover:text-[#f7a37c]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New List
                </button>
              )}
            </div>

            {!data?.lists?.length ? (
              <EmptyState
                icon={List}
                title="No lists yet"
                body="Create a list above, or add one from any player profile card."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.lists.map((list) => (
                  <ListCard
                    key={list.normalizedName}
                    list={list}
                    playerPool={playerPool}
                    onDeleteList={handleDeleteList}
                    onRenameList={handleRenameList}
                    onRemovePlayer={handleRemovePlayer}
                    onAddPlayer={handleAddPlayer}
                    onOpenProfile={(pid) => { setOpenToTab('overview'); setSelectedPlayerId(pid); }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Notes tab */}
        {activeTab === 'notes' && (
          <>
            {!data?.notes?.length ? (
              <EmptyState
                icon={NotebookPen}
                title="No notes yet"
                body="Add scouting notes to any player from their profile card."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {data.notes.map((note) => (
                  <NoteCard
                    key={note.playerId}
                    note={note}
                    onDelete={handleDeleteNote}
                    onEdit={handleEditNote}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Player profile modal */}
      {selectedPlayerId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={closeModal}
        >
          <div
            className="bg-transparent p-0 rounded-lg shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <PlayerProfileCard
              playerId={selectedPlayerId}
              expanded={true}
              onExpandClick={closeModal}
              defaultTab={openToTab}
            />
          </div>
        </div>
      )}
    </div>
  );
}
