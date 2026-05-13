import { NextResponse } from 'next/server';
import { buildBankerFeedTweets } from '@/lib/banker-feed';
import { getBankerFeedThreadCounts, getContractChanges, getMediaFeedItems } from '@/lib/db-helpers';
import { syncActiveFreeAgentAuctionFeed } from '@/lib/free-agent-auction-feed';
import { syncActiveRookieDraftFeed } from '@/lib/rookie-draft-feed';
import { syncSleeperTransactionsFeed } from '@/lib/sleeper-transactions-feed';
import { syncTradeBlockFeed } from '@/lib/trade-block-feed';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    let sync = null;

    if (url.searchParams.get('sync') === '1') {
      const [rookieDraft, freeAgentAuction, sleeperTransactions, tradeBlock] = await Promise.all([
        syncActiveRookieDraftFeed().catch((error) => ({ ok: false, error: error.message })),
        syncActiveFreeAgentAuctionFeed().catch((error) => ({ ok: false, error: error.message })),
        syncSleeperTransactionsFeed().catch((error) => ({ ok: false, error: error.message })),
        syncTradeBlockFeed().catch((error) => ({ ok: false, error: error.message })),
      ]);
      sync = { rookieDraft, freeAgentAuction, sleeperTransactions, tradeBlock };
    }

    const [contractChanges, mediaFeedItems] = await Promise.all([
      getContractChanges(),
      getMediaFeedItems(),
    ]);

    if (contractChanges?.success === false) {
      return NextResponse.json({ error: contractChanges.error }, { status: 500 });
    }

    if (mediaFeedItems?.success === false) {
      return NextResponse.json({ error: mediaFeedItems.error }, { status: 500 });
    }

    const tweets = buildBankerFeedTweets({ contractChanges, mediaFeedItems });
    const threadCountsResult = await getBankerFeedThreadCounts(tweets.map((tweet) => tweet._tweetKey));
    const replyCounts = threadCountsResult?.success === false ? {} : (threadCountsResult?.counts || {});

    const enrichedTweets = tweets.map((tweet) => ({
      ...tweet,
      _replyCount: Number(replyCounts[tweet._tweetKey] || 0),
    }));
    return NextResponse.json({ tweets: enrichedTweets, sync });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}