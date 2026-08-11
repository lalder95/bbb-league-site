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
      // Sleeper's player metadata is a current-state snapshot. Do not let a
      // current injury designation make a player unavailable for every future
      // week of a season simulation. `active === false` is retained as metadata
      // only; weekly projections and the simulator's unavailable-chance model
      // determine future lineup eligibility.
      active: meta?.active !== false,
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
    const userName = owner?.display_name || owner?.username || `Team ${rosterId}`;
    const teamName = owner?.metadata?.team_name || owner?.team_name || userName;
    const avatar = owner?.avatar || owner?.metadata?.avatar || '';
    const rawDivision = roster?.settings?.division ?? roster?.division ?? roster?.metadata?.division;
    const division = rawDivision === undefined || rawDivision === null || String(rawDivision).trim() === ''
      ? null
      : String(rawDivision);

    rosterMap.set(rosterId, {
      rosterId,
      ownerId: roster?.owner_id || null,
      displayName: userName,
      userName,
      teamName,
      avatar,
      division,
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
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}`, { cache: 'force-cache', next: { revalidate: 60 } }),
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { cache: 'force-cache', next: { revalidate: 60 } }),
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/users`, { cache: 'force-cache', next: { revalidate: 60 } }),
    fetchJson('https://api.sleeper.app/v1/state/nfl', { cache: 'force-cache', next: { revalidate: 60 } }),
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
    const matchups = await fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`, { cache: 'force-cache', next: { revalidate: 120 } });
    return Array.isArray(matchups) ? matchups : [];
  } catch {
    return [];
  }
}

export async function fetchSleeperWeeklyProjections({ season, week }) {
  const url = new URL(`https://api.sleeper.com/projections/nfl/${season}/${week}`);
  url.searchParams.set('season_type', 'regular');
  const response = await fetch(url.toString(), { cache: 'force-cache', next: { revalidate: 300 } });
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

function buildRosterPlayerAvailability(meta = {}, projectedPoints = 0) {
  const points = Number(projectedPoints || 0);

  // A positive projection for the simulated week is the strongest signal that
  // the player should participate in lineup optimization. Sleeper injury/status
  // fields describe the player's current real-world state and otherwise caused
  // one current designation to bench that player for every future simulated week.
  if (points > 0) return true;

  // When there is no useful weekly projection, keep clearly inactive/retired
  // players out of the candidate pool. Zero-point active players are harmless
  // fallback candidates if a roster cannot otherwise fill a required slot.
  const status = String(meta?.status || '').trim().toLowerCase();
  if (meta?.active === false) return false;
  if (['inactive', 'retired'].includes(status)) return false;
  return true;
}

function buildRosterProjectedPlayers({ roster, projectionMap, playerMetaMap }) {
  return (roster?.players || []).map((playerId) => {
    const projected = getProjectedPointsForPlayer(playerId, projectionMap, playerMetaMap);
    const meta = playerMetaMap.get(String(playerId)) || {};
    return {
      ...projected,
      available: buildRosterPlayerAvailability(meta, projected.points),
    };
  });
}

