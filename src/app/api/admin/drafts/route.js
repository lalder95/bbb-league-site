import dbConnect from '@/lib/dbConnect';
import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema({
  playerId: Number,
  playerName: String,
  position: String,
  ktc: { type: String, default: '' },
  status: { type: String, enum: ['ACTIVE', 'UPCOMING', 'FINAL'], default: 'UPCOMING' },
  startDelay: { type: Number, default: 504 }
});

const draftSchema = new mongoose.Schema({
  draftId: Number,
  startDate: String,
  state: String,
  nomDuration: Number,
  users: [{ username: String }],
  players: [playerSchema],
  results: [{
    username: String,
    playerId: Number,
    salary: Number,
    years: Number,
    contractPoints: Number,
    state: String,
    expiration: String
  }],
  bidLog: [{
    username: String,
    playerId: Number,
    salary: Number,
    years: Number,
    contractPoints: Number,
    comments: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
  }],
  blind: { type: Boolean, default: false } // <-- Add this line
});

const Draft = mongoose.models.Draft || mongoose.model('Draft', draftSchema);

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();

    // Ensure each player has status and startDelay as a number
    const players = (body.players || []).map(p => ({
      ...p,
      status: p.status || 'UPCOMING',
      startDelay: Number(p.startDelay ?? 504)
    }));

    // Sanitize results
    const results = Array.isArray(body.results)
      ? body.results.map(r => ({
          username: r.username,
          playerId: r.playerId,
          salary: r.salary ?? 0,
          years: r.years ?? 1,
          contractPoints: r.contractPoints ?? 0,
          state: r.state ?? 'ACTIVE',
          expiration: r.expiration ?? ''
        }))
      : [];

    // Sanitize bidLog
    const bidLog = Array.isArray(body.bidLog)
      ? body.bidLog.map(b => ({
          username: b.username,
          playerId: b.playerId,
          salary: b.salary ?? 0,
          years: b.years ?? 1,
          contractPoints: b.contractPoints ?? 0,
          comments: b.comments ?? '',
          timestamp: b.timestamp ? new Date(b.timestamp) : new Date()
        }))
      : [];

    const draftData = { 
      ...body, 
      nomDuration: Number(body.nomDuration), 
      players,
      results,
      bidLog,
      blind: typeof body.blind === 'boolean' ? body.blind : false // <-- Ensure blind is set
    };

    const draft = await Draft.create(draftData);

    return new Response(JSON.stringify(draft), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function GET() {
  try {
    await dbConnect();
    const drafts = await Draft.find({});
    return new Response(JSON.stringify(drafts), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}