function normalizeTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function flattenAiNotes(items, mapParentFields) {
  const tweets = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (!Array.isArray(item?.ai_notes)) continue;

    for (const note of item.ai_notes) {
      if (!note || typeof note !== 'object') continue;
      tweets.push({
        ...note,
        ...mapParentFields(item),
      });
    }
  }

  return tweets;
}

export function buildBankerFeedTweets({ contractChanges = [], mediaFeedItems = [] } = {}) {
  const tweets = [
    ...flattenAiNotes(contractChanges, (item) => ({
      _timestamp: item.timestamp || null,
      _team: item.team || '',
      _parentNotes: item.notes || '',
      _source: 'contract-change',
    })),
    ...flattenAiNotes(mediaFeedItems, (item) => ({
      _timestamp: item.timestamp || null,
      _team: item.team || '',
      _parentNotes: item.notes || '',
      _source: item.source || 'media-feed',
      _eventType: item.eventType || '',
    })),
  ];

  tweets.sort((left, right) => {
    const leftTime = normalizeTimestamp(left?._timestamp)?.getTime();
    const rightTime = normalizeTimestamp(right?._timestamp)?.getTime();

    if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0;
    if (!Number.isFinite(leftTime)) return 1;
    if (!Number.isFinite(rightTime)) return -1;
    return rightTime - leftTime;
  });

  return tweets;
}