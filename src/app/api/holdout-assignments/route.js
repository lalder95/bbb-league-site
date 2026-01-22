import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const runtime = 'nodejs';

function roundUpToTenth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.ceil(n * 10) / 10;
}

function computeEscalatingSalaries({ offerYear1, years }) {
  const yrs = Number(years);
  if (![1, 2, 3].includes(yrs)) return null;
  const y1 = roundUpToTenth(offerYear1);
  if (y1 === null || y1 <= 0) return null;
  const salaries = [y1];
  while (salaries.length < yrs) {
    const prev = salaries[salaries.length - 1];
    salaries.push(roundUpToTenth(prev * 1.1));
  }
  return salaries;
}

function normTeam(s) {
  return String(s || '').trim().toLowerCase();
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET: fetch holdout assignments.
// - Admins: may fetch all, or filter by ?team=
// - Non-admins: must provide ?team= (client-derived) and will only receive that team.
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const team = url.searchParams.get('team') || '';
  const isAdmin = session.user?.role === 'admin';

  if (!isAdmin && !team) {
    return NextResponse.json({ error: 'team is required' }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db('bbb-league');

  const query = {};
  if (team) {
    // Case-insensitive exact match to avoid casing mismatches.
    query.assignedTeam = { $regex: `^${escapeRegex(team)}$`, $options: 'i' };
  }

  const assignments = await db.collection('holdoutAssignments').find(query).toArray();

  // If non-admin, additionally enforce exact team match (case-insensitive) on the server response.
  // Note: we do not have a canonical team field in the user session, so team is client-provided.
  const filtered = !isAdmin && team
    ? assignments.filter(a => normTeam(a.assignedTeam) === normTeam(team))
    : assignments;

  return NextResponse.json({ assignments: filtered });
}

// PATCH: set decisionMade for a holdout assignment.
// - Admins: may set decision for any assignment.
// - Non-admins: must provide team and it must match the assignment's assignedTeam (case-insensitive).
export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { playerId, team, decisionMade, decisionStatus, decisionYears } = body || {};
  const isAdmin = session.user?.role === 'admin';

  if (!playerId) {
    return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
  }
  if (!isAdmin && !team) {
    return NextResponse.json({ error: 'team is required' }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db('bbb-league');

  const assignment = await db.collection('holdoutAssignments').findOne({ playerId: String(playerId) });
  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  // Decisions are final once set.
  const existingStatus = String(assignment.decisionStatus || '').trim().toUpperCase();
  const hasFinalStatus = ['DECLINED', 'ACCEPTED'].includes(existingStatus);
  const hasLegacyDecision = Boolean(assignment.decisionMade && String(assignment.decisionMade).trim());
  if (hasFinalStatus || hasLegacyDecision) {
    return NextResponse.json(
      { error: 'Decision is final and cannot be changed.' },
      { status: 409 }
    );
  }

  if (!isAdmin && normTeam(assignment.assignedTeam) !== normTeam(team)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();

  // Backward compatibility: if old clients still submit a free-text decisionMade,
  // store it but do not overwrite the structured decision fields.
  if (decisionMade && String(decisionMade).trim()) {
    await db.collection('holdoutAssignments').updateOne(
      { playerId: String(playerId) },
      {
        $set: {
          decisionMade: String(decisionMade).trim(),
          decisionMadeAt: now,
          decisionMadeBy: session.user?.username || session.user?.email || null,
          updatedAt: now,
        },
      }
    );

    const saved = await db.collection('holdoutAssignments').findOne({ playerId: String(playerId) });
    return NextResponse.json({ success: true, assignment: saved });
  }

  const normalizedStatus = String(decisionStatus || '').trim().toUpperCase();
  if (!['DECLINED', 'ACCEPTED'].includes(normalizedStatus)) {
    return NextResponse.json(
      { error: 'decisionStatus must be DECLINED or ACCEPTED' },
      { status: 400 }
    );
  }

  let years = null;
  let salaries = [];
  if (normalizedStatus === 'ACCEPTED') {
    years = Number(decisionYears);
    salaries = computeEscalatingSalaries({ offerYear1: assignment.offerYear1, years });
    if (!salaries) {
      return NextResponse.json(
        { error: 'Invalid decisionYears (1-3) or missing offerYear1 on assignment' },
        { status: 400 }
      );
    }
  }

  await db.collection('holdoutAssignments').updateOne(
    { playerId: String(playerId) },
    {
      $set: {
        decisionStatus: normalizedStatus,
        decisionYears: years,
        decisionSalaries: salaries,
        decisionMadeAt: now,
        decisionMadeBy: session.user?.username || session.user?.email || null,
        updatedAt: now,
      },
    }
  );

  const saved = await db.collection('holdoutAssignments').findOne({ playerId: String(playerId) });
  return NextResponse.json({ success: true, assignment: saved });
}
