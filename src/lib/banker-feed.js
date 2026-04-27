function normalizeTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stringifyKeyPart(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && typeof value.toString === 'function') {
    return value.toString();
  }
  return String(value);
}

function buildParentSourceKey(prefix, item) {
  const explicit = stringifyKeyPart(item?.sourceKey || item?.key || item?._id);
  if (explicit) {
    return explicit.startsWith(`${prefix}:`) ? explicit : `${prefix}:${explicit}`;
  }

  const timestamp = stringifyKeyPart(item?.timestamp || 'no-time');
  const team = stringifyKeyPart(item?.team || 'no-team');
  const notes = stringifyKeyPart(item?.notes || 'no-notes');
  return `${prefix}:${timestamp}:${team}:${notes}`;
}

function flattenAiNotes(items, mapParentFields) {
  const tweets = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (!Array.isArray(item?.ai_notes)) continue;

    for (const [index, note] of item.ai_notes.entries()) {
      if (!note || typeof note !== 'object') continue;
      const parentFields = mapParentFields(item, note, index) || {};
      tweets.push({
        ...note,
        ...parentFields,
      });
    }
  }

  return tweets;
}

export function buildBankerFeedTweets({ contractChanges = [], mediaFeedItems = [] } = {}) {
  const tweets = [
    ...flattenAiNotes(contractChanges, (item, note, index) => {
      const parentSourceKey = buildParentSourceKey('contract-change', item);
      return {
      _timestamp: item.timestamp || null,
      _team: item.team || '',
      _parentNotes: item.notes || '',
      _source: 'contract-change',
      _parentSourceKey: parentSourceKey,
      _tweetKey: `${parentSourceKey}:note:${index}`,
      _noteIndex: index,
    };
    }),
    ...flattenAiNotes(mediaFeedItems, (item, note, index) => {
      const parentSourceKey = buildParentSourceKey(item.source || 'media-feed', item);
      return {
      _timestamp: item.timestamp || null,
      _team: item.team || '',
      _parentNotes: item.notes || '',
      _source: item.source || 'media-feed',
      _eventType: item.eventType || '',
      _parentSourceKey: parentSourceKey,
      _tweetKey: `${parentSourceKey}:note:${index}`,
      _noteIndex: index,
    };
    }),
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