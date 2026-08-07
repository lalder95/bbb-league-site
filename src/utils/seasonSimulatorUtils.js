import { buildStarterSlots, fillWeeklyMaxDetailed } from './maxpf.js';

export const DEFAULT_SIMULATION_SETTINGS = {
  simulations: 250,
  boomBustStdDev: 0.18,
  shortInjuryChance: 0.05,
  longInjuryChance: 0.01,
};

export function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  if (!response.ok) {
    throw new Error(`Failed fetch: ${url} (${response.status})`);
  }
  return response.json();
}

export function getCurrentWeek(state = {}) {
  const week = Number(state?.display_week ?? state?.week ?? 1);
  return Number.isFinite(week) && week > 0 ? week : 1;
}

export function getPlayoffWeekStart(league = {}) {
  const start = Number(league?.settings?.playoff_week_start);
  return Number.isFinite(start) && start > 0 ? start : 15;
}

export function getRegularSeasonEndWeek(league = {}) {
  const playoffWeekStart = getPlayoffWeekStart(league);
  return Math.max(1, playoffWeekStart - 1);
}

export function gaussianRandom(randomFn = Math.random) {
  let u = 0;
  let v = 0;
  while (u === 0) u = randomFn();
  while (v === 0) v = randomFn();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function randomizeProjectedPoints(basePoints, rngConfig = {}, randomFn = Math.random, options = {}) {
  const startingPoints = Math.max(0, Number(basePoints) || 0);
  if (startingPoints === 0) return 0;

  // Backward-compatible injury switches. `includeInjury: false` still disables
  // both injury types, while callers can now control short/in-game and
  // unavailable/pre-lineup injuries independently.
  const includeInjury = options.includeInjury !== false;
  const includeShortInjury = options.includeShortInjury ?? includeInjury;
  const includeLongInjury = options.includeLongInjury ?? includeInjury;
  const boomBustStdDev = clampNumber(rngConfig.boomBustStdDev ?? DEFAULT_SIMULATION_SETTINGS.boomBustStdDev, 0, 1);
  const shortInjuryChance = clampNumber(rngConfig.shortInjuryChance ?? DEFAULT_SIMULATION_SETTINGS.shortInjuryChance, 0, 1);
  const longInjuryChance = clampNumber(rngConfig.longInjuryChance ?? DEFAULT_SIMULATION_SETTINGS.longInjuryChance, 0, 1);

  if (includeLongInjury && randomFn() < longInjuryChance) return 0;

  let multiplier = 1 + gaussianRandom(randomFn) * boomBustStdDev;
  if (includeShortInjury && randomFn() < shortInjuryChance) {
    multiplier *= 0.35 + randomFn() * 0.45;
  }

  return Math.max(0, Number((startingPoints * multiplier).toFixed(2)));
}

export function normalizeSleeperProjectionEntries(rawPayload) {
  const sourceEntries = Array.isArray(rawPayload)
    ? rawPayload
    : Array.isArray(rawPayload?.players)
      ? rawPayload.players
      : Array.isArray(rawPayload?.data)
        ? rawPayload.data
        : rawPayload && typeof rawPayload === 'object'
          ? Object.entries(rawPayload).map(([playerId, value]) => ({ player_id: playerId, ...(value || {}) }))
          : [];

  const normalized = new Map();

  for (const entry of sourceEntries) {
    const playerId = String(
      entry?.player_id ?? entry?.playerId ?? entry?.id ?? entry?.player?.player_id ?? entry?.player?.id ?? ''
    ).trim();
    if (!playerId) continue;

    const projectedPointsCandidates = [
      entry?.projected_pts,
      entry?.projectedPoints,
      entry?.projected_points,
      entry?.projected,
      entry?.fantasy_points,
      entry?.points,
      entry?.pts,
      entry?.pts_ppr,
      entry?.pts_half_ppr,
      entry?.pts_std,
      entry?.appliedTotal,
      entry?.applied_total,
      entry?.stats?.projected,
      entry?.stats?.pts,
      entry?.stats?.pts_ppr,
      entry?.stats?.pts_half_ppr,
      entry?.stats?.pts_std,
      entry?.stats?.fantasy_points,
    ];
    const projectedPoints = projectedPointsCandidates.find((value) => Number.isFinite(Number(value)));

    const position = String(
      entry?.position ?? entry?.fantasy_position ?? entry?.player?.position ?? entry?.player?.fantasy_position ?? 'UNK'
    ).toUpperCase();

    normalized.set(playerId, {
      playerId,
      position: position || 'UNK',
      projectedPoints: Number(projectedPoints ?? 0) || 0,
      raw: entry,
    });
  }

  return normalized;
}

export function buildPlayerMetaMap(playersMeta = {}) {
  const map = new Map();
  for (const [playerId, meta] of Object.entries(playersMeta || {})) {
    const position = String(meta?.position ?? meta?.fantasy_positions?.[0] ?? meta?.fantasy_position ?? 'UNK').toUpperCase();
    const status = String(meta?.status || '').trim();
    const injuryStatus = String(meta?.injury_status || '').trim();
    const name = String(
      meta?.full_name ||
      meta?.fullName ||
      [meta?.first_name, meta?.last_name].filter(Boolean).join(' ') ||
      meta?.name ||
      meta?.player_name ||
      ''
    ).trim();
    map.set(String(playerId), {
      position: position || 'UNK',
      name,
      nflTeam: String(meta?.team || meta?.team_abbr || meta?.nfl_team || '').toUpperCase(),
      status,
      injuryStatus,
      availableForLineup: Boolean(meta?.active) && !injuryStatus && !['out', 'ir', 'injured reserve', 'suspended', 'doubtful'].includes(status.toLowerCase()),
      raw: meta,
    });
  }
  return map;
}

export function buildTeamRosterMap(rosters = [], users = []) {
  const userById = new Map((Array.isArray(users) ? users : []).map((user) => [String(user?.user_id), user]));
  const rosterMap = new Map();

  for (const roster of Array.isArray(rosters) ? rosters : []) {
    const rosterId = Number(roster?.roster_id ?? roster?.rosterId);
    if (!Number.isFinite(rosterId)) continue;

    const owner = userById.get(String(roster?.owner_id));
    const displayName = owner?.display_name || owner?.team_name || owner?.username || `Team ${rosterId}`;

    rosterMap.set(rosterId, {
      rosterId,
      ownerId: roster?.owner_id || null,
      displayName,
      teamName: owner?.team_name || owner?.display_name || displayName,
      players: Array.isArray(roster?.players) ? roster.players.map(String) : [],
      wins: Number(roster?.wins) || 0,
      losses: Number(roster?.losses) || 0,
      ties: Number(roster?.ties) || 0,
      pointsFor: Number(roster?.fpts) || 0,
      pointsAgainst: Number(roster?.fpts_against) || 0,
    });
  }

  return rosterMap;
}

export function cloneRosterMap(rosterMap = new Map()) {
  const cloned = new Map();
  for (const [rosterId, team] of rosterMap.entries()) {
    cloned.set(Number(rosterId), {
      ...team,
      players: Array.isArray(team?.players) ? [...team.players] : [],
    });
  }
  return cloned;
}

export function applyRosterTradesToMap(rosterMap, rosterTrades = []) {
  const clonedMap = cloneRosterMap(rosterMap);
  const appliedMoves = [];

  for (const trade of Array.isArray(rosterTrades) ? rosterTrades : []) {
    const fromRosterId = Number(trade?.fromRosterId);
    const toRosterId = Number(trade?.toRosterId);
    const playerId = String(trade?.asset?.playerId || trade?.playerId || '').trim();
    if (!Number.isFinite(fromRosterId) || !Number.isFinite(toRosterId) || !playerId) continue;

    const fromTeam = clonedMap.get(fromRosterId);
    const toTeam = clonedMap.get(toRosterId);
    if (!fromTeam || !toTeam) continue;

    const sourceIndex = fromTeam.players.indexOf(playerId);
    if (sourceIndex === -1) continue;

    fromTeam.players.splice(sourceIndex, 1);
    if (!toTeam.players.includes(playerId)) {
      toTeam.players.push(playerId);
    }

    appliedMoves.push({
      fromRosterId,
      toRosterId,
      playerId,
      asset: trade.asset || null,
    });
  }

  return { rosterMap: clonedMap, appliedMoves };
}

export function buildStandingsFromCurrentState(rosterMap, { startFromCurrentWeek }) {
  return Array.from(rosterMap.values()).map((team) => ({
    rosterId: team.rosterId,
    displayName: team.displayName,
    teamName: team.teamName,
    wins: startFromCurrentWeek ? team.wins : 0,
    losses: startFromCurrentWeek ? team.losses : 0,
    ties: startFromCurrentWeek ? team.ties : 0,
    pointsFor: startFromCurrentWeek ? team.pointsFor : 0,
    pointsAgainst: startFromCurrentWeek ? team.pointsAgainst : 0,
    playoffAppearances: 0,
    championships: 0,
  }));
}

export function sortStandings(standings) {
  return [...standings].sort((left, right) => {
    if (right.wins !== left.wins) return right.wins - left.wins;
    if (right.pointsFor !== left.pointsFor) return right.pointsFor - left.pointsFor;
    if (right.ties !== left.ties) return right.ties - left.ties;
    if (left.losses !== right.losses) return left.losses - right.losses;
    return left.displayName.localeCompare(right.displayName);
  });
}

export async function fetchSleeperLeagueBundle(leagueId) {
  const [league, rosters, users, state, playersMeta] = await Promise.all([
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}`),
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/users`),
    fetchJson('https://api.sleeper.app/v1/state/nfl'),
    fetchJson('https://api.sleeper.app/v1/players/nfl', { cache: 'force-cache', next: { revalidate: 3600 } }),
  ]);

  return {
    league,
    rosters,
    users,
    state,
    playersMeta,
    currentWeek: getCurrentWeek(state),
    season: Number(state?.season || league?.season || new Date().getFullYear()),
    playoffWeekStart: getPlayoffWeekStart(league),
    regularSeasonEndWeek: getRegularSeasonEndWeek(league),
    rosterPositions: Array.isArray(league?.roster_positions) ? league.roster_positions : [],
    playoffTeams: Number(league?.settings?.playoff_teams) || 6,
  };
}

