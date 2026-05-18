import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '@/lib/db-helpers';

export const runtime = 'nodejs';

// All preference keys with their default values (true = enabled by default)
export const NOTIFICATION_PREF_DEFAULTS = {
  contract_extension: true,
  franchise_tag: true,
  rfa_tag: true,
  holdout_decision: true,
  trade_block_listing: true,
  trade_block_offer_selected: true,
  auction_outbid: true,
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stored = await getNotificationPreferences(session.user.name);
  // Merge with defaults so callers always get every key
  const preferences = { ...NOTIFICATION_PREF_DEFAULTS, ...stored };
  return NextResponse.json({ preferences });
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  // Allow only known keys and only boolean values
  const sanitized = {};
  for (const key of Object.keys(NOTIFICATION_PREF_DEFAULTS)) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      sanitized[key] = Boolean(body[key]);
    }
  }

  if (Object.keys(sanitized).length === 0) {
    return NextResponse.json({ error: 'No valid preference keys provided' }, { status: 400 });
  }

  // Merge with existing preferences so a partial PATCH only updates supplied keys
  const existing = await getNotificationPreferences(session.user.name);
  const merged = { ...NOTIFICATION_PREF_DEFAULTS, ...existing, ...sanitized };

  const result = await updateNotificationPreferences(session.user.name, merged);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, preferences: merged });
}
