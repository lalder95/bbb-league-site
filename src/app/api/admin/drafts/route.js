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
  nomDuration: Number, // <-- must be present!
  users: [{ username: String }],
  players: [playerSchema],
  results: [{
    username: String,
    playerId: Number,
    highBid: Number,
    state: String,
    expiration: String
  }]
});

const Draft = mongoose.models.Draft || mongoose.model('Draft', draftSchema);

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();

    // Debug: Log the incoming request body
    console.log('Draft POST body:', JSON.stringify(body, null, 2));

    // Ensure each player has status and startDelay as a number
    const players = (body.players || []).map(p => ({
      ...p,
      status: p.status || 'UPCOMING',
      startDelay: Number(p.startDelay ?? 504)
    }));

    // Debug: Log the processed players array
    console.log('Processed players:', JSON.stringify(players, null, 2));

    // Ensure nomDuration is a number
    const draftData = { 
      ...body, 
      nomDuration: Number(body.nomDuration), 
      players 
    };

    // Debug: Log the final draft object to be saved
    console.log('Draft to be saved:', JSON.stringify(draftData, null, 2));

    const draft = await Draft.create(draftData);

    // Debug: Log the saved draft from the database
    console.log('Saved draft:', JSON.stringify(draft, null, 2));

    return new Response(JSON.stringify(draft), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Draft creation error:', err);
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