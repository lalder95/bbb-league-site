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
    salary: Number,           // <-- NEW
    years: Number,            // <-- NEW
    contractPoints: Number,   // <-- NEW
    state: String,
    expiration: String
  }],
  bidLog: [{
    username: String,
    playerId: Number,
    salary: Number,           // <-- NEW
    years: Number,            // <-- NEW
    contractPoints: Number,   // <-- NEW
    comments: { type: String, default: '' }, // <-- NEW
    timestamp: { type: Date, default: Date.now }
  }]
});

const Draft = mongoose.models.Draft || mongoose.model('Draft', draftSchema);

export async function PATCH(request, { params }) {
  await dbConnect();
  const { id } = params;
  const body = await request.json();

  const updateFields = {};
  if (typeof body.state === 'string') updateFields.state = body.state;

  // Sanitize results
  if (Array.isArray(body.results)) {
    updateFields.results = body.results.map(r => ({
      username: r.username,
      playerId: r.playerId,
      salary: r.salary ?? 0,
      years: r.years ?? 1,
      contractPoints: r.contractPoints ?? 0,
      state: r.state ?? 'ACTIVE',
      expiration: r.expiration ?? ''
    }));
  }

  // Sanitize bidLog
  if (Array.isArray(body.bidLog)) {
    updateFields.bidLog = body.bidLog.map(b => ({
      username: b.username,
      playerId: b.playerId,
      salary: b.salary ?? 0,
      years: b.years ?? 1,
      contractPoints: b.contractPoints ?? 0,
      comments: b.comments ?? '',
      timestamp: b.timestamp ? new Date(b.timestamp) : new Date()
    }));
  }

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