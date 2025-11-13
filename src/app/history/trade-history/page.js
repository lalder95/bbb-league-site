'use client';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import PlayerProfileCard from '@/app/my-team/components/PlayerProfileCard';

// Trade History Page
// Fetches per-season trade data via our API route and allows filtering by season and teams involved.
// Players are rendered with existing PlayerProfileCard (lightweight mode) to show contract + basic stats.

const START_SEASON = 2024; // first BBB season baseline

export default function TradeHistoryPage() {
  const { data: session } = useSession();
  const isAdmin = Boolean(
    session?.user?.isAdmin ||
    session?.user?.role === 'admin' ||
    (process.env.NEXT_PUBLIC_ADMIN_EMAIL && session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)
  );
  const [season, setSeason] = useState(null);
  const [currentSeason, setCurrentSeason] = useState(null);
  const [loadingSeasonMeta, setLoadingSeasonMeta] = useState(true);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [error, setError] = useState(null);
  const [trades, setTrades] = useState([]);
  const [teamFilter, setTeamFilter] = useState([]); // array of owner_ids selected
  const [playersMap, setPlayersMap] = useState(null); // sleeperId -> { playerId, playerName, position, team }
  const loadingPlayersRef = useRef(false);
  const [contractsMap, setContractsMap] = useState(null); // sleeperId -> { salary, ktcValue }
  const loadingContractsRef = useRef(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [openDebug, setOpenDebug] = useState(new Set());
  const [openPickDebug, setOpenPickDebug] = useState(new Set());
  const [showSent, setShowSent] = useState(false); // toggle visibility of Sent side (default off)

  // Helpers for pick label formatting
  const ordinal = (n) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
  };
  const pad2 = (n) => (n === 0 || n ? String(n).padStart(2, '0') : null);
  const draftedPickLabel = (pk) => {
    const slot = pk?.match_debug?.computed_slot;
    const rd = Number(pk.round);
    const core = slot || slot === 0 ? `${pk.season} ${rd}.${pad2(Number(slot))}` : `${pk.season} ${rd}`;
    return `${core} from ${pk.slot_owner_name || pk.previous_owner_name}`;
  };
  // Compact label for pick header above card (keeps one-line, no team)
  const draftedPickLabelShort = (pk) => {
    const slot = pk?.match_debug?.computed_slot;
    const rd = Number(pk.round);
    return slot || slot === 0 ? `${pk.season} ${rd}.${pad2(Number(slot))}` : `${pk.season} ${rd}`;
  };
  const undraftedPickLabel = (pk) => {
    const rd = Number(pk.round);
    return `${pk.season} ${ordinal(rd)} from ${pk.slot_owner_name || pk.previous_owner_name}`;
  };

  // Load current NFL season for season dropdown
  useEffect(() => {
    async function loadState() {
      try {
        setLoadingSeasonMeta(true);
        const res = await fetch('https://api.sleeper.app/v1/state/nfl');
        const json = await res.json();
        setCurrentSeason(parseInt(json.season));
        setSeason(parseInt(json.season));
      } catch (e) {
        setError('Failed to load NFL state');
      } finally {
        setLoadingSeasonMeta(false);
      }
    }
    loadState();
  }, []);

  // Fetch trades when season changes
  useEffect(() => {
    if (!season) return;
    async function loadTrades() {
      try {
        setLoadingTrades(true);
        setError(null);
        const res = await fetch(`/api/history/trades?season=${season}`);
        if (!res.ok) throw new Error('Failed to fetch trades');
        const json = await res.json();
        setTrades(json.trades || []);
      } catch (e) {
        setError(e.message);
        setTrades([]);
      } finally {
        setLoadingTrades(false);
      }
    }
    loadTrades();
  }, [season]);

  // Lazy-load Sleeper players (trimmed) once per page to build a lookup map for PlayerProfileCard fallbacks
  useEffect(() => {
    if (playersMap || loadingPlayersRef.current) return;
    loadingPlayersRef.current = true;
    (async () => {
      try {
        const res = await fetch('/api/players/all');
        if (res.ok) {
          const arr = await res.json();
          const map = new Map();
          arr.forEach(p => map.set(String(p.playerId), p));
          setPlayersMap(map);
        }
      } catch {}
      finally { loadingPlayersRef.current = false; }
    })();
  }, [playersMap]);

  // Load BBB_Contracts.csv once and build a map of player_id -> { salary, ktcValue }
  useEffect(() => {
    if (contractsMap || loadingContractsRef.current) return;
    loadingContractsRef.current = true;
    (async () => {
      try {
        const resp = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
        const text = await resp.text();
        const rows = text.split('\n').filter(Boolean);
        if (rows.length < 2) { setContractsMap(new Map()); return; }
        const header = rows[0].split(',').map(h => h.trim());
        const idx = (name, def = -1) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
        const idIdx = idx('Player ID');
        const relY1Idx = idx('Relative Year 1 Salary');
        const ktcIdx = idx('Current KTC Value');
        const statusIdx = idx('Status');
        const deadY1Idx = idx('Relative Year 1 Dead');
        const map = new Map();
        for (let i = 1; i < rows.length; i++) {
          const values = rows[i].split(',');
          if (values.length < header.length) continue;
          const pid = String(values[idIdx] ?? '').trim();
          if (!pid) continue;
          const status = (values[statusIdx] ?? '').trim();
          const salaryVal = status === 'Active' || status === 'Future' ? parseFloat(values[relY1Idx] || '0') : parseFloat(values[deadY1Idx] || '0');
          const ktcVal = values[ktcIdx] ? parseInt(values[ktcIdx], 10) : null;
          map.set(pid, { salary: isFinite(salaryVal) ? salaryVal : 0, ktcValue: isFinite(ktcVal) ? ktcVal : null });
        }
        setContractsMap(map);
      } catch {
        setContractsMap(new Map());
      } finally {
        loadingContractsRef.current = false;
      }
    })();
  }, [contractsMap]);

  const formatMoney = (num) => {
    const n = Number(num);
    if (!isFinite(n) || n <= 0) return '-';
    return `$${n.toFixed(1)}`;
  };
  const formatInt = (num) => {
    const n = Number(num);
    if (!isFinite(n) || n <= 0) return '-';
    return Math.round(n).toLocaleString();
  };

  // Inline totals bar component for symmetry across sides
  const TotalsBar = ({ side, players, draftedPicks, contractsMap }) => {
    const getSalary = (id) => Number(contractsMap?.get(String(id))?.salary) || 0;
    const getKtc = (id) => Number(contractsMap?.get(String(id))?.ktcValue) || 0;
    const salaryFromPlayers = (players || []).reduce((sum, p) => sum + getSalary(p.player_id), 0);
    const salaryFromDrafted = (draftedPicks || []).reduce((sum, pk) => sum + getSalary(pk?.drafted_player?.player_id), 0);
    const ktcFromPlayers = (players || []).reduce((sum, p) => sum + getKtc(p.player_id), 0);
    const ktcFromDrafted = (draftedPicks || []).reduce((sum, pk) => sum + getKtc(pk?.drafted_player?.player_id), 0);
    const salaryTotal = salaryFromPlayers + salaryFromDrafted;
    const ktcTotal = ktcFromPlayers + ktcFromDrafted;
    return (
      <div className="text-[11px] text-white/70 mb-2">
        <span className="text-white/60">Totals:</span> Salary {formatMoney(salaryTotal)}
        <span className="mx-2 text-white/30">•</span>
        KTC {formatInt(ktcTotal)}
      </div>
    );
  };

  // Derive unique teams (owners) from trades
  const uniqueTeams = useMemo(() => {
    const map = new Map();
    trades.forEach(t => {
      t.teams.forEach(tm => {
        if (tm.owner_id) {
          if (!map.has(tm.owner_id)) map.set(tm.owner_id, tm.owner_name);
        }
      });
    });
    return Array.from(map.entries()).map(([owner_id, owner_name]) => ({ owner_id, owner_name }));
  }, [trades]);

  // Filtered trades by teamFilter
  const filteredTrades = useMemo(() => {
    if (!teamFilter.length) return trades;
    return trades.filter(t => {
      const ownersInTrade = t.teams.map(tm => tm.owner_id).filter(Boolean);
      // Include if all selected teamFilter owners appear in this trade
      return teamFilter.every(sel => ownersInTrade.includes(sel));
    });
  }, [trades, teamFilter]);

  function toggleTeam(ownerId) {
    setTeamFilter(prev => prev.includes(ownerId) ? prev.filter(id => id !== ownerId) : [...prev, ownerId]);
  }

  function clearFilters() {
    setTeamFilter([]);
  }

  // Group player moves per trade side by roster_id destination
  function playersByRoster(trade) {
    const grouped = {};
    trade.players.forEach(p => {
      const key = p.to_roster_id || p.from_roster_id || 'unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    });
    return grouped;
  }

  const seasonOptions = useMemo(() => {
    if (!currentSeason) return [];
    const opts = [];
    for (let yr = currentSeason; yr >= START_SEASON; yr--) opts.push(yr);
    return opts;
  }, [currentSeason]);

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className="p-6 bg-black/30 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          <h1 className="text-3xl font-bold text-[#FF4B1F]">Trade History</h1>
        </div>
      </div>
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6 flex flex-col md:flex-row gap-4 md:items-end">
          <div>
            <label className="block text-sm mb-1">Season</label>
            {loadingSeasonMeta ? (
              <div className="text-white/60 text-sm">Loading seasons...</div>
            ) : (
              <select
                value={season || ''}
                onChange={e => setSeason(parseInt(e.target.value))}
                className="bg-black/40 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4B1F]/40"
              >
                {seasonOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}
            <div className="mt-3 flex items-center gap-2">
              <label className="flex items-center text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showSent}
                  onChange={e => setShowSent(e.target.checked)}
                  className="accent-[#FF4B1F] mr-2" aria-label="Toggle Sent Assets"
                />
                <span className="text-white/70">Show Sent Side</span>
              </label>
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-sm mb-1">Filter Teams (click to toggle)</label>
            <div className="flex flex-wrap gap-2">
              {uniqueTeams.map(t => {
                const active = teamFilter.includes(t.owner_id);
                return (
                  <button
                    key={t.owner_id}
                    onClick={() => toggleTeam(t.owner_id)}
                    className={`px-3 py-1 rounded-full text-xs border transition-all ${active ? 'bg-[#FF4B1F] border-[#FF4B1F] text-white' : 'bg-black/40 border-white/20 text-white/70 hover:border-white/50'}`}
                  >
                    {t.owner_name}
                  </button>
                );
              })}
              {teamFilter.length > 0 && (
                <button onClick={clearFilters} className="px-3 py-1 rounded-full text-xs bg-black/50 border border-white/30 text-white/70 hover:text-white">Clear</button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-700 text-sm rounded">{error}</div>
        )}

        {loadingTrades ? (
          <div className="flex items-center gap-3 text-white/70">
            <div className="animate-spin h-8 w-8 border-4 border-[#FF4B1F] border-t-transparent rounded-full" />
            <span>Loading trades for {season}...</span>
          </div>
        ) : filteredTrades.length === 0 ? (
          <div className="text-white/60">No trades found for this season{teamFilter.length ? ' (with current filters)' : ''}.</div>
        ) : (
          <div className="space-y-6">
            {filteredTrades.map(trade => {
              const grouped = playersByRoster(trade);
              return (
                <div key={trade.trade_id} className="bg-black/30 border border-white/10 rounded-lg p-4 hover:border-[#FF4B1F]/50 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                    <div className="text-sm text-white/70">
                      <span className="font-semibold text-white">Season {trade.season}</span> • Week {trade.week} • Transaction #{trade.trade_id}
                    </div>
                    {isAdmin && (
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-white/50">Status: {trade.status || 'unknown'}</div>
                      <button
                        type="button"
                        onClick={() => setOpenDebug(prev => {
                          const next = new Set(prev);
                          if (next.has(trade.trade_id)) next.delete(trade.trade_id); else next.add(trade.trade_id);
                          return next;
                        })}
                        className={`px-2 py-1 rounded text-xs border transition-colors ${openDebug.has(trade.trade_id) ? 'bg-[#FF4B1F] border-[#FF4B1F] text-white' : 'bg-black/40 border-white/20 text-white/70 hover:border-white/50'}`}
                      >{openDebug.has(trade.trade_id) ? 'Hide Debug' : 'Debug'}</button>
                      <button
                        type="button"
                        onClick={() => setOpenPickDebug(prev => {
                          const next = new Set(prev);
                          if (next.has(trade.trade_id)) next.delete(trade.trade_id); else next.add(trade.trade_id);
                          return next;
                        })}
                        className={`px-2 py-1 rounded text-xs border transition-colors ${openPickDebug.has(trade.trade_id) ? 'bg-green-600 border-green-600 text-white' : 'bg-black/40 border-white/20 text-white/70 hover:border-white/50'}`}
                      >{openPickDebug.has(trade.trade_id) ? 'Hide Pick Match' : 'Pick Match Debug'}</button>
                    </div>
                    )}
                  </div>
                  {openDebug.has(trade.trade_id) && (
                    <pre className="text-[11px] leading-relaxed max-h-64 overflow-auto bg-black/50 border border-white/10 rounded p-3 mb-4 whitespace-pre-wrap break-all">
{formatRaw(trade.raw)}
                    </pre>
                  )}
                  {openPickDebug.has(trade.trade_id) && (
                    <div className="mb-4 bg-black/40 border border-white/10 rounded p-3">
                      <div className="text-xs text-white/70 mb-2">Pick match details</div>
                      <div className="space-y-1">
                        {trade.picks.length === 0 ? (
                          <div className="text-[11px] text-white/50">No picks in this trade.</div>
                        ) : (
                          trade.picks.map((pk, i) => (
                            <pre key={i} className="text-[11px] leading-relaxed overflow-auto bg-black/30 border border-white/10 rounded p-2 whitespace-pre-wrap break-all">
{formatRaw(pk.match_debug)}
                            </pre>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                  {/* Teams involved */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {trade.teams.map(tm => (
                      <div key={`${trade.trade_id}-${tm.roster_id}`} className="px-2 py-1 rounded bg-white/5 text-xs border border-white/10">
                        {tm.owner_name}
                      </div>
                    ))}
                  </div>
                  {/* Player movement */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {trade.teams.map(teamObj => {
                      const rosterId = Number(teamObj.roster_id);
                      const ownerId = teamObj.owner_id;
                      const inboundPlayers = trade.players.filter(p => p.to_roster_id === rosterId);
                      const outboundPlayers = trade.players.filter(p => p.from_roster_id === rosterId);
                      // For picks, use normalized to/from roster ids; fall back to legacy fields if needed
                      const inboundPicks = trade.picks.filter(pk => Number(pk.to_roster_id ?? pk.roster_id) === Number(rosterId));
                      const outboundPicks = trade.picks.filter(pk => Number(pk.from_roster_id ?? pk.previous_owner_id) === Number(rosterId));
                      const inboundDraftedPicks = inboundPicks.filter(pk => pk.drafted_player && pk.drafted_player.player_id);
                      const inboundRawPicks = inboundPicks.filter(pk => !(pk.drafted_player && pk.drafted_player.player_id));
                      const outboundDraftedPicks = outboundPicks.filter(pk => pk.drafted_player && pk.drafted_player.player_id);
                      const outboundRawPicks = outboundPicks.filter(pk => !(pk.drafted_player && pk.drafted_player.player_id));
                      const recvCount = inboundPlayers.length + inboundPicks.length;
                      const sentCount = outboundPlayers.length + outboundPicks.length;
                      return (
                        <div key={rosterId} className="bg-black/20 rounded p-3 border border-white/10">
                          <div className="text-sm font-semibold mb-3 flex items-center justify-between">
                            <span>{teamObj.owner_name}</span>
                            <span className="text-xs text-white/40">Received {recvCount} / Sent {sentCount}</span>
                          </div>
                          {/* Layout: Received always shown; Sent optional. When Sent hidden, single-column without divider. */}
                          <div className={showSent ? 'flex flex-col sm:flex-row gap-6 sm:gap-0' : 'flex flex-col'}>
                            <div>
                              <div className="text-xs uppercase tracking-wide text-green-400 mb-1">Received</div>
                              {/* Totals for received side */}
                              <TotalsBar side="in" players={inboundPlayers} draftedPicks={inboundDraftedPicks} contractsMap={contractsMap} />
                              {inboundPlayers.length === 0 && inboundPicks.length === 0 && <div className="text-[11px] text-white/40">None</div>}
                              <div className="flex flex-wrap gap-3">
                                {inboundPlayers.map(p => {
                                  const sleeper = playersMap?.get(String(p.player_id));
                                  const minimalContract = sleeper ? [{
                                    playerId: String(sleeper.playerId),
                                    playerName: sleeper.playerName,
                                    position: sleeper.position,
                                    team: '',
                                    status: 'Active',
                                    nflTeam: sleeper.team || ''
                                  }] : [];
                                  return (
                                    <div key={`pl-in-${p.player_id}`} className="w-28 cursor-pointer flex flex-col items-center" onClick={() => setSelectedPlayerId(String(p.player_id))}>
                                      {/* Reserve label space for alignment */}
                                      <div className="h-5 w-full" />
                                      <PlayerProfileCard playerId={p.player_id} contracts={minimalContract} expanded={false} className="w-24 h-28 sm:w-28 sm:h-32" />
                                      {sleeper && (
                                        <div className="w-full mt-1 flex flex-col items-center">
                                          <div className="text-[12px] sm:text-[11px] text-center text-white/80 whitespace-normal break-words leading-tight">
                                            {sleeper.playerName} · {sleeper.position}
                                          </div>
                                          <div className="text-[11px] text-white/70 mt-0.5 leading-tight">
                                            <span className="text-white/60">Salary:</span> {formatMoney(contractsMap?.get(String(sleeper.playerId))?.salary)}
                                          </div>
                                          <div className="text-[11px] text-white/70 leading-tight">
                                            <span className="text-white/60">KTC:</span> {contractsMap?.get(String(sleeper.playerId))?.ktcValue ?? '-'}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {inboundDraftedPicks.map((pk, idx) => {
                                  const drafted = pk.drafted_player;
                                  const sleeper = playersMap?.get(String(drafted.player_id));
                                  const playerName = drafted.name || sleeper?.playerName || `Player ${drafted.player_id}`;
                                  const position = drafted.position || sleeper?.position || '';
                                  const minimalContract = [{
                                    playerId: String(drafted.player_id),
                                    playerName,
                                    position,
                                    team: '',
                                    status: 'Active',
                                    nflTeam: drafted.team || sleeper?.team || ''
                                  }];
                                  return (
                                    <div key={`pk-in-${idx}`} className="w-28 cursor-pointer flex flex-col items-center" onClick={() => setSelectedPlayerId(String(drafted.player_id))}>
                                      <div className="w-24 sm:w-28 rounded-lg border border-orange-500/60 bg-orange-500/10 p-1 flex flex-col items-center">
                                        {/* Label space (fixed height) */}
                                        <div className="h-5 w-full flex items-center justify-center" title={draftedPickLabel(pk)}>
                                          <div className="text-[11px] sm:text-[11px] text-center text-orange-300 leading-tight px-1 truncate">
                                            {draftedPickLabelShort(pk)}
                                          </div>
                                        </div>
                                        <PlayerProfileCard playerId={drafted.player_id} contracts={minimalContract} expanded={false} className="w-24 h-28 sm:w-28 sm:h-32" />
                                        <div className="w-full mt-1 flex flex-col items-center">
                                          <div className="text-[12px] sm:text-[11px] text-center text-white/80 whitespace-normal break-words leading-tight">
                                            {playerName} · {position || 'N/A'}
                                          </div>
                                          <div className="text-[11px] text-white/70 mt-0.5 leading-tight">
                                            <span className="text-white/60">Salary:</span> {formatMoney(contractsMap?.get(String(drafted.player_id))?.salary)}
                                          </div>
                                          <div className="text-[11px] text-white/70 leading-tight">
                                            <span className="text-white/60">KTC:</span> {contractsMap?.get(String(drafted.player_id))?.ktcValue ?? '-'}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Raw pick chips always below cards */}
                              {inboundRawPicks.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {inboundRawPicks.map((pk, idx) => (
                                    <span key={`pk-in-chip-${idx}`} className="inline-flex max-w-fit px-2 py-1 rounded bg-green-500/15 border border-green-500/30 text-[13px] w-auto shrink-0">
                                      {undraftedPickLabel(pk)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {showSent && <div className="hidden sm:block w-px bg-[#FF4B1F]/70 mx-6 self-stretch rounded-full" aria-hidden="true" />}
                            {showSent && (
                            <div>
                              <div className="text-xs uppercase tracking-wide text-red-400 mb-1">Sent</div>
                              {/* Totals for sent side */}
                              <TotalsBar side="out" players={outboundPlayers} draftedPicks={outboundDraftedPicks} contractsMap={contractsMap} />
                              {outboundPlayers.length === 0 && outboundPicks.length === 0 && <div className="text-[11px] text-white/40">None</div>}
                              <div className="flex flex-wrap gap-3">
                                {outboundPlayers.map(p => {
                                  const sleeper = playersMap?.get(String(p.player_id));
                                  const minimalContract = sleeper ? [{
                                    playerId: String(sleeper.playerId),
                                    playerName: sleeper.playerName,
                                    position: sleeper.position,
                                    team: '',
                                    status: 'Active',
                                    nflTeam: sleeper.team || ''
                                  }] : [];
                                  return (
                                    <div key={`pl-out-${p.player_id}`} className="w-28 cursor-pointer flex flex-col items-center" onClick={() => setSelectedPlayerId(String(p.player_id))}>
                                      <div className="h-5 w-full" />
                                      <PlayerProfileCard playerId={p.player_id} contracts={minimalContract} expanded={false} className="w-24 h-28 sm:w-28 sm:h-32" />
                                      {sleeper && (
                                        <div className="w-full mt-1 flex flex-col items-center">
                                          <div className="text-[12px] sm:text-[11px] text-center text-white/80 whitespace-normal break-words leading-tight">
                                            {sleeper.playerName} · {sleeper.position}
                                          </div>
                                          <div className="text-[11px] text-white/70 mt-0.5 leading-tight">
                                            <span className="text-white/60">Salary:</span> {formatMoney(contractsMap?.get(String(sleeper.playerId))?.salary)}
                                          </div>
                                          <div className="text-[11px] text-white/70 leading-tight">
                                            <span className="text-white/60">KTC:</span> {contractsMap?.get(String(sleeper.playerId))?.ktcValue ?? '-'}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {outboundDraftedPicks.map((pk, idx) => {
                                  const drafted = pk.drafted_player;
                                  const sleeper = playersMap?.get(String(drafted.player_id));
                                  const playerName = drafted.name || sleeper?.playerName || `Player ${drafted.player_id}`;
                                  const position = drafted.position || sleeper?.position || '';
                                  const minimalContract = [{
                                    playerId: String(drafted.player_id),
                                    playerName,
                                    position,
                                    team: '',
                                    status: 'Active',
                                    nflTeam: drafted.team || sleeper?.team || ''
                                  }];
                                  return (
                                    <div key={`pk-out-${idx}`} className="w-28 cursor-pointer flex flex-col items-center" onClick={() => setSelectedPlayerId(String(drafted.player_id))}>
                                      <div className="w-24 sm:w-28 rounded-lg border border-orange-500/60 bg-orange-500/10 p-1 flex flex-col items-center">
                                        <div className="h-5 w-full flex items-center justify-center" title={draftedPickLabel(pk)}>
                                          <div className="text-[11px] sm:text-[11px] text-center text-orange-300 leading-tight px-1 truncate">
                                            {draftedPickLabelShort(pk)}
                                          </div>
                                        </div>
                                        <PlayerProfileCard playerId={drafted.player_id} contracts={minimalContract} expanded={false} className="w-24 h-28 sm:w-28 sm:h-32" />
                                        <div className="w-full mt-1 flex flex-col items-center">
                                          <div className="text-[12px] sm:text-[11px] text-center text-white/80 whitespace-normal break-words leading-tight">
                                            {playerName} · {position || 'N/A'}
                                          </div>
                                          <div className="text-[11px] text-white/70 mt-0.5 leading-tight">
                                            <span className="text-white/60">Salary:</span> {formatMoney(contractsMap?.get(String(drafted.player_id))?.salary)}
                                          </div>
                                          <div className="text-[11px] text-white/70 leading-tight">
                                            <span className="text-white/60">KTC:</span> {contractsMap?.get(String(drafted.player_id))?.ktcValue ?? '-'}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {outboundRawPicks.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {outboundRawPicks.map((pk, idx) => (
                                    <span key={`pk-out-chip-${idx}`} className="inline-flex max-w-fit px-2 py-1 rounded bg-red-500/15 border border-red-500/30 text-[13px] w-auto shrink-0">
                                      {undraftedPickLabel(pk)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Bottom Draft Picks section removed as redundant */}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Player modal for stats (expanded card) */}
      {selectedPlayerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedPlayerId(null)} aria-hidden />
          <div className="relative z-10 w-[95vw] max-w-2xl max-h-[90vh] overflow-auto bg-black/90 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-white/80 text-sm">Player Card</div>
              <button onClick={() => setSelectedPlayerId(null)} className="text-white/70 hover:text-white">✕</button>
            </div>
            <PlayerProfileCard playerId={selectedPlayerId} contracts={(playersMap && playersMap.get(String(selectedPlayerId))) ? [{
              playerId: String(playersMap.get(String(selectedPlayerId)).playerId),
              playerName: playersMap.get(String(selectedPlayerId)).playerName,
              position: playersMap.get(String(selectedPlayerId)).position,
              team: '',
              status: 'Active',
              nflTeam: playersMap.get(String(selectedPlayerId)).team || ''
            }] : []} expanded={true} />
          </div>
        </div>
      )}
    </main>
  );
}

function formatRaw(raw) {
  try {
    if (!raw || typeof raw !== 'object') return 'No raw data';
    const json = JSON.stringify(raw, null, 2);
    return json.length > 30000 ? json.slice(0, 30000) + '\n... (truncated)' : json;
  } catch (e) {
    return 'Failed to stringify raw trade';
  }
}