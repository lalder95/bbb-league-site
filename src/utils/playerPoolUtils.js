// src/utils/playerPoolUtils.js

import fs from 'fs';
import path from 'path';

/**
 * Load a player pool from public/data/player-pool.json if present.
 * Falls back to a small built-in sample so the generator can run in dev.
 * Shape: { id, name, position, rank, value }
 */
export function loadPlayerPool() {
  // Resolve to Next.js project root public folder at runtime
  const root = process.cwd();
  const file = path.join(root, 'public', 'data', 'player-pool.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Player pool file not found at ${file}`);
  }
  const raw = fs.readFileSync(file, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error('Player pool JSON parse error');
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Player pool is empty or invalid');
  }
  return normalizePool(data);
}

function normalizePool(arr) {
  return arr
    .filter(Boolean)
    .map((p, idx) => ({
      id: String(p.id ?? idx + 1),
      name: String(p.name ?? p.player ?? 'Unknown Player'),
      position: String(p.position ?? p.pos ?? 'WR').toUpperCase(),
      rank: Number(p.rank ?? idx + 1),
      value: Number(p.value ?? p.ktc ?? Math.max(1, 100 - idx)),
    }))
    // sort ascending rank
    .sort((a, b) => a.rank - b.rank);
}

// No built-in sample pool; caller must supply a valid JSON file.

/** Utility to remove a player from the pool by name */
export function popPlayerByName(pool, name) {
  const idx = pool.findIndex(p => p.name.toLowerCase() === String(name).toLowerCase());
  if (idx === -1) return { picked: null, nextPool: pool };
  const [picked] = pool.splice(idx, 1);
  return { picked, nextPool: pool };
}
