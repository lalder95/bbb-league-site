import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import { getBadgePrestigeSettings, updateBadgePrestigeSettings } from '@/lib/badge-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorizedSession(session) {
  return Boolean(session?.user && (session.user.role === 'admin' || session.user.isAdmin === true));
}

function serialize(result) {
  return {
    settings: result?.settings,
    updatedAt: result?.updatedAt instanceof Date ? result.updatedAt.toISOString() : result?.updatedAt || null,
    updatedBy: result?.updatedBy || null,
  };
}

export async function GET() {
  try {
    const result = await getBadgePrestigeSettings();
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to load badge settings' }, { status: 500 });
    }
    return NextResponse.json(serialize(result));
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
    const result = await updateBadgePrestigeSettings(
      body?.settings || body,
      session?.user?.username || session?.user?.name || session?.user?.id || 'admin'
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to save badge settings' }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...serialize(result) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
