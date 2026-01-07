// scripts/bbbContractsNeedsSanity.mjs
// Sanity-check: parse BBB_Contracts.csv, filter Active, group by team+position, and compute KTC-based ranks.
// Usage (optional): node .\\scripts\\bbbContractsNeedsSanity.mjs C:\\Users\\<you>\\Downloads\\BBB_Contracts.csv

import fs from 'node:fs';
import path from 'node:path';
import { parseBBBContractsCsv, buildTeamNeeds } from '../src/utils/teamNeedsUtils.js';

const csvPath = process.argv[2];
if (!csvPath) {
  console.log('No CSV path provided; exiting. (This script is for local validation.)');
  process.exit(0);
}

const abs = path.resolve(csvPath);
const csvText = fs.readFileSync(abs, 'utf8');
const active = parseBBBContractsCsv(csvText);

console.log('Active rows parsed:', active.length);

const teamNames = Array.from(new Set(active.map(r => r.teamName))).filter(Boolean);
console.log('Teams found:', teamNames.length);

const needs = buildTeamNeeds({ activeContracts: active, teamNames });

// Print top/bottom for WR as a quick check
const sortedWr = needs.teams
  .map(t => ({ team: t.teamName, rank: t.positions.WR.rank, totalKtc: t.positions.WR.totalKtc, count: t.positions.WR.count }))
  .sort((a, b) => a.rank - b.rank);

console.log('WR top 3:', sortedWr.slice(0, 3));
console.log('WR bottom 3:', sortedWr.slice(-3));
