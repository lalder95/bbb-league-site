'use client';
import React, { useEffect, useRef, useState } from 'react';
import { getTeamName, findTradeForPick, formatTradeDate } from '@/utils/draftUtils';
import PlayerProfileCard from '@/app/my-team/components/PlayerProfileCard';

const TradedPicks = ({ tradedPicks, tradeHistory, users, rosters, draftYearToShow }) => {
  const [selectedTradePick, setSelectedTradePick] = useState(null);
  const [playersMap, setPlayersMap] = useState(null); // Map of sleeperId -> { playerId, playerName, position, team }
  const loadingPlayersRef = useRef(false);
  const [showPickDebug, setShowPickDebug] = useState(false);
  const [showTradeDebug, setShowTradeDebug] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  // Use draftYearToShow for the first year, then +1, +2
  const baseYear = Number(draftYearToShow) || new Date().getFullYear() + 1;
  const futureYears = [baseYear, baseYear + 1, baseYear + 2].map(String);

  // Group picks by year and round
  const picksByYear = {};
  futureYears.forEach(year => {
    // First filter by year
    const yearPicks = tradedPicks.filter(pick => pick.season === year);
    
    // Group by round
    const roundsInYear = Array.from(new Set(yearPicks.map(pick => pick.round)))
      .sort((a, b) => a - b); // Sort rounds numerically
    
    picksByYear[year] = roundsInYear.map(round => {
      // Get all picks for this round and sort by original owner name
      const roundPicks = yearPicks.filter(pick => pick.round === round)
        .sort((a, b) => {
          const teamA = getTeamName(a.roster_id, rosters, users).toLowerCase();
          const teamB = getTeamName(b.roster_id, rosters, users).toLowerCase();
          return teamA.localeCompare(teamB);
        });
      
      return {
        round,
        picks: roundPicks
      };
    });
  });

  // Lazy-load players map once to resolve names for traded players
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
  
  // Render trade details modal
  const TradeDetailsModal = () => {
    if (!selectedTradePick) return null;
    
    const trade = findTradeForPick(selectedTradePick, tradeHistory);

    // Styling helpers for prettier pick badges (match Trade History theme)
    const pickVisual = (round) => {
      const r = Number(round);
      switch (r) {
        case 1:
          return { grad: 'from-amber-400 via-orange-500 to-pink-600', ring: 'ring-amber-400/40', avatarBorder: 'border-amber-400/60', pill: 'bg-gradient-to-r from-amber-500/90 to-orange-600/90 text-white' };
        case 2:
          return { grad: 'from-violet-400 via-fuchsia-500 to-pink-600', ring: 'ring-violet-400/40', avatarBorder: 'border-violet-400/60', pill: 'bg-gradient-to-r from-violet-500/90 to-fuchsia-600/90 text-white' };
        case 3:
          return { grad: 'from-cyan-400 via-sky-500 to-blue-600', ring: 'ring-cyan-400/40', avatarBorder: 'border-cyan-400/60', pill: 'bg-gradient-to-r from-cyan-500/90 to-sky-600/90 text-white' };
        case 4:
          return { grad: 'from-emerald-400 via-green-500 to-teal-600', ring: 'ring-emerald-400/40', avatarBorder: 'border-emerald-400/60', pill: 'bg-gradient-to-r from-emerald-500/90 to-green-600/90 text-white' };
        default:
          return { grad: 'from-slate-400 via-slate-500 to-slate-700', ring: 'ring-slate-400/40', avatarBorder: 'border-slate-400/60', pill: 'bg-gradient-to-r from-slate-500/90 to-slate-700/90 text-white' };
      }
    };

    // Helpers for compact label above drafted-player cards
    const pad2 = (n) => (n === 0 || n ? String(n).padStart(2, '0') : null);
    const draftedPickLabelShort = (pk) => {
      const slot = pk?.match_debug?.computed_slot;
      const rd = Number(pk.round);
      return slot || slot === 0 ? `${pk.season} ${rd}.${pad2(Number(slot))}` : `${pk.season} ${rd}`;
    };
    
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-[#001A2B] border border-white/10 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
          <div className="sticky top-0 bg-[#001A2B] border-b border-white/10 p-4 flex justify-between items-center">
            <h3 className="text-xl font-bold text-[#FF4B1F]">Trade Details</h3>
            <button 
              onClick={() => setSelectedTradePick(null)}
              className="text-white/70 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="p-4">
            <div className="mb-6">
              <div className="text-white/70 mb-1">Pick</div>
              <div className="text-xl font-bold">
                Round {selectedTradePick.round} ({selectedTradePick.season})
              </div>
              <div className="flex flex-col sm:flex-row sm:gap-2 mt-2">
                <div>
                  <span className="text-white/70">Original Owner:</span>{' '}
                  <span className="font-medium">{getTeamName(selectedTradePick.roster_id, rosters, users)}</span>
                </div>
                <div className="hidden sm:block text-white/70">→</div>
                <div>
                  <span className="text-white/70">Current Owner:</span>{' '}
                  <span className="font-medium">{getTeamName(selectedTradePick.owner_id, rosters, users)}</span>
                </div>
              </div>
              {/* Debug toggles */}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowPickDebug(prev => !prev)}
                  className={`px-2 py-1 rounded text-xs border transition-colors ${showPickDebug ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white/5 border-white/15 text-white/80 hover:border-white/40'}`}
                >{showPickDebug ? 'Hide Pick Match' : 'Pick Match Debug'}</button>
                <button
                  type="button"
                  onClick={() => setShowTradeDebug(prev => !prev)}
                  className={`px-2 py-1 rounded text-xs border transition-colors ${showTradeDebug ? 'bg-[#FF4B1F] border-[#FF4B1F] text-white' : 'bg-white/5 border-white/15 text-white/80 hover:border-white/40'}`}
                >{showTradeDebug ? 'Hide Raw Trade' : 'Raw Trade Debug'}</button>
              </div>
            </div>
            
            {trade ? (
              <>
                <div className="mb-4">
                  <div className="text-white/70 mb-1">Trade Date</div>
                  <div>{formatTradeDate(trade.created)}</div>
                </div>

                {/* Debug blocks */}
                {showPickDebug && (
                  <div className="mb-4 bg-black/50 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/70 mb-2">Pick match details</div>
                    <div className="space-y-1">
                      {Array.isArray(trade.picks) && trade.picks.length > 0 ? (
                        trade.picks
                          .filter(pk => String(pk.season) === String(selectedTradePick.season) && Number(pk.round) === Number(selectedTradePick.round))
                          .map((pk, i) => (
                            <pre key={i} className="text-[11px] leading-relaxed overflow-auto bg-black/40 border border-white/10 rounded p-2 whitespace-pre-wrap break-all">
{safeStringify(pk.match_debug)}
                            </pre>
                          ))
                      ) : (
                        <div className="text-[11px] text-white/50">No picks in this trade.</div>
                      )}
                    </div>
                  </div>
                )}
                {showTradeDebug && (
                  <pre className="text-[11px] leading-relaxed max-h-64 overflow-auto bg-black/60 border border-white/10 rounded-lg p-3 mb-4 whitespace-pre-wrap break-all">
{safeStringify(trade.raw || trade)}
                  </pre>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {(Array.isArray(trade.teams) ? trade.teams : (Array.isArray(trade.roster_ids) ? trade.roster_ids.map(rid => ({ roster_id: rid })) : [])).map((teamObj, rosterIndex) => (
                    <div key={rosterIndex} className="bg-black/20 p-4 rounded-lg">
                      <h4 className="font-bold mb-3 text-[#FF4B1F]">{teamObj.owner_name || getTeamName(teamObj.roster_id, rosters, users)} Received</h4>
                      
                      {/* Display draft picks received */}
                      {(Array.isArray(trade.picks) && trade.picks.filter(pick => Number(pick.to_roster_id) === Number(teamObj.roster_id)).length > 0) ||
                       (Array.isArray(trade.draft_picks) && trade.draft_picks.filter(pick => Number(pick.owner_id) === Number(teamObj.roster_id)).length > 0) ? (
                        <div className="mb-3">
                          <div className="text-white/70 mb-1">Draft Picks</div>
                          {(() => {
                            const toRid = Number(teamObj.roster_id);
                            const enriched = Array.isArray(trade.picks) ? trade.picks.filter(pk => Number(pk.to_roster_id) === toRid) : [];
                            const drafted = enriched.filter(pk => pk.drafted_player && pk.drafted_player.player_id);
                            const undrafted = enriched.filter(pk => !(pk.drafted_player && pk.drafted_player.player_id));
                            return (
                              <>
                                {/* Drafted picks as cards with images */}
                                {drafted.length > 0 && (
                                  <div className="flex flex-wrap gap-3 mb-2 justify-center">
                                    {drafted.map((pk, idx) => {
                                      const rd = Number(pk.round);
                                      const vis = pickVisual(rd);
                                      const d = pk.drafted_player;
                                      const minimalContract = [{
                                        playerId: String(d.player_id),
                                        playerName: d.name || '',
                                        position: d.position || '',
                                        team: '',
                                        status: 'Active',
                                        nflTeam: d.team || ''
                                      }];
                                      return (
                                        <div key={`pk-card-${idx}`} className={`relative w-24 sm:w-28 p-[2px] rounded-xl bg-gradient-to-br ${vis.grad} shadow-lg shadow-black/40 cursor-pointer hover:scale-[1.02] transition-transform`} onClick={() => setSelectedPlayerId(String(d.player_id))}>
                                          <div className={`rounded-[10px] h-full w-full bg-black/60 backdrop-blur-sm border border-white/10 ring-1 ${vis.ring} flex flex-col items-center`} title={`${pk.season} R${rd}`}>
                                            <div className="absolute -top-2 left-2">
                                              <div className={`text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wide shadow ${vis.pill}`}>{draftedPickLabelShort(pk)}</div>
                                            </div>
                                            <div className="pt-5" />
                                            <PlayerProfileCard playerId={d.player_id} contracts={minimalContract} expanded={false} className="w-24 h-28 sm:w-28 sm:h-32" />
                                            <div className="w-full mt-1 mb-1 flex flex-col items-center px-1">
                                              <div className="text-[12px] sm:text-[11px] text-center text-white/80 whitespace-normal break-words leading-tight">
                                                {(d.name || '')} · {(d.position || 'N/A')}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                {/* Remaining undrafted enriched picks as chips + legacy chips */}
                                <ul className="flex flex-wrap gap-2">
                                  {undrafted.map((pick, pickIndex) => {
                                    const vis = pickVisual(pick.round);
                                    return (
                                      <li key={`pnew-${pickIndex}`} className="relative inline-flex items-center gap-1.5 max-w-fit pl-1.5 pr-2 py-1 rounded-full border text-[11px] font-medium tracking-wide bg-black/30 border-white/10">
                                        <span className={`grid place-items-center h-5 w-5 rounded-full text-[10px] font-bold bg-gradient-to-br ${vis.grad} text-white shadow border ${vis.avatarBorder}`}>
                                          {Number(pick.round)}
                                        </span>
                                        <span className="text-white/85">
                                          {pick.season} from {getTeamName(pick.slot_roster_id, rosters, users)}
                                        </span>
                                      </li>
                                    );
                                  })}
                                  {Array.isArray(trade.draft_picks) && trade.draft_picks.filter(pick => Number(pick.owner_id) === toRid).map((pick, pickIndex) => {
                                    const vis = pickVisual(pick.round);
                                    return (
                                      <li key={`pleg-${pickIndex}`} className="relative inline-flex items-center gap-1.5 max-w-fit pl-1.5 pr-2 py-1 rounded-full border text-[11px] font-medium tracking-wide bg-black/30 border-white/10">
                                        <span className={`grid place-items-center h-5 w-5 rounded-full text-[10px] font-bold bg-gradient-to-br ${vis.grad} text-white shadow border ${vis.avatarBorder}`}>
                                          {Number(pick.round)}
                                        </span>
                                        <span className="text-white/85">
                                          {pick.season} from {getTeamName(pick.roster_id, rosters, users)}
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </>
                            );
                          })()}
                        </div>
                      ) : null}
                      
                      {/* Display players received (render as PlayerProfileCard, matching Trade History style) */}
                      {(Array.isArray(trade.players) && trade.players.filter(m => Number(m.to_roster_id) === Number(teamObj.roster_id)).length > 0) ||
                       (trade.adds && Object.entries(trade.adds).filter(([playerId, toRid]) => Number(toRid) === Number(teamObj.roster_id)).length > 0) ? (
                        <div>
                          <div className="text-white/70 mb-1">Players</div>
                          <div className="flex flex-wrap gap-3">
                            {/* Enriched players */}
                            {Array.isArray(trade.players) && trade.players
                              .filter(m => Number(m.to_roster_id) === Number(teamObj.roster_id))
                              .map((m, mi) => {
                                const sleeper = playersMap?.get(String(m.player_id));
                                const minimalContract = sleeper ? [{
                                  playerId: String(sleeper.playerId),
                                  playerName: sleeper.playerName,
                                  position: sleeper.position,
                                  team: '',
                                  status: 'Active',
                                  nflTeam: sleeper.team || ''
                                }] : [];
                                return (
                                  <div key={`pl-in-${m.player_id}-${mi}`} className="w-28 flex flex-col items-center cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => setSelectedPlayerId(String(m.player_id))}>
                                    {/* Reserve label space for alignment */}
                                    <div className="h-5 w-full" />
                                    <PlayerProfileCard playerId={m.player_id} contracts={minimalContract} expanded={false} className="w-24 h-28 sm:w-28 sm:h-32" />
                                    {sleeper && (
                                      <div className="w-full mt-1 flex flex-col items-center">
                                        <div className="text-[12px] sm:text-[11px] text-center text-white/80 whitespace-normal break-words leading-tight">
                                          {sleeper.playerName} · {sleeper.position}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            {/* Legacy adds map */}
                            {trade.adds && Object.entries(trade.adds)
                              .filter(([playerId, toRid]) => Number(toRid) === Number(teamObj.roster_id))
                              .map(([playerId], mi) => {
                                const sleeper = playersMap?.get(String(playerId));
                                const minimalContract = sleeper ? [{
                                  playerId: String(sleeper.playerId),
                                  playerName: sleeper.playerName,
                                  position: sleeper.position,
                                  team: '',
                                  status: 'Active',
                                  nflTeam: sleeper.team || ''
                                }] : [];
                                return (
                                  <div key={`pl-in-legacy-${playerId}-${mi}`} className="w-28 flex flex-col items-center cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => setSelectedPlayerId(String(playerId))}>
                                    <div className="h-5 w-full" />
                                    <PlayerProfileCard playerId={playerId} contracts={minimalContract} expanded={false} className="w-24 h-28 sm:w-28 sm:h-32" />
                                    {sleeper && (
                                      <div className="w-full mt-1 flex flex-col items-center">
                                        <div className="text-[12px] sm:text-[11px] text-center text-white/80 whitespace-normal break-words leading-tight">
                                          {sleeper.playerName} · {sleeper.position}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="bg-black/20 p-4 rounded-lg text-center">
                <div className="text-white/70">
                  Detailed trade information is not available for this pick.
                </div>
                {showPickDebug && (
                  <div className="mt-3 text-left bg-black/40 border border-white/10 rounded p-3">
                    <div className="text-xs text-white/70 mb-1">Selected Pick</div>
                    <pre className="text-[11px] whitespace-pre-wrap break-all">{safeStringify(selectedTradePick)}</pre>
                    <div className="text-xs text-white/70 mt-2 mb-1">Trade History sample</div>
                    <pre className="text-[11px] whitespace-pre-wrap break-all">{safeStringify(tradeHistory?.[0])}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Safe stringify helper used in debug blocks
  function safeStringify(obj) {
    try {
      if (!obj || typeof obj !== 'object') return String(obj ?? 'null');
      const json = JSON.stringify(obj, null, 2);
      return json.length > 30000 ? json.slice(0, 30000) + '\n... (truncated)' : json;
    } catch (e) {
      return 'Failed to stringify object';
    }
  }
  
  return (
    <div className="bg-black/20 p-6 rounded-lg">
      <h3 className="text-xl font-bold mb-4">Traded Draft Picks</h3>
      
      {tradedPicks.length === 0 ? (
        <div className="text-center text-white/70 py-4">
          No traded picks found.
        </div>
      ) : (
        <div className="space-y-6">
          {futureYears.map(year => (
            <div key={year}>
              <h4 className="text-lg font-semibold mb-3 text-[#FF4B1F]">{year} Draft</h4>
              
              {picksByYear[year] && picksByYear[year].length > 0 ? (
                <div className="space-y-4">
                  {picksByYear[year].map(roundData => (
                    <div key={`round-${roundData.round}`} className="bg-black/10 p-4 rounded-lg">
                      <h5 className="font-medium mb-3">Round {roundData.round}</h5>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="py-2 text-left">Original Owner</th>
                              <th className="py-2 text-left">Current Owner</th>
                              <th className="py-2 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {roundData.picks.map((pick, index) => (
                              <tr 
                                key={index} 
                                className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                                onClick={() => setSelectedTradePick(pick)}
                              >
                                <td className="py-3">{getTeamName(pick.roster_id, rosters, users)}</td>
                                <td className="py-3">{getTeamName(pick.owner_id, rosters, users)}</td>
                                <td className="py-3 text-right">
                                  <button 
                                    className="text-[#FF4B1F] hover:underline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTradePick(pick);
                                    }}
                                  >
                                    View Trade
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-white/70 py-4 bg-black/10 rounded">
                  No traded picks found for {year}.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      <TradeDetailsModal />
      {/* Player modal for stats (expanded card) */}
      {selectedPlayerId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
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
    </div>
  );
};

export default TradedPicks;