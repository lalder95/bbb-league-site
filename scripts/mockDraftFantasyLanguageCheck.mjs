// scripts/mockDraftFantasyLanguageCheck.mjs
// Quick regression check: ensure mock draft reasons don't contain real-football coaching phrases.
// Run with: node .\scripts\mockDraftFantasyLanguageCheck.mjs

const BANNED = [
  /balanced offense/i,
  /stretch the field/i,
  /receiver corps|receiving corps/i,
  /snap counts?/i,
  /special teams/i,
  /red[- ]zone packages?/i,
  /playbook/i,
  /scheme/i,
  /(offensive|defensive) coordinator/i,
  /route tree/i,
  /play[- ]calling/i,
  /gameplan/i,
  /two[- ]high/i,
  /cover\s*2/i,
];

/**
 * @param {string} reason
 */
function findHits(reason) {
  const hits = [];
  for (const rx of BANNED) {
    if (rx.test(reason)) hits.push(rx);
  }
  return hits;
}

// Sample strings (include the screenshot-like example)
const samples = [
  `At 2.02, Vikingsfan80 goes hunting, not shopping. Luther Burden is an exciting young wide receiver who can step in and make an immediate impact.
He adds depth to the receiving corps while also providing big-play potential. With a balanced offense, now's the time to grab someone who can stretch the field.
The only concern might be his consistency as a rookie, but the upside is undeniable.`,
  `Player X is a clean fantasy fit: stabilizes the WR room, gives weekly flex value early, and offers spike-week upside when the matchup breaks right.
The risk is the usual rookie volatility, but the roster can absorb it.`,
];

let failed = false;
for (const [i, s] of samples.entries()) {
  const hits = findHits(s);
  if (hits.length) {
    failed = true;
    console.error(`Sample ${i + 1} FAILED. Found banned phrase(s):`, hits.map(r => String(r)));
  } else {
    console.log(`Sample ${i + 1} OK.`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log('All samples OK.');
}
