// scripts/quickMockVoiceSanity.mjs
// Sanity check for the mock draft voice helpers (no network calls).

import {
  createRng,
  buildArticleIntro,
  buildRoundIntro,
  buildPickLeadIn,
  buildPickCoda,
  buildStyleToken,
  buildReasonTemplate,
} from '../src/utils/mockDraftVoice.js';

const rng = createRng({ seed: 12345, salt: 'sanity' });

const intro = buildArticleIntro({ title: 'Test Mock', leagueName: 'Budget Blitz Bowl', rng });
const r1 = buildRoundIntro({ round: 1, rng });
const lead = buildPickLeadIn({ pickNumber: '1.01', teamName: 'Team Example', position: 'WR', rng });
const coda = buildPickCoda({ rng });
const style = buildStyleToken({ rng });
const template = buildReasonTemplate({ rng, position: 'WR' });

const out = { intro, r1, lead, coda, style, template };

for (const [k, v] of Object.entries(out)) {
  if (typeof v !== 'string') {
    throw new Error(`Expected string for ${k}`);
  }
  // coda is intentionally optional (can be empty)
  if (k !== 'coda' && v.trim().length === 0) {
    throw new Error(`Expected non-empty string for ${k}`);
  }
}

// Determinism check
// Re-run the exact same sequence of calls with a fresh RNG.
const rng2 = createRng({ seed: 12345, salt: 'sanity' });
buildArticleIntro({ title: 'Test Mock', leagueName: 'Budget Blitz Bowl', rng: rng2 });
buildRoundIntro({ round: 1, rng: rng2 });
const lead2 = buildPickLeadIn({ pickNumber: '1.01', teamName: 'Team Example', position: 'WR', rng: rng2 });
if (lead2 !== lead) {
  throw new Error('Determinism check failed (lead-in differs)');
}

console.log('OK', out);
