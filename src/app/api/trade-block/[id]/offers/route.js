import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getTradeBlockListingById,
  getTradeBlockOffers,
  createTradeBlockOffer,
  updateTradeBlockListing,
} from '@/lib/db-helpers';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

function validateOfferAgainstCriteria(assets, criteria, filterMode) {
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

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const listing = await getTradeBlockListingById(id);
    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });

    const session = await getServerSession(authOptions);
    const actingUsernameHeader = request.headers.get('x-trade-block-acting-user');
    const actingUsername = session?.user?.role === 'admin' && actingUsernameHeader
      ? String(actingUsernameHeader).trim()
      : session?.user?.name;
    const isOwner = actingUsername === listing.posterUsername;
    const isAdmin = session?.user?.role === 'admin';

    const rawOffers = await getTradeBlockOffers(id);
    const offers = Array.isArray(rawOffers) ? rawOffers : [];
    const pendingOffer = offers.find((o) => o.offerId === listing.pendingOfferId);
    const ownOffers = actingUsername
      ? offers.filter((offer) => offer.offererUsername === actingUsername)
      : [];

    // Apply offer visibility rules for non-owners
    if (!isOwner && !isAdmin) {
      const vis = listing.offerVisibility || 'exists_only';
      const pendingOffer = offers.find((o) => o.offerId === listing.pendingOfferId);

      if (listing.status === 'countdown_active' && pendingOffer) {
        return NextResponse.json({
          offers: ownOffers,
          hasOffers: true,
          countdownActive: true,
          leadingOffer: pendingOffer,
          leadingOfferSummary: {
            totalKtc: pendingOffer.totalKtc,
            totalBv: pendingOffer.totalBv,
            assetCount: (pendingOffer.assets || []).length,
          },
        });
      }

      if (vis === 'hidden') {
        return NextResponse.json({ offers: ownOffers, hasOffers: offers.some((o) => o.status !== 'withdrawn') });
      }
      if (vis === 'countdown_only') {
        return NextResponse.json({
          offers: ownOffers,
          hasOffers: offers.some((o) => o.status !== 'withdrawn'),
          countdownActive: listing.status === 'countdown_active',
        });
      }
      if (vis === 'exists_only') {
        return NextResponse.json({
          offers: ownOffers,
          hasOffers: offers.some((o) => o.status !== 'withdrawn'),
        });
      }
      if (vis === 'value_summary' && pendingOffer) {
        return NextResponse.json({
          offers: ownOffers,
          hasOffers: true,
          leadingOfferSummary: {
            totalKtc: pendingOffer.totalKtc,
            totalBv: pendingOffer.totalBv,
            assetCount: (pendingOffer.assets || []).length,
          },
        });
      }
      if (vis === 'full' && pendingOffer) {
        return NextResponse.json({
          offers: ownOffers,
          hasOffers: true,
          leadingOffer: pendingOffer,
        });
      }
      return NextResponse.json({ offers: [], hasOffers: offers.some((o) => o.status !== 'withdrawn') });
    }

    // Owner / admin sees everything
    return NextResponse.json({
      offers,
      countdownActive: listing.status === 'countdown_active',
      leadingOffer: pendingOffer || null,
      leadingOfferSummary: pendingOffer ? {
        totalKtc: pendingOffer.totalKtc,
        totalBv: pendingOffer.totalBv,
        assetCount: (pendingOffer.assets || []).length,
      } : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actingUsernameHeader = request.headers.get('x-trade-block-acting-user');
    const actingUsername = session.user.role === 'admin' && actingUsernameHeader
      ? String(actingUsernameHeader).trim()
      : session.user.name;

    const { id } = await params;
    const listing = await getTradeBlockListingById(id);
    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });

    if (!['open', 'offers_received', 'countdown_active'].includes(listing.status)) {
      return NextResponse.json({ error: 'Listing is not accepting offers.' }, { status: 400 });
    }

    if (listing.posterUsername === actingUsername) {
      return NextResponse.json({ error: 'You cannot bid on your own listing.' }, { status: 400 });
    }

    const body = await request.json();
    const { assets, message } = body;

    if (!Array.isArray(assets) || assets.length === 0) {
      return NextResponse.json({ error: 'assets are required' }, { status: 400 });
    }

    const existingOffers = await getTradeBlockOffers(id);
    const activeOffer = Array.isArray(existingOffers)
      ? existingOffers.find((offer) => offer.offererUsername === actingUsername && ['pending', 'selected'].includes(offer.status))
      : null;
    if (activeOffer) {
      return NextResponse.json(
        {
          error: activeOffer.status === 'pending'
            ? 'You already have a pending offer on this listing. Edit that offer instead of creating a new one.'
            : 'You already have the active selected offer on this listing.',
          offerId: activeOffer.offerId,
          status: activeOffer.status,
        },
        { status: 409 }
      );
    }

    // Criteria validation
    const { meets, violations } = validateOfferAgainstCriteria(assets, listing.criteria, listing.filterMode);
    if (listing.filterMode === 'hard' && !meets) {
      return NextResponse.json({ error: `Offer does not meet required criteria: ${violations.join('; ')}` }, { status: 400 });
    }

    const totalKtc = assets.reduce((s, a) => s + (Number(a.ktcValue || a.pickKtcValue || 0)), 0);
    const totalBv = assets.reduce((s, a) => s + (Number(a.bvValue || 0)), 0);

    const offerId = randomUUID();
    const offerDoc = {
      offerId,
      listingId: id,
      offererUsername: actingUsername,
      assets,
      totalKtc,
      totalBv,
      message: message ? String(message).slice(0, 300) : null,
      status: 'pending',
      meetsCriteria: meets,
      criteriaViolations: violations,
    };

    const result = await createTradeBlockOffer(offerDoc);
    if (!result?.success) {
      return NextResponse.json({ error: result?.error || 'Failed to create offer' }, { status: 500 });
    }

    // Update listing status to offers_received if currently open
    if (listing.status === 'open') {
      await updateTradeBlockListing(id, { status: 'offers_received' });
    }

    return NextResponse.json({ success: true, offerId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
