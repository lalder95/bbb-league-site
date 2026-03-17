import { NextResponse } from 'next/server';
import { getContractManagementSettings } from '@/lib/db-helpers';

export const runtime = 'nodejs';

function serializeSettings(settings) {
  return {
    contractYearOverride: settings?.contractYearOverride ?? null,
    updatedAt: settings?.updatedAt instanceof Date ? settings.updatedAt.toISOString() : settings?.updatedAt || null,
    updatedBy: settings?.updatedBy || null,
  };
}

export async function GET() {
  try {
    const result = await getContractManagementSettings();
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to load settings' }, { status: 500 });
    }

    return NextResponse.json({ settings: serializeSettings(result.settings) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
