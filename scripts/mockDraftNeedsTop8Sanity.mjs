// scripts/mockDraftNeedsTop8Sanity.mjs
// Sanity-check: needs weighting stays within top-8 window and can change ordering.
// Run with: node .\\scripts\\mockDraftNeedsTop8Sanity.mjs

import { pickWindowScore } from '../src/utils/teamNeedsUtils.js';

const window = [
  { name: 'Player A', position: 'QB', rank: 1 },
  { name: 'Player B', position: 'RB', rank: 2 },
  { name: 'Player C', position: 'WR', rank: 3 },
  { name: 'Player D', position: 'TE', rank: 4 },
  { name: 'Player E', position: 'WR', rank: 5 },
  { name: 'Player F', position: 'RB', rank: 6 },
  { name: 'Player G', position: 'QB', rank: 7 },
  { name: 'Player H', position: 'TE', rank: 8 },
];

// Case: WR is a big need, so WR candidates can jump ahead within the window.
const needWeights = { QB: 0.55, RB: 0.85, WR: 1.70, TE: 0.80 };

let best = null;
for (const cand of window) {
  const w = needWeights[cand.position] ?? 1.0;
  const score = pickWindowScore({ candidate: cand, needWeight: w });
  if (!best || score > best.score) best = { name: cand.name, score, pos: cand.position };
}

console.log('Best in top-8 window:', best);

if (best.name !== 'Player C') {
  console.error('FAIL: expected needs weighting to favor the WR (Player C) in this fixture');
  process.exitCode = 1;
}

if (!window.map(x => x.name).includes(best.name)) {
  console.error('FAIL: selected player not in top-8 window');
  process.exitCode = 1;
}

// Assert that if all weights = 1, BPA is rank 1.
let bestBpa = null;
for (const cand of window) {
  const score = pickWindowScore({ candidate: cand, needWeight: 1.0 });
  if (!bestBpa || score > bestBpa.score) bestBpa = { name: cand.name, score, pos: cand.position };
}

console.log('BPA baseline:', bestBpa);
if (bestBpa.name !== 'Player A') {
  console.error('FAIL: BPA baseline should select rank 1');
  process.exitCode = 1;
}
