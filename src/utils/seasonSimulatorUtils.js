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

  const includeInjury = options.includeInjury !== false;
  const boomBustStdDev = clampNumber(rngConfig.boomBustStdDev ?? DEFAULT_SIMULATION_SETTINGS.boomBustStdDev, 0, 1);
  const shortInjuryChance = clampNumber(rngConfig.shortInjuryChance ?? DEFAULT_SIMULATION_SETTINGS.shortInjuryChance, 0, 1);
  const longInjuryChance = clampNumber(rngConfig.longInjuryChance ?? DEFAULT_SIMULATION_SETTINGS.longInjuryChance, 0, 1);

  if (includeInjury && randomFn() < longInjuryChance) return 0;

  let multiplier = 1 + gaussianRandom(randomFn) * boomBustStdDev;
  if (includeInjury && randomFn() < shortInjuryChance) {
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
    fetchJson('https://api.sleeper.app/v1/players/nfl'),
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

function buildActualPointMap({ roster, projectionMap, playerMetaMap, rngConfig }) {
  const actualPlayers = (roster?.players || []).map((playerId) => {
    const projected = getProjectedPointsForPlayer(playerId, projectionMap, playerMetaMap);
    return {
      playerId: projected.playerId,
      points: randomizeProjectedPoints(projected.points, rngConfig, Math.random, { includeInjury: false }),
    };
  });

  return new Map(actualPlayers.map((player) => [player.playerId, player.points]));
}

export function scoreRosterOptimalLineup({
  roster,
  projectionMap,
  playerMetaMap,
  rosterPositions,
  rngConfig,
}) {
  const { slots, flexDefs } = buildStarterSlots(rosterPositions);
  const weeklyPlayers = buildProjectedLineupPlayers({ roster, projectionMap, playerMetaMap });
  const projectedLineup = fillWeeklyMaxDetailed(weeklyPlayers, slots, flexDefs);
  const actualPointsByPlayerId = buildActualPointMap({ roster, projectionMap, playerMetaMap, rngConfig });

  const assignments = projectedLineup.assignments.map((assignment) => ({
    ...assignment,
    projectedPoints: assignment.points,
    points: Number(actualPointsByPlayerId.get(String(assignment.playerId)) || 0),
  }));

  return {
    total: assignments.reduce((sum, assignment) => sum + (assignment.points || 0), 0),
    chosen: projectedLineup.chosen,
    assignments,
  };
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

async function buildBaselineStandings({ leagueId, rosterMap, currentWeek, startFromCurrentWeek }) {
  const standings = buildStandingsFromCurrentState(rosterMap, { startFromCurrentWeek: false });
  const standingsMap = new Map(standings.map((team) => [team.rosterId, team]));

  const lastCompletedWeek = startFromCurrentWeek ? Math.max(0, currentWeek - 1) : 0;
  for (let week = 1; week <= lastCompletedWeek; week += 1) {
    const matchups = await fetchSleeperWeeklyMatchups(leagueId, week);
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

  for (let week = weekStart; week <= seasonEndWeek; week += 1) {
    const [matchups, projections] = await Promise.all([
      fetchSleeperWeeklyMatchups(leagueId, week),
      fetchSleeperWeeklyProjections({ season: bundle.season, week }).catch(() => new Map()),
    ]);
    matchupCache.set(week, matchups);
    projectionCache.set(week, projections);
  }

  const totals = new Map();
  for (const team of rosterMap.values()) {
    totals.set(team.rosterId, {
      rosterId: team.rosterId,
      displayName: team.displayName,
      teamName: team.teamName,
      simulations: 0,
      winsTotal: 0,
      lossesTotal: 0,
      tiesTotal: 0,
      pointsForTotal: 0,
      playoffAppearances: 0,
      championships: 0,
      firstPickOdds: 0,
      finishTotal: 0,
      recordCounts: new Map(),
    });
  }

  const simulationRuns = [];
  const playoffTeamCount = Math.max(2, Math.min(bundle.playoffTeams || 6, teamIds.length));
  const baseline = await buildBaselineStandings({
    leagueId,
    rosterMap,
    currentWeek: bundle.currentWeek,
    startFromCurrentWeek: activeStartMode === 'current',
  });

  for (let simulationIndex = 0; simulationIndex < simulations; simulationIndex += 1) {
    const runRecord = {
      simulationIndex: simulationIndex + 1,
      championRosterId: null,
      matchups: [],
      rows: [],
    };
    const standings = baseline.standings.map((team) => ({ ...team }));
    const standingsMap = new Map(standings.map((team) => [team.rosterId, team]));

    for (let week = weekStart; week <= regularSeasonEndWeek; week += 1) {
      const projectionMap = projectionCache.get(week) || new Map();
      const pairings = pairMatchupsFromWeek(matchupCache.get(week), teamIds);

      for (const pairing of pairings) {
        const homeTeam = rosterMap.get(pairing.homeRosterId);
        const awayTeam = rosterMap.get(pairing.awayRosterId);
        if (!homeTeam || !awayTeam) continue;

        const homeScore = scoreRosterOptimalLineup({
          roster: homeTeam,
          projectionMap,
          playerMetaMap,
          rosterPositions: bundle.rosterPositions,
          rngConfig,
        });
        const awayScore = scoreRosterOptimalLineup({
          roster: awayTeam,
          projectionMap,
          playerMetaMap,
          rosterPositions: bundle.rosterPositions,
          rngConfig,
        });

        updateStandingsForGame(standingsMap, pairing.homeRosterId, pairing.awayRosterId, homeScore.total, awayScore.total);

        const matchupRecord = {
          simulationIndex: simulationIndex + 1,
          week,
          matchupId: pairing.matchupId,
          stage: 'regular',
          matchupKey: `${week}|regular|${pairing.matchupId}|${pairing.homeRosterId}|${pairing.awayRosterId}`,
          homeRosterId: pairing.homeRosterId,
          awayRosterId: pairing.awayRosterId,
          homeTeamName: homeTeam.displayName,
          awayTeamName: awayTeam.displayName,
          homeScore: Number(homeScore.total.toFixed(2)),
          awayScore: Number(awayScore.total.toFixed(2)),
          winnerRosterId: homeScore.total >= awayScore.total ? pairing.homeRosterId : pairing.awayRosterId,
          homeStarters: homeScore.assignments,
          awayStarters: awayScore.assignments,
        };

        runRecord.matchups.push(matchupRecord);
      }
    }

    const playoffField = sortStandings(standings).slice(0, playoffTeamCount).map((team) => team.rosterId);
    playoffField.forEach((rosterId) => {
      const teamTotal = totals.get(rosterId);
      if (teamTotal) teamTotal.playoffAppearances += 1;
    });

    let activePlayoffTeams = playoffField;
    for (let week = bundle.playoffWeekStart; week <= seasonEndWeek && activePlayoffTeams.length > 1; week += 1) {
      const projectionMap = projectionCache.get(week) || new Map();
      const { pairings, byeTeam } = buildPlayoffPairings(activePlayoffTeams, standingsMap);
      const winners = [];

      if (byeTeam !== null && byeTeam !== undefined) {
        winners.push(byeTeam);
      }

      for (const pairing of pairings) {
        const homeTeam = rosterMap.get(pairing.homeRosterId);
        const awayTeam = rosterMap.get(pairing.awayRosterId);
        if (!homeTeam || !awayTeam) continue;

        const homeScore = scoreRosterOptimalLineup({
          roster: homeTeam,
          projectionMap,
          playerMetaMap,
          rosterPositions: bundle.rosterPositions,
          rngConfig,
        });
        const awayScore = scoreRosterOptimalLineup({
          roster: awayTeam,
          projectionMap,
          playerMetaMap,
          rosterPositions: bundle.rosterPositions,
          rngConfig,
        });

        const winnerRosterId = homeScore.total >= awayScore.total ? pairing.homeRosterId : pairing.awayRosterId;
        winners.push(winnerRosterId);

        const matchupRecord = {
          simulationIndex: simulationIndex + 1,
          week,
          matchupId: pairing.matchupId,
          stage: 'playoffs',
          matchupKey: `${week}|playoffs|${pairing.matchupId}|${pairing.homeRosterId}|${pairing.awayRosterId}`,
          homeRosterId: pairing.homeRosterId,
          awayRosterId: pairing.awayRosterId,
          homeTeamName: homeTeam.displayName,
          awayTeamName: awayTeam.displayName,
          homeScore: Number(homeScore.total.toFixed(2)),
          awayScore: Number(awayScore.total.toFixed(2)),
          winnerRosterId,
          homeStarters: homeScore.assignments,
          awayStarters: awayScore.assignments,
        };

        runRecord.matchups.push(matchupRecord);
      }

      activePlayoffTeams = winners;
    }

    const championRosterId = activePlayoffTeams[0] ?? sortStandings(standings)[0]?.rosterId;
    const finalRankings = sortStandings(standings);
    const finishByRosterId = new Map(finalRankings.map((team, index) => [team.rosterId, index + 1]));
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
      total.lossesTotal += team.losses;
      total.tiesTotal += team.ties;
      total.pointsForTotal += team.pointsFor;
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

    runRecord.championRosterId = championRosterId ?? null;
    runRecord.rows = Array.from(standingsMap.values())
        .map((team) => ({
          rosterId: team.rosterId,
          displayName: team.displayName,
          teamName: team.teamName,
          wins: team.wins,
          losses: team.losses,
          ties: team.ties,
          pointsFor: Number(team.pointsFor.toFixed(2)),
          pointsAgainst: Number(team.pointsAgainst.toFixed(2)),
          finish: finishByRosterId.get(team.rosterId) || null,
          madePlayoffs: playoffField.includes(team.rosterId),
          wonChampionship: championRosterId === team.rosterId,
          wonFirstPick: finishByRosterId.get(team.rosterId) === teamIds.length,
        }))
        .sort((left, right) => (left.finish || 999) - (right.finish || 999));

    simulationRuns.push(runRecord);
  }

  const teamSummaries = Array.from(totals.values())
    .map((team) => ({
      rosterId: team.rosterId,
      teamName: team.teamName,
      displayName: team.displayName,
      averageWins: Number((team.winsTotal / simulations).toFixed(2)),
      averageLosses: Number((team.lossesTotal / simulations).toFixed(2)),
      averageTies: Number((team.tiesTotal / simulations).toFixed(2)),
      averagePointsFor: Number((team.pointsForTotal / simulations).toFixed(2)),
      averageFinish: Number((team.finishTotal / simulations).toFixed(2)),
      playoffOdds: Number(((team.playoffAppearances / simulations) * 100).toFixed(2)),
      championshipOdds: Number(((team.championships / simulations) * 100).toFixed(2)),
      firstPickOdds: Number(((team.firstPickOdds / simulations) * 100).toFixed(2)),
      recordDistribution: Array.from(team.recordCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([record, count]) => ({ record, count, odds: Number(((count / simulations) * 100).toFixed(2)) })),
    }))
    .sort((left, right) => left.averageFinish - right.averageFinish);

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
    simulationRuns,
    settingsUsed: {
      simulations,
      boomBustStdDev: Number(rngConfig.boomBustStdDev ?? DEFAULT_SIMULATION_SETTINGS.boomBustStdDev),
      shortInjuryChance: Number(rngConfig.shortInjuryChance ?? DEFAULT_SIMULATION_SETTINGS.shortInjuryChance),
      longInjuryChance: Number(rngConfig.longInjuryChance ?? DEFAULT_SIMULATION_SETTINGS.longInjuryChance),
    },
    rosterTrades: appliedMoves,
  };
}