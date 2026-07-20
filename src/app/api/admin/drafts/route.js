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
  endDate: String,
  timeZone: String,
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
    // Array of AI reactions to this bid (only for non-blind auctions)
    reactions: [{
      name: String,
      role: String,
      persona: String,
      reaction: String
    }],
    timestamp: { type: Date, default: Date.now }
  }],
  blind: { type: Boolean, default: false },
  lastBidFloorEnabled: { type: Boolean, default: true },
  lastBidFloorHours: { type: Number, default: 24 },
  lastBidFloorRules: [{
    startAt: String,
    endAt: String,
    hours: Number,
    enabled: { type: Boolean, default: true }
  }],
  minBidIncreaseType: { type: String, default: 'flat' },
  minBidIncreaseValue: { type: Number, default: 0 },
  autoAddDropped: { type: Boolean, default: false },
  sleeperLeagueId: { type: String, default: '' }
});

const Draft = mongoose.models.Draft || mongoose.model('Draft', draftSchema);

function floorRulesOverlap(left, right) {
  const leftStart = new Date(left.startAt);
  const leftEnd = new Date(left.endAt);
  const rightStart = new Date(right.startAt);
  const rightEnd = new Date(right.endAt);

  if ([leftStart, leftEnd, rightStart, rightEnd].some(date => Number.isNaN(date.getTime()))) {
    return false;
  }

  return leftStart < rightEnd && rightStart < leftEnd;
}

function validateFloorRules(rules) {
  for (let index = 0; index < rules.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < rules.length; otherIndex += 1) {
      if (floorRulesOverlap(rules[index], rules[otherIndex])) {
        return 'Bid floor ranges cannot overlap.';
      }
    }
  }

  return '';
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();

    const normalizeFloorRules = (rules) => {
      if (!Array.isArray(rules)) return [];
      return rules
        .map((rule) => ({
          startAt: rule?.startAt ? String(rule.startAt) : '',
          endAt: rule?.endAt ? String(rule.endAt) : '',
          hours: Number(rule?.hours),
          enabled: rule?.enabled !== false,
        }))
        .filter((rule) => rule.startAt && rule.endAt && Number.isFinite(rule.hours) && rule.hours >= 1);
    };

    const floorRules = normalizeFloorRules(body.lastBidFloorRules);
    const floorRulesError = validateFloorRules(floorRules);
    if (floorRulesError) {
      return new Response(JSON.stringify({ error: floorRulesError }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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
          reactions: Array.isArray(b.reactions) ? b.reactions.map(r => ({
            name: r.name ?? '',
            role: r.role ?? '',
            persona: r.persona ?? '',
            reaction: r.reaction ?? ''
          })) : [],
          timestamp: b.timestamp ? new Date(b.timestamp) : new Date()
        }))
      : [];

    const draftData = { 
      ...body, 
      endDate: body.endDate ? String(body.endDate) : '',
      timeZone: body.timeZone ? String(body.timeZone) : '',
      nomDuration: Number(body.nomDuration), 
      players,
      results,
      bidLog,
      blind: typeof body.blind === 'boolean' ? body.blind : false,
      lastBidFloorEnabled: typeof body.lastBidFloorEnabled === 'boolean' ? body.lastBidFloorEnabled : true,
      lastBidFloorHours: typeof body.lastBidFloorHours === 'number' ? body.lastBidFloorHours : 24,
      lastBidFloorRules: floorRules,
      minBidIncreaseType: typeof body.minBidIncreaseType === 'string' && ['flat', 'percentage'].includes(body.minBidIncreaseType) ? body.minBidIncreaseType : 'flat',
      minBidIncreaseValue: typeof body.minBidIncreaseValue === 'number' && body.minBidIncreaseValue >= 0 ? body.minBidIncreaseValue : 0,
      autoAddDropped: typeof body.autoAddDropped === 'boolean' ? body.autoAddDropped : false,
      sleeperLeagueId: typeof body.sleeperLeagueId === 'string' ? body.sleeperLeagueId.trim() : ''
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