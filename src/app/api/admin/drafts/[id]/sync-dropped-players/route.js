import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const USER_ID = '456973480269705216';

async function detectBBBLeagueId() {
  const seasonRes = await fetch('https://api.sleeper.app/v1/state/nfl', { cache: 'no-store' });
  if (!seasonRes.ok) throw new Error('Failed to fetch NFL state from Sleeper.');
  const { season: currentSeason } = await seasonRes.json();

  const isBBB = (name) => {
    if (!name) return false;
    const lower = name.toLowerCase();
    return lower.includes('budget blitz bowl') || lower.includes('bbb') || (lower.includes('budget') && lower.includes('blitz'));
  };

  const fetchLeagues = async (season) => {
    const res = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${season}`, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  };

  let leagues = await fetchLeagues(currentSeason);
  let bbbLeagues = leagues.filter(l => isBBB(l.name));

  if (bbbLeagues.length === 0) {
    const prev = await fetchLeagues(String(Number(currentSeason) - 1));
    bbbLeagues = prev.filter(l => isBBB(l.name));
    if (bbbLeagues.length === 0 && leagues.length > 0) bbbLeagues = [leagues[0]];
  }

  if (bbbLeagues.length === 0) throw new Error('Could not auto-detect BBB Sleeper league ID.');
  return bbbLeagues.sort((a, b) => Number(b.season) - Number(a.season))[0].league_id;
}

const playerSchema = new mongoose.Schema({
  playerId: Number,
  playerName: String,
  position: String,
  ktc: { type: String, default: '' },
  status: { type: String, enum: ['ACTIVE', 'UPCOMING', 'FINAL'], default: 'UPCOMING' },
  startDelay: { type: Number, default: 0 }
});

const draftSchema = new mongoose.Schema({
  draftId: Number,
  startDate: String,
  endDate: String,
  timeZone: String,
  state: String,
  nomDuration: Number,
  users: [{ username: String }],
  players: [playerSchema],
  results: [mongoose.Schema.Types.Mixed],
  bidLog: [mongoose.Schema.Types.Mixed],
  blind: { type: Boolean, default: false },
  lastBidFloorEnabled: { type: Boolean, default: true },
  lastBidFloorHours: { type: Number, default: 24 },
  autoAddDropped: { type: Boolean, default: false },
  sleeperLeagueId: { type: String, default: '' }
});

const Draft = mongoose.models.Draft || mongoose.model('Draft', draftSchema);

export async function POST(request, { params }) {
  try {
    await dbConnect();
    const { id } = params;

    const draft = await Draft.findById(id);
    if (!draft) {
      return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
    }

    if (!draft.autoAddDropped) {
      return NextResponse.json({ message: 'Auto-add dropped players is disabled for this draft.', added: 0 });
    }

    // Auto-detect the Sleeper league ID if not stored on the draft
    let leagueId = draft.sleeperLeagueId;
    if (!leagueId) {
      leagueId = await detectBBBLeagueId();
      // Persist it for future calls
      await Draft.findByIdAndUpdate(id, { sleeperLeagueId: leagueId });
    }

    const auctionStartMs = new Date(draft.startDate).getTime();
    if (Number.isNaN(auctionStartMs)) {
      return NextResponse.json({ error: 'Draft has an invalid startDate.' }, { status: 400 });
    }

    // Get current NFL state to know which weeks to scan
    const nflStateRes = await fetch('https://api.sleeper.app/v1/state/nfl', { cache: 'no-store' });
    if (!nflStateRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch NFL state from Sleeper.' }, { status: 502 });
    }
    const nflState = await nflStateRes.json();
    const currentWeek = Math.min(Number(nflState.week) || 1, 18);

    // Collect all dropped player IDs from transactions at or after auction start
    const droppedPlayerIds = new Set();
    for (let week = 1; week <= currentWeek; week++) {
      let txRes;
      try {
        txRes = await fetch(
          `https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`,
          { cache: 'no-store' }
        );
      } catch {
        continue;
      }
      if (!txRes.ok) continue;

      let transactions;
      try {
        transactions = await txRes.json();
      } catch {
        continue;
      }

      if (!Array.isArray(transactions)) continue;

      for (const tx of transactions) {
        const txType = String(tx.type || '').toLowerCase();
        if (txType !== 'waiver' && txType !== 'free_agent') continue;

        // Sleeper timestamps are in milliseconds
        const txCreated = Number(tx.created || tx.status_updated || 0);
        if (txCreated > 0 && txCreated < auctionStartMs) continue;

        if (tx.drops && typeof tx.drops === 'object') {
          for (const playerId of Object.keys(tx.drops)) {
            droppedPlayerIds.add(String(playerId));
          }
        }
      }
    }

    if (droppedPlayerIds.size === 0) {
      return NextResponse.json({ message: 'No dropped players found since auction start.', added: 0 });
    }

    // Filter out players already in the draft
    const existingPlayerIds = new Set((draft.players || []).map(p => String(p.playerId)));
    const newPlayerIds = Array.from(droppedPlayerIds).filter(id => !existingPlayerIds.has(id));

    if (newPlayerIds.length === 0) {
      return NextResponse.json({ message: 'All dropped players are already in the draft.', added: 0 });
    }

    // Load the player pool to enrich metadata
    let playerPool = [];
    try {
      const poolPath = path.join(process.cwd(), 'public', 'data', 'player-pool.json');
      const raw = fs.readFileSync(poolPath, 'utf-8');
      playerPool = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Could not read player pool data.' }, { status: 500 });
    }

    const poolById = new Map(playerPool.map(p => [String(p.playerId), p]));

    const playersToAdd = [];
    for (const pid of newPlayerIds) {
      const poolPlayer = poolById.get(pid);
      if (!poolPlayer) continue; // skip unknown player IDs
      playersToAdd.push({
        playerId: Number(pid),
        playerName: poolPlayer.playerName || poolPlayer.full_name || pid,
        position: poolPlayer.position || '',
        ktc: String(poolPlayer.ktc || ''),
        status: 'UPCOMING',
        startDelay: 0
      });
    }

    if (playersToAdd.length === 0) {
      return NextResponse.json({ message: 'Dropped players not found in player pool.', added: 0 });
    }

    const updatedDraft = await Draft.findByIdAndUpdate(
      id,
      { $push: { players: { $each: playersToAdd } } },
      { new: true }
    );

    return NextResponse.json({ message: `Added ${playersToAdd.length} player(s).`, added: playersToAdd.length, draft: updatedDraft });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
