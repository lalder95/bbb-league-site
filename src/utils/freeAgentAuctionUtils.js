import { fromZonedTime } from 'date-fns-tz';

export function getDraftTimeZone(draft) {
  return draft?.timeZone || 'America/Chicago';
}

export function parseDraftDateTime(value, timeZone = 'America/Chicago') {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return value;

  const rawValue = String(value).trim();
  if (!rawValue) return new Date(NaN);
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(rawValue)) {
    return new Date(rawValue);
  }

  return fromZonedTime(rawValue, timeZone);
}

export function getPlayerStartTime(draftStartDate, startDelay, draftTimeZone = 'America/Chicago') {
  const start = parseDraftDateTime(draftStartDate, draftTimeZone);
  if (Number.isNaN(start.getTime())) return start;
  return new Date(start.getTime() + Number(startDelay || 0) * 60 * 60 * 1000);
}

export function getPlayerEndTime(
  draftStartDate,
  startDelay,
  nomDuration,
  contractPoints = 0,
  bidLog = [],
  playerId,
  draftBlind = false,
  draftTimeZone = 'America/Chicago',
  draftEndDate = null
) {
  const start = getPlayerStartTime(draftStartDate, startDelay, draftTimeZone);

  if (draftBlind) {
    const explicitEnd = parseDraftDateTime(draftEndDate, draftTimeZone);
    if (!Number.isNaN(explicitEnd.getTime())) {
      return explicitEnd;
    }

    const effectiveDuration = Number(nomDuration || 0);
    return new Date(start.getTime() + effectiveDuration * 60 * 1000);
  }

  const reductionPercent = Math.min(Number(contractPoints) * 0.0138, 0.95);
  const effectiveDuration = Number(nomDuration || 0) * (1 - reductionPercent);
  const calculatedEnd = new Date(start.getTime() + effectiveDuration * 60 * 1000);

  const playerBids = (bidLog || []).filter((bid) => String(bid.playerId) === String(playerId));
  let latestBidTime = null;
  if (playerBids.length > 0) {
    latestBidTime = new Date(
      playerBids.reduce((latest, bid) =>
        !latest || new Date(bid.timestamp) > new Date(latest) ? bid.timestamp : latest
      , null)
    );
  }

  let minEnd = null;
  if (latestBidTime) {
    minEnd = new Date(latestBidTime.getTime() + 24 * 60 * 60 * 1000);
  }

  if (minEnd && minEnd > calculatedEnd) {
    return minEnd;
  }

  return calculatedEnd;
}

export function resolveBlindAuctionOutcome(playerId, bidLog = []) {
  const playerBids = (bidLog || []).filter((bid) => String(bid.playerId) === String(playerId));
  if (playerBids.length === 0) {
    return { topScore: null, leaders: [], isTie: false };
  }

  const bestBidByTeam = new Map();
  playerBids.forEach((bid) => {
    const username = String(bid.username || 'Unknown');
    const existing = bestBidByTeam.get(username);
    const bidScore = Number(bid.contractPoints) || 0;
    const existingScore = existing ? Number(existing.contractPoints) || 0 : -Infinity;

    if (!existing || bidScore > existingScore) {
      bestBidByTeam.set(username, bid);
    }
  });

  const bestBids = Array.from(bestBidByTeam.values());
  const topScore = Math.max(...bestBids.map((bid) => Number(bid.contractPoints) || 0));
  const leaders = bestBids
    .filter((bid) => (Number(bid.contractPoints) || 0) === topScore)
    .sort((left, right) => String(left.username || '').localeCompare(String(right.username || '')));

  return {
    topScore,
    leaders,
    isTie: leaders.length > 1,
  };
}