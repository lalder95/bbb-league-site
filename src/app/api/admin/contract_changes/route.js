import { NextResponse } from 'next/server';
import { getContractChanges, addContractChange } from '@/lib/db-helpers';

export async function GET() {
  const result = await getContractChanges();
  if (result.success === false) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const change = {
      change_type: body.change_type,
      user: body.user,
      timestamp: new Date(body.timestamp),
      notes: body.notes,
      ai_notes: body.ai_notes,
  playerId: body.playerId, // player identifier
  // Persist extra context for admin-awarded extensions
  team: body.team,
  playerName: body.playerName,
  years: body.years,
  extensionSalaries: body.extensionSalaries,
    };
    const result = await addContractChange(change);
    if (result.success === false) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, change: result.change });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}