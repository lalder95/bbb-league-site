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
    highBid: Number,
    state: String,
    expiration: String
  }],
  bidLog: [{ // Added bidLog field
    username: String,
    playerId: Number,
    bidAmount: Number,
    timestamp: { type: Date, default: Date.now }
  }]
});

const Draft = mongoose.models.Draft || mongoose.model('Draft', draftSchema);

export async function PATCH(request, { params }) {
  await dbConnect();
  const { id } = params;
  const body = await request.json();

  // Allow updating state, results, and bidLog
  const updateFields = {};
  if (typeof body.state === 'string') updateFields.state = body.state;
  if (Array.isArray(body.results)) updateFields.results = body.results;
  if (Array.isArray(body.bidLog)) updateFields.bidLog = body.bidLog;

  if (Object.keys(updateFields).length === 0) {
    return new Response(JSON.stringify({ error: 'No valid fields to update.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const draft = await Draft.findByIdAndUpdate(
    id,
    updateFields,
    { new: true }
  );

  if (!draft) {
    return new Response(JSON.stringify({ error: 'Draft not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(draft), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}