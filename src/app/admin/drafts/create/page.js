'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

// Helper to get YYYY-MM-DDTHH:mm for July 1st, 8am this year
function getDefaultStartDate() {
  const now = new Date();
  const year = now.getFullYear();
  const dt = new Date(year, 6, 1, 8, 0, 0, 0); // July is month 6 (0-based)
  const pad = n => n.toString().padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function getDefaultEndDate() {
  const start = new Date(getDefaultStartDate());
  const end = new Date(start.getTime() + 43920 * 60000);
  const pad = n => n.toString().padStart(2, '0');
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

function getDefaultTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
}

function formatLocalDateTimeInZone(value, timeZone) {
  if (!value) return '';
  const zonedDate = fromZonedTime(value, timeZone);
  if (Number.isNaN(zonedDate.getTime())) return '';
  return formatInTimeZone(zonedDate, timeZone, 'MMM d, yyyy h:mm a zzz');
}

const TIME_ZONE_OPTIONS = [
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Los_Angeles',
  'UTC'
];

function parseRfaValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized || normalized === '0' || normalized === 'no' || normalized === 'n' || normalized === 'false' || normalized.includes('ufa')) {
    return false;
  }
  return ['true', 'yes', 'y', '1', 'rfa', 'restricted'].includes(normalized) || normalized.includes('rfa');
}

