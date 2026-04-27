import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { buildBankerFeedTweets } from '@/lib/banker-feed';
import {
  appendBankerFeedThreadMessages,
  getBankerFeedThread,
  getBankerFeedUserMessageTimestamps,
} from '@/lib/db-helpers';
import {
  generateBankerThreadReplies,
  selectBankerThreadParticipants,
} from '@/lib/banker-feed-thread-reactions';

export const runtime = 'nodejs';

const REPLY_LIMIT = 25;
const REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 400;

function sanitizeUserMessage(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_LENGTH);
}

function buildParentSnapshot(tweet) {
  if (!tweet) return null;
  return {
    _tweetKey: tweet._tweetKey,
    _parentSourceKey: tweet._parentSourceKey,
    _source: tweet._source,
    _eventType: tweet._eventType || '',
    _timestamp: tweet._timestamp || null,
    _team: tweet._team || '',
    _parentNotes: tweet._parentNotes || '',
    _noteIndex: tweet._noteIndex ?? null,
    name: tweet.name || '@Unknown',
    role: tweet.role || 'fan',
    persona: tweet.persona || '',
    reaction: tweet.reaction || '',
    _replyCount: Number(tweet._replyCount || 0),
  };
}

function serializeThread(thread) {
  if (!thread) return null;
  return {
    ...thread,
    _id: thread._id?.toString?.() || null,
    createdAt: thread.createdAt || null,
    updatedAt: thread.updatedAt || null,
    messages: Array.isArray(thread.messages)
      ? thread.messages.map((message) => ({
        ...message,
        createdAt: message.createdAt || null,
      }))
      : [],
  };
}

async function resolveSleeperAvatar(sleeperId) {
  const normalized = String(sleeperId || '').trim();
  if (!normalized) return null;

  try {
    const response = await fetch(`https://api.sleeper.app/v1/user/${normalized}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.avatar ? `https://sleepercdn.com/avatars/${data.avatar}` : null;
  } catch {
    return null;
  }
}

async function getRateLimitStatus(userId) {
  if (!userId) {
    return { limit: REPLY_LIMIT, used: 0, remaining: REPLY_LIMIT, resetAt: null };
  }

  const since = new Date(Date.now() - REPLY_WINDOW_MS);
  const usage = await getBankerFeedUserMessageTimestamps({ userId, since });
  if (usage?.success === false) {
    throw new Error(usage.error);
  }

  const timestamps = Array.isArray(usage?.timestamps) ? usage.timestamps : [];
  return {
    limit: REPLY_LIMIT,
    used: timestamps.length,
    remaining: Math.max(0, REPLY_LIMIT - timestamps.length),
    resetAt: timestamps.length > 0 ? new Date(new Date(timestamps[0]).getTime() + REPLY_WINDOW_MS) : null,
  };
}

function buildEmptyThread(parentSnapshot) {
  return {
    tweetKey: parentSnapshot?._tweetKey || null,
    parentSourceKey: parentSnapshot?._parentSourceKey || null,
    parentSnapshot,
    aiParticipants: [],
    messages: [],
    createdAt: null,
    updatedAt: null,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tweetKey = String(searchParams.get('tweetKey') || '').trim();
    if (!tweetKey) {
      return NextResponse.json({ error: 'tweetKey is required' }, { status: 400 });
    }

    const [threadResult, session] = await Promise.all([
      getBankerFeedThread(tweetKey),
      getServerSession(authOptions).catch(() => null),
    ]);

    if (threadResult?.success === false) {
      return NextResponse.json({ error: threadResult.error }, { status: 500 });
    }

    const thread = threadResult?.thread || null;

    const rateLimit = session?.user?.id ? await getRateLimitStatus(session.user.id) : null;
    return NextResponse.json({
      thread: serializeThread(thread),
      rateLimit,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const tweetKey = String(body?.tweetKey || '').trim();
    const content = sanitizeUserMessage(body?.message);

    if (!tweetKey) {
      return NextResponse.json({ error: 'tweetKey is required' }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const rateLimit = await getRateLimitStatus(session.user.id);
    if (rateLimit.used >= REPLY_LIMIT) {
      return NextResponse.json({
        error: 'Reply limit reached for the last 7 days',
        rateLimit,
      }, { status: 429 });
    }

    const existingThreadResult = await getBankerFeedThread(tweetKey);
    if (existingThreadResult?.success === false) {
      return NextResponse.json({ error: existingThreadResult.error }, { status: 500 });
    }

    const existingThread = existingThreadResult.thread || null;
    const parentSnapshot = existingThread?.parentSnapshot || buildParentSnapshot(body?.parentSnapshot);
    if (!parentSnapshot) {
      return NextResponse.json({ error: 'Thread parent not found' }, { status: 404 });
    }

    const participants = Array.isArray(existingThread?.aiParticipants) && existingThread.aiParticipants.length > 0
      ? existingThread.aiParticipants
      : await selectBankerThreadParticipants({
        seed: `${tweetKey}:participants`,
        parentTweet: parentSnapshot,
        maxParticipants: 2,
      });

    const now = new Date();
    const userAvatar = await resolveSleeperAvatar(session.user.sleeperId);
    const userMessage = {
      id: `${tweetKey}:user:${crypto.randomUUID()}`,
      authorType: 'user',
      userId: session.user.id,
      username: session.user.username || session.user.name || 'User',
      userAvatar,
      content,
      parentMessageId: body?.parentMessageId || null,
      createdAt: now,
    };

    const threadMessages = Array.isArray(existingThread?.messages) ? existingThread.messages : [];
    const aiMessages = await generateBankerThreadReplies({
      participants,
      parentTweet: parentSnapshot,
      threadMessages: [...threadMessages, userMessage],
      latestUserMessage: userMessage,
      seed: `${tweetKey}:${threadMessages.length}:${now.getTime()}`,
    });

    const appendResult = await appendBankerFeedThreadMessages({
      tweetKey,
      parentSourceKey: parentSnapshot._parentSourceKey,
      parentSnapshot,
      aiParticipants: participants,
      messages: [userMessage, ...aiMessages],
    });

    if (appendResult?.success === false) {
      return NextResponse.json({ error: appendResult.error }, { status: 500 });
    }

    const updatedThreadResult = await getBankerFeedThread(tweetKey);
    if (updatedThreadResult?.success === false) {
      return NextResponse.json({ error: updatedThreadResult.error }, { status: 500 });
    }

    const updatedRateLimit = await getRateLimitStatus(session.user.id);
    return NextResponse.json({
      thread: serializeThread(updatedThreadResult.thread || buildEmptyThread(parentSnapshot)),
      rateLimit: updatedRateLimit,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}