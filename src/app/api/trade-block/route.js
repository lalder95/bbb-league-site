import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  createTradeBlockListing,
  getTradeBlockListings,
  getTradeBlockOffersForListings,
  getTradeBlockSettings,
} from '@/lib/db-helpers';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

function buildPublicLeadingOfferFields(listing, offers) {
  const pendingOffer = Array.isArray(offers)
    ? offers.find((offer) => offer.offerId === listing.pendingOfferId)
    : null;

  if (!pendingOffer) {
    return { publicCountdownActive: listing.status === 'countdown_active' };
  }

  if (listing.offerVisibility === 'full') {
    return {
      publicCountdownActive: listing.status === 'countdown_active',
      publicLeadingOffer: pendingOffer,
      publicLeadingOfferSummary: {
        totalKtc: pendingOffer.totalKtc,
        totalBv: pendingOffer.totalBv,
        assetCount: (pendingOffer.assets || []).length,
      },
    };
  }

  if (listing.offerVisibility === 'value_summary') {
    return {
      publicCountdownActive: listing.status === 'countdown_active',
      publicLeadingOfferSummary: {
        totalKtc: pendingOffer.totalKtc,
        totalBv: pendingOffer.totalBv,
        assetCount: (pendingOffer.assets || []).length,
      },
    };
  }

  return { publicCountdownActive: listing.status === 'countdown_active' };
}

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    const actingUsernameHeader = request.headers.get('x-trade-block-acting-user');
    const actingUsername = session?.user?.role === 'admin' && actingUsernameHeader
      ? String(actingUsernameHeader).trim()
      : session?.user?.name;
    const isAdmin = session?.user?.role === 'admin';

    const listings = await getTradeBlockListings({
      status: ['open', 'offers_received', 'pending_offer_selected', 'countdown_active', 'pending_admin'],
    });
    if (listings?.success === false) {
      return NextResponse.json({ error: listings.error }, { status: 500 });
    }

    const hydratedListings = await (async () => {
      // Collect listing IDs that need offers hydration in one bulk query
      const needsOffers = (listings || []).filter((l) => {
        const isOwner = actingUsername === l.posterUsername;
        if (isOwner || isAdmin) return false;
        return ['full', 'value_summary'].includes(l.offerVisibility) && l.pendingOfferId;
      });

      const offersMap = needsOffers.length > 0
        ? await getTradeBlockOffersForListings(needsOffers.map((l) => l.listingId))
        : {};

      return (listings || []).map((listing) => {
        const isOwner = actingUsername === listing.posterUsername;
        if (isOwner || isAdmin) return listing;

        if (!['full', 'value_summary'].includes(listing.offerVisibility) || !listing.pendingOfferId) {
          return {
            ...listing,
            publicCountdownActive: listing.status === 'countdown_active',
          };
        }

        const offers = offersMap[listing.listingId] || [];
        return {
          ...listing,
          ...buildPublicLeadingOfferFields(listing, offers),
        };
      });
    })();

    return NextResponse.json({ listings: hydratedListings });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actingUsernameHeader = request.headers.get('x-trade-block-acting-user');
    const actingUsername = session.user.role === 'admin' && actingUsernameHeader
      ? String(actingUsernameHeader).trim()
      : session.user.name;

    const settings = await getTradeBlockSettings();
    if (!settings?.newPostingsEnabled && settings?.newPostingsEnabled !== undefined) {
      return NextResponse.json({ error: 'New trade block listings are currently disabled.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      asset,
      postingType,
      countdownDays,
      offerVisibility,
      filterMode,
      criteria,
      notes,
    } = body;

    if (!asset || !postingType) {
      return NextResponse.json({ error: 'asset and postingType are required' }, { status: 400 });
    }
    if (!['straight', 'auction'].includes(postingType)) {
      return NextResponse.json({ error: 'Invalid postingType' }, { status: 400 });
    }
    if (postingType === 'straight' && settings?.straightTradeModeEnabled === false) {
      return NextResponse.json({ error: 'Straight trade mode is currently disabled.' }, { status: 403 });
    }
    if (postingType === 'auction' && settings?.auctionModeEnabled === false) {
      return NextResponse.json({ error: 'Auction trade mode is currently disabled.' }, { status: 403 });
    }
    if (postingType === 'auction') {
      const min = Number(settings?.minCountdownDays || 1);
      const max = Number(settings?.maxCountdownDays || 10);
      const days = Number(countdownDays);
      if (!Number.isFinite(days) || days < min || days > max) {
        return NextResponse.json({ error: `Countdown must be between ${min} and ${max} days.` }, { status: 400 });
      }
    }

    // Check user posting limit
    const existing = await getTradeBlockListings({ posterUsername: actingUsername });
    const activeCount = Array.isArray(existing)
      ? existing.filter((l) =>
          ['open', 'offers_received', 'pending_offer_selected', 'countdown_active'].includes(l.status)
        ).length
      : 0;
    const maxPostings = Number(settings?.maxActivePostingsPerUser || 3);
    if (activeCount >= maxPostings) {
      return NextResponse.json({ error: `You can only have ${maxPostings} active listings at a time.` }, { status: 400 });
    }

    const listingId = randomUUID();
    const doc = {
      listingId,
      posterUsername: actingUsername,
      asset,
      postingType,
      countdownDays: postingType === 'auction' ? Number(countdownDays) : null,
      offerVisibility: offerVisibility || 'exists_only',
      filterMode: filterMode || 'flexible',
      criteria: criteria || {},
      notes: notes ? String(notes).slice(0, 500) : '',
      status: 'open',
      pendingOfferId: null,
      countdownEndsAt: null,
      completedAt: null,
      archivedAt: null,
    };

    const result = await createTradeBlockListing(doc);
    if (!result?.success) {
      return NextResponse.json({ error: result?.error || 'Failed to create listing' }, { status: 500 });
    }

    return NextResponse.json({ success: true, listingId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
