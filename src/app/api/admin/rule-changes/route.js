// src/app/api/admin/rule-changes/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import { addRuleChange, getAllRuleChanges } from '@/lib/db-helpers';

function isAuthorizedSession(session) {
  return !!(session && session.user && session.user.role === 'admin');
}

export async function GET() {
  try {
    let session;
    try { session = await getServerSession(authOptions); } catch {}

    if (!isAuthorizedSession(session) && process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const list = await getAllRuleChanges();
    if (!Array.isArray(list)) {
      return NextResponse.json({ error: list?.error || 'Failed to fetch' }, { status: 500 });
    }

    const ruleChanges = list.map(r => ({
      ...r,
      _id: r._id?.toString?.() || r._id,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));

    return NextResponse.json({ ruleChanges });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    let session;
    try { session = await getServerSession(authOptions); } catch {}

    const isAuthorized = isAuthorizedSession(session) || process.env.NODE_ENV === 'development';
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { description, effectiveYear } = body || {};

    const result = await addRuleChange({
      description,
      effectiveYear,
      createdBy: session?.user?.id || null,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      ruleChange: {
        ...result.ruleChange,
        _id: result.insertedId?.toString?.() || result.insertedId,
        createdAt: result.ruleChange.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
