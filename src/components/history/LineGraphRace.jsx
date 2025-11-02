'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * LineGraphRace - Animated cumulative points lines over time
 *
 * Props:
 * - weeklyFrames: Array<{ season:number, week:number, perUser: { [userId]: number } }>
 * - teams: Array<{ user_id: string, display_name: string, avatar?: string }>
 * - topN?: number (default 8)
 * - stepMs?: number (default 1200)
 */
export default function LineGraphRace({
  weeklyFrames = [],
  teams = [],
  topN = undefined, // ignored; we show all teams by default
  stepMs = 1200,
}) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const timerRef = useRef(null);
  const [mode, setMode] = useState('all'); // 'all' | 'season'
  const [showFilter, setShowFilter] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState(() => new Set());

  // tween state (0..1) between idx-1 and idx
  const [tweenT, setTweenT] = useState(1);
  const rafRef = useRef(null);
  const tweenStartRef = useRef(0);
  const tweenDurationRef = useRef(700);

  function cancelTween() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  // Map for team meta and stable colors
  const teamMap = useMemo(() => {
    const map = new Map();
    teams.forEach(t => map.set(t.user_id, t));
    return map;
  }, [teams]);

  const colorMap = useMemo(() => {
    const palette = [
      '#FF4B1F', '#3b82f6', '#22c55e', '#a855f7', '#eab308',
      '#ec4899', '#14b8a6', '#f97316', '#64748b', '#8b5cf6',
      '#10b981', '#ef4444', '#06b6d4', '#84cc16', '#f59e0b',
    ];
    const map = new Map();
    teams.forEach((t, i) => map.set(t.user_id, palette[i % palette.length]));
    return map;
  }, [teams]);

  const teamsUsed = useMemo(() => {
    if (!selectedTeamIds || selectedTeamIds.size === 0) return teams;
    return teams.filter(t => selectedTeamIds.has(t.user_id));
  }, [teams, selectedTeamIds]);

  // Build a flat list of cumulative totals per team at each frame index
  const cumulativeByTeam = useMemo(() => {
    const totals = new Map();
    teams.forEach(t => totals.set(t.user_id, []));
    const running = new Map();
    teams.forEach(t => running.set(t.user_id, 0));
    weeklyFrames.forEach((frame, i) => {
      const per = frame?.perUser || {};
      teams.forEach(t => {
        const inc = Number(per[t.user_id]) || 0;
        const prev = running.get(t.user_id) || 0;
        const next = prev + inc;
        running.set(t.user_id, next);
        totals.get(t.user_id).push(next);
      });
    });
    return totals; // Map user_id -> number[] length = weeklyFrames.length
  }, [weeklyFrames, teams]);

  // Helpers for season-bound calculations
  const seasonStartIdx = useMemo(() => {
    if (!weeklyFrames.length) return 0;
    const at = Math.min(idx, weeklyFrames.length - 1);
    const curSeason = weeklyFrames[at]?.season;
    if (!curSeason) return 0;
    let j = at;
    while (j > 0 && weeklyFrames[j - 1]?.season === curSeason) j--;
    return mode === 'season' ? j : 0;
  }, [weeklyFrames, idx, mode]);

  // Fixed season end index to keep X scale stable within a season
  const seasonEndIdx = useMemo(() => {
    if (!weeklyFrames.length) return 0;
    const at = Math.min(idx, weeklyFrames.length - 1);
    if (mode !== 'season') return weeklyFrames.length - 1;
    const curSeason = weeklyFrames[at]?.season;
    if (!curSeason) return weeklyFrames.length - 1;
    let k = at;
    while (k < weeklyFrames.length - 1 && weeklyFrames[k + 1]?.season === curSeason) k++;
    return k;
  }, [weeklyFrames, idx, mode]);

  // Determine current ranks and visible team ids
  const { visibleTeamIds, sortedNow } = useMemo(() => {
    if (!weeklyFrames.length || teamsUsed.length === 0) return { visibleTeamIds: [], sortedNow: [] };
    const at = Math.min(idx, weeklyFrames.length - 1);
    const startIdx = seasonStartIdx;
    const entries = teamsUsed.map(t => {
      const arr = cumulativeByTeam.get(t.user_id) || [];
      const baseline = startIdx > 0 ? (arr[startIdx - 1] || 0) : 0;
      const base = arr[at - 1] || baseline;
      const inc = (weeklyFrames[at]?.perUser?.[t.user_id] || 0);
      const val = (base + inc * tweenT) - baseline; // interpolated, baseline-adjusted
      return { id: t.user_id, val };
    });
    entries.sort((a, b) => b.val - a.val);
    const vis = entries.map(e => e.id); // show all by default
    return { visibleTeamIds: vis, sortedNow: entries };
  }, [teamsUsed, weeklyFrames, cumulativeByTeam, idx, tweenT, seasonStartIdx]);

  // Auto-advance frames
  useEffect(() => {
    const frameCount = weeklyFrames.length;
    if (!playing || frameCount === 0) return;
    const maxIdx = frameCount - 1;
    if (!loop && idx >= maxIdx) return;

    // schedule index hops
    const atEnd = idx >= maxIdx;
    const delay = atEnd && loop ? 5000 : Math.max(200, stepMs / (speed || 1));
    timerRef.current = setTimeout(() => {
      setIdx(prev => prev >= maxIdx ? (loop ? 0 : maxIdx) : Math.min(prev + 1, maxIdx));
    }, delay);
    return () => clearTimeout(timerRef.current);
  }, [playing, idx, weeklyFrames.length, stepMs, speed, loop]);

  // Tween between frames whenever idx changes
  useEffect(() => {
    cancelTween();
    const duration = Math.max(200, Math.floor(stepMs / (speed || 1)));
    tweenDurationRef.current = duration;
    tweenStartRef.current = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - tweenStartRef.current) / tweenDurationRef.current);
      setTweenT(t);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    setTweenT(0);
    rafRef.current = requestAnimationFrame(tick);
    return cancelTween;
  }, [idx, stepMs, speed]);

  // Layout config
  const width = 960; // will scale via viewBox in SVG
  const height = 390; // increased by 50% from 260 -> 390
  const margin = { top: 16, right: 24, bottom: 28, left: 40 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // X scale: 0..(idx+tweenT)
  const xMaxIndex = Math.max(1, idx + tweenT);
  const xForIndex = (i) => {
    const denom = Math.max(1e-6, weeklyFrames.length - 1);
    return margin.left + (innerW * ((i) / denom));
  };

  // Dynamic Y range: 10% above highest, 10% below 12th place (or last team if < 12)
  const { yMin, yMax } = useMemo(() => {
    if (!sortedNow.length) return { yMin: 0, yMax: 1 };
    const topVal = sortedNow[0]?.val ?? 1;
    const idx12 = Math.min(11, sortedNow.length - 1);
    const twelfthVal = sortedNow[idx12]?.val ?? 0;
    let max = topVal * 1.1;
    let min = twelfthVal * 0.9;
    if (max - min < 1) {
      // ensure non-zero range
      const mid = (max + min) / 2;
      max = mid + 0.5;
      min = mid - 0.5;
    }
    return { yMin: Math.max(0, min), yMax: Math.max(min + 1e-6, max) };
  }, [sortedNow]);

  const yForValue = (v) => {
    const min = yMin;
    const max = yMax;
    const t = (v - min) / Math.max(1e-6, max - min);
    return margin.top + innerH - (innerH * t);
  };

  const label = useMemo(() => {
    const at = Math.min(idx, weeklyFrames.length - 1);
    const f = weeklyFrames[at];
    return f ? `Season ${f.season} — Week ${f.week}` : '';
  }, [weeklyFrames, idx]);

  return (
    <div className="bg-black/30 rounded-lg border border-white/10 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h3 className="text-xl md:text-2xl font-bold">All-Time Points Line Race</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="px-3 py-1 rounded bg-[#FF4B1F] text-white hover:bg-[#FF4B1F]/80"
            onClick={() => setPlaying(p => !p)}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            className="px-3 py-1 rounded bg-black/40 text-white/80 hover:bg-black/50 border border-white/10"
            onClick={() => { setIdx(Math.max(0, 0)); setPlaying(true); }}
          >
            Restart
          </button>
          <button
            className="px-3 py-1 rounded bg-black/40 text-white/80 hover:bg-black/50 border border-white/10"
            onClick={() => { setIdx(Math.max(0, weeklyFrames.length - 1)); setPlaying(false); }}
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

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[390px]">
          {/* axes */}
          <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + innerH} stroke="rgba(255,255,255,0.2)" />
          <line x1={margin.left} y1={margin.top + innerH} x2={margin.left + innerW} y2={margin.top + innerH} stroke="rgba(255,255,255,0.2)" />

          {/* lines + avatars */}
          {visibleTeamIds.map((id) => {
            const color = colorMap.get(id) || '#FF4B1F';
            const arr = cumulativeByTeam.get(id) || [];
            const at = Math.min(idx, weeklyFrames.length - 1);
            const startIdx = seasonStartIdx;
            const endIdx = seasonEndIdx;
            const denom = Math.max(1, endIdx - startIdx);
            const baseline = startIdx > 0 ? (arr[startIdx - 1] || 0) : 0;
            const pts = [];
            for (let j = startIdx; j < at; j++) {
              const x = margin.left + (innerW * ((j - startIdx) / denom));
              const y = yForValue((arr[j] || 0) - baseline);
              pts.push([x, y]);
            }
            if (weeklyFrames.length > 0) {
              const base = (arr[at - 1] || baseline);
              const inc = (weeklyFrames[at]?.perUser?.[id] || 0);
              const yVal = (base + inc * tweenT) - baseline; // interpolated end (baseline adjusted)
              const ratio = Math.max(0, Math.min(1, ((at - 1 + tweenT) - startIdx) / denom));
              const x = margin.left + (innerW * ratio);
              const y = yForValue(yVal);
              pts.push([x, y]);
              // Avatar at the end point
              const team = teamMap.get(id);
              const r = 9;
              const clipId = `clip-${id}`;
              // Render path then marker group
              const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
              return (
                <g key={id}>
                  <path d={d} fill="none" stroke={color} strokeWidth={2.5} />
                  <defs>
                    <clipPath id={clipId}>
                      <circle cx={x} cy={y} r={r} />
                    </clipPath>
                  </defs>
                  {team?.avatar ? (
                    <image href={`https://sleepercdn.com/avatars/${team.avatar}`}
                           x={x - r} y={y - r} width={2*r} height={2*r}
                           clipPath={`url(#${clipId})`} />
                  ) : (
                    <g>
                      <circle cx={x} cy={y} r={r} fill={color} />
                      <text x={x} y={y} fill="#000" fontSize="10" fontWeight="700" textAnchor="middle" dominantBaseline="central">
                        {(team?.display_name || id).charAt(0)}
                      </text>
                    </g>
                  )}
                </g>
              );
            }
            const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
            return <path key={id} d={d} fill="none" stroke={color} strokeWidth={2.5} />;
          })}

          {/* y-axis labels (5 ticks over dynamic range) */}
          {Array.from({ length: 5 }).map((_, i) => {
            const fr = i / 4;
            const v = yMin + (yMax - yMin) * fr;
            const y = yForValue(v);
            return (
              <g key={i}>
                <line x1={margin.left} x2={margin.left + innerW} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />
                <text x={margin.left - 8} y={y} fill="rgba(255,255,255,0.6)" fontSize="10" textAnchor="end" dominantBaseline="middle">
                  {v.toFixed(0)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend with stable ordering (original teams order), filtered to visible */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {teamsUsed
          .map(t => t.user_id)
          .filter(id => visibleTeamIds.includes(id))
          .map(id => (
            <div key={id} className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: colorMap.get(id) || '#FF4B1F' }} />
              <span className="text-white/80">{teamMap.get(id)?.display_name || id}</span>
            </div>
          ))}
      </div>

      {/* Timeline */}
      <div className="mt-4">
        <input
          type="range"
          min={0}
          max={Math.max(0, weeklyFrames.length - 1)}
          value={idx}
          onMouseDown={() => { setPlaying(false); if (timerRef.current) clearTimeout(timerRef.current); }}
          onTouchStart={() => { setPlaying(false); if (timerRef.current) clearTimeout(timerRef.current); }}
          onChange={(e) => { setPlaying(false); setIdx(parseInt(e.target.value)); }}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-white/50 mt-1">
          <span>{weeklyFrames[0] ? `S${weeklyFrames[0].season} W${weeklyFrames[0].week}` : ''}</span>
          <span>{weeklyFrames[weeklyFrames.length - 1] ? `S${weeklyFrames[weeklyFrames.length - 1].season} W${weeklyFrames[weeklyFrames.length - 1].week}` : ''}</span>
        </div>
      </div>
    </div>
  );
}
