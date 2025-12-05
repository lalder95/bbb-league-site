// scripts/generatePlayerPool.js
// Convert a KeepTradeCut rookies JSON export (playersArray) into public/data/player-pool.json
// Usage (PowerShell):
//   node scripts/generatePlayerPool.js "C:\path\to\rookie.json"
//   # or set KTC_ROOKIES_JSON env var
//   $env:KTC_ROOKIES_JSON = "C:\path\to\rookie.json"; node scripts/generatePlayerPool.js

import fs from 'fs';
import path from 'path';

function readInputJson(inputPath) {
  if (!inputPath) throw new Error('Input path is required. Provide a path or set KTC_ROOKIES_JSON.');
  if (!fs.existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);
  const raw = fs.readFileSync(inputPath, 'utf-8');
  let json;
  try { json = JSON.parse(raw); } catch (e) {
    throw new Error('Failed to parse input JSON: ' + e.message);
  }
  if (!Array.isArray(json)) throw new Error('Expected an array (playersArray) at root of input JSON.');
  return json;
}

function normalizeKTCPlayers(players) {
  // KTC rookie playersArray objects commonly include: playerID, display_name, position, value, rank, etc.
  // We map to { id, name, position, rank, value }
  const out = players.map((p, idx) => ({
    id: String(p.playerID ?? p.id ?? ('ktc_' + (idx + 1))),
    name: String(p.display_name ?? p.name ?? 'Unknown Player'),
    position: String(p.position ?? p.pos ?? 'WR').toUpperCase(),
    rank: Number(p.rank ?? p.positionalRank ?? idx + 1),
    value: Number(p.value ?? p.ktc_value ?? p.superflexValue ?? 0),
  }))
  .filter(p => p.name && p.position && Number.isFinite(p.rank))
  .sort((a, b) => a.rank - b.rank);

  if (out.length === 0) throw new Error('No valid players found in input JSON.');
  return out;
}

function writePoolJson(players) {
  const outPath = path.join(process.cwd(), 'public', 'data', 'player-pool.json');
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(players, null, 2), 'utf-8');
  return outPath;
}

function main() {
  try {
    const inputArg = process.argv[2] || process.env.KTC_ROOKIES_JSON;
    const playersArray = readInputJson(inputArg);
    const pool = normalizeKTCPlayers(playersArray);
    const outPath = writePoolJson(pool);
    console.log(`Player pool written: ${outPath}`);
    console.log(`Count: ${pool.length}`);
  } catch (e) {
    console.error('Error generating player pool:', e.message);
    process.exit(1);
  }
}

main();
