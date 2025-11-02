'use client';

import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import Image from 'next/image';

/**
 * BarChartRace - Cumulative points over seasons ("all-time") animated race
 *
 * Props:
 * - seasons: string[] | number[] (sorted chronologically)
 * - seasonPerformance: Array<{ season: string|number, `${userId}_points`: number }>
 * - teams: Array<{ user_id: string, display_name: string, avatar?: string }>
 * - topN?: number (default 10)
 * - stepMs?: number (default 1200)
 */
export default function BarChartRace({
  seasons = [], // for legacy season-level mode
  seasonPerformance = [], // for legacy season-level mode
  weeklyFrames = [], // preferred: [{ season:number, week:number, perUser: { [userId]: number } }]
  teams = [],
  topN = 12,
  stepMs = 1200,
}) {
  // Global tween state (drives both bar widths and numeric labels)
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef(null);
  const [speed, setSpeed] = useState(1); // 0.5, 1, 2
  const [mode, setMode] = useState('all'); // 'all' | 'season'
  const [showFilter, setShowFilter] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState(() => new Set());
  const [loop, setLoop] = useState(true);
  const [tweenT, setTweenT] = useState(1); // 0..1 progress between frames
  const rafRef = useRef(null);
  const tweenStartRef = useRef(0);
  const tweenDurationRef = useRef(700);
  const prevTotalsRef = useRef({});
  const nextTotalsRef = useRef({});

  function cancelTween() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  // Build a quick lookup for team meta
  const teamMap = useMemo(() => {
    const map = new Map();
    teams.forEach(t => map.set(t.user_id, t));
    return map;
  }, [teams]);

  // Stable team colors (per team, not per rank/position)
  const teamColorMap = useMemo(() => {
    const palette = [
      '#FF4B1F', '#3b82f6', '#22c55e', '#a855f7', '#eab308',
      '#ec4899', '#14b8a6', '#f97316', '#64748b', '#8b5cf6',
      '#10b981', '#ef4444', '#06b6d4', '#84cc16', '#f59e0b',
    ];
    const map = new Map();
    teams.forEach((t, idx) => {
      map.set(t.user_id, palette[idx % palette.length]);
    });
    return map;
  }, [teams]);

  const teamsUsed = useMemo(() => {
    if (!selectedTeamIds || selectedTeamIds.size === 0) return teams;
    return teams.filter(t => selectedTeamIds.has(t.user_id));
  }, [teams, selectedTeamIds]);

  // Helper to compute cumulative totals up to a given index
  const computeTotalsAtIndex = useMemo(() => {
    return (useIdx) => {
      const totals = {};
      teamsUsed.forEach(t => { totals[t.user_id] = 0; });
      if (weeklyFrames?.length) {
        const idxClamped = Math.min(useIdx, weeklyFrames.length - 1);
        const curSeason = weeklyFrames[idxClamped]?.season;
        const startIdx = mode === 'season'
          ? (() => {
              let j = idxClamped;
              while (j > 0 && weeklyFrames[j - 1]?.season === curSeason) j--;
              return j;
            })()
          : 0;
        for (let i = startIdx; i <= idxClamped; i++) {
          const frame = weeklyFrames[i];
          const perUser = frame?.perUser || {};
          teamsUsed.forEach(t => {
            const val = perUser[t.user_id];
            const num = typeof val === 'number' ? val : (typeof val === 'string' ? parseFloat(val) : 0);
            totals[t.user_id] += (isFinite(num) ? num : 0);
          });
        }
        return totals;
      } else if (seasonPerformance?.length) {
        const idxClamped = Math.min(useIdx, seasonPerformance.length - 1);
        for (let i = 0; i <= idxClamped; i++) {
          const entry = seasonPerformance[i];
          teamsUsed.forEach(t => {
            const val = entry?.[`${t.user_id}_points`];
            const num = typeof val === 'number' ? val : (typeof val === 'string' ? parseFloat(val) : 0);
            totals[t.user_id] += (isFinite(num) ? num : 0);
          });
        }
        return totals;
      }
      return totals;
    };
  }, [teamsUsed, weeklyFrames, seasonPerformance, mode]);

  // Target label for the current idx (does not tween)
  const label = useMemo(() => {
    if (weeklyFrames?.length) {
      const useIdx = Math.min(idx, weeklyFrames.length - 1);
      const frame = weeklyFrames[useIdx];
      return frame ? `Season ${frame.season} — Week ${frame.week}` : '';
    } else if (seasons?.length) {
      return `Season ${seasons[Math.min(idx, seasons.length - 1)]}`;
    }
    return '';
  }, [idx, weeklyFrames, seasons]);

  // Start a tween whenever idx / filters / mode change to a new target totals map
  useEffect(() => {
    if (!teamsUsed?.length) return;
    const frameCount = weeklyFrames?.length ? weeklyFrames.length : (seasons?.length || 0);
    if (frameCount === 0) return;

    const targetTotals = computeTotalsAtIndex(Math.min(idx, frameCount - 1));

    // If we don't have a previous totals, initialize prev=target and set t=1
    const havePrev = Object.keys(prevTotalsRef.current || {}).length > 0;
    if (!havePrev) {
      prevTotalsRef.current = { ...targetTotals };
      nextTotalsRef.current = { ...targetTotals };
      setTweenT(1);
      return;
    }

    // Set prev to current interpolated snapshot to avoid any jump, then tween to target
    const currentInterp = {};
    const prev = prevTotalsRef.current || {};
    const next = nextTotalsRef.current || targetTotals;
    const curT = tweenT;
    teamsUsed.forEach(t => {
      const id = t.user_id;
      const a = prev[id] ?? 0;
      const b = next[id] ?? 0;
      currentInterp[id] = a + (b - a) * curT;
    });
    prevTotalsRef.current = currentInterp;
    nextTotalsRef.current = { ...targetTotals };

    // Kick off tween
    cancelTween();
    const duration = Math.max(200, Math.floor(stepMs / (speed || 1)));
    tweenDurationRef.current = duration;
    tweenStartRef.current = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - tweenStartRef.current) / tweenDurationRef.current);
      setTweenT(t);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return cancelTween;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, teamsUsed, mode]);

  // Auto-advance timer (with 5s hold at end before loop restart)
  useEffect(() => {
    const frameCount = weeklyFrames?.length ? weeklyFrames.length : (seasons?.length || 0);
    if (!playing || frameCount === 0) return;
    const maxIdx = frameCount - 1;
    if (!loop && idx >= maxIdx) return; // stop at end when not looping

    const atEnd = idx >= maxIdx;
    const delay = atEnd && loop ? 5000 : Math.max(200, stepMs / (speed || 1));

    timerRef.current = setTimeout(() => {
      setIdx(prev => {
        const wasEnd = prev >= maxIdx;
        if (wasEnd) {
          return loop ? 0 : maxIdx;
        }
        return Math.min(prev + 1, maxIdx);
      });
    }, delay);
    return () => clearTimeout(timerRef.current);
  }, [playing, idx, seasons?.length, weeklyFrames?.length, stepMs, speed, loop]);

  function restart() {
    setIdx(0);
    setPlaying(true);
  }

  function jumpToEnd() {
    const maxIdx = weeklyFrames?.length ? weeklyFrames.length - 1 : (seasons?.length ? seasons.length - 1 : 0);
    setIdx(Math.max(0, maxIdx));
    setPlaying(false);
  }

  // Interpolated rows and max based on tweenT (defined before FLIP effect)
  const { interpRows, interpMax } = useMemo(() => {
    if (!teamsUsed?.length) return { interpRows: [], interpMax: 1 };
    const prev = prevTotalsRef.current || {};
    const next = nextTotalsRef.current || {};
    const all = teamsUsed.map(t => {
      const a = prev[t.user_id] ?? 0;
      const b = next[t.user_id] ?? 0;
      const value = a + (b - a) * tweenT;
      return {
        user_id: t.user_id,
        value,
        name: teamMap.get(t.user_id)?.display_name || t.user_id,
        avatar: teamMap.get(t.user_id)?.avatar || null,
      };
    });
    all.sort((a, b) => b.value - a.value);
    const limited = all.slice(0, Math.max(1, Math.min(topN, all.length)));
    const max = Math.max(1, ...limited.map(r => r.value));
    return { interpRows: limited, interpMax: max };
  }, [teamsUsed, teamMap, topN, tweenT]);

  // FLIP reordering animation, measured relative to list container to avoid scroll-induced jumps
  const rowRefs = useRef({});
  const listRef = useRef(null);
  const prevPositionsRef = useRef(null);
  useLayoutEffect(() => {
    // Measure new positions after render
    const positions = new Map();
    const containerTop = listRef.current?.getBoundingClientRect?.().top || 0;
    // Measure only visible/interpolated rows by id, relative to container top
    interpRows.forEach(r => {
      const el = rowRefs.current[r.user_id];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      positions.set(r.user_id, { top: rect.top - containerTop });
    });

    const prev = prevPositionsRef.current;
    if (prev) {
      positions.forEach((newBox, id) => {
        const prevBox = prev.get(id);
        const node = rowRefs.current[id];
        if (!node) return;

        if (prevBox) {
          const dy = (prevBox.top ?? 0) - (newBox.top ?? 0);
          if (dy) {
            node.style.transition = 'transform 0s, opacity 0s';
            node.style.transform = `translateY(${dy}px) translateZ(0)`;
            // double rAF to ensure the browser registers the initial transform
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                node.style.transition = 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms ease-out';
                node.style.transform = 'translateY(0) translateZ(0)';
                node.style.opacity = '1';
              });
            });
          }
        } else {
          // New row entering the topN: fade and slide in slightly
          node.style.transition = 'transform 0s, opacity 0s';
          node.style.transform = 'translateY(12px) translateZ(0)';
          node.style.opacity = '0';
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              node.style.transition = 'transform 500ms ease-out, opacity 500ms ease-out';
              node.style.transform = 'translateY(0) translateZ(0)';
              node.style.opacity = '1';
            });
          });
        }
      });
    }
    prevPositionsRef.current = positions;
  }, [interpRows]);

  

  return (
    <div className="bg-black/30 rounded-lg border border-white/10 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h3 className="text-xl md:text-2xl font-bold">All-Time Points Bar Chart Race</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="px-3 py-1 rounded bg-[#FF4B1F] text-white hover:bg-[#FF4B1F]/80"
            onClick={() => setPlaying(p => !p)}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            className="px-3 py-1 rounded bg-black/40 text-white/80 hover:bg-black/50 border border-white/10"
            onClick={restart}
          >
            Restart
          </button>
          <button
            className="px-3 py-1 rounded bg-black/40 text-white/80 hover:bg-black/50 border border-white/10"
            onClick={jumpToEnd}
          >
            Skip ➜
          </button>

          {/* Speed selector */}
          <div className="ml-2 flex items-center gap-1 text-sm">
            <span className="text-white/70 mr-1">Speed:</span>
            {[0.5, 1, 2].map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-1 rounded border ${speed === s ? 'bg-white/20 border-white/40' : 'bg-black/30 border-white/10 hover:bg-black/40'} text-white/90`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Mode selector */}
          <div className="ml-2 flex items-center gap-1 text-sm">
            <span className="text-white/70 mr-1">Mode:</span>
            {['all', 'season'].map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-1 rounded border capitalize ${mode === m ? 'bg-white/20 border-white/40' : 'bg-black/30 border-white/10 hover:bg-black/40'} text-white/90`}
              >
                {m === 'all' ? 'All-time' : 'Within-season'}
              </button>
            ))}
          </div>

          {/* Team filter toggle */}
          <button
            className="ml-2 px-3 py-1 rounded bg-black/40 text-white/80 hover:bg-black/50 border border-white/10"
            onClick={() => setShowFilter(v => !v)}
          >
            {showFilter ? 'Hide Filter' : 'Filter Teams'}
          </button>

          {/* Loop toggle */}
          <button
            className={`ml-2 px-3 py-1 rounded border ${loop ? 'bg-white/20 border-white/40' : 'bg-black/30 border-white/10 hover:bg-black/40'} text-white/90`}
            onClick={() => setLoop(v => !v)}
            title="Toggle looping playback"
          >
            Loop: {loop ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {/* Team filter panel */}
      {showFilter && (
        <div className="mb-3 p-3 bg-black/20 border border-white/10 rounded">
          <div className="flex flex-wrap gap-2">
            {teams.map(t => {
              const selected = selectedTeamIds.has(t.user_id);
              return (
                <button
                  key={t.user_id}
                  onClick={() => {
                    setSelectedTeamIds(prev => {
                      const next = new Set(prev);
                      if (next.has(t.user_id)) next.delete(t.user_id); else next.add(t.user_id);
                      return next;
                    });
                  }}
                  className={`px-2 py-1 rounded-full text-sm border ${selected ? 'bg-[#FF4B1F]/20 border-[#FF4B1F]/60' : 'bg-black/30 border-white/10 hover:bg-black/40'} text-white/90`}
                  title={t.display_name}
                >
                  {t.display_name}
                </button>
              );
            })}
          </div>
          {selectedTeamIds.size > 0 && (
            <div className="mt-2 text-xs text-white/60">{selectedTeamIds.size} selected</div>
          )}
        </div>
      )}

  <div className="text-white/70 mb-2">Through: <span className="text-white font-semibold">{label || '—'}</span></div>

      {/* Bars list container: fixed height and overflow hidden to prevent page scroll and jank */}
      <div
        ref={listRef}
        className="space-y-3 relative overflow-hidden"
        style={{
          // approximate stable height per row to avoid layout thrash
          height: `${Math.max(1, interpRows.length) * 48 + (Math.max(1, interpRows.length) - 1) * 12}px`,
        }}
      >
        {interpRows.map((r, i) => {
          const pct = interpMax > 0 ? (r.value / interpMax) * 100 : 0;
          const color = teamColorMap.get(r.user_id) || '#FF4B1F';
          const transitionMs = Math.max(200, Math.floor(stepMs / (speed || 1)));
          return (
            <div
              key={r.user_id}
              ref={el => { if (el) rowRefs.current[r.user_id] = el; }}
              data-user-id={r.user_id}
              className="flex items-center gap-3 will-change-transform h-12"
              style={{ transform: 'translateZ(0)' }}
            >
              <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center">
                {r.avatar ? (
                  <Image
                    src={`https://sleepercdn.com/avatars/${r.avatar}`}
                    alt={r.name}
                    width={32}
                    height={32}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    unoptimized={r.avatar?.startsWith?.('http')}
                  />
                ) : (
                  <span className="text-sm font-bold text-[#FF4B1F]">{r.name?.charAt?.(0) || '?'}</span>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">{i + 1}. {r.name}</span>
                  <span className="text-white/70">{isFinite(r.value) ? r.value.toFixed(1) : '0.0'}</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-5 rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: color, transition: `width ${transitionMs}ms linear` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="mt-4">
        <input
          type="range"
          min={0}
          max={Math.max(0, (weeklyFrames?.length ? weeklyFrames.length : seasons.length) - 1)}
          value={idx}
          onMouseDown={() => { setPlaying(false); if (timerRef.current) clearTimeout(timerRef.current); }}
          onTouchStart={() => { setPlaying(false); if (timerRef.current) clearTimeout(timerRef.current); }}
          onChange={(e) => { setPlaying(false); setIdx(parseInt(e.target.value)); }}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-white/50 mt-1">
          {weeklyFrames?.length ? (
            <>
              <span>
                {weeklyFrames[0] ? `S${weeklyFrames[0].season} W${weeklyFrames[0].week}` : ''}
              </span>
              <span>
                {weeklyFrames[weeklyFrames.length - 1] ? `S${weeklyFrames[weeklyFrames.length - 1].season} W${weeklyFrames[weeklyFrames.length - 1].week}` : ''}
              </span>
            </>
          ) : (
            <>
              <span>{seasons[0]}</span>
              <span>{seasons[seasons.length - 1]}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
