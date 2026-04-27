'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

function getFeedNoteLabel(tweet) {
  if (tweet?._source !== 'free-agent-auction') return null;

  const labels = {
    bid: 'Auction Bid',
    winner: 'Auction Winner',
    reveal: 'Blind Reveal',
  };

  return labels[String(tweet?._eventType || '').toLowerCase()] || 'Auction';
}

function formatTweetDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const hours = date.getHours() % 12 || 12;
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear().toString().slice(-2);
  return `${month}/${day}/${year} ${hours}:${minutes} ${ampm}`;
}

function VerifiedAvatar({ tweet, size = 'large' }) {
  const classes = size === 'small'
    ? 'w-9 h-9 text-lg border'
    : 'w-12 h-12 text-2xl border-2';

  if (tweet?.role === 'journalist') {
    return (
      <span
        title="Verified"
        className={`inline-flex rounded-full bg-blue-600 items-center justify-center text-white font-bold border-blue-300 ${classes}`}
      >
        ✓
      </span>
    );
  }

  return (
    <span className={`inline-flex rounded-full bg-gray-700 items-center justify-center text-white font-bold border-gray-500 ${classes}`}>
      {String(tweet?.name || '@').charAt(1) || '@'}
    </span>
  );
}

function FeedCard({ tweet, actionLabel = 'Open Thread', onAction, compact = false, isReplyTarget = false, useTextAction = false }) {
  const replyCount = Number(tweet?._replyCount || 0);
  const targetClass = isReplyTarget ? 'ring-2 ring-[#FF4B1F]/60 border-[#FF4B1F]/40 shadow-[0_0_0_1px_rgba(255,75,31,0.25)]' : '';
  return (
    <div className={`bg-black/20 rounded-xl px-4 py-3 border border-white/10 flex flex-col gap-2 transition-colors ${targetClass}`}>
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <VerifiedAvatar tweet={tweet} size={compact ? 'small' : 'large'} />
        </div>
        <div className="flex flex-col min-w-0">
          <span className={`font-bold text-white leading-tight ${compact ? 'text-sm' : 'text-base'} truncate`}>
            {tweet.name?.replace(/^@/, '') || 'Unknown'}
          </span>
          <span className="text-gray-400 text-sm leading-tight truncate">
            @{tweet.name?.replace(/^@/, '') || 'Unknown'}
          </span>
        </div>
      </div>
      <div className={`${compact ? 'text-white/85 text-base' : 'text-white/90 text-lg'} leading-snug px-1 pt-1 pb-2`}>
        {tweet.reaction}
      </div>
      <div className="text-xs text-gray-400 pl-1 pt-1 flex items-center gap-2 flex-wrap">
        {tweet._timestamp ? formatTweetDate(tweet._timestamp) : ''}
        <span>·</span>
        <span className="text-blue-400 font-medium">bAnker for Mobile</span>
      </div>
      {tweet._parentNotes ? (
        <div className="text-[11px] text-white/50 italic pl-1 flex flex-wrap items-center gap-2">
          {getFeedNoteLabel(tweet) ? (
            <span className="rounded-full border border-[#FF4B1F]/35 bg-[#FF4B1F]/12 px-2 py-0.5 not-italic font-semibold uppercase tracking-[0.14em] text-[#ff9a7f]">
              {getFeedNoteLabel(tweet)}
            </span>
          ) : null}
          {tweet._parentNotes}
        </div>
      ) : null}
      {onAction ? (
        <div className="pt-2 flex justify-end">
          {useTextAction ? (
            <button
              type="button"
              onClick={onAction}
              className="text-xs font-semibold text-[#ff9a7f] hover:text-[#FF4B1F]"
            >
              {actionLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={onAction}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-colors ${replyCount > 0
                ? 'border-[#FF4B1F]/35 bg-[#FF4B1F]/12 text-[#ff9a7f] hover:bg-[#FF4B1F]/20'
                : 'border-white/15 bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70'}`}
              aria-label={replyCount > 0 ? `${replyCount} replies` : actionLabel}
              title={replyCount > 0 ? `${replyCount} replies` : actionLabel}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-7 6 2.6-2H18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" />
              </svg>
              {replyCount > 0 ? <span>{replyCount}</span> : null}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, children, maxWidth = 'max-w-3xl' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className={`relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#020817]/95 shadow-2xl shadow-black/40 ${maxWidth}`}>
        <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
          <button
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl text-white/70 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
          <h2 className="pr-12 text-xl font-semibold text-white sm:text-2xl">{title}</h2>
          {subtitle ? <p className="mt-1 pr-12 text-sm text-white/60">{subtitle}</p> : null}
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">{children}</div>
      </div>
    </div>
  );
}

function ThreadMessage({ message, isReplyTarget = false }) {
  const isAi = message?.authorType === 'ai';
  const isTyping = message?.authorType === 'typing';
  const wrapperClass = isAi
    ? 'border-white/10 bg-black/20'
    : isTyping
      ? 'border-white/10 bg-white/5'
    : 'border-[#FF4B1F]/25 bg-[#FF4B1F]/10';
  const targetClass = isReplyTarget ? 'ring-2 ring-[#FF4B1F]/60 border-[#FF4B1F]/40 shadow-[0_0_0_1px_rgba(255,75,31,0.25)]' : '';

  return (
    <div className={`rounded-xl border px-4 py-3 transition-colors ${wrapperClass} ${targetClass}`}>
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {isAi || isTyping ? (
            <VerifiedAvatar tweet={message} size="small" />
          ) : (
            <span className="inline-flex w-9 h-9 rounded-full bg-[#FF4B1F] items-center justify-center text-black font-bold border border-[#FF8A6B] overflow-hidden">
              {message?.userAvatar ? (
                <img src={message.userAvatar} alt={message?.username || 'User'} className="h-full w-full object-cover" />
              ) : (
                String(message?.username || 'U').charAt(0).toUpperCase()
              )}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">
            {isAi || isTyping ? (message?.name?.replace(/^@/, '') || 'Unknown') : (message?.username || 'User')}
          </div>
          <div className="text-xs text-white/45">
            {isAi || isTyping ? `@${message?.name?.replace(/^@/, '') || 'unknown'}${message?.persona ? ` · ${message.persona}` : ''}` : 'League member'}
          </div>
        </div>
      </div>
      <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/90">
        {isTyping ? (
          <span className="inline-flex items-center gap-1.5 text-white/70">
            <span>Typing</span>
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60 [animation-delay:300ms]" />
            </span>
          </span>
        ) : message?.content}
      </div>
      <div className="mt-3 text-[11px] text-white/40">{message?.createdAt ? formatTweetDate(message.createdAt) : ''}</div>
    </div>
  );
}

function getLoginHref() {
  if (typeof window === 'undefined') return '/login';
  const callbackUrl = `${window.location.pathname}${window.location.search}`;
  return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

function getOptimisticAiParticipants(thread, selectedTweet) {
  const existingParticipants = Array.isArray(thread?.aiParticipants) ? thread.aiParticipants.filter(Boolean) : [];
  if (existingParticipants.length > 0) {
    return existingParticipants.map((participant) => ({
      name: `@${String(participant?.name || 'Unknown').replace(/^@/, '')}`,
      role: participant?.role || 'fan',
      persona: participant?.persona || '',
    }));
  }

  if (selectedTweet?.name) {
    return [{
      name: `@${String(selectedTweet.name).replace(/^@/, '')}`,
      role: selectedTweet?.role || 'fan',
      persona: selectedTweet?.persona || '',
    }];
  }

  return [{
    name: '@bAnker',
    role: 'journalist',
    persona: 'league desk',
  }];
}

function getReplyTargetLabel(message) {
  if (!message) return 'the original post';
  if (message.authorType === 'original') {
    return message.name?.replace(/^@/, '') || 'the original post';
  }
  return message.authorType === 'ai'
    ? (message.name?.replace(/^@/, '') || 'Unknown')
    : (message.username || 'User');
}

function getReplyTargetExcerpt(message, maxLength = 140) {
  const sourceText = message?.authorType === 'original' ? message?.reaction : message?.content;
  const text = String(sourceText || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

export default function BankerFeed({ tweets }) {
  const { data: session } = useSession();
  const [selectedTweet, setSelectedTweet] = useState(null);
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');
  const [composerValue, setComposerValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rateLimit, setRateLimit] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [collapsedBranches, setCollapsedBranches] = useState({});

  const messageCount = useMemo(() => Array.isArray(thread?.messages) ? thread.messages.length : 0, [thread]);
  const threadParent = thread?.parentSnapshot || selectedTweet;
  const originalReplyTarget = useMemo(() => threadParent ? ({
    id: '__original__',
    authorType: 'original',
    name: threadParent.name,
    role: threadParent.role,
    persona: threadParent.persona,
    reaction: threadParent.reaction,
  }) : null, [threadParent]);

  useEffect(() => {
    if (!selectedTweet) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setSelectedTweet(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTweet]);

  useEffect(() => {
    if (!replyTarget?.id || typeof document === 'undefined') return;

    const element = document.querySelector(`[data-thread-message-id="${replyTarget.id}"]`);
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [replyTarget]);

  async function openThread(tweet) {
    const isSameThread = selectedTweet?._tweetKey === tweet?._tweetKey;
    setSelectedTweet(tweet);
    setThreadLoading(true);
    setThreadError('');
    setComposerValue('');
    if (!isSameThread) {
      setCollapsedBranches({});
    }

    try {
      const response = await fetch(`/api/media-feed/thread?tweetKey=${encodeURIComponent(tweet._tweetKey)}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load thread');
      }
      setThread(data.thread || {
        tweetKey: tweet._tweetKey,
        parentSourceKey: tweet._parentSourceKey,
        parentSnapshot: tweet,
        aiParticipants: [],
        messages: [],
      });
      setRateLimit(data.rateLimit || null);
      setReplyTarget(null);
    } catch (error) {
      setThread({
        tweetKey: tweet._tweetKey,
        parentSourceKey: tweet._parentSourceKey,
        parentSnapshot: tweet,
        aiParticipants: [],
        messages: [],
      });
      setThreadError(error.message || 'Failed to load thread');
    } finally {
      setThreadLoading(false);
    }
  }

  function toggleBranchCollapse(messageId) {
    setCollapsedBranches((prev) => ({
      ...prev,
      [messageId]: !(prev[messageId] ?? true),
    }));
  }

  async function handleSubmitReply(event) {
    event.preventDefault();
    if (!selectedTweet || !composerValue.trim()) return;

    setSubmitting(true);
    setThreadError('');

    const previousThread = thread;
    const previousRateLimit = rateLimit;
    const trimmedValue = composerValue.trim();
    const optimisticMessage = {
      id: `optimistic:${Date.now()}`,
      authorType: 'user',
      userId: session?.user?.id || null,
      username: session?.user?.username || session?.user?.name || 'User',
      userAvatar: thread?.messages?.find((message) => message?.authorType === 'user' && message?.userId === session?.user?.id)?.userAvatar || null,
      content: trimmedValue,
      parentMessageId: replyTarget?.id === '__original__' ? null : (replyTarget?.id || null),
      createdAt: new Date().toISOString(),
      optimistic: true,
    };
    const optimisticTypingMessages = getOptimisticAiParticipants(thread, selectedTweet).map((participant, index) => ({
      id: `${optimisticMessage.id}:typing:${index}`,
      authorType: 'typing',
      name: participant.name,
      role: participant.role,
      persona: participant.persona,
      content: '',
      parentMessageId: optimisticMessage.id,
      createdAt: new Date().toISOString(),
      optimistic: true,
    }));

    setThread((currentThread) => {
      const baseThread = currentThread || {
        tweetKey: selectedTweet._tweetKey,
        parentSourceKey: selectedTweet._parentSourceKey,
        parentSnapshot: selectedTweet,
        aiParticipants: [],
        messages: [],
      };

      return {
        ...baseThread,
        messages: [...(Array.isArray(baseThread.messages) ? baseThread.messages : []), optimisticMessage, ...optimisticTypingMessages],
      };
    });
    setRateLimit((currentRateLimit) => currentRateLimit ? {
      ...currentRateLimit,
      used: Number(currentRateLimit.used || 0) + 1,
      remaining: Math.max(0, Number(currentRateLimit.remaining || 0) - 1),
    } : currentRateLimit);
    setComposerValue('');
    setReplyTarget(null);

    try {
      const response = await fetch('/api/media-feed/thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tweetKey: selectedTweet._tweetKey,
          message: trimmedValue,
          parentMessageId: optimisticMessage.parentMessageId,
          parentSnapshot: selectedTweet,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to post reply');
      }

      setThread(data.thread || null);
      setRateLimit(data.rateLimit || null);
    } catch (error) {
      setThread(previousThread);
      setRateLimit(previousRateLimit);
      setComposerValue(trimmedValue);
      setReplyTarget(optimisticMessage.parentMessageId
        ? (previousThread?.messages || []).find((message) => message?.id === optimisticMessage.parentMessageId) || null
        : null);
      setThreadError(error.message || 'Failed to post reply');
    } finally {
      setSubmitting(false);
    }
  }

  const threadMessages = Array.isArray(thread?.messages) ? thread.messages : [];
  const messageChildren = useMemo(() => {
    const children = threadMessages.reduce((accumulator, message) => {
      const parentKey = message?.parentMessageId || '__root__';
      if (!accumulator[parentKey]) {
        accumulator[parentKey] = [];
      }
      accumulator[parentKey].push(message);
      return accumulator;
    }, {});

    Object.values(children).forEach((messages) => {
      messages.sort((left, right) => new Date(left?.createdAt || 0) - new Date(right?.createdAt || 0));
    });

    return children;
  }, [threadMessages]);

  function renderThreadBranch(parentMessageId = '__root__', depth = 0) {
    const messages = messageChildren[parentMessageId] || [];
    return messages.map((message) => {
      const childMessages = messageChildren[message.id] || [];
      const shouldAutoCollapse = depth >= 1 && childMessages.length > 0;
      const isCollapsed = collapsedBranches[message.id] ?? shouldAutoCollapse;
      const isTyping = message?.authorType === 'typing';

      return (
        <div
          key={message.id || `${message.authorType}-${message.createdAt}`}
          data-thread-message-id={message.id || ''}
          className={depth > 0 ? 'mt-3 ml-5 border-l border-white/10 pl-4' : 'mt-3'}
        >
          <ThreadMessage message={message} isReplyTarget={replyTarget?.id === message?.id} />
          {!isTyping ? (
            <div className="mt-2 flex items-center gap-3 pl-1 text-xs">
              <button
                type="button"
                onClick={() => setReplyTarget(message)}
                className="font-semibold text-[#ff9a7f] hover:text-[#FF4B1F]"
              >
                Reply
              </button>
              {childMessages.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggleBranchCollapse(message.id)}
                  className="font-semibold text-white/55 hover:text-white"
                >
                  {isCollapsed ? `Show ${childMessages.length} ${childMessages.length === 1 ? 'reply' : 'replies'}` : 'Hide replies'}
                </button>
              ) : null}
              {message?.optimistic ? (
                <span className="text-white/40">Sending…</span>
              ) : null}
            </div>
          ) : null}
          {!isCollapsed ? renderThreadBranch(message.id, Math.min(depth + 1, 6)) : null}
        </div>
      );
    });
  }

  if (!tweets || tweets.length === 0) {
    return (
      <div className="text-center text-white/70 py-6 md:py-8">
        No posts available
      </div>
    );
  }

  return (
    <>
      <div
        className="space-y-2 overflow-y-auto"
        style={{
          maxHeight: '420px',
          scrollbarWidth: 'thin',
          scrollbarColor: '#FF4B1F #1a232b',
        }}
      >
        {tweets.map((tweet) => (
          <FeedCard
            key={tweet._tweetKey || `${tweet.name}-${tweet._timestamp}`}
            tweet={tweet}
            onAction={() => openThread(tweet)}
          />
        ))}
      </div>

      {selectedTweet ? (
        <ModalShell
          title="bAnker Thread"
          subtitle={`${messageCount} ${messageCount === 1 ? 'reply' : 'replies'}`}
          onClose={() => setSelectedTweet(null)}
        >
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Thread</div>
                  <div className="text-xs text-white/50">Replies stay nested under the original post.</div>
                </div>
                {session?.user && rateLimit ? (
                  <div className="text-right text-xs text-white/50">
                    <div>{rateLimit.remaining} of {rateLimit.limit} replies left this week</div>
                    {rateLimit.resetAt ? <div>Resets after {formatTweetDate(rateLimit.resetAt)}</div> : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                {threadParent ? (
                  <FeedCard
                    tweet={threadParent}
                    compact
                    isReplyTarget={replyTarget?.id === '__original__'}
                    onAction={() => setReplyTarget(originalReplyTarget)}
                    actionLabel="Reply"
                    useTextAction
                  />
                ) : null}
                {threadLoading ? (
                  <div className="text-sm text-white/60">Loading thread…</div>
                ) : threadMessages.length > 0 ? (
                  <div className="mt-3">{renderThreadBranch()}</div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/55">
                    No replies yet. Start the thread from here.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="text-sm font-semibold text-white">Reply</div>
              <div className="mt-1 text-xs text-white/50">
                Logged-in users can send up to 25 thread replies every rolling 7 days.
              </div>
              {!replyTarget ? (
                <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-white/55">
                  Select a comment in the thread to reply. You can reply to the original post or any reply further down the chain.
                </div>
              ) : (
                <>
                  <div className="mt-3 rounded-xl border border-[#FF4B1F]/30 bg-[#FF4B1F]/10 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ff9a7f]">
                      Replying To {getReplyTargetLabel(replyTarget)}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-white/85">
                      {getReplyTargetExcerpt(replyTarget)}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-white/50">
                    <span>
                      Replying to {getReplyTargetLabel(replyTarget)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyTarget(null)}
                      className="font-semibold text-white/60 hover:text-white"
                    >
                      Clear
                    </button>
                  </div>
                </>
              )}

              {threadError ? (
                <div className="mt-3 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {threadError}
                </div>
              ) : null}

              {!session?.user ? (
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-white/75">Log in to post a reply and trigger in-character responses.</div>
                  <Link
                    href={getLoginHref()}
                    className="inline-flex items-center justify-center rounded-md bg-[#FF4B1F] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#ff6a45]"
                  >
                    Log In To Reply
                  </Link>
                </div>
              ) : replyTarget ? (
                <form className="mt-4 space-y-3" onSubmit={handleSubmitReply}>
                  <textarea
                    value={composerValue}
                    onChange={(event) => setComposerValue(event.target.value.slice(0, 400))}
                    placeholder="Reply to the thread..."
                    className="min-h-[112px] w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-[#FF4B1F]/50"
                    disabled={submitting || (rateLimit && rateLimit.remaining <= 0)}
                  />
                  <div className="flex items-center justify-between gap-3 text-xs text-white/50">
                    <span>{composerValue.trim().length}/400</span>
                    {rateLimit && rateLimit.remaining <= 0 ? (
                      <span className="text-red-200">Weekly reply limit reached.</span>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-end">
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-md bg-[#FF4B1F] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#ff6a45] disabled:cursor-not-allowed disabled:bg-[#FF4B1F]/40 disabled:text-black/60"
                      disabled={submitting || !composerValue.trim() || (rateLimit && rateLimit.remaining <= 0)}
                    >
                      {submitting ? 'Posting…' : 'Post Reply'}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}