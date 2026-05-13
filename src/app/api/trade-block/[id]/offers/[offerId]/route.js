import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getTradeBlockListingById,
  getTradeBlockOfferById,
  updateTradeBlockOffer,
  updateTradeBlockListing,
  getTradeBlockOffers,
} from '@/lib/db-helpers';

export const runtime = 'nodejs';

function validateOfferAgainstCriteria(assets, criteria) {
  if (!criteria || Object.keys(criteria).length === 0) return { meets: true, violations: [] };

  const violations = [];
  const players = assets.filter((a) => a.assetType === 'player');
  const picks = assets.filter((a) => a.assetType === 'pick');
  const totalKtc = assets.reduce((s, a) => s + (Number(a.ktcValue || a.pickKtcValue || 0)), 0);
  const totalBv = assets.reduce((s, a) => s + (Number(a.bvValue || 0)), 0);

  if (criteria.acceptPlayers === false && players.length > 0) violations.push('Players not accepted');
  if (criteria.acceptPicks === false && picks.length > 0) violations.push('Draft picks not accepted');
  if (criteria.maxPlayers != null && players.length > Number(criteria.maxPlayers)) violations.push(`Max ${criteria.maxPlayers} players`);
  if (criteria.maxPicks != null && picks.length > Number(criteria.maxPicks)) violations.push(`Max ${criteria.maxPicks} picks`);
  if (criteria.maxTotalAssets != null && assets.length > Number(criteria.maxTotalAssets)) violations.push(`Max ${criteria.maxTotalAssets} total assets`);
  if (criteria.minTotalKtc != null && totalKtc < Number(criteria.minTotalKtc)) violations.push(`Min KTC ${criteria.minTotalKtc}`);
  if (criteria.minTotalBv != null && totalBv < Number(criteria.minTotalBv)) violations.push(`Min BV ${criteria.minTotalBv}`);

  for (const p of players) {
    if (criteria.positions?.length && !criteria.positions.includes(p.position)) violations.push(`Position ${p.position} not wanted`);
    if (criteria.minKtc != null && Number(p.ktcValue || 0) < Number(criteria.minKtc)) violations.push(`${p.playerName}: KTC below minimum`);
    if (criteria.maxKtc != null && Number(p.ktcValue || 0) > Number(criteria.maxKtc)) violations.push(`${p.playerName}: KTC above maximum`);
    if (criteria.minBv != null && Number(p.bvValue || 0) < Number(criteria.minBv)) violations.push(`${p.playerName}: BV below minimum`);
    if (criteria.minAge != null && Number(p.age || 0) < Number(criteria.minAge)) violations.push(`${p.playerName}: Age below minimum`);
    if (criteria.maxAge != null && Number(p.age || 0) > Number(criteria.maxAge)) violations.push(`${p.playerName}: Age above maximum`);
    if (criteria.maxSalary != null && Number(p.salary || 0) > Number(criteria.maxSalary)) violations.push(`${p.playerName}: Salary above maximum`);
    if (criteria.contractTypes?.length && !criteria.contractTypes.includes(p.contractType)) violations.push(`${p.playerName}: Contract type not wanted`);
  }

  for (const pick of picks) {
    if (criteria.pickRounds?.length && !criteria.pickRounds.includes(Number(pick.round))) violations.push(`Round ${pick.round} pick not wanted`);
    if (criteria.pickYears?.length && !criteria.pickYears.includes(String(pick.season))) violations.push(`${pick.season} pick not wanted`);
  }

  return { meets: violations.length === 0, violations };
}

