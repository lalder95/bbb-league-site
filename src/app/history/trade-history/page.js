'use client';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import PlayerProfileCard from '@/app/my-team/components/PlayerProfileCard';

// Trade History Page
// Fetches per-season trade data via our API route and allows filtering by season and teams involved.
// Players are rendered with existing PlayerProfileCard (lightweight mode) to show contract + basic stats.

const START_SEASON = 2024; // first BBB season baseline

export default function TradeHistoryPage() {
  const [season, setSeason] = useState(null);
  const [currentSeason, setCurrentSeason] = useState(null);
  const [loadingSeasonMeta, setLoadingSeasonMeta] = useState(true);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [error, setError] = useState(null);
  const [trades, setTrades] = useState([]);
  const [teamFilter, setTeamFilter] = useState([]); // array of owner_ids selected
  const [playersMap, setPlayersMap] = useState(null); // sleeperId -> { playerId, playerName, position, team }
  const loadingPlayersRef = useRef(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [openDebug, setOpenDebug] = useState(new Set());
  const [openPickDebug, setOpenPickDebug] = useState(new Set());

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
                      const recvCount = inboundPlayers.length + inboundPicks.length;
                      const sentCount = outboundPlayers.length + outboundPicks.length;
                      return (
                        <div key={rosterId} className="bg-black/20 rounded p-3 border border-white/10">
                          <div className="text-sm font-semibold mb-3 flex items-center justify-between">
                            <span>{teamObj.owner_name}</span>
                            <span className="text-xs text-white/40">Received {recvCount} / Sent {sentCount}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs uppercase tracking-wide text-green-400 mb-1">Received</div>
                              {inboundPlayers.length === 0 && inboundPicks.length === 0 && <div className="text-[11px] text-white/40">None</div>}
                              <div className="flex flex-wrap gap-2">
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
                                      <PlayerProfileCard playerId={p.player_id} contracts={minimalContract} expanded={false} className="w-28 h-32" />
                                      {sleeper && (
                                        <div className="text-[10px] text-center mt-1 text-white/80 truncate">
                                          {sleeper.playerName} · {sleeper.position}
                                        </div>
                                      )}
                                      <div className="text-[10px] text-center mt-0.5 text-white/50">IN</div>
                                    </div>
                                  );
                                })}
                                {inboundPicks.map((pk, idx) => (
                                  <span key={`pk-in-${idx}`} className="inline-flex px-2 py-1 mt-3 rounded bg-green-500/15 border border-green-500/30 text-[11px] w-auto shrink-0">
                                    R{pk.round} {pk.season} (from {pk.slot_owner_name || pk.previous_owner_name}){pk.drafted_player ? ` • ${pk.drafted_player.name} (${pk.drafted_player.position || 'N/A'})` : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-wide text-red-400 mb-1">Sent</div>
                              {outboundPlayers.length === 0 && outboundPicks.length === 0 && <div className="text-[11px] text-white/40">None</div>}
                              <div className="flex flex-wrap gap-2">
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
                                      <PlayerProfileCard playerId={p.player_id} contracts={minimalContract} expanded={false} className="w-28 h-32" />
                                      {sleeper && (
                                        <div className="text-[10px] text-center mt-1 text-white/80 truncate">
                                          {sleeper.playerName} · {sleeper.position}
                                        </div>
                                      )}
                                      <div className="text-[10px] text-center mt-0.5 text-white/50">OUT</div>
                                    </div>
                                  );
                                })}
                                {outboundPicks.map((pk, idx) => (
                                  <span key={`pk-out-${idx}`} className="inline-flex px-2 py-1 mt-3 rounded bg-red-500/15 border border-red-500/30 text-[11px] w-auto shrink-0">
                                    R{pk.round} {pk.season} (from {pk.slot_owner_name || pk.previous_owner_name}){pk.drafted_player ? ` • ${pk.drafted_player.name} (${pk.drafted_player.position || 'N/A'})` : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
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