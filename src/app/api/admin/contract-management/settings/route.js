import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]/route';
import {
  getContractManagementSettings,
  updateContractManagementSettings,
} from '@/lib/db-helpers';

export const runtime = 'nodejs';

function isAuthorizedSession(session) {
  return !!(session && session.user && session.user.role === 'admin');
}

function serializeSettings(settings) {
  return {
    contractYearOverride: settings?.contractYearOverride ?? null,
    updatedAt: settings?.updatedAt instanceof Date ? settings.updatedAt.toISOString() : settings?.updatedAt || null,
    updatedBy: settings?.updatedBy || null,
  };
}

export async function GET() {
  try {
    let session;
    try {
      session = await getServerSession(authOptions);
    } catch {}

    if (!isAuthorizedSession(session) && process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await getContractManagementSettings();
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to load settings' }, { status: 500 });
    }

    return NextResponse.json({ settings: serializeSettings(result.settings) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    let session;
    try {
      session = await getServerSession(authOptions);
    } catch {}

    const isAuthorized = isAuthorizedSession(session) || process.env.NODE_ENV === 'development';
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const result = await updateContractManagementSettings({
      contractYearOverride: body?.contractYearOverride ?? null,
      updatedBy: session?.user?.username || session?.user?.id || 'admin',
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to save settings' }, { status: 400 });
    }

    return NextResponse.json({ success: true, settings: serializeSettings(result.settings) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
