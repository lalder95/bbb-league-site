import draftPickKtcMatrix from '@/data/draft-pick-ktc-matrix.json';

export const DRAFT_PICK_BUCKETS = ['early', 'mid', 'late'];
export const DEFAULT_FUTURE_PICK_BUCKET = 'mid';

const ROUND_ONE_BUCKET_SALARIES = {
  early: 12,
  mid: 9,
  late: 6.5,
};

const ORDINAL_SUFFIXES = {
  1: 'st',
  2: 'nd',
  3: 'rd',
};

export const isDraftPickAsset = (asset) => asset?.assetType === 'pick';

export const getAssetKey = (asset) => asset?.uniqueKey || asset?.id || '';

export const getDisplayDraftSlot = (asset) => {
  if (!isDraftPickAsset(asset)) return null;
  return asset?.slotDetermined ? (asset?.pickNumber || null) : null;
};

export const getDraftPickBucket = (pickPosition, totalTeams = 12) => {
  const numericPosition = Number(pickPosition);
  const safeTotalTeams = Number.isFinite(Number(totalTeams)) && Number(totalTeams) > 0 ? Number(totalTeams) : 12;
  const clampedPosition = Math.min(Math.max(numericPosition || 1, 1), safeTotalTeams);

  if (clampedPosition <= 4) return 'early';
  if (clampedPosition <= 8) return 'mid';
  return 'late';
};

export const getDraftPickBucketLabel = (bucket) => {
  switch (String(bucket || '').toLowerCase()) {
    case 'early':
      return 'Early';
    case 'mid':
      return 'Mid';
    case 'late':
      return 'Late';
    default:
      return 'Unknown';
  }
};

export const getOrdinalRoundLabel = (round) => {
  const numericRound = Number(round);
  if (!Number.isFinite(numericRound) || numericRound <= 0) return 'Round';
  const teenCheck = numericRound % 100;
  const suffix = teenCheck >= 11 && teenCheck <= 13 ? 'th' : (ORDINAL_SUFFIXES[numericRound % 10] || 'th');
  return `${numericRound}${suffix}`;
};

export const formatDraftPickNumber = (round, pickPosition) => `${round}.${String(pickPosition).padStart(2, '0')}`;

export const getDraftPickKtcValue = (round, bucket) => {
  const roundValues = draftPickKtcMatrix?.[String(round)] || {};
  const value = Number(roundValues?.[String(bucket || '').toLowerCase()]);
  return Number.isFinite(value) ? value : 0;
};

export const getDraftPickSalary = (round, bucket) => {
  const numericRound = Number(round);
  const normalizedBucket = String(bucket || '').toLowerCase();

  if (numericRound === 1) {
    return ROUND_ONE_BUCKET_SALARIES[normalizedBucket] ?? ROUND_ONE_BUCKET_SALARIES.late;
  }

  if (numericRound === 2) return 4;
  if (numericRound === 3) return 2;
  if (numericRound >= 4 && numericRound <= 7) return 1;
  return 0;
};

export const getDraftPickBudgetValue = (asset, { ktcPerDollar } = {}) => {
  const ktc = parseFloat(asset?.ktcValue) || 0;
  const salary = Number(asset?.pickSalary ?? asset?.year2 ?? asset?.curYear) || 0;
  const ratio = Number(ktcPerDollar) || 0;
  const value = Math.round(ktc - salary * ratio);
  return Number.isNaN(value) ? 0 : value;
};

export const getAssetBudgetValue = (asset, { ktcPerDollar, usePositionRatios, positionRatios, avgKtcByPosition } = {}) => {
  if (isDraftPickAsset(asset)) {
    return getDraftPickBudgetValue(asset, { ktcPerDollar });
  }

  const ktc = parseFloat(asset?.ktcValue) || 0;
  const salary = parseFloat(asset?.curYear) || 0;
  const globalRatio = typeof ktcPerDollar === 'number' ? ktcPerDollar : 0;
  const posKey = (asset?.position || 'UNKNOWN').toUpperCase();
  const posRatio = usePositionRatios ? positionRatios?.[posKey] : null;
  const appliedRatio = (posRatio != null ? posRatio : globalRatio) || 0;
  const avgAdd = avgKtcByPosition?.[posKey] || 0;
  const value = Math.round(ktc + salary * (-appliedRatio) + avgAdd);
  return Number.isNaN(value) ? 0 : value;
};

export const formatDraftPickDisplayName = ({ season, round, bucket }) => {
  const seasonText = season ? `${season} ` : '';
  return `${seasonText}${getDraftPickBucketLabel(bucket)} ${getOrdinalRoundLabel(round)}`.trim();
};

export const createDraftPickAsset = ({
  season,
  round,
  pickPosition,
  originalOwner,
  currentOwner,
  bucketOverride,
  mappedSlotDebug,
  slotDetermined = false,
}) => {
  const bucket = bucketOverride || getDraftPickBucket(pickPosition);
  const ktcValue = getDraftPickKtcValue(round, bucket);
  const rookieSalary = getDraftPickSalary(round, bucket);
  const numericSeason = Number(season);
  const finalYear = Number.isFinite(numericSeason) ? String(numericSeason + 2) : '-';
  const pickNumber = formatDraftPickNumber(round, pickPosition);

  return {
    id: `pick-${season}-${round}-${pickPosition}-${originalOwner}-${currentOwner}`,
    uniqueKey: `pick-${season}-${round}-${pickPosition}-${originalOwner}-${currentOwner}`,
    assetType: 'pick',
    playerName: formatDraftPickDisplayName({ season, round, bucket }),
    pickNumber,
    slotDetermined,
    mappedSlotDebug,
    pickBucket: bucket,
    pickBucketLabel: getDraftPickBucketLabel(bucket),
    pickPosition,
    round,
    season: String(season),
    originalTeam: originalOwner,
    currentOwner,
    team: currentOwner,
    position: 'PICK',
    contractType: 'Rookie Pick',
    contractFinalYear: finalYear,
    age: '',
    nflTeam: '',
    ktcValue,
    pickSalary: rookieSalary,
    curYear: 0,
    year2: rookieSalary,
    year3: rookieSalary,
    year4: rookieSalary,
    deadCurYear: 0,
    deadYear2: 0,
    deadYear3: 0,
    deadYear4: 0,
    rfaEligible: false,
    franchiseTagEligible: false,
  };
};

export const describeTradeAsset = (asset) => {
  if (isDraftPickAsset(asset)) {
    const salary = Number(asset?.pickSalary) || 0;
    const ktc = Number(asset?.ktcValue) || 0;
    const slotText = getDisplayDraftSlot(asset);
    const detailParts = [
      slotText,
      `rookie $${salary.toFixed(1)}`,
      `KTC ${Math.round(ktc)}`,
    ].filter(Boolean);
    return `${asset.playerName} (${detailParts.join(', ')})`;
  }

  return `${asset.playerName} (${asset.position}, $${Number(asset?.curYear || 0).toFixed(1)})`;
};