export default function CreateDraftPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [ktcMap, setKtcMap] = useState({});
  const [contractPlayerMap, setContractPlayerMap] = useState({});
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [timeZone, setTimeZone] = useState(getDefaultTimeZone());
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'playerName', direction: 'asc' });
  const [blind, setBlind] = useState(false);
  const [playerStartDelays, setPlayerStartDelays] = useState({});
  const [idImportMode, setIdImportMode] = useState('select'); // 'select' | 'deselect'
  const [idImportStats, setIdImportStats] = useState(null); // { total, matched, unmatched }
  const [showContractedPlayers, setShowContractedPlayers] = useState(false);
  const [playerNameSearch, setPlayerNameSearch] = useState('');
  const [rfaFilter, setRfaFilter] = useState('all');
  const [contractFinalYearFilter, setContractFinalYearFilter] = useState('all');

  useEffect(() => {
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(setUsers);
  }, []);

  useEffect(() => {
    Papa.parse('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/Players.csv', {
      download: true,
      header: true,
      complete: (results) => {
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

  useEffect(() => {
    Papa.parse('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv', {
      download: true,
      header: true,
      complete: (results) => {
        const contractMap = {};
        results.data.forEach(row => {
          const playerId = String(row['Player ID'] || '').trim();
          const status = String(row['Status'] || '').trim().toLowerCase();

          if (!playerId) return;

          const existing = contractMap[playerId] || { isContracted: false, rfaEligible: false };
          contractMap[playerId] = {
            isContracted: existing.isContracted || status === 'active',
            rfaEligible: existing.rfaEligible || parseRfaValue(row['Will Be RFA?'] ?? row['RFA?'] ?? row.RFA),
            contractFinalYear:
              status === 'active'
                ? String(row['Contract Final Year'] || '').trim()
                : existing.contractFinalYear || String(row['Contract Final Year'] || '').trim()
          };
        });
        setContractPlayerMap(contractMap);
      }
    });
  }, []);

  useEffect(() => {
    fetch('/api/players/all')
      .then(res => res.json())
      .then(data => {
        const allowedPositions = ['QB', 'WR', 'RB', 'TE'];
        const seen = new Set();
        const mergedPlayers = data
          .filter(p => allowedPositions.includes(p.position))
          .map(p => {
            const contractInfo = contractPlayerMap[String(p.playerId)] || {};
            return {
              ...p,
              ktc: ktcMap[p.playerId] || '',
              isContracted: Boolean(contractInfo.isContracted),
              rfaEligible: Boolean(contractInfo.rfaEligible),
              contractFinalYear: contractInfo.contractFinalYear || ''
            };
          })
          .filter(p => Number(p.ktc) > 0)
          .filter(p => {
            if (seen.has(p.playerId)) return false;
            seen.add(p.playerId);
            return true;
          });
        setPlayers(mergedPlayers);
      });
  }, [ktcMap, contractPlayerMap]);

  const normalizedSearch = playerNameSearch.trim().toLowerCase();
  const filteredPlayers = players.filter((player) => {
    const matchesContracted = showContractedPlayers || !player.isContracted;
    const matchesName = !normalizedSearch || player.playerName?.toLowerCase().includes(normalizedSearch);
    const matchesRfa =
      rfaFilter === 'all' ||
      (rfaFilter === 'true' && player.rfaEligible) ||
      (rfaFilter === 'false' && !player.rfaEligible);
    const matchesContractFinalYear =
      contractFinalYearFilter === 'all' ||
      (contractFinalYearFilter === 'none' && !player.contractFinalYear) ||
      String(player.contractFinalYear || '') === contractFinalYearFilter;

    return matchesContracted && matchesName && matchesRfa && matchesContractFinalYear;
  });

  const contractFinalYearOptions = Array.from(
    new Set(
      players
        .map(player => String(player.contractFinalYear || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => Number(a) - Number(b));
  const timeZoneOptions = Array.from(new Set([timeZone, ...TIME_ZONE_OPTIONS]));

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    const { key, direction } = sortConfig;
    let aValue = a[key];
    let bValue = b[key];

    if (key === 'ktc') {
      aValue = aValue === '' ? -Infinity : Number(aValue);
      bValue = bValue === '' ? -Infinity : Number(bValue);
    }

    if (key === 'isContracted' || key === 'rfaEligible') {
      aValue = Number(Boolean(aValue));
      bValue = Number(Boolean(bValue));
    }

    if (key === 'contractFinalYear') {
      aValue = aValue === '' ? -Infinity : Number(aValue);
      bValue = bValue === '' ? -Infinity : Number(bValue);
    }

    if (typeof aValue === 'string') aValue = aValue.toLowerCase();
    if (typeof bValue === 'string') bValue = bValue.toLowerCase();

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

  const handleIdFileImport = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const rawTokens = text
        .split(/[^A-Za-z0-9_-]+/)
        .map(t => t.trim())
        .filter(Boolean);
      const importedIds = Array.from(new Set(rawTokens.map(String)));

      const playerIdSet = new Set(players.map(p => String(p.playerId)));
      const matchedIds = importedIds.filter(id => playerIdSet.has(String(id)));
      const unmatchedCount = importedIds.length - matchedIds.length;

      setSelectedPlayers(prev => {
        const prevSet = new Set(prev.map(String));
        if (idImportMode === 'select') {
          matchedIds.forEach(id => prevSet.add(String(id)));
        } else {
          matchedIds.forEach(id => prevSet.delete(String(id)));
        }
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

    const draftId = Date.now();
    try {
      const startAt = fromZonedTime(startDate, timeZone);
      const endAt = fromZonedTime(endDate, timeZone);
      const nomDuration = Math.round((endAt.getTime() - startAt.getTime()) / 60000);

      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        throw new Error('Please provide valid start and end date/time values.');
      }

      if (nomDuration <= 0) {
        throw new Error('End date/time must be after the start date/time.');
      }

      const selectedPlayerObjs = players
        .filter(p => selectedPlayers.includes(p.playerId))
        .map(p => ({
          ...p,
          status: 'UPCOMING',
          startDelay: Number(
            playerStartDelays[p.playerId] !== undefined
              ? playerStartDelays[p.playerId]
              : 0
          )
        }));
      const selectedUserObjs = users
        .filter(u => selectedUsers.includes(u.id))
        .map(u => ({
          username: u.username
        }));
      const res = await fetch('/api/admin/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId,
          startDate: startAt.toISOString(),
          endDate: endAt.toISOString(),
          timeZone,
          state: 'ACTIVE',
          nomDuration,
          users: selectedUserObjs,
          players: selectedPlayerObjs,
          results: [],
          bidLog: [],
          blind
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
          <div className="grid gap-4 md:grid-cols-3">
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
              <label className="block mb-1">End Date/Time</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full p-2 rounded bg-white/5 border border-white/10 text-white"
                required
              />
            </div>
            <div>
              <label className="block mb-1">Time Zone</label>
              <select
                value={timeZone}
                onChange={e => setTimeZone(e.target.value)}
                className="w-full p-2 rounded bg-[#0A2233] border border-white/10 text-white"
              >
                {timeZoneOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="text-sm text-white/80">
            <div><b>Start Preview:</b> {formatLocalDateTimeInZone(startDate, timeZone) || '-'}</div>
            <div><b>End Preview:</b> {formatLocalDateTimeInZone(endDate, timeZone) || '-'}</div>
            <div>
              <b>Duration:</b>{' '}
              {(() => {
                const startAt = fromZonedTime(startDate, timeZone);
                const endAt = fromZonedTime(endDate, timeZone);
                if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) return '-';
                const totalMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
                const days = Math.floor(totalMinutes / (60 * 24));
                const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
                const minutes = totalMinutes % 60;
                return `${days}d ${hours}h ${minutes}m`;
              })()}
            </div>
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
                    <tr key={u.id} className="hover:bg-black/20" >
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

            <div className="mb-3 grid gap-3 rounded border border-white/10 bg-white/5 p-3 md:grid-cols-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showContractedPlayers}
                  onChange={(e) => setShowContractedPlayers(e.target.checked)}
                />
                <span>Show currently contracted players</span>
              </label>
              <div>
                <label className="mb-1 block text-sm text-white/80">Search Name</label>
                <input
                  type="text"
                  value={playerNameSearch}
                  onChange={(e) => setPlayerNameSearch(e.target.value)}
                  placeholder="Search by player name"
                  className="w-full rounded border border-white/10 bg-white/10 p-2 text-white placeholder:text-white/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-white/80">RFA Filter</label>
                <select
                  value={rfaFilter}
                  onChange={(e) => setRfaFilter(e.target.value)}
                  className="w-full rounded border border-white/10 bg-[#0A2233] p-2 text-white"
                >
                  <option value="all">All</option>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-white/80">Contract Final Year</label>
                <select
                  value={contractFinalYearFilter}
                  onChange={(e) => setContractFinalYearFilter(e.target.value)}
                  className="w-full rounded border border-white/10 bg-[#0A2233] p-2 text-white"
                >
                  <option value="all">All</option>
                  <option value="none">None / Blank</option>
                  {contractFinalYearOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>

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
            <div className="mb-2 text-xs text-white/60">
              Showing {sortedPlayers.length} of {players.length} players
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
                    <th className="cursor-pointer text-center" onClick={() => handleSort('isContracted')}>
                      Contracted {sortConfig.key === 'isContracted' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className="cursor-pointer text-center" onClick={() => handleSort('rfaEligible')}>
                      RFA {sortConfig.key === 'rfaEligible' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className="cursor-pointer text-center" onClick={() => handleSort('contractFinalYear')}>
                      Final Year {sortConfig.key === 'contractFinalYear' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
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
                      <td className="text-center">{p.isContracted ? 'True' : 'False'}</td>
                      <td className="text-center">{p.rfaEligible ? 'True' : 'False'}</td>
                      <td className="text-center">{p.contractFinalYear || '-'}</td>
                      <td>{p.ktc !== '' ? Number(p.ktc).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}</td>
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