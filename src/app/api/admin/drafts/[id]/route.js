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
  }]
});

const Draft = mongoose.models.Draft || mongoose.model('Draft', draftSchema);

export async function PATCH(request, { params }) {
  await dbConnect();
  const { id } = params;
  const body = await request.json();

  // Only allow updating the results array
  if (!body.results) {
    return new Response(JSON.stringify({ error: 'Missing results array.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const draft = await Draft.findByIdAndUpdate(
    id,
    { results: body.results },
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