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
      <div className="inline-flex items-center gap-2 mb-2 text-[11px] rounded-full px-2 py-1 border border-white/10 bg-white/5 text-white/70">
        <span className="uppercase tracking-wide text-white/60">Totals</span>
        <span className="h-3 w-px bg-white/15" />
        <span className="text-white/70">Salary <span className="text-white">{formatMoney(salaryTotal)}</span></span>
        <span className="text-white/30">•</span>
        <span className="text-white/70">KTC <span className="text-white">{formatInt(ktcTotal)}</span></span>
      </div>
    );
  };

  // Styling helpers for prettier pick badges/cards
  function pickVisual(round) {
    const r = Number(round);
    // Map rounds to color themes
    switch (r) {
      case 1:
        return { grad: 'from-amber-400 via-orange-500 to-pink-600', ring: 'ring-amber-400/40', pill: 'bg-gradient-to-r from-amber-500/90 to-orange-600/90 text-white', chipBorder: 'border-amber-400/40', avatarBorder: 'border-amber-400/60' };
      case 2:
        return { grad: 'from-violet-400 via-fuchsia-500 to-pink-600', ring: 'ring-violet-400/40', pill: 'bg-gradient-to-r from-violet-500/90 to-fuchsia-600/90 text-white', chipBorder: 'border-violet-400/40', avatarBorder: 'border-violet-400/60' };
      case 3:
        return { grad: 'from-cyan-400 via-sky-500 to-blue-600', ring: 'ring-cyan-400/40', pill: 'bg-gradient-to-r from-cyan-500/90 to-sky-600/90 text-white', chipBorder: 'border-cyan-400/40', avatarBorder: 'border-cyan-400/60' };
      case 4:
        return { grad: 'from-emerald-400 via-green-500 to-teal-600', ring: 'ring-emerald-400/40', pill: 'bg-gradient-to-r from-emerald-500/90 to-green-600/90 text-white', chipBorder: 'border-emerald-400/40', avatarBorder: 'border-emerald-400/60' };
      default:
        return { grad: 'from-slate-400 via-slate-500 to-slate-700', ring: 'ring-slate-400/40', pill: 'bg-gradient-to-r from-slate-500/90 to-slate-700/90 text-white', chipBorder: 'border-slate-400/40', avatarBorder: 'border-slate-400/60' };
    }
  }

  const DraftedPickWrapper = ({ pk, children }) => {
    const rd = Number(pk.round);
    const vis = pickVisual(rd);
    return (
      <div className={`relative w-24 sm:w-28 p-[2px] rounded-xl bg-gradient-to-br ${vis.grad} shadow-lg shadow-black/40 hover:shadow-[#FF4B1F]/30 transition-shadow`}>
        <div className={`rounded-[10px] h-full w-full bg-black/60 backdrop-blur-sm border border-white/10 ring-1 ${vis.ring} flex flex-col items-center`}
             title={draftedPickLabel(pk)}>
          {/* Corner pill */}
          <div className="absolute -top-2 left-2">
            <div className={`text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wide shadow ${vis.pill}`}>{draftedPickLabelShort(pk)}</div>
          </div>
          {children}
        </div>
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
    <main className="relative min-h-screen text-white bg-gradient-to-br from-[#0B1220] via-[#0A1A2B] to-[#0B1220]">
      {/* Decorative background accents */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-[#FF4B1F]/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col items-center text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-[#FF8A00] via-[#FF4B1F] to-[#F7007B] bg-clip-text text-transparent">
            Trade History
          </h1>
          <p className="mt-2 text-sm text-white/70">Explore every move across seasons, with picks and contracts in one view.</p>
        </div>
      </div>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto p-6">
        {/* Filters */}
        <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Season + Sent toggle */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="block text-[12px] uppercase tracking-wide text-white/60 mb-1">Season</label>
                  {loadingSeasonMeta ? (
                    <div className="text-white/60 text-sm">Loading seasons...</div>
                  ) : (
                    <select
                      value={season || ''}
                      onChange={e => setSeason(parseInt(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4B1F]/40"
                    >
                      {seasonOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="pt-6">
                  <label className="flex items-center text-xs cursor-pointer select-none bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={showSent}
                      onChange={e => setShowSent(e.target.checked)}
                      className="accent-[#FF4B1F] mr-2" aria-label="Toggle Sent Assets"
                    />
                    <span className="text-white/80">Show Sent</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Team filter chips */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[12px] uppercase tracking-wide text-white/60">Filter Teams</label>
                {teamFilter.length > 0 && (
                  <button onClick={clearFilters} className="text-xs text-white/70 hover:text-white underline underline-offset-2">Clear</button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {uniqueTeams.map(t => {
                  const active = teamFilter.includes(t.owner_id);
                  return (
                    <button
                      key={t.owner_id}
                      onClick={() => toggleTeam(t.owner_id)}
                      className={`group relative overflow-hidden px-3 py-1.5 rounded-full text-xs border transition-all ${active ? 'bg-gradient-to-r from-[#FF8A00]/90 to-[#FF4B1F]/90 border-[#FF4B1F] text-white shadow-[0_0_0_1px_rgba(255,75,31,0.3),0_8px_24px_-8px_rgba(255,75,31,0.6)]' : 'bg-black/40 border-white/15 text-white/80 hover:border-white/40 hover:bg-black/50'}`}
                    >
                      <span className="relative z-10">{t.owner_name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        )}

        {/* Loading / Empty / List */}
        {loadingTrades ? (
          <div className="flex items-center gap-3 text-white/80">
            <div className="h-8 w-8 inline-flex items-center justify-center">
              <div className="animate-spin h-6 w-6 border-2 border-[#FF4B1F] border-t-transparent rounded-full" />
            </div>
            <span>Loading trades for {season}...</span>
          </div>
        ) : filteredTrades.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/70">No trades found for this season{teamFilter.length ? ' (with current filters)' : ''}.</div>
        ) : (
          <div className="space-y-6">
            {filteredTrades.map(trade => {
              const grouped = playersByRoster(trade);
              return (
                <div key={trade.trade_id} className="group relative rounded-2xl p-[1px] bg-gradient-to-br from-white/10 via-white/5 to-transparent">
                  <div className="rounded-2xl bg-black/40 backdrop-blur-sm border border-white/10 p-4 sm:p-5">
                    {/* Card header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                      <div className="text-sm text-white/80 flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">Season {trade.season}</span>
                        <span className="text-white/30">•</span>
                        <span>Week {trade.week}</span>
                        <span className="text-white/30">•</span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/80 hidden sm:inline-flex">TX #{trade.trade_id}</span>
                      </div>
                      {isAdmin && (
                        <div className="hidden sm:flex items-center gap-2 sm:gap-3">
                          <div className="text-xs text-white/60">Status: <span className="text-white">{trade.status || 'unknown'}</span></div>
                          <button
                            type="button"
                            onClick={() => setOpenDebug(prev => {
                              const next = new Set(prev);
                              if (next.has(trade.trade_id)) next.delete(trade.trade_id); else next.add(trade.trade_id);
                              return next;
                            })}
                            className={`px-2 py-1 rounded text-xs border transition-colors ${openDebug.has(trade.trade_id) ? 'bg-[#FF4B1F] border-[#FF4B1F] text-white' : 'bg-white/5 border-white/15 text-white/80 hover:border-white/40'}`}
                          >{openDebug.has(trade.trade_id) ? 'Hide Debug' : 'Debug'}</button>
                          <button
                            type="button"
                            onClick={() => setOpenPickDebug(prev => {
                              const next = new Set(prev);
                              if (next.has(trade.trade_id)) next.delete(trade.trade_id); else next.add(trade.trade_id);
                              return next;
                            })}
                            className={`px-2 py-1 rounded text-xs border transition-colors ${openPickDebug.has(trade.trade_id) ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white/5 border-white/15 text-white/80 hover:border-white/40'}`}
                          >{openPickDebug.has(trade.trade_id) ? 'Hide Pick Match' : 'Pick Match Debug'}</button>
                        </div>
                      )}
                    </div>

                    {openDebug.has(trade.trade_id) && (
                      <pre className="text-[11px] leading-relaxed max-h-64 overflow-auto bg-black/60 border border-white/10 rounded-lg p-3 mb-4 whitespace-pre-wrap break-all">
{formatRaw(trade.raw)}
                      </pre>
                    )}

                    {openPickDebug.has(trade.trade_id) && (
                      <div className="mb-4 bg-black/50 border border-white/10 rounded-lg p-3">
                        <div className="text-xs text-white/70 mb-2">Pick match details</div>
                        <div className="space-y-1">
                          {trade.picks.length === 0 ? (
                            <div className="text-[11px] text-white/50">No picks in this trade.</div>
                          ) : (
                            trade.picks.map((pk, i) => (
                              <pre key={i} className="text-[11px] leading-relaxed overflow-auto bg-black/40 border border-white/10 rounded p-2 whitespace-pre-wrap break-all">
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
                        <div key={`${trade.trade_id}-${tm.roster_id}`} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 text-xs border border-white/10">
                          <span className="grid place-items-center h-5 w-5 rounded-full bg-white/10 text-[10px] text-white/70">{String(tm.owner_name || '?').slice(0,1)}</span>
                          <span>{tm.owner_name}</span>
                        </div>
                      ))}
                    </div>

                    {/* Player movement */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                          <div key={rosterId} className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="text-sm font-semibold mb-3 flex items-center justify-between">
                              <span className="truncate pr-2">{teamObj.owner_name}</span>
                              <span className="text-xs text-white/70 inline-flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5">Received <span className="font-medium text-white">{recvCount}</span></span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2 py-0.5">Sent <span className="font-medium text-white">{sentCount}</span></span>
                              </span>
                            </div>

                            {/* Layout: Received always shown; Sent optional. When Sent hidden, single-column without divider. */}
                            <div className={showSent ? 'flex flex-col sm:flex-row gap-6 sm:gap-8' : 'flex flex-col'}>
                              {/* Received */}
                              <div className="flex-1">
                                <div className="text-[11px] uppercase tracking-wide text-emerald-300 mb-1">Received</div>
                                {/* Totals for received side */}
                                <TotalsBar side="in" players={inboundPlayers} draftedPicks={inboundDraftedPicks} contractsMap={contractsMap} />
                                {inboundPlayers.length === 0 && inboundPicks.length === 0 && <div className="text-[11px] text-white/40">None</div>}
                                <div className="flex flex-wrap gap-3 justify-center">
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
                                      <div key={`pl-in-${p.player_id}`} className="w-28 cursor-pointer flex flex-col items-center hover:scale-[1.02] transition-transform" onClick={() => setSelectedPlayerId(String(p.player_id))}>
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
                                      <div key={`pk-in-${idx}`} className="w-28 cursor-pointer flex flex-col items-center hover:scale-[1.02] transition-transform" onClick={() => setSelectedPlayerId(String(drafted.player_id))}>
                                        <DraftedPickWrapper pk={pk}>
                                          <div className="pt-5" />
                                          <PlayerProfileCard playerId={drafted.player_id} contracts={minimalContract} expanded={false} className="w-24 h-28 sm:w-28 sm:h-32" />
                                          <div className="w-full mt-1 flex flex-col items-center px-1 pb-2">
                                            <div className="text-[12px] sm:text-[11px] text-center text-white/80 whitespace-normal break-words leading-tight">
                                              {playerName} · {position || 'N/A'}
                                            </div>
                                            <div className="text-[10px] text-white/60 mt-0.5 leading-tight">
                                              Salary <span className="text-white">{formatMoney(contractsMap?.get(String(drafted.player_id))?.salary)}</span>
                                            </div>
                                            <div className="text-[10px] text-white/60 leading-tight">
                                              KTC <span className="text-white">{contractsMap?.get(String(drafted.player_id))?.ktcValue ?? '-'}</span>
                                            </div>
                                          </div>
                                        </DraftedPickWrapper>
                                      </div>
                                    );
                                  })}
                                </div>
                                {/* Raw pick chips always below cards */}
                                {inboundRawPicks.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mt-2 justify-center">
                                    {inboundRawPicks.map((pk, idx) => {
                                      const rd = Number(pk.round);
                                      const vis = pickVisual(rd);
                                      return (
                                        <span key={`pk-in-chip-${idx}`} className={`relative inline-flex items-center gap-1.5 max-w-fit pl-1.5 pr-2 py-1 rounded-full border text-[11px] font-medium tracking-wide bg-black/40 backdrop-blur-sm ${vis.chipBorder} hover:border-white/50`}>
                                          <span className={`grid place-items-center h-5 w-5 rounded-full text-[10px] font-bold bg-gradient-to-br ${vis.grad} text-white shadow border ${vis.avatarBorder}`}>
                                            {rd}
                                          </span>
                                          <span className="text-white/80">{undraftedPickLabel(pk)}</span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Divider */}
                              {showSent && <div className="hidden sm:block w-px bg-white/10 self-stretch" aria-hidden="true" />}

                              {/* Sent */}
                              {showSent && (
                                <div className="flex-1">
                                  <div className="text-[11px] uppercase tracking-wide text-rose-300 mb-1">Sent</div>
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
                                        <div key={`pl-out-${p.player_id}`} className="w-28 cursor-pointer flex flex-col items-center hover:scale-[1.02] transition-transform" onClick={() => setSelectedPlayerId(String(p.player_id))}>
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
                                        <div key={`pk-out-${idx}`} className="w-28 cursor-pointer flex flex-col items-center hover:scale-[1.02] transition-transform" onClick={() => setSelectedPlayerId(String(drafted.player_id))}>
                                          <DraftedPickWrapper pk={pk}>
                                            <div className="pt-5" />
                                            <PlayerProfileCard playerId={drafted.player_id} contracts={minimalContract} expanded={false} className="w-24 h-28 sm:w-28 sm:h-32" />
                                            <div className="w-full mt-1 flex flex-col items-center px-1 pb-2">
                                              <div className="text-[12px] sm:text-[11px] text-center text-white/80 whitespace-normal break-words leading-tight">
                                                {playerName} · {position || 'N/A'}
                                              </div>
                                              <div className="text-[10px] text-white/60 mt-0.5 leading-tight">
                                                Salary <span className="text-white">{formatMoney(contractsMap?.get(String(drafted.player_id))?.salary)}</span>
                                              </div>
                                              <div className="text-[10px] text-white/60 leading-tight">
                                                KTC <span className="text-white">{contractsMap?.get(String(drafted.player_id))?.ktcValue ?? '-'}</span>
                                              </div>
                                            </div>
                                          </DraftedPickWrapper>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {outboundRawPicks.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2 justify-center">
                                      {outboundRawPicks.map((pk, idx) => {
                                        const rd = Number(pk.round);
                                        const vis = pickVisual(rd);
                                        return (
                                          <span key={`pk-out-chip-${idx}`} className={`relative inline-flex items-center gap-1.5 max-w-fit pl-1.5 pr-2 py-1 rounded-full border text-[11px] font-medium tracking-wide bg-black/40 backdrop-blur-sm ${vis.chipBorder} hover:border-white/50`}>
                                            <span className={`grid place-items-center h-5 w-5 rounded-full text-[10px] font-bold bg-gradient-to-br ${vis.grad} text-white shadow border ${vis.avatarBorder}`}>
                                              {rd}
                                            </span>
                                            <span className="text-white/80">{undraftedPickLabel(pk)}</span>
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Bottom Draft Picks section intentionally omitted to avoid redundancy */}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Player modal for stats (expanded card) */}
      {selectedPlayerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedPlayerId(null)} aria-hidden />
          <div className="relative z-10 w-[95vw] max-w-2xl max-h-[90vh] overflow-auto bg-gradient-to-b from-black/90 to-black/80 border border-white/10 rounded-2xl p-4 shadow-2xl">
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