function buildProjectedLineupPlayers({ roster, projectionMap, playerMetaMap }) {
  return buildRosterProjectedPlayers({ roster, projectionMap, playerMetaMap })
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
  const rosterPlayers = buildRosterProjectedPlayers({ roster, projectionMap, playerMetaMap });
  const playerPool = rosterPlayers.filter((player) => player.available);
  const healthyTemplate = buildProjectedLineupTemplateFromPlayers({
    weeklyPlayers: playerPool,
    slots,
    flexDefs,
    slotLabels,
  });

  const healthyStarterIds = new Set(healthyTemplate.map((assignment) => String(assignment.playerId)));
  const benchPlayers = playerPool.filter((player) => !healthyStarterIds.has(String(player.playerId)));

  // Depth measures replacement quality, not the average of every bench player.
  // QB/TE use the best reserve; RB/WR use the best two reserves. If a roster
  // does not have the full target number, the missing replacement slot counts
  // as zero so thin depth is appropriately penalized.
  const depthTargets = { QB: 1, RB: 2, WR: 2, TE: 1 };
  const depthSnapshot = {};

  for (const [position, targetPlayers] of Object.entries(depthTargets)) {
    const players = benchPlayers
      .filter((player) => String(player.position || '').toUpperCase() === position)
      .sort((left, right) => Number(right.points || 0) - Number(left.points || 0));
    const selectedPlayers = players.slice(0, targetPlayers);
    const selectedPoints = selectedPlayers.reduce((sum, player) => sum + Number(player.points || 0), 0);

    depthSnapshot[position] = {
      position,
      playerCount: selectedPlayers.length,
      targetPlayers,
      avgPoints: selectedPoints / targetPlayers,
    };
  }

  const replacementValues = Object.values(depthSnapshot).map((row) => Number(row.avgPoints || 0));
  depthSnapshot.BENCH = {
    position: 'BENCH',
    playerCount: Object.values(depthSnapshot).reduce((sum, row) => sum + Number(row.playerCount || 0), 0),
    targetPlayers: Object.values(depthTargets).reduce((sum, value) => sum + value, 0),
    avgPoints: replacementValues.length
      ? replacementValues.reduce((sum, value) => sum + value, 0) / replacementValues.length
      : 0,
  };

  return {
    rosterPlayers,
    playerPool,
    healthyTemplate,
    healthyStarterIds,
    depthSnapshot,
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

function addSlotPoint(slotStats, assignment, points) {
  if (!slotStats) return;
  const slot = assignment.slotLabel || assignment.slot || assignment.position || 'UNK';
  if (!slotStats.has(slot)) {
    slotStats.set(slot, { label: slot, appearances: 0, pointsTotal: 0 });
  }
  const bucket = slotStats.get(slot);
  bucket.appearances += 1;
  bucket.pointsTotal += Number(points || 0);
}

function addDepthSnapshot(depthStats, depthSnapshot = {}) {
  if (!depthStats) return;
  for (const [position, row] of Object.entries(depthSnapshot || {})) {
    if (!depthStats.has(position)) {
      depthStats.set(position, {
        position,
        weeks: 0,
        pointsTotal: 0,
        playerCountTotal: 0,
      });
    }
    const bucket = depthStats.get(position);
    bucket.weeks += 1;
    bucket.pointsTotal += Number(row?.avgPoints || 0);
    bucket.playerCountTotal += Number(row?.playerCount || 0);
  }
}

function addPositionGroupSnapshot(positionGroupStats, preparedRoster = {}) {
  if (!positionGroupStats) return;
  const starterIds = preparedRoster?.healthyStarterIds || new Set();

  for (const player of preparedRoster?.rosterPlayers || []) {
    const position = String(player?.position || 'UNK').toUpperCase();
    if (!['QB', 'RB', 'WR', 'TE'].includes(position)) continue;

    const playerId = String(player?.playerId || '').trim();
    if (!playerId) continue;

    if (!positionGroupStats.has(playerId)) {
      positionGroupStats.set(playerId, {
        playerId,
        name: String(player?.name || '').trim(),
        nflTeam: String(player?.nflTeam || '').trim(),
        position,
        rosterWeeks: 0,
        projectionWeeks: 0,
        projectedPointsTotal: 0,
        starterWeeks: 0,
      });
    }

    const bucket = positionGroupStats.get(playerId);
    bucket.rosterWeeks += 1;

    const projectedPoints = Number(player?.points || 0);
    if (projectedPoints > 0) {
      bucket.projectionWeeks += 1;
      bucket.projectedPointsTotal += projectedPoints;
    }

    if (starterIds.has(playerId)) {
      bucket.starterWeeks += 1;
    }

    if (!bucket.name && player?.name) bucket.name = String(player.name);
    if (!bucket.nflTeam && player?.nflTeam) bucket.nflTeam = String(player.nflTeam);
  }
}

function addWeeklyScoreStats(teamTotal, score, margin) {
  if (!teamTotal) return;
  const numericScore = Number(score || 0);
  const numericMargin = Number(margin || 0);
  teamTotal.weeklyScoreTotal += numericScore;
  teamTotal.weeklyScoreSquaredTotal += numericScore * numericScore;
  teamTotal.weeklyScoreCount += 1;
  teamTotal.weeklyMarginTotal += numericMargin;
  teamTotal.weeklyMarginCount += 1;
}

function addHeadToHeadResult(teamTotal, opponentRosterId, score, opponentScore) {
  if (!teamTotal) return;
  const key = String(opponentRosterId);
  if (!teamTotal.headToHead.has(key)) {
    teamTotal.headToHead.set(key, {
      opponentRosterId,
      comparisons: 0,
      wins: 0,
      ties: 0,
    });
  }
  const bucket = teamTotal.headToHead.get(key);
  bucket.comparisons += 1;
  if (score > opponentScore) bucket.wins += 1;
  else if (score === opponentScore) bucket.ties += 1;
}

function simulatePreparedLineup(
  template = [],
  rngConfig = {},
  randomFn = Math.random,
  { slotStats = null, includeDetails = false } = {}
) {
  let total = 0;
  const assignments = includeDetails ? new Array(template.length) : null;

  for (let index = 0; index < template.length; index += 1) {
    const assignment = template[index];
    const points = randomizeProjectedPoints(
      assignment.projectedPoints,
      rngConfig,
      randomFn,
      { includeLongInjury: false, includeShortInjury: true }
    );

    total += points;
    addSlotPoint(slotStats, assignment, points);

    if (includeDetails) {
      assignments[index] = {
        ...assignment,
        points,
      };
    }
  }

  return includeDetails ? { total, assignments } : { total };
}

function simulatePreparedRosterWeek({
  preparedRoster,
  rngConfig = {},
  slots,
  flexDefs,
  slotLabels = [],
  randomFn = Math.random,
  slotStats = null,
  includeDetails = false,
}) {
  const template = selectLineupForSimulation({
    preparedRoster,
    rngConfig,
    slots,
    flexDefs,
    slotLabels,
    randomFn,
  });

  const simulated = simulatePreparedLineup(template, rngConfig, randomFn, {
    slotStats,
    includeDetails,
  });

  if (!includeDetails) return simulated;
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
    includeDetails: true,
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

function serializeSlotStats(slotStats) {
  return Array.from(slotStats.values())
    .map((slot) => ({
      slot: slot.label,
      appearances: slot.appearances,
      pointsTotal: Number(slot.pointsTotal || 0),
      avgPoints: Number((slot.pointsTotal / Math.max(1, slot.appearances)).toFixed(2)),
    }))
    .sort((left, right) => right.avgPoints - left.avgPoints || left.slot.localeCompare(right.slot));
}

function populationStdDev(sum, sumSquares, count) {
  if (!count) return 0;
  const mean = sum / count;
  const variance = Math.max(0, (sumSquares / count) - (mean * mean));
  return Math.sqrt(variance);
}

function buildTeamSummaries(totals, simulations) {
  return Array.from(totals.values())
    .map((team) => {
      const divisor = Math.max(1, team.simulations || simulations);
      const averagePointsFor = team.pointsForTotal / divisor;
      const averagePointsAgainst = team.pointsAgainstTotal / divisor;
      const weeklyDivisor = Math.max(1, team.weeklyScoreCount);
      const marginDivisor = Math.max(1, team.weeklyMarginCount);
      const averageWeeklyScore = team.weeklyScoreTotal / weeklyDivisor;
      const averageWeeklyMargin = team.weeklyMarginTotal / marginDivisor;
      const weeklyScoreVolatility = populationStdDev(
        team.weeklyScoreTotal,
        team.weeklyScoreSquaredTotal,
        weeklyDivisor
      );

      return {
        rosterId: team.rosterId,
        ownerId: team.ownerId,
        teamName: team.teamName,
        displayName: team.displayName,
        userName: team.userName || team.displayName,
        avatar: team.avatar || '',
        division: team.division ?? null,
        averageWins: Number((team.winsTotal / divisor).toFixed(2)),
        averageLosses: Number((team.lossesTotal / divisor).toFixed(2)),
        averageTies: Number((team.tiesTotal / divisor).toFixed(2)),
        averagePointsFor: Number(averagePointsFor.toFixed(2)),
        averagePointsAgainst: Number(averagePointsAgainst.toFixed(2)),
        seasonPointDifferential: Number((averagePointsFor - averagePointsAgainst).toFixed(2)),
        averageWeeklyScore: Number(averageWeeklyScore.toFixed(2)),
        averageWeeklyMargin: Number(averageWeeklyMargin.toFixed(2)),
        averageMargin: Number(averageWeeklyMargin.toFixed(2)),
        scoringVolatility: Number(weeklyScoreVolatility.toFixed(2)),
        pointsForVolatility: Number(weeklyScoreVolatility.toFixed(2)),
        winsVolatility: Number(
          populationStdDev(team.winsTotal, team.winsSquaredTotal, divisor).toFixed(2)
        ),
        averageFinish: Number((team.finishTotal / divisor).toFixed(2)),
        playoffOdds: Number(((team.playoffAppearances / divisor) * 100).toFixed(2)),
        championshipOdds: Number(((team.championships / divisor) * 100).toFixed(2)),
        firstPickOdds: Number(((team.firstPickCount / divisor) * 100).toFixed(2)),
        slotAverages: serializeSlotStats(team.slotStats).map((slot) => ({
          slot: slot.slot,
          avgPoints: slot.avgPoints,
          appearances: slot.appearances,
        })),
        depthAverages: Array.from(team.depthStats.values())
          .map((row) => ({
            position: row.position,
            avgPoints: Number((row.pointsTotal / Math.max(1, row.weeks)).toFixed(2)),
            avgPlayers: Number((row.playerCountTotal / Math.max(1, row.weeks)).toFixed(2)),
            weeks: row.weeks,
          }))
          .sort((left, right) => left.position.localeCompare(right.position)),
        positionGroupPlayers: Array.from(team.positionGroupStats.values())
          .map((row) => ({
            playerId: row.playerId,
            name: row.name,
            nflTeam: row.nflTeam,
            position: row.position,
            rosterWeeks: row.rosterWeeks,
            projectionWeeks: row.projectionWeeks,
            avgProjectedPoints: Number(
              (row.projectedPointsTotal / Math.max(1, row.projectionWeeks)).toFixed(2)
            ),
            starterRate: Number(
              ((row.starterWeeks / Math.max(1, row.rosterWeeks)) * 100).toFixed(1)
            ),
          }))
          .sort((left, right) => (
            left.position.localeCompare(right.position)
            || right.avgProjectedPoints - left.avgProjectedPoints
            || left.name.localeCompare(right.name)
          )),
        headToHead: Array.from(team.headToHead.values())
          .map((row) => ({
            opponentRosterId: row.opponentRosterId,
            comparisons: row.comparisons,
            wins: row.wins,
            ties: row.ties,
            winOdds: Number((((row.wins + row.ties * 0.5) / Math.max(1, row.comparisons)) * 100).toFixed(2)),
          }))
          .sort((left, right) => Number(left.opponentRosterId) - Number(right.opponentRosterId)),
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
}

function buildAggregationPayload(totals, simulations) {
  return {
    simulations,
    teams: Array.from(totals.values()).map((team) => ({
      rosterId: team.rosterId,
      ownerId: team.ownerId,
      teamName: team.teamName,
      displayName: team.displayName,
      userName: team.userName || team.displayName,
      avatar: team.avatar || '',
      division: team.division ?? null,
      simulations: team.simulations,
      winsTotal: team.winsTotal,
      winsSquaredTotal: team.winsSquaredTotal,
      lossesTotal: team.lossesTotal,
      tiesTotal: team.tiesTotal,
      pointsForTotal: team.pointsForTotal,
      pointsForSquaredTotal: team.pointsForSquaredTotal,
      pointsAgainstTotal: team.pointsAgainstTotal,
      weeklyScoreTotal: team.weeklyScoreTotal,
      weeklyScoreSquaredTotal: team.weeklyScoreSquaredTotal,
      weeklyScoreCount: team.weeklyScoreCount,
      weeklyMarginTotal: team.weeklyMarginTotal,
      weeklyMarginCount: team.weeklyMarginCount,
      playoffAppearances: team.playoffAppearances,
      championships: team.championships,
      firstPickCount: team.firstPickCount,
      finishTotal: team.finishTotal,
      recordCounts: Array.from(team.recordCounts.entries()).map(([record, count]) => ({ record, count })),
      slotStats: serializeSlotStats(team.slotStats).map((slot) => ({
        slot: slot.slot,
        appearances: slot.appearances,
        pointsTotal: slot.pointsTotal,
      })),
      depthStats: Array.from(team.depthStats.values()).map((row) => ({
        position: row.position,
        weeks: row.weeks,
        pointsTotal: row.pointsTotal,
        playerCountTotal: row.playerCountTotal,
      })),
      positionGroupStats: Array.from(team.positionGroupStats.values()).map((row) => ({ ...row })),
      headToHead: Array.from(team.headToHead.values()).map((row) => ({ ...row })),
    })),
  };
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

  // Batch requests intentionally reuse Vercel/Next's data cache for schedule,
  // projections, league data, and player metadata. That keeps each 20-season
  // invocation focused on simulation CPU instead of repeating network work.
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

  const regularPairingsCache = new Map();
  for (let week = weekStart; week <= regularSeasonEndWeek; week += 1) {
    regularPairingsCache.set(week, pairMatchupsFromWeek(matchupCache.get(week), teamIds));
  }

  const totals = new Map();
  for (const team of rosterMap.values()) {
    totals.set(team.rosterId, {
      rosterId: team.rosterId,
      ownerId: team.ownerId,
      displayName: team.displayName,
      userName: team.userName || team.displayName,
      teamName: team.teamName,
      avatar: team.avatar || '',
      division: team.division ?? null,
      simulations: 0,
      winsTotal: 0,
      winsSquaredTotal: 0,
      lossesTotal: 0,
      tiesTotal: 0,
      pointsForTotal: 0,
      pointsForSquaredTotal: 0,
      pointsAgainstTotal: 0,
      weeklyScoreTotal: 0,
      weeklyScoreSquaredTotal: 0,
      weeklyScoreCount: 0,
      weeklyMarginTotal: 0,
      weeklyMarginCount: 0,
      playoffAppearances: 0,
      championships: 0,
      firstPickCount: 0,
      finishTotal: 0,
      recordCounts: new Map(),
      slotStats: new Map(),
      depthStats: new Map(),
      positionGroupStats: new Map(),
      headToHead: new Map(),
    });
  }

  // Depth is a stable projected roster-quality measure, so calculate it once
  // per team/week instead of re-scoring every bench player in every Monte Carlo run.
  for (let week = weekStart; week <= regularSeasonEndWeek; week += 1) {
    const weekPreparedRosters = preparedRosterCache.get(week) || new Map();
    for (const rosterId of teamIds) {
      const total = totals.get(rosterId);
      const prepared = weekPreparedRosters.get(rosterId);
      if (!total || !prepared) continue;
      addDepthSnapshot(total.depthStats, prepared.depthSnapshot);
      addPositionGroupSnapshot(total.positionGroupStats, prepared);
    }
  }

  const playoffTeamCount = Math.max(2, Math.min(bundle.playoffTeams || 6, teamIds.length));
  const baseline = await buildBaselineStandings({
    leagueId,
    rosterMap,
    currentWeek: bundle.currentWeek,
    startFromCurrentWeek: activeStartMode === 'current',
    matchupCache,
  });

  for (let simulationIndex = 0; simulationIndex < simulations; simulationIndex += 1) {
    // These are the only season-specific structures retained. They become
    // unreachable at the end of this loop iteration; no raw run is stored.
    const standings = baseline.standings.map((team) => ({ ...team }));
    const standingsMap = new Map(standings.map((team) => [team.rosterId, team]));

    for (let week = weekStart; week <= regularSeasonEndWeek; week += 1) {
      const pairings = regularPairingsCache.get(week) || [];
      const weekPreparedRosters = preparedRosterCache.get(week) || new Map();
      const weekScores = new Map();

      for (const pairing of pairings) {
        const homeTotal = totals.get(pairing.homeRosterId);
        const awayTotal = totals.get(pairing.awayRosterId);
        if (!homeTotal || !awayTotal) continue;

        const homeScore = simulatePreparedRosterWeek({
          preparedRoster: weekPreparedRosters.get(pairing.homeRosterId),
          rngConfig,
          slots,
          flexDefs,
          slotLabels,
          slotStats: homeTotal.slotStats,
        });
        const awayScore = simulatePreparedRosterWeek({
          preparedRoster: weekPreparedRosters.get(pairing.awayRosterId),
          rngConfig,
          slots,
          flexDefs,
          slotLabels,
          slotStats: awayTotal.slotStats,
        });

        updateStandingsForGame(
          standingsMap,
          pairing.homeRosterId,
          pairing.awayRosterId,
          homeScore.total,
          awayScore.total
        );

        weekScores.set(pairing.homeRosterId, homeScore.total);
        weekScores.set(pairing.awayRosterId, awayScore.total);
        addWeeklyScoreStats(homeTotal, homeScore.total, homeScore.total - awayScore.total);
        addWeeklyScoreStats(awayTotal, awayScore.total, awayScore.total - homeScore.total);
      }

      // Neutral head-to-head odds reuse the same weekly score draws. This adds
      // no extra player simulation work: every pair is simply compared as if
      // they had met that simulated week.
      for (let leftIndex = 0; leftIndex < teamIds.length; leftIndex += 1) {
        const leftRosterId = teamIds[leftIndex];
        const leftScore = weekScores.get(leftRosterId);
        if (!Number.isFinite(leftScore)) continue;

        for (let rightIndex = leftIndex + 1; rightIndex < teamIds.length; rightIndex += 1) {
          const rightRosterId = teamIds[rightIndex];
          const rightScore = weekScores.get(rightRosterId);
          if (!Number.isFinite(rightScore)) continue;

          addHeadToHeadResult(totals.get(leftRosterId), rightRosterId, leftScore, rightScore);
          addHeadToHeadResult(totals.get(rightRosterId), leftRosterId, rightScore, leftScore);
        }
      }
    }

    const playoffField = sortStandings(standings)
      .slice(0, playoffTeamCount)
      .map((team) => team.rosterId);

    for (const rosterId of playoffField) {
      const teamTotal = totals.get(rosterId);
      if (teamTotal) teamTotal.playoffAppearances += 1;
    }

    let activePlayoffTeams = playoffField;
    for (
      let week = bundle.playoffWeekStart;
      week <= seasonEndWeek && activePlayoffTeams.length > 1;
      week += 1
    ) {
      const weekPreparedRosters = preparedRosterCache.get(week) || new Map();
      const { pairings, byeTeam } = buildPlayoffPairings(activePlayoffTeams, standingsMap);
      const winners = [];

      if (byeTeam !== null && byeTeam !== undefined) winners.push(byeTeam);

      for (const pairing of pairings) {
        const homeTotal = totals.get(pairing.homeRosterId);
        const awayTotal = totals.get(pairing.awayRosterId);
        if (!homeTotal || !awayTotal) continue;

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
      }

      activePlayoffTeams = winners;
    }

    const championRosterId = activePlayoffTeams[0] ?? sortStandings(standings)[0]?.rosterId;
    const finalRankings = sortStandings(standings);

    if (championRosterId !== undefined && championRosterId !== null) {
      const championStanding = finalRankings.find((team) => team.rosterId === championRosterId);
      if (championStanding) {
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

      if (index === finalRankings.length - 1) total.firstPickCount += 1;
    });

    if (championRosterId !== undefined && championRosterId !== null) {
      const championTotal = totals.get(championRosterId);
      if (championTotal) championTotal.championships += 1;
    }
  }

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
    teamSummaries: buildTeamSummaries(totals, simulations),
    aggregation: buildAggregationPayload(totals, simulations),
    rawRunsIncluded: false,
    matchupDetailIncluded: false,
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
