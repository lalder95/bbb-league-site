// scripts/sampleMockHooks.mjs
// Samples hook variety deterministically (no network calls).

import { createRng, buildPickLeadIn } from '../src/utils/mockDraftVoice.js';

const rng = createRng({ seed: 20251222, salt: 'hook-sample' });
const recent = [];

const teams = ['JoshStorm', 'tylercrain', 'jwalwer81', 'Vikingsfan80', 'EthanL21', 'Schoontang'];
const positions = ['QB', 'RB', 'WR', 'TE'];

const hooks = [];
for (let i = 1; i <= 60; i++) {
  const pickNumber = `1.${String(i % 12 === 0 ? 12 : i % 12).padStart(2, '0')}`;
  const teamName = teams[i % teams.length];
  const position = positions[i % positions.length];
  const raw = buildPickLeadIn({ pickNumber, teamName, position, rng, recent });
  recent.push(raw);
  const lead = String(raw).includes('|') ? String(raw).split('|').slice(1).join('|') : String(raw);
  hooks.push(lead);
}

const counts = new Map();
for (const h of hooks) counts.set(h, (counts.get(h) || 0) + 1);
const repeats = [...counts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);

console.log('Sample hooks (first 20):');
for (const h of hooks.slice(0, 20)) console.log('-', h);
console.log('\nTotal:', hooks.length);
console.log('Unique:', counts.size);
console.log('Repeated entries:', repeats.length);
if (repeats.length) {
  console.log('Top repeats:', repeats.slice(0, 10));
}
