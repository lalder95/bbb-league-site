import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import {
  getSeasonSimulatorSettings,
  updateSeasonSimulatorSettings,
} from '@/lib/db-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorizedSession(session) {
  return !!(session && session.user && session.user.role === 'admin');
}

function serializeSettings(settings, meta = {}) {
  return {
    simulations: Number(settings?.simulations ?? 250),
    boomBustStdDev: Number(settings?.boomBustStdDev ?? 0.18),
    shortInjuryChance: Number(settings?.shortInjuryChance ?? 0.05),
    longInjuryChance: Number(settings?.longInjuryChance ?? 0.01),
    updatedAt: meta?.updatedAt instanceof Date ? meta.updatedAt.toISOString() : meta?.updatedAt || null,
    updatedBy: meta?.updatedBy || null,
  };
}

export async function GET() {
  try {
    const result = await getSeasonSimulatorSettings();
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to load settings' }, { status: 500 });
    }

    return NextResponse.json({ settings: serializeSettings(result.settings, result) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAuthorizedSession(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const result = await updateSeasonSimulatorSettings(body, session?.user?.username || session?.user?.id || 'admin');
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to save settings' }, { status: 400 });
    }

    return NextResponse.json({ success: true, settings: serializeSettings(result.settings, result.settings) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}