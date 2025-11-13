'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';

// Helper to get YYYY-MM-DDTHH:mm for July 1st, 8am this year
function getDefaultStartDate() {
  const now = new Date();
  const year = now.getFullYear();
  const dt = new Date(year, 6, 1, 8, 0, 0, 0); // July is month 6 (0-based)
  // Pad to 'YYYY-MM-DDTHH:mm'
  const pad = n => n.toString().padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export default function CreateDraftPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [ktcMap, setKtcMap] = useState({});
  const [activeContractIds, setActiveContractIds] = useState(new Set());
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'playerName', direction: 'asc' });
  const [nomDuration, setNomDuration] = useState(43920); // Default to 43,920 minutes (30.5 days)
  const [blind, setBlind] = useState(false); // <-- Add this line

  // Add state for player start times
  const [playerStartTimes, setPlayerStartTimes] = useState({});

  // Add state for player start delays (default 1000)
  const [playerStartDelays, setPlayerStartDelays] = useState({});

  // Import Player IDs state
  const [idImportMode, setIdImportMode] = useState('select'); // 'select' | 'deselect'
  const [idImportStats, setIdImportStats] = useState(null); // { total, matched, unmatched }

  // Fetch users
  useEffect(() => {
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(setUsers);
  }, []);

  // Fetch and parse KTC CSV
  useEffect(() => {
    Papa.parse('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/Players.csv', {
      download: true,
      header: true,
      complete: (results) => {
        // Build a map: PlayerID -> KTC Value
        const map = {};
        results.data.forEach(row => {
          if (row.PlayerID && row['KTC Value']) {
            map[row.PlayerID] = row['KTC Value'];
          }
        });
        setKtcMap(map);
      }
    });
  }, []);

  // Fetch and parse BBB_Contracts CSV to get active contract Player IDs
  useEffect(() => {
    Papa.parse('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv', {
      download: true,
      header: true,
      complete: (results) => {
        const activeIds = new Set();
        results.data.forEach(row => {
          if (row['Player ID'] && row['Status'] && row['Status'].toLowerCase() === 'active') {
            activeIds.add(row['Player ID']);
          }
        });
        setActiveContractIds(activeIds);
      }
    });
  }, []);

  // Fetch players from Sleeper API and merge KTC, filter by KTC > 0, not under contract, and remove duplicates
  useEffect(() => {
    fetch('/api/players/all')
      .then(res => res.json())
      .then(data => {
        const allowedPositions = ["QB", "WR", "RB", "TE"];
        // Filter, map, and remove duplicates by playerId
        const seen = new Set();
        const filtered = data
          .filter(p => allowedPositions.includes(p.position))
          .map(p => ({
            ...p,
            ktc: ktcMap[p.playerId] || ''
          }))
          .filter(p =>
            Number(p.ktc) > 0 &&
            !activeContractIds.has(String(p.playerId))
          )
          .filter(p => {
            if (seen.has(p.playerId)) return false;
            seen.add(p.playerId);
            return true;
          });
        setPlayers(filtered);
      });
  }, [ktcMap, activeContractIds]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedPlayers = [...players].sort((a, b) => {
    const { key, direction } = sortConfig;
    let aValue = a[key];
    let bValue = b[key];

    // If sorting by KTC, compare as numbers
    if (key === 'ktc') {
      aValue = aValue === "" ? -Infinity : Number(aValue);
      bValue = bValue === "" ? -Infinity : Number(bValue);
    }

    if (aValue < bValue) return direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const togglePlayer = (playerId) => {
    setSelectedPlayers((prev) =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  // Parse an uploaded text/CSV file of IDs and apply select/deselect
  const handleIdFileImport = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      // Split on any non-alphanumeric/underscore/hyphen characters to get tokens
      const rawTokens = text
        .split(/[^A-Za-z0-9_-]+/)
        .map(t => t.trim())
        .filter(Boolean);
      // Normalize to strings for comparison
      const importedIds = Array.from(new Set(rawTokens.map(String)));

      // Build a quick lookup for existing player IDs
      const playerIdSet = new Set(players.map(p => String(p.playerId)));
      const matchedIds = importedIds.filter(id => playerIdSet.has(String(id)));
      const unmatchedCount = importedIds.length - matchedIds.length;

      setSelectedPlayers(prev => {
        const prevSet = new Set(prev.map(String));
        if (idImportMode === 'select') {
          // Union: add matched IDs
          matchedIds.forEach(id => prevSet.add(String(id)));
        } else {
          // Deselect: remove matched IDs
          matchedIds.forEach(id => prevSet.delete(String(id)));
        }
        // Convert back to original ID shape if possible (keep as string)
        return Array.from(prevSet);
      });

      setIdImportStats({ total: importedIds.length, matched: matchedIds.length, unmatched: unmatchedCount });
    } catch (e) {
      setError(`Failed to import IDs: ${e.message}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    // No nomOrder validation needed

    const draftId = Date.now();
    try {
      const selectedPlayerObjs = players
        .filter(p => selectedPlayers.includes(p.playerId))
        .map(p => ({
          ...p,
          status: 'UPCOMING',
          startDelay: Number(
            playerStartDelays[p.playerId] !== undefined
              ? playerStartDelays[p.playerId]
              : 0 // Default to 0 if not set
          )
        }));
      const selectedUserObjs = users
        .filter(u => selectedUsers.includes(u.id))
        .map(u => ({
          username: u.username
          // nomOrder removed
        }));
      const res = await fetch('/api/admin/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId,
          startDate,
          state: 'ACTIVE',
          nomDuration,
          users: selectedUserObjs,
          players: selectedPlayerObjs,
          results: [],
          bidLog: [],
          blind // <-- Add this line
        })
      });
      if (!res.ok) throw new Error(await res.text());
      setSuccess('Draft created!');
      setTimeout(() => router.push('/admin/drafts'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#001A2B] text-white p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Create New Draft</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block mb-1">Start Date/Time</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full p-2 rounded bg-white/5 border border-white/10 text-white"
              required
            />
          </div>
          <div>
            <label className="block mb-1">Select Users</label>
            <button
              type="button"
              className="mb-2 px-3 py-1 bg-blue-600 rounded text-white hover:bg-blue-700 transition-colors"
              onClick={() => setSelectedUsers(users.map(u => u.id))}
            >
              Select All
            </button>
            <div className="overflow-x-auto max-h-60 border border-white/10 rounded bg-white/5 mb-4">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th></th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-black/20">
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(u.id)}
                          onChange={() => {
                            setSelectedUsers(prev =>
                              prev.includes(u.id)
                                ? prev.filter(id => id !== u.id)
                                : [...prev, u.id]
                            );
                          }}
                        />
                      </td>
                      <td>{u.username}</td>
                      <td>{u.email}</td>
                      <td>{u.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <label className="block mb-1">Select Players</label>
            <button
              type="button"
              className="mb-2 px-3 py-1 bg-blue-600 rounded text-white hover:bg-blue-700 transition-colors"
              onClick={() => setSelectedPlayers(sortedPlayers.map(p => p.playerId))}
            >
              Select All
            </button>
            <button
              type="button"
              className="ml-2 mb-2 px-3 py-1 bg-slate-600 rounded text-white hover:bg-slate-700 transition-colors"
              onClick={() => setSelectedPlayers([])}
            >
              Deselect All
            </button>

            {/* Import Player IDs */}
            <div className="mb-3 p-3 bg-white/5 border border-white/10 rounded">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm">Import Player IDs:</span>
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      name="idImportMode"
                      value="select"
                      checked={idImportMode === 'select'}
                      onChange={() => setIdImportMode('select')}
                    />
                    Select
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      name="idImportMode"
                      value="deselect"
                      checked={idImportMode === 'deselect'}
                      onChange={() => setIdImportMode('deselect')}
                    />
                    Deselect
                  </label>
                </div>
                <input
                  type="file"
                  accept=".txt,.csv,.tsv,.log,.list"
                  className="text-sm"
                  onChange={(e) => handleIdFileImport(e.target.files?.[0])}
                />
              </div>
              {idImportStats && (
                <div className="mt-2 text-xs text-white/80">
                  Processed {idImportStats.total} IDs • Matched {idImportStats.matched} • Unmatched {idImportStats.unmatched}
                </div>
              )}
            </div>
            <div className="overflow-x-auto max-h-96 border border-white/10 rounded bg-white/5">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th></th>
                    <th className="cursor-pointer" onClick={() => handleSort('playerId')}>
                      PlayerID {sortConfig.key === 'playerId' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className="cursor-pointer" onClick={() => handleSort('playerName')}>
                      Player {sortConfig.key === 'playerName' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className="cursor-pointer" onClick={() => handleSort('position')}>
                      Position {sortConfig.key === 'position' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className="cursor-pointer" onClick={() => handleSort('ktc')}>
                      KTC Score {sortConfig.key === 'ktc' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th>Start Delay (Hours) <span className="text-red-400">*</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((p) => (
                    <tr key={p.playerId} className="hover:bg-black/20">
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedPlayers.includes(p.playerId)}
                          onChange={() => togglePlayer(p.playerId)}
                        />
                      </td>
                      <td>{p.playerId}</td>
                      <td>{p.playerName}</td>
                      <td>{p.position}</td>
                      <td>{p.ktc !== "" ? Number(p.ktc).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "-"}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          className="w-24 p-1 rounded bg-white/10 border border-white/10 text-white"
                          value={playerStartDelays[p.playerId] ?? 0}
                          onChange={e =>
                            setPlayerStartDelays(prev => ({
                              ...prev,
                              [p.playerId]: e.target.value
                            }))
                          }
                          disabled={!selectedPlayers.includes(p.playerId)}
                          required={selectedPlayers.includes(p.playerId)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <label className="block mb-1">Nomination Duration (minutes)</label>
            <input
              type="number"
              min={1}
              className="w-full p-2 rounded bg-white/5 border border-white/10 text-white"
              value={nomDuration}
              onChange={e => setNomDuration(Number(e.target.value))}
              required
            />
            {/* Show calculated end time */}
            <div className="mt-2 text-sm text-white/80">
              {(() => {
                if (!startDate || !nomDuration) return null;
                const start = new Date(startDate);
                if (isNaN(start.getTime())) return null;
                const end = new Date(start.getTime() + nomDuration * 60000);
                return (
                  <>
                    <span>
                      <b>Draft End Preview:</b>{' '}
                      {end.toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
          {/* Blind toggle */}
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={blind}
                onChange={e => setBlind(e.target.checked)}
                className="form-checkbox"
              />
              <span>If enabled, all bids and bidders will be hidden.</span>
            </label>
          </div>
          <button
            type="submit"
            className="w-full p-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Draft'}
          </button>
          {error && <div className="text-red-400">{error}</div>}
          {success && <div className="text-green-400">{success}</div>}
        </form>
      </div>
    </main>
  );
}