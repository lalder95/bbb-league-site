// scripts/mockDraftQualitySpectrumSanity.mjs
// Sanity-check the smooth quality spectrum behavior.
// Run with: node .\\scripts\\mockDraftQualitySpectrumSanity.mjs

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function qualitySpectrumForPick(pickIndex, maxBlueChipPicks = 40) {
  const i = Math.max(0, Number(pickIndex) || 0);
  const t = clamp01(i / Math.max(1, Number(maxBlueChipPicks) || 40));

  let band;
  if (t <= 0.12) band = 'blue-chip';
  else if (t <= 0.30) band = 'high-end starter';
  else if (t <= 0.55) band = 'solid contributor';
  else if (t <= 0.78) band = 'depth/upside';
  else band = 'dart throw';

  return { t, band, slider: `Blue Chip ${Math.round((1 - t) * 100)}% ~ Dart Throw ${Math.round(t * 100)}%` };
}

const cases = [
  { pick: 0, expect: 'blue-chip' },
  { pick: 5, expectOneOf: ['blue-chip', 'high-end starter'] },
  { pick: 15, expectOneOf: ['high-end starter', 'solid contributor'] },
  { pick: 30, expectOneOf: ['solid contributor', 'depth/upside'] },
  { pick: 40, expect: 'dart throw' },
  { pick: 60, expect: 'dart throw' },
];

let failed = false;
for (const c of cases) {
  const q = qualitySpectrumForPick(c.pick, 40);
  console.log(`pick ${String(c.pick).padStart(2, ' ')} => t=${q.t.toFixed(2)} band=${q.band} (${q.slider})`);
  if (c.expect && q.band !== c.expect) {
    console.error(`  FAIL: expected ${c.expect}`);
    failed = true;
  }
  if (c.expectOneOf && !c.expectOneOf.includes(q.band)) {
    console.error(`  FAIL: expected one of ${c.expectOneOf.join(', ')}`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