export async function fetchSleeperWeeklyMatchups(leagueId, week) {
  try {
    const matchups = await fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
    return Array.isArray(matchups) ? matchups : [];
  } catch {
    return [];
  }
}

export async function fetchSleeperWeeklyProjections({ season, week }) {
  const url = new URL(`https://api.sleeper.com/projections/nfl/${season}/${week}`);
  url.searchParams.set('season_type', 'regular');
  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Sleeper projections failed (${response.status}) for season=${season}, week=${week}`);
  }
  return normalizeSleeperProjectionEntries(await response.json());
}

function getProjectedPointsForPlayer(playerId, projectionMap, playerMetaMap) {
  const projection = projectionMap.get(String(playerId));
  const meta = playerMetaMap.get(String(playerId)) || {};
  const position = projection?.position || meta.position || 'UNK';
  return {
    playerId: String(playerId),
    position,
    points: Number(projection?.projectedPoints ?? 0) || 0,
    name: projection?.name || meta.name || '',
    nflTeam: projection?.nflTeam || meta.nflTeam || '',
  };
}

function buildRosterPlayerAvailability(meta = {}) {
  const status = String(meta?.status || '').trim().toLowerCase();
  const injuryStatus = String(meta?.injuryStatus || meta?.injury_status || '').trim();
  if (meta?.availableForLineup === false) return false;
  if (status && ['out', 'ir', 'injured reserve', 'suspended', 'doubtful'].includes(status)) return false;
  if (injuryStatus) return false;
  return true;
}

function buildProjectedLineupPlayers({ roster, projectionMap, playerMetaMap }) {
  return (roster?.players || [])
    .map((playerId) => {
      const projected = getProjectedPointsForPlayer(playerId, projectionMap, playerMetaMap);
      const meta = playerMetaMap.get(String(playerId)) || {};
      return {
        ...projected,
        available: buildRosterPlayerAvailability(meta),
      };
    })
    .filter((player) => player.available);
}

function buildSlotLabels(rosterPositions = []) {
  const ignored = new Set(['BN', 'IR', 'TAXI']);
  const counts = new Map();
  const slots = [];

  for (const rawSlot of rosterPositions) {
    const slot = String(rawSlot || '').trim();
    if (!slot || ignored.has(slot)) continue;
    counts.set(slot, (counts.get(slot) || 0) + 1);
    slots.push(slot);
  }

  const seen = new Map();
  return slots.map((slot) => {
    seen.set(slot, (seen.get(slot) || 0) + 1);
    return counts.get(slot) > 1 ? `${slot}${seen.get(slot)}` : slot;
  });
}

function buildProjectedLineupTemplateFromPlayers({
  weeklyPlayers = [],
  slots,
  flexDefs,
  slotLabels = [],
}) {
  const projectedLineup = fillWeeklyMaxDetailed(weeklyPlayers, slots, flexDefs);

  return projectedLineup.assignments.map((assignment, index) => ({
    ...assignment,
    slotLabel: slotLabels[index] || assignment.slot || assignment.position || 'UNK',
    projectedPoints: Number(assignment.points || 0),
  }));
}

function buildPreparedWeeklyRoster({
  roster,
  projectionMap,
  playerMetaMap,
  slots,
  flexDefs,
  slotLabels = [],
}) {
  const playerPool = buildProjectedLineupPlayers({ roster, projectionMap, playerMetaMap });
  const healthyTemplate = buildProjectedLineupTemplateFromPlayers({
    weeklyPlayers: playerPool,
    slots,
    flexDefs,
    slotLabels,
  });

  return {
    playerPool,
    healthyTemplate,
    healthyStarterIds: new Set(healthyTemplate.map((assignment) => String(assignment.playerId))),
  };
}

function selectLineupForSimulation({
  preparedRoster,
  rngConfig = {},
  slots,
  flexDefs,
  slotLabels = [],
  randomFn = Math.random,
}) {
  const prepared = preparedRoster || { playerPool: [], healthyTemplate: [], healthyStarterIds: new Set() };
  const unavailableChance = clampNumber(
    rngConfig.longInjuryChance ?? DEFAULT_SIMULATION_SETTINGS.longInjuryChance,
    0,
    1
  );

  // Fast path: only an unavailable projected starter can change the optimal
  // lineup. Roll starters first. If all projected starters are available,
  // bench-player availability cannot affect the selected lineup, so the cached
  // healthy template is valid and no lineup optimizer call is needed.
  if (unavailableChance <= 0 || prepared.healthyTemplate.length === 0) {
    return prepared.healthyTemplate;
  }

  const unavailablePlayerIds = new Set();
  let starterUnavailable = false;

  for (const assignment of prepared.healthyTemplate) {
    const playerId = String(assignment.playerId);
    if (randomFn() < unavailableChance) {
      unavailablePlayerIds.add(playerId);
      starterUnavailable = true;
    }
  }

  if (!starterUnavailable) {
    return prepared.healthyTemplate;
  }

  // Once a starter is unavailable, replacement availability matters. Roll the
  // remaining player pool exactly once for this simulated team-week, then
  // rebuild the optimal lineup from players who are still available.
  for (const player of prepared.playerPool) {
    const playerId = String(player.playerId);
    if (prepared.healthyStarterIds.has(playerId)) continue;
    if (randomFn() < unavailableChance) {
      unavailablePlayerIds.add(playerId);
    }
  }

  const availablePlayers = prepared.playerPool.filter(
    (player) => !unavailablePlayerIds.has(String(player.playerId))
  );

  return buildProjectedLineupTemplateFromPlayers({
    weeklyPlayers: availablePlayers,
    slots,
    flexDefs,
    slotLabels,
  });
}

function simulatePreparedLineup(template = [], rngConfig = {}, randomFn = Math.random) {
  let total = 0;
  const assignments = new Array(template.length);

  for (let index = 0; index < template.length; index += 1) {
    const assignment = template[index];
    const points = randomizeProjectedPoints(
      assignment.projectedPoints,
      rngConfig,
      randomFn,
      { includeLongInjury: false, includeShortInjury: true }
    );

    total += points;
    assignments[index] = {
      ...assignment,
      points,
    };
  }

  return {
    total,
    assignments,
  };
}

function simulatePreparedRosterWeek({
  preparedRoster,
  rngConfig = {},
  slots,
  flexDefs,
  slotLabels = [],
  randomFn = Math.random,
}) {
  const template = selectLineupForSimulation({
    preparedRoster,
    rngConfig,
    slots,
    flexDefs,
    slotLabels,
    randomFn,
  });

  const simulated = simulatePreparedLineup(template, rngConfig, randomFn);
  return {
    ...simulated,
    chosen: template.map((assignment) => assignment.playerId),
  };
}

export function scoreRosterOptimalLineup({
  roster,
  projectionMap,
  playerMetaMap,
  rosterPositions,
  rngConfig,
}) {
  const { slots, flexDefs } = buildStarterSlots(rosterPositions);
  const slotLabels = buildSlotLabels(rosterPositions);
  const preparedRoster = buildPreparedWeeklyRoster({
    roster,
    projectionMap,
    playerMetaMap,
    slots,
    flexDefs,
    slotLabels,
  });

  return simulatePreparedRosterWeek({
    preparedRoster,
    rngConfig,
    slots,
    flexDefs,
    slotLabels,
  });
}

function pairMatchupsFromWeek(matchups, rosterIds) {
  const groups = new Map();
  for (const matchup of Array.isArray(matchups) ? matchups : []) {
    const matchupId = Number(matchup?.matchup_id ?? matchup?.matchupId ?? -1);
    const rosterId = Number(matchup?.roster_id ?? matchup?.rosterId);
    if (!Number.isFinite(rosterId)) continue;
    if (!groups.has(matchupId)) groups.set(matchupId, []);
    groups.get(matchupId).push({ rosterId, raw: matchup });
  }

  const pairings = [];
  for (const [matchupId, rosterGroup] of groups.entries()) {
    if (rosterGroup.length < 2) continue;
    pairings.push({
      matchupId,
      homeRosterId: rosterGroup[0].rosterId,
      awayRosterId: rosterGroup[1].rosterId,
    });
  }

  if (pairings.length > 0) return pairings;

  const orderedRosterIds = [...rosterIds].sort((left, right) => left - right);
  for (let index = 0; index + 1 < orderedRosterIds.length; index += 2) {
    pairings.push({ matchupId: `synthetic-${index}`, homeRosterId: orderedRosterIds[index], awayRosterId: orderedRosterIds[index + 1] });
  }
  return pairings;
}

function buildPlayoffPairings(activeTeams, standings) {
  const seedOrder = activeTeams
    .slice()
    .sort((left, right) => {
      const leftStanding = standings.get(left);
      const rightStanding = standings.get(right);
      if (rightStanding.wins !== leftStanding.wins) return rightStanding.wins - leftStanding.wins;
      if (rightStanding.pointsFor !== leftStanding.pointsFor) return rightStanding.pointsFor - leftStanding.pointsFor;
      return leftStanding.displayName.localeCompare(rightStanding.displayName);
    });

  const pairings = [];
  let leftIndex = 0;
  let rightIndex = seedOrder.length - 1;
  let matchupIndex = 0;
  while (leftIndex < rightIndex) {
    pairings.push({ matchupId: `playoff-${matchupIndex}`, homeRosterId: seedOrder[leftIndex], awayRosterId: seedOrder[rightIndex] });
    leftIndex += 1;
    rightIndex -= 1;
    matchupIndex += 1;
  }

  const byeTeam = leftIndex === rightIndex ? seedOrder[leftIndex] : null;
  return { pairings, byeTeam };
}

function updateStandingsForGame(standings, homeRosterId, awayRosterId, homeScore, awayScore) {
  const homeTeam = standings.get(homeRosterId);
  const awayTeam = standings.get(awayRosterId);
  if (!homeTeam || !awayTeam) return;

  homeTeam.pointsFor += homeScore;
  homeTeam.pointsAgainst += awayScore;
  awayTeam.pointsFor += awayScore;
  awayTeam.pointsAgainst += homeScore;

  if (homeScore > awayScore) {
    homeTeam.wins += 1;
    awayTeam.losses += 1;
  } else if (awayScore > homeScore) {
    awayTeam.wins += 1;
    homeTeam.losses += 1;
  } else {
    homeTeam.ties += 1;
    awayTeam.ties += 1;
  }
}

function getMatchupScore(matchup) {
  const candidates = [
    matchup?.points,
    matchup?.pts,
    matchup?.score,
    matchup?.fpts,
    matchup?.players_points,
    matchup?.playersPoints,
  ];
  const numeric = candidates.find((value) => Number.isFinite(Number(value)));
  return Number(numeric ?? 0) || 0;
}

async function buildBaselineStandings({
  leagueId,
  rosterMap,
  currentWeek,
  startFromCurrentWeek,
  matchupCache = null,
}) {
  const standings = buildStandingsFromCurrentState(rosterMap, { startFromCurrentWeek: false });
  const standingsMap = new Map(standings.map((team) => [team.rosterId, team]));

  const lastCompletedWeek = startFromCurrentWeek ? Math.max(0, currentWeek - 1) : 0;
  for (let week = 1; week <= lastCompletedWeek; week += 1) {
    const matchups = matchupCache?.has(week)
      ? matchupCache.get(week)
      : await fetchSleeperWeeklyMatchups(leagueId, week);

    const groups = new Map();
    for (const matchup of Array.isArray(matchups) ? matchups : []) {
      const matchupId = Number(matchup?.matchup_id ?? matchup?.matchupId ?? -1);
      const rosterId = Number(matchup?.roster_id ?? matchup?.rosterId);
      if (!Number.isFinite(rosterId)) continue;
      if (!groups.has(matchupId)) groups.set(matchupId, []);
      groups.get(matchupId).push(matchup);
    }

    for (const matchupGroup of groups.values()) {
      if (matchupGroup.length < 2) continue;
      const home = matchupGroup[0];
      const away = matchupGroup[1];
      const homeRosterId = Number(home?.roster_id ?? home?.rosterId);
      const awayRosterId = Number(away?.roster_id ?? away?.rosterId);
      const homeScore = getMatchupScore(home);
      const awayScore = getMatchupScore(away);
      updateStandingsForGame(standingsMap, homeRosterId, awayRosterId, homeScore, awayScore);
    }
  }

  return { standings, standingsMap };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const input = Array.from(items || []);
  const results = new Array(input.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= input.length) return;
      results[index] = await mapper(input[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, input.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function addAssignmentStats(slotStats, playerStats, assignments = []) {
  for (const assignment of assignments) {
    const slot = assignment.slotLabel || assignment.slot || assignment.position || 'UNK';
    const points = Number(assignment.points || 0);
    const playerId = String(assignment.playerId || '');
    const name = assignment.name || assignment.playerName || playerId;
    const position = assignment.position || 'UNK';

    if (!slotStats.has(slot)) {
      slotStats.set(slot, { label: slot, appearances: 0, pointsTotal: 0 });
    }
    const slotRow = slotStats.get(slot);
    slotRow.appearances += 1;
    slotRow.pointsTotal += points;

    if (!playerId) continue;
    if (!playerStats.has(playerId)) {
      playerStats.set(playerId, {
        playerId,
        name,
        position,
        startCount: 0,
        pointsTotal: 0,
      });
    }

    const playerRow = playerStats.get(playerId);
    playerRow.startCount += 1;
    playerRow.pointsTotal += points;
  }
}

function serializeSlotStats(slotStats, simulations) {
  return Array.from(slotStats.values())
    .map((slot) => ({
      label: slot.label,
      avgPoints: Number((slot.pointsTotal / Math.max(1, slot.appearances)).toFixed(2)),
      avgAppearances: Number((slot.appearances / Math.max(1, simulations)).toFixed(2)),
      appearances: slot.appearances,
    }))
    .sort((left, right) => right.avgPoints - left.avgPoints || left.label.localeCompare(right.label));
}

function serializePlayerStats(playerStats, simulations) {
  return Array.from(playerStats.values())
    .map((player) => ({
      playerId: player.playerId,
      name: player.name,
      position: player.position,
      startOdds: Number(((player.startCount / Math.max(1, simulations)) * 100).toFixed(2)),
      avgPoints: Number((player.pointsTotal / Math.max(1, player.startCount)).toFixed(2)),
      starts: player.startCount,
    }))
    .sort((left, right) => right.startOdds - left.startOdds || right.avgPoints - left.avgPoints);
}

function populationStdDev(sum, sumSquares, count) {
  if (!count) return 0;
  const mean = sum / count;
  const variance = Math.max(0, (sumSquares / count) - (mean * mean));
  return Math.sqrt(variance);
}

function createMatchupAccumulator({
  matchupKey,
  week,
  stage,
  matchupId,
  homeRosterId,
  awayRosterId,
  homeTeamName,
  awayTeamName,
}) {
  return {
    matchupKey,
    week,
    stage,
    matchupId,
    homeRosterId,
    awayRosterId,
    homeTeamName,
    awayTeamName,
    sims: 0,
    homeScoreTotal: 0,
    awayScoreTotal: 0,
    marginTotal: 0,
    homeSlotStats: new Map(),
    awaySlotStats: new Map(),
    homePlayerStats: new Map(),
    awayPlayerStats: new Map(),
  };
}

function accumulateMatchup(matchupTotals, {
  matchupKey,
  week,
  stage,
  matchupId,
  homeRosterId,
  awayRosterId,
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
}) {
  if (!matchupTotals.has(matchupKey)) {
    matchupTotals.set(matchupKey, createMatchupAccumulator({
      matchupKey,
      week,
      stage,
      matchupId,
      homeRosterId,
      awayRosterId,
      homeTeamName,
      awayTeamName,
    }));
  }

  const group = matchupTotals.get(matchupKey);
  group.sims += 1;
  group.homeScoreTotal += Number(homeScore.total || 0);
  group.awayScoreTotal += Number(awayScore.total || 0);
  group.marginTotal += Number(homeScore.total || 0) - Number(awayScore.total || 0);

  addAssignmentStats(group.homeSlotStats, group.homePlayerStats, homeScore.assignments);
  addAssignmentStats(group.awaySlotStats, group.awayPlayerStats, awayScore.assignments);
}

function addTeamLineupStats(teamTotal, assignments = []) {
  if (!teamTotal) return;
  addAssignmentStats(teamTotal.slotStats, teamTotal.playerStats, assignments);
}

export async function runSeasonSimulation({
  leagueId,
  startMode = 'current',
  simulations = DEFAULT_SIMULATION_SETTINGS.simulations,
  rngConfig = {},
  rosterTrades = [],
}) {
  const bundle = await fetchSleeperLeagueBundle(leagueId);
  const baseRosterMap = buildTeamRosterMap(bundle.rosters, bundle.users);
  const { rosterMap, appliedMoves } = applyRosterTradesToMap(baseRosterMap, rosterTrades);
  const playerMetaMap = buildPlayerMetaMap(bundle.playersMeta);
  const teamIds = Array.from(rosterMap.keys()).sort((left, right) => left - right);
  const activeStartMode = startMode === 'full' ? 'full' : 'current';
  const weekStart = activeStartMode === 'full' ? 1 : Math.max(1, bundle.currentWeek);
  const regularSeasonEndWeek = bundle.regularSeasonEndWeek;
  const seasonEndWeek = Math.max(17, bundle.playoffWeekStart + 2);
  const projectionCache = new Map();
  const matchupCache = new Map();

  // Load schedule and projection data once, with bounded concurrency.
  // Matchups are only needed through the end of the regular season.
  const fetchTasks = [];
  for (let week = 1; week <= regularSeasonEndWeek; week += 1) {
    fetchTasks.push({ type: 'matchups', week });
  }
  for (let week = weekStart; week <= seasonEndWeek; week += 1) {
    fetchTasks.push({ type: 'projections', week });
  }

  const fetched = await mapWithConcurrency(fetchTasks, 8, async (task) => {
    if (task.type === 'matchups') {
      return {
        ...task,
        value: await fetchSleeperWeeklyMatchups(leagueId, task.week),
      };
    }

    return {
      ...task,
      value: await fetchSleeperWeeklyProjections({
        season: bundle.season,
        week: task.week,
      }).catch(() => new Map()),
    };
  });

  for (const row of fetched) {
    if (row.type === 'matchups') matchupCache.set(row.week, row.value);
    else projectionCache.set(row.week, row.value);
  }

  const { slots, flexDefs } = buildStarterSlots(bundle.rosterPositions);
  const slotLabels = buildSlotLabels(bundle.rosterPositions);

  // Cache each team's eligible weekly player pool and its healthy optimal
  // lineup. Most simulated team-weeks can reuse that lineup directly. We only
  // rerun the lineup optimizer when an otherwise healthy projected starter is
  // randomly unavailable for that specific simulated week.
  const preparedRosterCache = new Map();
  for (let week = weekStart; week <= seasonEndWeek; week += 1) {
    const projectionMap = projectionCache.get(week) || new Map();
    const byRoster = new Map();

    for (const [rosterId, roster] of rosterMap.entries()) {
      byRoster.set(rosterId, buildPreparedWeeklyRoster({
        roster,
        projectionMap,
        playerMetaMap,
        slots,
        flexDefs,
        slotLabels,
      }));
    }

    preparedRosterCache.set(week, byRoster);
  }

  // Regular-season pairings are schedule data, so compute them once rather
  // than rebuilding the same groups for every simulated season.
  const regularPairingsCache = new Map();
  for (let week = weekStart; week <= regularSeasonEndWeek; week += 1) {
    regularPairingsCache.set(week, pairMatchupsFromWeek(matchupCache.get(week), teamIds));
  }

  const totals = new Map();
  for (const team of rosterMap.values()) {
    totals.set(team.rosterId, {
      rosterId: team.rosterId,
      displayName: team.displayName,
      teamName: team.teamName,
      simulations: 0,
      winsTotal: 0,
      winsSquaredTotal: 0,
      lossesTotal: 0,
      tiesTotal: 0,
      pointsForTotal: 0,
      pointsForSquaredTotal: 0,
      pointsAgainstTotal: 0,
      playoffAppearances: 0,
      championships: 0,
      firstPickOdds: 0,
      finishTotal: 0,
      recordCounts: new Map(),
      slotStats: new Map(),
      playerStats: new Map(),
    });
  }

  const matchupTotals = new Map();
  const playoffTeamCount = Math.max(2, Math.min(bundle.playoffTeams || 6, teamIds.length));
  const baseline = await buildBaselineStandings({
    leagueId,
    rosterMap,
    currentWeek: bundle.currentWeek,
    startFromCurrentWeek: activeStartMode === 'current',
    matchupCache,
  });

  for (let simulationIndex = 0; simulationIndex < simulations; simulationIndex += 1) {
    const standings = baseline.standings.map((team) => ({ ...team }));
    const standingsMap = new Map(standings.map((team) => [team.rosterId, team]));

    for (let week = weekStart; week <= regularSeasonEndWeek; week += 1) {
      const pairings = regularPairingsCache.get(week) || [];
      const weekPreparedRosters = preparedRosterCache.get(week) || new Map();

      for (const pairing of pairings) {
        const homeTeam = rosterMap.get(pairing.homeRosterId);
        const awayTeam = rosterMap.get(pairing.awayRosterId);
        if (!homeTeam || !awayTeam) continue;

        const homeScore = simulatePreparedRosterWeek({
          preparedRoster: weekPreparedRosters.get(pairing.homeRosterId),
          rngConfig,
          slots,
          flexDefs,
          slotLabels,
        });
        const awayScore = simulatePreparedRosterWeek({
          preparedRoster: weekPreparedRosters.get(pairing.awayRosterId),
          rngConfig,
          slots,
          flexDefs,
          slotLabels,
        });

        updateStandingsForGame(
          standingsMap,
          pairing.homeRosterId,
          pairing.awayRosterId,
          homeScore.total,
          awayScore.total
        );

        addTeamLineupStats(totals.get(pairing.homeRosterId), homeScore.assignments);
        addTeamLineupStats(totals.get(pairing.awayRosterId), awayScore.assignments);

        const matchupKey = `${week}|regular|${pairing.matchupId}|${pairing.homeRosterId}|${pairing.awayRosterId}`;
        accumulateMatchup(matchupTotals, {
          matchupKey,
          week,
          stage: 'regular',
          matchupId: pairing.matchupId,
          homeRosterId: pairing.homeRosterId,
          awayRosterId: pairing.awayRosterId,
          homeTeamName: homeTeam.displayName,
          awayTeamName: awayTeam.displayName,
          homeScore,
          awayScore,
        });
      }
    }

    const playoffField = sortStandings(standings)
      .slice(0, playoffTeamCount)
      .map((team) => team.rosterId);

    playoffField.forEach((rosterId) => {
      const teamTotal = totals.get(rosterId);
      if (teamTotal) teamTotal.playoffAppearances += 1;
    });

    let activePlayoffTeams = playoffField;
    for (
      let week = bundle.playoffWeekStart;
      week <= seasonEndWeek && activePlayoffTeams.length > 1;
      week += 1
    ) {
      const weekPreparedRosters = preparedRosterCache.get(week) || new Map();
      const { pairings, byeTeam } = buildPlayoffPairings(activePlayoffTeams, standingsMap);
      const winners = [];

      if (byeTeam !== null && byeTeam !== undefined) {
        winners.push(byeTeam);
      }

      for (const pairing of pairings) {
        const homeTeam = rosterMap.get(pairing.homeRosterId);
        const awayTeam = rosterMap.get(pairing.awayRosterId);
        if (!homeTeam || !awayTeam) continue;

        const homeScore = simulatePreparedRosterWeek({
          preparedRoster: weekPreparedRosters.get(pairing.homeRosterId),
          rngConfig,
          slots,
          flexDefs,
          slotLabels,
        });
        const awayScore = simulatePreparedRosterWeek({
          preparedRoster: weekPreparedRosters.get(pairing.awayRosterId),
          rngConfig,
          slots,
          flexDefs,
          slotLabels,
        });

        const winnerRosterId = homeScore.total >= awayScore.total
          ? pairing.homeRosterId
          : pairing.awayRosterId;
        winners.push(winnerRosterId);

        addTeamLineupStats(totals.get(pairing.homeRosterId), homeScore.assignments);
        addTeamLineupStats(totals.get(pairing.awayRosterId), awayScore.assignments);

        const matchupKey = `${week}|playoffs|${pairing.matchupId}|${pairing.homeRosterId}|${pairing.awayRosterId}`;
        accumulateMatchup(matchupTotals, {
          matchupKey,
          week,
          stage: 'playoffs',
          matchupId: pairing.matchupId,
          homeRosterId: pairing.homeRosterId,
          awayRosterId: pairing.awayRosterId,
          homeTeamName: homeTeam.displayName,
          awayTeamName: awayTeam.displayName,
          homeScore,
          awayScore,
        });
      }

      activePlayoffTeams = winners;
    }

    const championRosterId = activePlayoffTeams[0] ?? sortStandings(standings)[0]?.rosterId;
    const finalRankings = sortStandings(standings);

    if (championRosterId !== undefined && championRosterId !== null) {
      const championStanding = finalRankings.find((team) => team.rosterId === championRosterId);
      if (championStanding) {
        championStanding.championships += 1;
        finalRankings.splice(finalRankings.indexOf(championStanding), 1);
        finalRankings.unshift(championStanding);
      }
    }

    finalRankings.forEach((team, index) => {
      const total = totals.get(team.rosterId);
      if (!total) return;

      total.simulations += 1;
      total.winsTotal += team.wins;
      total.winsSquaredTotal += team.wins * team.wins;
      total.lossesTotal += team.losses;
      total.tiesTotal += team.ties;
      total.pointsForTotal += team.pointsFor;
      total.pointsForSquaredTotal += team.pointsFor * team.pointsFor;
      total.pointsAgainstTotal += team.pointsAgainst;
      total.finishTotal += index + 1;

      const recordKey = `${team.wins}-${team.losses}-${team.ties}`;
      total.recordCounts.set(recordKey, (total.recordCounts.get(recordKey) || 0) + 1);

      if (index === finalRankings.length - 1) {
        total.firstPickOdds += 1;
      }
    });

    if (championRosterId !== undefined && championRosterId !== null) {
      const championTotal = totals.get(championRosterId);
      if (championTotal) championTotal.championships += 1;
    }
  }

  const teamSummaries = Array.from(totals.values())
    .map((team) => {
      const divisor = Math.max(1, simulations);
      const averagePointsFor = team.pointsForTotal / divisor;
      const averagePointsAgainst = team.pointsAgainstTotal / divisor;

      return {
        rosterId: team.rosterId,
        teamName: team.teamName,
        displayName: team.displayName,
        averageWins: Number((team.winsTotal / divisor).toFixed(2)),
        averageLosses: Number((team.lossesTotal / divisor).toFixed(2)),
        averageTies: Number((team.tiesTotal / divisor).toFixed(2)),
        averagePointsFor: Number(averagePointsFor.toFixed(2)),
        averagePointsAgainst: Number(averagePointsAgainst.toFixed(2)),
        averageMargin: Number((averagePointsFor - averagePointsAgainst).toFixed(2)),
        pointsForVolatility: Number(
          populationStdDev(team.pointsForTotal, team.pointsForSquaredTotal, divisor).toFixed(2)
        ),
        winsVolatility: Number(
          populationStdDev(team.winsTotal, team.winsSquaredTotal, divisor).toFixed(2)
        ),
        averageFinish: Number((team.finishTotal / divisor).toFixed(2)),
        playoffOdds: Number(((team.playoffAppearances / divisor) * 100).toFixed(2)),
        championshipOdds: Number(((team.championships / divisor) * 100).toFixed(2)),
        firstPickOdds: Number(((team.firstPickOdds / divisor) * 100).toFixed(2)),
        slotAverages: serializeSlotStats(team.slotStats, divisor).map((slot) => ({
          slot: slot.label,
          avgPoints: slot.avgPoints,
          appearances: slot.appearances,
        })),
        recordDistribution: Array.from(team.recordCounts.entries())
          .sort((left, right) => right[1] - left[1])
          .slice(0, 5)
          .map(([record, count]) => ({
            record,
            count,
            odds: Number(((count / divisor) * 100).toFixed(2)),
          })),
      };
    })
    .sort((left, right) => left.averageFinish - right.averageFinish);

  const matchupSummaries = Array.from(matchupTotals.values())
    .map((group) => ({
      matchupKey: group.matchupKey,
      week: group.week,
      stage: group.stage,
      matchupId: group.matchupId,
      homeRosterId: group.homeRosterId,
      awayRosterId: group.awayRosterId,
      homeTeamName: group.homeTeamName,
      awayTeamName: group.awayTeamName,
      simulations: group.sims,
      avgHomeScore: Number((group.homeScoreTotal / Math.max(1, group.sims)).toFixed(2)),
      avgAwayScore: Number((group.awayScoreTotal / Math.max(1, group.sims)).toFixed(2)),
      avgMargin: Number((group.marginTotal / Math.max(1, group.sims)).toFixed(2)),
      homeSlotAverages: serializeSlotStats(group.homeSlotStats, group.sims),
      awaySlotAverages: serializeSlotStats(group.awaySlotStats, group.sims),
      homePlayerOdds: serializePlayerStats(group.homePlayerStats, group.sims),
      awayPlayerOdds: serializePlayerStats(group.awayPlayerStats, group.sims),
    }))
    .sort((left, right) => {
      if (left.week !== right.week) return left.week - right.week;
      const leftLabel = `${left.homeTeamName || ''} ${left.awayTeamName || ''}`;
      const rightLabel = `${right.homeTeamName || ''} ${right.awayTeamName || ''}`;
      return leftLabel.localeCompare(rightLabel);
    });

  return {
    ok: true,
    leagueId,
    season: bundle.season,
    leagueName: bundle.league?.name || 'Unknown League',
    currentWeek: bundle.currentWeek,
    startMode: activeStartMode,
    simulations,
    playoffWeekStart: bundle.playoffWeekStart,
    regularSeasonEndWeek,
    teamSummaries,
    matchupSummaries,
    rawRunsIncluded: false,
    settingsUsed: {
      simulations,
      boomBustStdDev: Number(
        rngConfig.boomBustStdDev ?? DEFAULT_SIMULATION_SETTINGS.boomBustStdDev
      ),
      shortInjuryChance: Number(
        rngConfig.shortInjuryChance ?? DEFAULT_SIMULATION_SETTINGS.shortInjuryChance
      ),
      longInjuryChance: Number(
        rngConfig.longInjuryChance ?? DEFAULT_SIMULATION_SETTINGS.longInjuryChance
      ),
    },
    rosterTrades: appliedMoves,
  };
}

