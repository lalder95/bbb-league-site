export const BADGE_PRESTIGE_CATALOG = [
  { key: 'championships', label: 'League Champion', rarity: true, tier: false },
  { key: 'divisionTitles', label: 'Division Champion', rarity: true, tier: true },
  { key: 'playoffAppearances', label: 'Playoff Appearances', rarity: true, tier: true },
  { key: 'backToBack', label: 'Back-to-Back', rarity: true, tier: false },
  { key: 'runnerUp', label: 'Runner-Up', rarity: true, tier: false },
  { key: 'regularSeasonKing', label: 'Regular Season #1', rarity: true, tier: false },
  { key: 'tenWinClub', label: '10-Win Club', rarity: true, tier: true },
  { key: 'threeTeamTrader', label: '3+ Team Trader', rarity: true, tier: true },
  { key: 'sweepArtist', label: 'Sweep Artist', rarity: true, tier: false },
  { key: 'scoringChampion', label: 'Scoring Champion', rarity: true, tier: false },
  { key: 'bestDefense', label: 'Best Defense', rarity: true, tier: false },
  { key: 'pointsJuggernaut', label: 'Points Juggernaut', rarity: true, tier: false },
  { key: 'divisionSweepAward', label: 'Division Sweep', rarity: true, tier: false },
  { key: 'cinderellaChampion', label: 'Cinderella Champion', rarity: true, tier: false },
  { key: 'woodenSpoon', label: 'Wooden Spoon', rarity: true, tier: false },
];

export const DEFAULT_BADGE_PRESTIGE_CONFIG = {
  rarity: {
    enabled: true,
    thresholds: {
      legendary: 10,
      epic: 25,
      rare: 45,
      uncommon: 70,
      common: 100,
    },
    badges: Object.fromEntries(BADGE_PRESTIGE_CATALOG.map(item => [item.key, item.rarity !== false])),
  },
  tiers: {
    enabled: true,
    badges: Object.fromEntries(BADGE_PRESTIGE_CATALOG.filter(item => item.tier).map(item => [item.key, true])),
    thresholds: {
      playoffAppearances: [1, 3, 5, 10],
      divisionTitles: [1, 3, 5, 10],
      tenWinClub: [1, 3, 5, 10],
      threeTeamTrader: [1, 3, 5, 10],
    },
  },
  prestige: {
    legendaryWallMarker: true,
    epicWallMarker: true,
    legendaryGlow: true,
    epicGlow: true,
  },
};

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeTierThresholds(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  const normalized = source.slice(0, 4).map((item, index) => {
    const prior = index === 0 ? 0 : Number(source[index - 1]) || 0;
    return Math.max(prior + (index === 0 ? 1 : 1), Math.floor(clampNumber(item, fallback[index], 1, 999)));
  });
  while (normalized.length < 4) {
    const last = normalized[normalized.length - 1] || 0;
    normalized.push(last + 1);
  }
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] <= normalized[index - 1]) normalized[index] = normalized[index - 1] + 1;
  }
  return normalized;
}

export function normalizeBadgePrestigeConfig(input = {}) {
  const defaults = DEFAULT_BADGE_PRESTIGE_CONFIG;
  const rarityInput = input?.rarity || {};
  const tiersInput = input?.tiers || {};
  const prestigeInput = input?.prestige || {};

  const legendary = clampNumber(rarityInput?.thresholds?.legendary, defaults.rarity.thresholds.legendary, 0.1, 100);
  const epic = Math.max(legendary, clampNumber(rarityInput?.thresholds?.epic, defaults.rarity.thresholds.epic, 0.1, 100));
  const rare = Math.max(epic, clampNumber(rarityInput?.thresholds?.rare, defaults.rarity.thresholds.rare, 0.1, 100));
  const uncommon = Math.max(rare, clampNumber(rarityInput?.thresholds?.uncommon, defaults.rarity.thresholds.uncommon, 0.1, 100));

  const rarityBadges = { ...defaults.rarity.badges };
  for (const item of BADGE_PRESTIGE_CATALOG) {
    if (Object.prototype.hasOwnProperty.call(rarityInput?.badges || {}, item.key)) {
      rarityBadges[item.key] = Boolean(rarityInput.badges[item.key]);
    }
  }

  const tierBadges = { ...defaults.tiers.badges };
  for (const item of BADGE_PRESTIGE_CATALOG.filter(entry => entry.tier)) {
    if (Object.prototype.hasOwnProperty.call(tiersInput?.badges || {}, item.key)) {
      tierBadges[item.key] = Boolean(tiersInput.badges[item.key]);
    }
  }

  const tierThresholds = {};
  for (const [key, fallback] of Object.entries(defaults.tiers.thresholds)) {
    tierThresholds[key] = normalizeTierThresholds(tiersInput?.thresholds?.[key], fallback);
  }

  return {
    rarity: {
      enabled: rarityInput.enabled === undefined ? defaults.rarity.enabled : Boolean(rarityInput.enabled),
      thresholds: {
        legendary,
        epic,
        rare,
        uncommon,
        common: 100,
      },
      badges: rarityBadges,
    },
    tiers: {
      enabled: tiersInput.enabled === undefined ? defaults.tiers.enabled : Boolean(tiersInput.enabled),
      badges: tierBadges,
      thresholds: tierThresholds,
    },
    prestige: {
      legendaryWallMarker: prestigeInput.legendaryWallMarker === undefined ? defaults.prestige.legendaryWallMarker : Boolean(prestigeInput.legendaryWallMarker),
      epicWallMarker: prestigeInput.epicWallMarker === undefined ? defaults.prestige.epicWallMarker : Boolean(prestigeInput.epicWallMarker),
      legendaryGlow: prestigeInput.legendaryGlow === undefined ? defaults.prestige.legendaryGlow : Boolean(prestigeInput.legendaryGlow),
      epicGlow: prestigeInput.epicGlow === undefined ? defaults.prestige.epicGlow : Boolean(prestigeInput.epicGlow),
    },
  };
}
