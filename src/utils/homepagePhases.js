export const HOMEPAGE_PHASES = Object.freeze({
  IN_SEASON: 'in-season',
  OFFSEASON_BREAK: 'offseason-break',
  OFFSEASON_TAGS: 'offseason-tags',
  OFFSEASON_PRE_DRAFT: 'offseason-pre-draft',
  OFFSEASON_FREE_AGENCY: 'offseason-free-agency',
  OFFSEASON_EXTENSIONS: 'offseason-extensions',
});

export const HOMEPAGE_PHASE_OPTIONS = [
  { value: HOMEPAGE_PHASES.IN_SEASON, label: 'In Season' },
  { value: HOMEPAGE_PHASES.OFFSEASON_BREAK, label: 'Offseason Phase 1' },
  { value: HOMEPAGE_PHASES.OFFSEASON_TAGS, label: 'Offseason Phase 2' },
  { value: HOMEPAGE_PHASES.OFFSEASON_PRE_DRAFT, label: 'Offseason Phase 3' },
  { value: HOMEPAGE_PHASES.OFFSEASON_FREE_AGENCY, label: 'Offseason Phase 4' },
  { value: HOMEPAGE_PHASES.OFFSEASON_EXTENSIONS, label: 'Offseason Phase 5' },
];

export function normalizeLeagueStatus(status) {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function resolveHomepagePhase({
  calendarMonth,
  nflWeek,
  leagueStatus,
} = {}) {
  const month = Number(calendarMonth);
  const week = Number(nflWeek);
  const normalizedStatus = normalizeLeagueStatus(leagueStatus);

  if (month === 3) {
    return HOMEPAGE_PHASES.OFFSEASON_TAGS;
  }

  if (month === 4 || month === 5) {
    if (normalizedStatus === 'pre_draft') {
      return HOMEPAGE_PHASES.OFFSEASON_PRE_DRAFT;
    }
  }

  if (month === 5 || month === 6 || month === 7) {
    if (normalizedStatus !== 'pre_draft') {
      return HOMEPAGE_PHASES.OFFSEASON_FREE_AGENCY;
    }
  }

  if (month === 8) {
    if (normalizedStatus !== 'pre_draft') {
      return HOMEPAGE_PHASES.OFFSEASON_EXTENSIONS;
    }
  }

  if ((Number.isFinite(week) && week >= 18) || month === 2) {
    return HOMEPAGE_PHASES.OFFSEASON_BREAK;
  }

  const isInSeasonMonth = month >= 9 || month === 1;
  if (isInSeasonMonth && Number.isFinite(week) && week < 18) {
    return HOMEPAGE_PHASES.IN_SEASON;
  }

  return HOMEPAGE_PHASES.IN_SEASON;
}

export function getHomepagePhaseMeta(phase) {
  switch (phase) {
    case HOMEPAGE_PHASES.OFFSEASON_BREAK:
      return {
        title: 'League Break',
        subtitle: 'Season wrap-up, awards, movement, and draft order.',
      };
    case HOMEPAGE_PHASES.OFFSEASON_TAGS:
      return {
        title: 'Franchise And RFA Tags',
        subtitle: 'Teams need to finalize tags before April 1.',
      };
    case HOMEPAGE_PHASES.OFFSEASON_PRE_DRAFT:
      return {
        title: 'Restricted Free Agency And Rookie Draft',
        subtitle: 'Auction, mock draft, rookie obligations, and holdout decisions.',
      };
    case HOMEPAGE_PHASES.OFFSEASON_FREE_AGENCY:
      return {
        title: 'Free Agency',
        subtitle: 'Auction activity and live cap snapshots.',
      };
    case HOMEPAGE_PHASES.OFFSEASON_EXTENSIONS:
      return {
        title: 'Contract Extensions',
        subtitle: 'Extension deadline pushes teams into final roster decisions.',
      };
    case HOMEPAGE_PHASES.IN_SEASON:
    default:
      return {
        title: 'In Season',
        subtitle: 'Current matchups, standings, and the bAnker feed.',
      };
  }
}

export function phaseShowsBankerFeed(phase) {
  return phase !== HOMEPAGE_PHASES.OFFSEASON_BREAK;
}