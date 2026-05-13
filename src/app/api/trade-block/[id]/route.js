import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getTradeBlockListingById,
  updateTradeBlockListing,
  deleteTradeBlockListing,
  getTradeBlockOffers,
} from '@/lib/db-helpers';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const listing = await getTradeBlockListingById(id);
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }
    const offers = await getTradeBlockOffers(id);
    return NextResponse.json({ listing, offers: Array.isArray(offers) ? offers : [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const listing = await getTradeBlockListingById(id);
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    const actingUsernameHeader = request.headers.get('x-trade-block-acting-user');
    const actingUsername = session.user.role === 'admin' && actingUsernameHeader
      ? String(actingUsernameHeader).trim()
      : session.user.name;
    const isAdmin = session.user.role === 'admin';
    const isOwner = listing.posterUsername === actingUsername;

    const body = await request.json();
    const { action, ...fields } = body;

    // Archive action
    if (action === 'archive') {
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const blockedStatuses = ['countdown_active', 'pending_offer_selected', 'pending_admin'];
      if (!isAdmin && blockedStatuses.includes(listing.status)) {
        return NextResponse.json({ error: 'Cannot archive a listing with an active countdown or pending offer.' }, { status: 400 });
      }
      await updateTradeBlockListing(id, { status: 'archived', archivedAt: new Date() });
      return NextResponse.json({ success: true });
    }

    // Admin: mark completed / voided
    if (isAdmin && action === 'complete') {
      await updateTradeBlockListing(id, { status: 'completed', completedAt: new Date() });
      return NextResponse.json({ success: true });
    }
    if (isAdmin && action === 'void') {
      await updateTradeBlockListing(id, { status: 'voided' });
      return NextResponse.json({ success: true });
    }
    if (isAdmin && action === 'mark_pending_admin') {
      await updateTradeBlockListing(id, { status: 'pending_admin' });
      return NextResponse.json({ success: true });
    }

    // Editing fields — restricted based on status
    if (!isOwner) {
      return NextResponse.json({ error: 'Only the listing owner can edit this listing.' }, { status: 403 });
    }

    if (listing.pendingOfferId) {
      return NextResponse.json({ error: 'Listings cannot be edited once an offer has been accepted.' }, { status: 400 });
    }

    const activeStatuses = ['countdown_active', 'pending_offer_selected', 'pending_admin', 'completed', 'archived', 'voided'];
    if (activeStatuses.includes(listing.status) && !isAdmin) {
      return NextResponse.json({ error: 'Listing cannot be edited in its current status.' }, { status: 400 });
    }

    const offers = await getTradeBlockOffers(id);
    const hasActiveOffers = Array.isArray(offers)
      ? offers.some((offer) => ['pending', 'selected'].includes(offer.status))
      : false;
    const allowedWithActiveOffers = ['notes', 'offerVisibility'];
    const allowedWithoutActiveOffers = ['notes', 'offerVisibility', 'filterMode', 'criteria', 'countdownDays'];
    const allowed = hasActiveOffers ? allowedWithActiveOffers : allowedWithoutActiveOffers;

    const update = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        update[key] = fields[key];
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    await updateTradeBlockListing(id, update);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.name || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    const { id } = await params;
    await deleteTradeBlockListing(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
