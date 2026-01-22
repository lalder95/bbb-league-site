import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const runtime = 'nodejs';

// POST: Assign a holdout player to a team (admin only)
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  const body = await request.json();
  const { playerId, playerName, assignedTeam, adminNotes, offerYear1 } = body;
  const offer = Number(offerYear1);
  if (!playerId || !playerName || !assignedTeam || !Number.isFinite(offer) || offer <= 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  const client = await clientPromise;
  const db = client.db('bbb-league');
  const now = new Date();
  const update = {
    playerId,
    playerName,
    assignedTeam,
    offerYear1: offer,
    adminNotes: adminNotes ? String(adminNotes) : '',
    assignedBy: session.user?.username || session.user?.email || 'admin',
    assignedAt: now,
    updatedAt: now,
  };

  await db.collection('holdoutAssignments').updateOne(
    { playerId },
    {
      $set: update,
      $setOnInsert: {
        createdAt: now,
        decisionStatus: 'PENDING',
        decisionYears: null,
        decisionSalaries: [],
        decisionMadeAt: null,
        decisionMadeBy: null,
      },
    },
    { upsert: true }
  );

  const saved = await db.collection('holdoutAssignments').findOne({ playerId });
  return NextResponse.json({ success: true, assignment: saved });
}

// GET: List all holdout assignments (admin only)
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  const client = await clientPromise;
  const db = client.db('bbb-league');
  const assignments = await db.collection('holdoutAssignments').find({}).toArray();
  return NextResponse.json({ assignments });
}
