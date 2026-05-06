// src/app/api/rule-changes/route.js
import { NextResponse } from 'next/server';
import { getAllRuleChanges } from '@/lib/db-helpers';

export async function GET() {
  try {
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