export async function PATCH(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, offerId } = await params;
    const listing = await getTradeBlockListingById(id);
    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });

    const offer = await getTradeBlockOfferById(offerId);
    if (!offer || offer.listingId !== id) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action } = body;
    const actingUsernameHeader = request.headers.get('x-trade-block-acting-user');
    const actingUsername = session.user.role === 'admin' && actingUsernameHeader
      ? String(actingUsernameHeader).trim()
      : session.user.name;
    const isOwner = listing.posterUsername === session.user.name;
    const isOfferer = offer.offererUsername === actingUsername;
    const isAdmin = session.user.role === 'admin';

    if (action === 'update') {
      if (!isOfferer && !isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (offer.status !== 'pending') {
        return NextResponse.json({ error: 'Only pending offers can be edited.' }, { status: 400 });
      }
      if (!['open', 'offers_received', 'countdown_active', 'pending_offer_selected'].includes(listing.status)) {
        return NextResponse.json({ error: 'Listing is not in a state that allows offer edits.' }, { status: 400 });
      }

      const assets = Array.isArray(body.assets) ? body.assets : [];
      const message = body.message;
      if (assets.length === 0) {
        return NextResponse.json({ error: 'assets are required' }, { status: 400 });
      }

      const { meets, violations } = validateOfferAgainstCriteria(assets, listing.criteria);
      if (listing.filterMode === 'hard' && !meets) {
        return NextResponse.json({ error: `Offer does not meet required criteria: ${violations.join('; ')}` }, { status: 400 });
      }

      const totalKtc = assets.reduce((s, a) => s + (Number(a.ktcValue || a.pickKtcValue || 0)), 0);
      const totalBv = assets.reduce((s, a) => s + (Number(a.bvValue || 0)), 0);

      await updateTradeBlockOffer(offerId, {
        assets,
        totalKtc,
        totalBv,
        message: message ? String(message).slice(0, 300) : null,
        meetsCriteria: meets,
        criteriaViolations: violations,
      });
      return NextResponse.json({ success: true });
    }

    // Offerer withdraws their own non-selected offer
    if (action === 'withdraw') {
      if (!isOfferer && !isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      // Cannot withdraw a selected offer during countdown
      if (offer.status === 'selected' && listing.status === 'countdown_active') {
        return NextResponse.json({ error: 'Cannot withdraw the selected offer during an active countdown.' }, { status: 400 });
      }
      await updateTradeBlockOffer(offerId, { status: 'withdrawn' });
      return NextResponse.json({ success: true });
    }

    // Poster selects an offer as the Pending Offer Selected
    if (action === 'select') {
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!['pending', 'selected'].includes(offer.status)) {
        return NextResponse.json({ error: 'Offer is not in a selectable state.' }, { status: 400 });
      }
      if (!['open', 'offers_received', 'countdown_active', 'pending_offer_selected'].includes(listing.status)) {
        return NextResponse.json({ error: 'Listing is not in a state that allows offer selection.' }, { status: 400 });
      }

      // Reject any previously selected offer when a new offer is accepted
      const allOffers = await getTradeBlockOffers(id);
      const prevSelected = Array.isArray(allOffers)
        ? allOffers.find((o) => o.offerId !== offerId && o.status === 'selected')
        : null;
      if (prevSelected) {
        await updateTradeBlockOffer(prevSelected.offerId, { status: 'rejected' });
      }

      // Mark this offer selected
      await updateTradeBlockOffer(offerId, { status: 'selected' });

      // For auction type: start or reset countdown
      let listingUpdate = { pendingOfferId: offerId };
      if (listing.postingType === 'auction') {
        const days = Number(listing.countdownDays || 3);
        const countdownEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        listingUpdate = {
          ...listingUpdate,
          status: 'countdown_active',
          countdownEndsAt,
        };
      } else {
        // Straight trade — immediately go to pending admin
        listingUpdate.status = 'pending_admin';
      }

      await updateTradeBlockListing(id, listingUpdate);
      return NextResponse.json({ success: true });
    }

    // Poster rejects a specific offer
    if (action === 'reject') {
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (offer.status === 'selected' && listing.status === 'countdown_active') {
        return NextResponse.json({ error: 'Cannot reject the selected offer during an active countdown.' }, { status: 400 });
      }
      await updateTradeBlockOffer(offerId, { status: 'rejected' });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
