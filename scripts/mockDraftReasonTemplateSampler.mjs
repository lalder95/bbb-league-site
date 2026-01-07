// scripts/mockDraftReasonTemplateSampler.mjs
// Samples buildReasonTemplate many times and reports uniqueness and repeat streaks.
// Intended to be run locally: node scripts/mockDraftReasonTemplateSampler.mjs

import { createRng, buildReasonTemplate } from '../src/utils/mockDraftVoice.js';

function makeQuality(band) {
  return { band };
}

function maxRepeatStreak(arr) {
  let best = 1;
  let cur = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === arr[i - 1]) {
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 1;
    }
  }
  return best;
}

function sample({ seed = 'sampler', position = 'WR', band = 'depth/upside', n = 5000 }) {
  const rng = createRng({ seed, salt: `reason|${position}|${band}` });
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(buildReasonTemplate({ rng, position, quality: makeQuality(band), recent: [], window: 1 }));
  }

  const counts = new Map();
  for (const t of out) counts.set(t, (counts.get(t) || 0) + 1);

  const unique = counts.size;
  const mostCommon = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tpl, c]) => ({ count: c, template: tpl }))
    .map(({ count, template }) => ({
      count,
      template: template.length > 140 ? `${template.slice(0, 140)}…` : template,
    }));

  return {
    seed,
    position,
    band,
    n,
    unique,
    uniquePct: Number(((unique / n) * 100).toFixed(2)),
    maxRepeatStreak: maxRepeatStreak(out),
    mostCommon,
  };
}

function sampleNonRepeating({ seed = 'sampler', position = 'WR', band = 'depth/upside', n = 5000, window = 8 }) {
  const rng = createRng({ seed, salt: `reason-nr|${position}|${band}|w${window}` });
  const recent = [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = buildReasonTemplate({ rng, position, quality: makeQuality(band), recent, window });
    out.push(t);
    recent.push(t);
  }

  const counts = new Map();
  for (const t of out) counts.set(t, (counts.get(t) || 0) + 1);

  return {
    seed,
    position,
    band,
    n,
    window,
    unique: counts.size,
    uniquePct: Number(((counts.size / n) * 100).toFixed(2)),
    maxRepeatStreak: maxRepeatStreak(out),
  };
}

const runs = [
  { seed: 'bbb', position: 'QB', band: 'blue-chip', n: 5000 },
  { seed: 'bbb', position: 'RB', band: 'high-end starter', n: 5000 },
  { seed: 'bbb', position: 'WR', band: 'solid contributor', n: 5000 },
  { seed: 'bbb', position: 'TE', band: 'depth/upside', n: 5000 },
  { seed: 'bbb', position: 'WR', band: 'dart throw', n: 5000 },
];

const results = runs.map(sample);
const nonRepeating = runs.map(r => sampleNonRepeating({ ...r, window: 8 }));
console.log(JSON.stringify({ results, nonRepeating }, null, 2));
