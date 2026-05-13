import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getTradeBlockSettings,
  updateTradeBlockSettings,
  getTradeBlockListings,
  updateTradeBlockListing,
  deleteTradeBlockListing,
} from '@/lib/db-helpers';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    const settings = await getTradeBlockSettings();
    const allListings = await getTradeBlockListings({});
    return NextResponse.json({ settings, listings: Array.isArray(allListings) ? allListings : [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    const body = await request.json();
    const { action, listingId, settings } = body;

    if (action === 'update_settings') {
      if (!settings || typeof settings !== 'object') {
        return NextResponse.json({ error: 'settings required' }, { status: 400 });
      }
      const allowedFields = [
        'maxActivePostingsPerUser', 'autoArchiveDays', 'newPostingsEnabled',
        'auctionModeEnabled', 'straightTradeModeEnabled', 'mediaFeedEnabled',
        'defaultCountdownDays', 'minCountdownDays', 'maxCountdownDays',
        'mediaIntensityLow', 'mediaIntensityMid', 'mediaIntensityHigh',
      ];
      const sanitized = {};
      for (const key of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(settings, key)) {
          sanitized[key] = settings[key];
        }
      }
      await updateTradeBlockSettings(sanitized);
      return NextResponse.json({ success: true });
    }

    if (action === 'archive') {
      if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
      await updateTradeBlockListing(listingId, { status: 'archived', archivedAt: new Date() });
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
      await deleteTradeBlockListing(listingId);
      return NextResponse.json({ success: true });
    }

    if (action === 'void') {
      if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
      await updateTradeBlockListing(listingId, { status: 'voided' });
      return NextResponse.json({ success: true });
    }

    if (action === 'complete') {
      if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
      await updateTradeBlockListing(listingId, { status: 'completed', completedAt: new Date() });
      return NextResponse.json({ success: true });
    }

    if (action === 'mark_pending_admin') {
      if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
      await updateTradeBlockListing(listingId, { status: 'pending_admin' });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
