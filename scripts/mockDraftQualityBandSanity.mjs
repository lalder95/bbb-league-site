// scripts/mockDraftQualityBandSanity.mjs
// Sanity-check the quality band helper and reason templates for early vs late rounds.
// Run with: node .\\scripts\\mockDraftQualityBandSanity.mjs

import { createRng, buildReasonTemplate } from '../src/utils/mockDraftVoice.js';

function qualityBandForRound(round) {
  const r = Number(round) || 1;
  if (r === 1) return { band: 'blue-chip', guidance: 'Round 1 talent.' };
  if (r === 2 || r === 3) return { band: 'solid contributor / rotation', guidance: 'Rounds 2–3 talent.' };
  if (r === 4 || r === 5) return { band: 'depth/upside', guidance: 'Rounds 4–5 talent.' };
  return { band: 'dart throw', guidance: 'Rounds 6+ talent.' };
}

const rng = createRng({ seed: 12345, salt: 'quality-band-sanity' });

const early = buildReasonTemplate({ rng, position: 'WR', quality: qualityBandForRound(1) });
const late = buildReasonTemplate({ rng, position: 'WR', quality: qualityBandForRound(7) });

console.log('EARLY TEMPLATE:\n', early, '\n');
console.log('LATE TEMPLATE:\n', late, '\n');

if (!/late-round talent/i.test(late) || !/dart throw|bench\/depth\/stash/i.test(late)) {
  console.error('FAIL: Late-round template does not include late-round guidance.');
  process.exitCode = 1;
} else {
  console.log('OK: Late-round template includes appropriate guidance.');
}
