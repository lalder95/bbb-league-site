import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import clientPromise from '@/lib/mongodb';
import dbConnect from '@/lib/dbConnect';
import { getContractManagementSettings } from '@/lib/db-helpers';
import { calculateDraftOrderForLeague } from '@/utils/draftOrderCalculator';
import { estimateDraftPositions, getTeamName as getDraftTeamName } from '@/utils/draftUtils';
import {
  HOMEPAGE_PHASES,
  normalizeLeagueStatus,
  resolveHomepagePhase,
} from '@/utils/homepagePhases';

export const runtime = 'nodejs';

const USER_ID = '456973480269705216';
const DEFAULT_ROOKIE_DRAFT_ROUNDS = 5;

const playerSchema = new mongoose.Schema({
  playerId: Number,
  playerName: String,
  position: String,
  status: String,
  startDelay: Number,
}, { _id: false });

const draftSchema = new mongoose.Schema({
  draftId: Number,
  startDate: String,
  endDate: String,
  timeZone: String,
  state: String,
  nomDuration: Number,
  blind: Boolean,
  users: [{ username: String }],
  players: [playerSchema],
  results: [{
    username: String,
    playerId: Number,
    salary: Number,
    years: Number,
    contractPoints: Number,
    state: String,
    expiration: String,
  }],
  bidLog: [{
    username: String,
    playerId: Number,
    salary: Number,
    years: Number,
    contractPoints: Number,
    timestamp: Date,
  }],
}, { collection: 'drafts' });

const Draft = mongoose.models.Draft || mongoose.model('Draft', draftSchema);

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseYear(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed request ${response.status}: ${url}`);
  }
  return response.json();
}

async function fetchJsonSafe(url, fallback) {
  try {
    return await fetchJson(url);
  } catch {
    return fallback;
  }
}

function buildDivisionMetadata(league) {
  const customDivisions = {
    1: { name: 'Wall Street', avatar: '/leagueimages/division1.jpg' },
    2: { name: 'Middle Class', avatar: '/leagueimages/division2.jpg' },
    3: { name: 'Poor House', avatar: '/leagueimages/division3.jpg' },
  };

  const divisionNames = {};
  if (league?.settings?.divisions) {
    for (let index = 1; index <= 10; index += 1) {
      if (customDivisions[index]) {
        divisionNames[index] = customDivisions[index].name;
      } else if (league.settings[`division_${index}`]) {
        divisionNames[index] = league.settings[`division_${index}`];
      }
    }
  } else {
    for (let index = 1; index <= 3; index += 1) {
      divisionNames[index] = customDivisions[index]?.name || `Division ${index}`;
    }
  }

  return { customDivisions, divisionNames };
}

function buildStandingsRows(rosters, users, league) {
  const { customDivisions, divisionNames } = buildDivisionMetadata(league);

  const rows = (rosters || []).map((roster) => {
    const user = (users || []).find((entry) => entry.user_id === roster.owner_id);
    const divisionId = roster.settings?.division || 0;
    return {
      rosterId: roster.roster_id,
      teamName: user?.display_name || user?.team_name || `Team ${roster.roster_id}`,
      avatar: user?.avatar || null,
      wins: toNumber(roster.settings?.wins),
      losses: toNumber(roster.settings?.losses),
      ties: toNumber(roster.settings?.ties),
      pointsFor: toNumber(roster.settings?.fpts),
      pointsAgainst: toNumber(roster.settings?.fpts_against),
      division: divisionId,
      divisionName: divisionNames[divisionId] || `Division ${divisionId || 1}`,
      divisionAvatar: customDivisions[divisionId]?.avatar || null,
    };
  });

  rows.sort((left, right) => {
    if (left.wins !== right.wins) return right.wins - left.wins;
    return right.pointsFor - left.pointsFor;
  });

  const divisions = rows.reduce((accumulator, row) => {
    const key = String(row.division || 0);
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    accumulator[key].push(row);
    return accumulator;
  }, {});

  Object.keys(divisions).forEach((key) => {
    divisions[key].sort((left, right) => {
      if (left.wins !== right.wins) return right.wins - left.wins;
      return right.pointsFor - left.pointsFor;
    });
  });

  return { rows, divisions, divisionNames };
}

function buildRosterIdentityMap(rosters, users) {
  const userById = new Map((users || []).map((user) => [user.user_id, user]));

  return new Map(
    (rosters || []).map((roster) => {
      const user = userById.get(roster.owner_id);
      const teamName = user?.display_name || user?.team_name || `Team ${roster.roster_id}`;
      const avatarUrl = user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null;

      return [Number(roster.roster_id), {
        teamName,
        avatarUrl,
      }];
    }),
  );
}

function pickChampion({ winnersBracket, standingsRows }) {
  if (Array.isArray(winnersBracket) && winnersBracket.length > 0) {
    const finalRound = winnersBracket.reduce((maxRound, row) => Math.max(maxRound, toNumber(row?.r)), 0);
    const finalMatches = winnersBracket
      .filter((row) => toNumber(row?.r) === finalRound)
      .sort((left, right) => toNumber(left?.m) - toNumber(right?.m));
    const championshipMatch = finalMatches.find((row) => toNumber(row?.p, -1) === 1);
    const winnersOnlyMatch = finalMatches.find(
      (row) => row?.t1_from?.w != null && row?.t2_from?.w != null,
    );
    const finalMatch = championshipMatch || winnersOnlyMatch || finalMatches[0];
    const winningRosterId = finalMatch?.w;
    if (winningRosterId != null) {
      return standingsRows.find((row) => Number(row.rosterId) === Number(winningRosterId)) || null;
    }
  }

  return standingsRows[0] || null;
}

async function findLeagueIdFallback() {
  const nflState = await fetchJson('https://api.sleeper.app/v1/state/nfl');
  const currentSeason = String(nflState?.season || new Date().getFullYear());
  const seasonsToTry = [currentSeason, String(parseInt(currentSeason, 10) - 1)];

  for (const season of seasonsToTry) {
    const leagues = await fetchJsonSafe(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${season}`, []);
    const candidates = (Array.isArray(leagues) ? leagues : []).filter((league) => {
      const name = String(league?.name || '').toLowerCase();
      return name.includes('budget blitz bowl') || name.includes('bbb') || (name.includes('budget') && name.includes('blitz'));
    });

    if (candidates.length > 0) {
      return candidates.sort((left, right) => toNumber(right?.season) - toNumber(left?.season))[0]?.league_id || null;
    }

    if (Array.isArray(leagues) && leagues.length > 0) {
      return leagues[0]?.league_id || null;
    }
  }

  return null;
}

async function getLeagueMeta(leagueId) {
  return fetchJsonSafe(`https://api.sleeper.app/v1/league/${leagueId}`, null);
}

async function findBbbLeagueCandidatesForSeason(seasonStr) {
  const leagues = await fetchJsonSafe(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${seasonStr}`, []);
  return (Array.isArray(leagues) ? leagues : []).filter((league) => {
    const name = String(league?.name || '').toLowerCase();
    return name.includes('budget blitz bowl') || name.includes('bbb') || (name.includes('budget') && name.includes('blitz'));
  });
}

async function resolveLeagueForSeason(baseLeagueId, seasonStr) {
  const target = Number(seasonStr);
  const baseMeta = await getLeagueMeta(baseLeagueId);
  const baseName = String(baseMeta?.name || '').trim().toLowerCase();
  const baseRosters = Number(baseMeta?.total_rosters) || 0;

  const directCandidates = await findBbbLeagueCandidatesForSeason(seasonStr);
  if (directCandidates.length === 1) {
    return directCandidates[0]?.league_id || baseLeagueId;
  }

  const exactNameCandidate = directCandidates.find(
    (league) => String(league?.name || '').trim().toLowerCase() === baseName,
  );
  if (exactNameCandidate?.league_id) {
    return exactNameCandidate.league_id;
  }

  let currentId = baseLeagueId;
  const visited = new Set();

  for (let index = 0; index < 10; index += 1) {
    if (!currentId || visited.has(currentId)) break;
    visited.add(currentId);

    const meta = await getLeagueMeta(currentId);
    if (!meta) break;

    const currentSeason = Number(meta.season);
    if (currentSeason === target) {
      return meta.league_id || currentId;
    }
    if (currentSeason < target && meta.next_league_id) {
      currentId = meta.next_league_id;
      continue;
    }
    if (currentSeason > target && meta.previous_league_id) {
      currentId = meta.previous_league_id;
      continue;
    }
    break;
  }

  for (const candidate of directCandidates) {
    let cursor = candidate.league_id;
    const seen = new Set();
    for (let index = 0; index < 10; index += 1) {
      if (!cursor || seen.has(cursor)) break;
      seen.add(cursor);
      const meta = await getLeagueMeta(cursor);
      if (!meta) break;
      if (meta.league_id === baseLeagueId) {
        return candidate.league_id;
      }
      if (!meta.previous_league_id) break;
      cursor = meta.previous_league_id;
    }
  }

  const approximate = directCandidates.find((league) => Number(league?.total_rosters) === baseRosters);
  return approximate?.league_id || baseLeagueId;
}

function parseContractsCsv(text) {
  const rows = String(text || '').split('\n').filter(Boolean);
  if (rows.length < 2) return [];

  const header = rows[0].split(',').map((value) => value.trim());
  const headerMap = {};
  header.forEach((column, index) => {
    headerMap[column] = index;
  });

  return rows.slice(1).map((row) => {
    const values = row.split(',');
    if (values.length !== header.length) {
      return null;
    }

    const status = values[headerMap.Status];
    const isActiveLike = status === 'Active' || status === 'Future';

    return {
      playerId: String(values[headerMap['Player ID']] || '').trim(),
      playerName: values[headerMap['Player Name']],
      position: values[headerMap.Position],
      contractType: values[headerMap['Contract Type']],
      status,
      team: values[headerMap.TeamDisplayName],
      contractFinalYear: values[headerMap['Contract Final Year']],
      age: values[headerMap.Age],
      ktcValue: parseYear(values[headerMap['Current KTC Value']]),
      rfaEligible: values[headerMap['Will Be RFA?']],
      franchiseTagEligible: values[headerMap['Franchise Tag Eligible?']],
      isActiveLike,
      curYear: isActiveLike
        ? toNumber(values[headerMap['Relative Year 1 Salary']])
        : toNumber(values[headerMap['Relative Year 1 Dead']]),
      year2: isActiveLike
        ? toNumber(values[headerMap['Relative Year 2 Salary']])
        : toNumber(values[headerMap['Relative Year 2 Dead']]),
      year3: isActiveLike
        ? toNumber(values[headerMap['Relative Year 3 Salary']])
        : toNumber(values[headerMap['Relative Year 3 Dead']]),
      year4: isActiveLike
        ? toNumber(values[headerMap['Relative Year 4 Salary']])
        : toNumber(values[headerMap['Relative Year 4 Dead']]),
    };
  }).filter(Boolean);
}

function parseFinesCsv(text) {
  const rows = String(text || '').split('\n').filter(Boolean);
  return rows.slice(1).reduce((accumulator, row) => {
    const [team, year1, year2, year3, year4] = row.split(',');
    if (!team) return accumulator;
    accumulator[team] = {
      curYear: toNumber(year1),
      year2: toNumber(year2),
      year3: toNumber(year3),
      year4: toNumber(year4),
    };
    return accumulator;
  }, {});
}

function isTruthyFlag(value) {
  return ['true', 'yes', '1'].includes(String(value || '').trim().toLowerCase());
}

function buildRfaPreview(contracts, effectiveContractYear) {
  const allowedTypes = ['waiver', 'fa', 'free agent', 'freeagent'];
  return contracts
    .filter((contract) => {
      const type = String(contract.contractType || '').trim().toLowerCase();
      return Boolean(contract.team) &&
        contract.status === 'Active' &&
        allowedTypes.includes(type) &&
        parseYear(contract.contractFinalYear) === effectiveContractYear &&
        !isTruthyFlag(contract.rfaEligible);
    })
    .sort((left, right) => String(left.playerName || '').localeCompare(String(right.playerName || '')))
    .map((contract) => ({
      playerId: contract.playerId,
      playerName: contract.playerName,
      team: contract.team,
      position: contract.position,
      contractType: contract.contractType,
      contractFinalYear: parseYear(contract.contractFinalYear),
    }));
}

function buildCapSummary({ contracts, fines, draft }) {
  const teamCaps = {};

  contracts.forEach((contract) => {
    if (!contract.team) return;

    if (!teamCaps[contract.team]) {
      teamCaps[contract.team] = {
        team: contract.team,
        curYear: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
        year2: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
        year3: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
        year4: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
      };
    }

    const capData = teamCaps[contract.team];
    if (contract.isActiveLike) {
      capData.curYear.active += contract.curYear;
      capData.year2.active += contract.year2;
      capData.year3.active += contract.year3;
      capData.year4.active += contract.year4;
    } else {
      capData.curYear.dead += contract.curYear;
      capData.year2.dead += contract.year2;
      capData.year3.dead += contract.year3;
      capData.year4.dead += contract.year4;
    }
  });

  Object.entries(teamCaps).forEach(([teamName, capData]) => {
    const teamFines = fines[teamName] || { curYear: 0, year2: 0, year3: 0, year4: 0 };
    capData.curYear.fines = teamFines.curYear;
    capData.year2.fines = teamFines.year2;
    capData.year3.fines = teamFines.year3;
    capData.year4.fines = teamFines.year4;

    ['curYear', 'year2', 'year3', 'year4'].forEach((yearKey) => {
      capData[yearKey].remaining = capData[yearKey].total - capData[yearKey].active - capData[yearKey].dead - capData[yearKey].fines;
    });
  });

  if (draft?.results) {
    Object.values(teamCaps).forEach((team) => {
      team.spend = draft.results
        .filter((result) => result.username === team.team)
        .reduce((sum, result) => sum + toNumber(result.contractPoints), 0);
    });
  }

  return Object.values(teamCaps)
    .map((team) => ({
      team: team.team,
      spend: toNumber(team.spend),
      remainingCap: Number(team.curYear.remaining.toFixed(1)),
      activeCap: Number(team.curYear.active.toFixed(1)),
      deadCap: Number(team.curYear.dead.toFixed(1)),
      fines: Number(team.curYear.fines.toFixed(1)),
    }))
    .sort((left, right) => right.remainingCap - left.remainingCap);
}

async function getActiveAuctionSummary() {
  await dbConnect();
  const draft = await Draft.findOne({ state: 'ACTIVE' }).sort({ startDate: -1 }).lean();
  if (!draft) return null;

  const startTime = draft?.startDate ? new Date(draft.startDate) : null;
  const endTime = draft?.endDate ? new Date(draft.endDate) : null;
  const now = new Date();

  return {
    exists: true,
    started: startTime instanceof Date && !Number.isNaN(startTime.getTime()) ? startTime <= now : false,
    title: draft?.blind ? 'Blind Free Agent Auction' : 'Free Agent Auction',
    startDate: draft?.startDate || null,
    endDate: draft?.endDate || null,
    timeZone: draft?.timeZone || null,
    blind: Boolean(draft?.blind),
    nominationDurationHours: toNumber(draft?.nomDuration),
    playerCount: Array.isArray(draft?.players) ? draft.players.length : 0,
    resultCount: Array.isArray(draft?.results) ? draft.results.length : 0,
    participantCount: Array.isArray(draft?.users) ? draft.users.length : 0,
    draft,
  };
}

async function getLatestMockDraft() {
  const client = await clientPromise;
  const db = client.db();
  const draft = await db.collection('mockDrafts')
    .find({ archived: { $ne: true } })
    .sort({ active: -1, date: -1 })
    .limit(1)
    .next();

  if (!draft) return null;

  return {
    id: String(draft._id),
    title: draft.title || 'Latest Mock Draft',
    description: draft.description || '',
    author: draft.author || 'Unknown',
    date: draft.date || null,
    active: Boolean(draft.active),
    picks: Array.isArray(draft?.meta?.picks)
      ? draft.meta.picks.map((pick) => ({
          pickNumber: String(pick?.pickNumber || ''),
          teamName: pick?.teamName || 'Unknown Team',
          playerName: pick?.player?.name || null,
          position: pick?.player?.position || null,
          nflTeam: pick?.player?.team || null,
        }))
      : [],
  };
}

async function getHoldoutSummary() {
  const client = await clientPromise;
  const db = client.db('bbb-league');
  const assignments = await db.collection('holdoutAssignments').find({}).toArray();
  const unresolved = (assignments || []).filter((assignment) => {
    const status = String(assignment?.decisionStatus || '').trim().toUpperCase();
    const hasLegacyDecision = Boolean(String(assignment?.decisionMade || '').trim());
    return !['DECLINED', 'ACCEPTED'].includes(status) && !hasLegacyDecision;
  });

  return {
    unresolvedCount: unresolved.length,
    unresolved: unresolved.slice(0, 6).map((assignment) => ({
      playerId: assignment.playerId,
      playerName: assignment.playerName || 'Unknown Player',
      assignedTeam: assignment.assignedTeam || '',
      offerYear1: assignment.offerYear1 || null,
    })),
  };
}

async function getSeasonTradeSummary({ leagueId, standingsRows }) {
  const teamByRosterId = new Map((standingsRows || []).map((row) => [Number(row.rosterId), row]));
  const tradeCounts = new Map();
  let totalTrades = 0;

  for (let week = 1; week <= 18; week += 1) {
    const transactions = await fetchJsonSafe(`https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`, []);
    const tradeTransactions = (Array.isArray(transactions) ? transactions : []).filter((transaction) => transaction.type === 'trade');
    totalTrades += tradeTransactions.length;

    tradeTransactions.forEach((trade) => {
      const rosterIds = new Set();

      (trade?.roster_ids || []).forEach((rosterId) => rosterIds.add(Number(rosterId)));
      Object.values(trade?.adds || {}).forEach((rosterId) => rosterIds.add(Number(rosterId)));
      Object.values(trade?.drops || {}).forEach((rosterId) => rosterIds.add(Number(rosterId)));
      (trade?.draft_picks || []).forEach((pick) => {
        rosterIds.add(Number(pick?.roster_id));
        rosterIds.add(Number(pick?.owner_id));
        rosterIds.add(Number(pick?.previous_owner_id));
      });

      Array.from(rosterIds)
        .filter((rosterId) => Number.isFinite(rosterId) && teamByRosterId.has(rosterId))
        .forEach((rosterId) => {
          tradeCounts.set(rosterId, toNumber(tradeCounts.get(rosterId)) + 1);
        });
    });
  }

  const mostTradesEntry = Array.from(tradeCounts.entries())
    .sort((left, right) => right[1] - left[1])[0];

  return {
    totalTrades,
    mostTrades: mostTradesEntry
      ? {
          rosterId: mostTradesEntry[0],
          count: mostTradesEntry[1],
          teamName: teamByRosterId.get(mostTradesEntry[0])?.teamName || `Roster ${mostTradesEntry[0]}`,
          avatar: teamByRosterId.get(mostTradesEntry[0])?.avatar || null,
        }
      : null,
  };
}

async function getHighScoreSummary({ leagueId, standingsRows }) {
  const teamByRosterId = new Map((standingsRows || []).map((row) => [Number(row.rosterId), row]));
  let best = null;

  for (let week = 1; week <= 18; week += 1) {
    const matchups = await fetchJsonSafe(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`, []);
    (Array.isArray(matchups) ? matchups : []).forEach((matchup) => {
      const points = Number(matchup?.points);
      if (!Number.isFinite(points)) return;
      if (!best || points > best.points) {
        const team = teamByRosterId.get(Number(matchup?.roster_id));
        best = {
          week,
          points,
          rosterId: Number(matchup?.roster_id),
          teamName: team?.teamName || `Roster ${matchup?.roster_id}`,
          avatar: team?.avatar || null,
        };
      }
    });
  }

  return best;
}

function buildPromotionDelegation(divisionData) {
  const divisions = divisionData?.divisions || {};
  const wallStreet = divisions['1'] || [];
  const middleClass = divisions['2'] || [];
  const poorHouse = divisions['3'] || [];

  const entries = [];

  if (wallStreet[0]) {
    entries.push({
      teamName: wallStreet[0].teamName,
      avatar: wallStreet[0].avatar,
      movement: 'stays',
      from: 'Wall Street',
      to: 'Wall Street',
      reason: 'Division winner holds the top flight.',
    });
  }
  if (wallStreet[wallStreet.length - 1]) {
    entries.push({
      teamName: wallStreet[wallStreet.length - 1].teamName,
      avatar: wallStreet[wallStreet.length - 1].avatar,
      movement: 'delegated',
      from: 'Wall Street',
      to: 'Middle Class',
      reason: 'Last place drops one division.',
    });
  }
  if (middleClass[0]) {
    entries.push({
      teamName: middleClass[0].teamName,
      avatar: middleClass[0].avatar,
      movement: 'promoted',
      from: 'Middle Class',
      to: 'Wall Street',
      reason: 'Division winner moves up.',
    });
  }
  if (middleClass[middleClass.length - 1]) {
    entries.push({
      teamName: middleClass[middleClass.length - 1].teamName,
      avatar: middleClass[middleClass.length - 1].avatar,
      movement: 'delegated',
      from: 'Middle Class',
      to: 'Poor House',
      reason: 'Last place drops one division.',
    });
  }
  if (poorHouse[0]) {
    entries.push({
      teamName: poorHouse[0].teamName,
      avatar: poorHouse[0].avatar,
      movement: 'promoted',
      from: 'Poor House',
      to: 'Middle Class',
      reason: 'Division winner moves up.',
    });
  }
  if (poorHouse[poorHouse.length - 1]) {
    entries.push({
      teamName: poorHouse[poorHouse.length - 1].teamName,
      avatar: poorHouse[poorHouse.length - 1].avatar,
      movement: 'stays',
      from: 'Poor House',
      to: 'Poor House',
      reason: 'Last place remains in the bottom division.',
    });
  }

  return entries;
}

async function buildRookieObligations({ leagueId, rosters, users, draftOrderResult, latestMockDraft }) {
  const [tradedPicks, drafts, fallbackDraftOrderResult] = await Promise.all([
    fetchJsonSafe(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, []),
    fetchJsonSafe(`https://api.sleeper.app/v1/league/${leagueId}/drafts`, []),
    draftOrderResult ? Promise.resolve(null) : calculateDraftOrderForLeague({ leagueId }),
  ]);

  const resolvedDraftOrderResult = draftOrderResult || fallbackDraftOrderResult;

  const activeDraft = (Array.isArray(drafts) ? drafts : []).find((draft) => String(draft?.status || '').toLowerCase() !== 'complete');
  const rounds = toNumber(activeDraft?.settings?.rounds || activeDraft?.rounds || DEFAULT_ROOKIE_DRAFT_ROUNDS, DEFAULT_ROOKIE_DRAFT_ROUNDS);
  const draftOrder = (resolvedDraftOrderResult?.draft_order || []).map((entry) => ({
    slot: Number(entry.slot),
    rosterId: Number(entry.original_roster_id || entry.roster_id),
  }));
  const targetSeason = Number(resolvedDraftOrderResult?.targetSeason);
  const getTeamName = (rosterId) => getDraftTeamName(rosterId, rosters, users);
  const teamPicks = estimateDraftPositions(
    rosters,
    Array.isArray(tradedPicks) ? tradedPicks : [],
    { settings: { rounds }, season: targetSeason },
    draftOrder,
    getTeamName,
    targetSeason,
  );

  const latestMockByPickNumber = new Map(
    (latestMockDraft?.picks || [])
      .filter((pick) => pick?.pickNumber)
      .map((pick) => [String(pick.pickNumber), pick]),
  );

  return Object.entries(teamPicks)
    .map(([teamName, picks]) => {
      const sortedCurrentPicks = (picks.currentPicks || [])
        .slice()
        .sort((left, right) => left.round - right.round || left.pickPosition - right.pickPosition);

      return {
        teamName,
        totalSalary: sortedCurrentPicks.reduce((sum, pick) => sum + toNumber(pick.salary), 0),
        pickCount: sortedCurrentPicks.length,
        topPick: sortedCurrentPicks[0]?.pickNumber || null,
        picks: sortedCurrentPicks.map((pick) => {
          const mockedPick = latestMockByPickNumber.get(String(pick.pickNumber));
          return {
            round: Number(pick.round),
            pickPosition: Number(pick.pickPosition),
            pickNumber: pick.pickNumber,
            salary: toNumber(pick.salary),
            originalOwner: pick.originalOwner,
            currentOwner: pick.currentOwner,
            mockedPlayer: mockedPick?.playerName
              ? {
                  playerName: mockedPick.playerName,
                  position: mockedPick.position,
                  nflTeam: mockedPick.nflTeam,
                  teamName: mockedPick.teamName,
                }
              : null,
          };
        }),
      };
    })
    .sort((left, right) => right.totalSalary - left.totalSalary || left.teamName.localeCompare(right.teamName));
}

function buildPhasePayload({
  phase,
  champion,
  standingsRows,
  tradeSummary,
  highScore,
  leagueInfo,
  draftOrderResult,
  promotionDelegation,
  rfaPreview,
  activeAuction,
  latestMockDraft,
  rookieObligations,
  holdoutSummary,
  freeAgencyCaps,
  currentRosterIdentityMap,
}) {
  const mostWins = standingsRows[0] || null;
  const mostPoints = standingsRows.slice().sort((left, right) => right.pointsFor - left.pointsFor)[0] || null;

  return {
    phase,
    champion: champion
      ? {
          teamName: champion.teamName,
          avatar: champion.avatar,
          wins: champion.wins,
          losses: champion.losses,
          pointsFor: Number(champion.pointsFor.toFixed(1)),
        }
      : null,
    awards: {
      mostWins: mostWins
        ? {
            teamName: mostWins.teamName,
            avatar: mostWins.avatar,
            value: `${mostWins.wins}-${mostWins.losses}${mostWins.ties ? `-${mostWins.ties}` : ''}`,
          }
        : null,
      mostPoints: mostPoints
        ? {
            teamName: mostPoints.teamName,
            avatar: mostPoints.avatar,
            value: Number(mostPoints.pointsFor.toFixed(1)),
          }
        : null,
      mostTrades: tradeSummary?.mostTrades || null,
    },
    seasonStats: {
      totalPoints: Number(standingsRows.reduce((sum, row) => sum + row.pointsFor, 0).toFixed(1)),
      totalTrades: tradeSummary?.totalTrades || 0,
      highScore: highScore
        ? {
            teamName: highScore.teamName,
            avatar: highScore.avatar,
            points: Number(highScore.points.toFixed(2)),
            week: highScore.week,
          }
        : null,
    },
    promotionDelegation,
    draftOrder: (draftOrderResult?.draft_order || []).map((entry) => {
      const fallbackIdentity = currentRosterIdentityMap?.get(Number(entry.original_roster_id))
        || currentRosterIdentityMap?.get(Number(entry.roster_id))
        || null;
      const shouldUseFallbackName = !entry.teamName || entry.teamName === 'Unknown Team';

      return {
        slot: Number(entry.slot),
        teamName: shouldUseFallbackName ? (fallbackIdentity?.teamName || entry.teamName) : entry.teamName,
        avatarUrl: entry.avatarUrl || fallbackIdentity?.avatarUrl || null,
        rosterId: entry.roster_id,
        originalRosterId: entry.original_roster_id,
      };
    }),
    rfaPreview: rfaPreview.slice(0, 16),
    activeAuction: activeAuction
      ? {
          exists: true,
          title: activeAuction.title,
          started: activeAuction.started,
          startDate: activeAuction.startDate,
          endDate: activeAuction.endDate,
          resultCount: activeAuction.resultCount,
          playerCount: activeAuction.playerCount,
        }
      : { exists: false },
    latestMockDraft,
    rookieObligations: rookieObligations.slice(0, 12),
    holdoutSummary,
    freeAgencyCaps: freeAgencyCaps.slice(0, 12),
    leagueStatus: normalizeLeagueStatus(leagueInfo?.status),
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    let leagueId = searchParams.get('leagueId');
    if (!leagueId) {
      leagueId = await findLeagueIdFallback();
    }

    if (!leagueId) {
      return NextResponse.json({ error: 'Unable to resolve leagueId' }, { status: 400 });
    }

    const [leagueInfo, users, rosters, nflState, winnersBracket, contractSettingsResult, contractsCsv, finesCsv, activeAuction, latestMockDraft, holdoutSummary] = await Promise.all([
      fetchJson(`https://api.sleeper.app/v1/league/${leagueId}`),
      fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/users`),
      fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
      fetchJson('https://api.sleeper.app/v1/state/nfl'),
      fetchJsonSafe(`https://api.sleeper.app/v1/league/${leagueId}/winners_bracket`, []),
      getContractManagementSettings(),
      fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv', { cache: 'no-store' }).then((response) => response.text()),
      fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_TeamFines.csv', { cache: 'no-store' }).then((response) => response.text()),
      getActiveAuctionSummary(),
      getLatestMockDraft(),
      getHoldoutSummary(),
    ]);

    const currentMonth = new Date().getMonth() + 1;
    const currentCalendarYear = new Date().getFullYear();
    const nflWeek = toNumber(nflState?.week ?? nflState?.display_week, null);
    const phase = resolveHomepagePhase({
      calendarMonth: currentMonth,
      nflWeek,
      leagueStatus: leagueInfo?.status,
    });

    const phaseOneSeasonYear = currentCalendarYear - 1;
    const phaseOneLeagueId = await resolveLeagueForSeason(leagueId, String(phaseOneSeasonYear));

    const [summaryLeagueInfo, summaryUsers, summaryRosters, summaryWinnersBracket] = phaseOneLeagueId === leagueId
      ? [leagueInfo, users, rosters, winnersBracket]
      : await Promise.all([
          fetchJson(`https://api.sleeper.app/v1/league/${phaseOneLeagueId}`),
          fetchJson(`https://api.sleeper.app/v1/league/${phaseOneLeagueId}/users`),
          fetchJson(`https://api.sleeper.app/v1/league/${phaseOneLeagueId}/rosters`),
          fetchJsonSafe(`https://api.sleeper.app/v1/league/${phaseOneLeagueId}/winners_bracket`, []),
        ]);

    const standingsData = buildStandingsRows(summaryRosters, summaryUsers, summaryLeagueInfo);
    const currentRosterIdentityMap = buildRosterIdentityMap(rosters, users);
    const champion = pickChampion({ winnersBracket: summaryWinnersBracket, standingsRows: standingsData.rows });

    const contracts = parseContractsCsv(contractsCsv);
    const fines = parseFinesCsv(finesCsv);
    const contractYearOverride = contractSettingsResult?.success ? parseYear(contractSettingsResult?.settings?.contractYearOverride) : null;
    const effectiveContractYear = contractYearOverride || parseYear(leagueInfo?.season) || parseYear(nflState?.season) || new Date().getFullYear();
    const [tradeSummary, highScore, draftOrderResult] = await Promise.all([
      getSeasonTradeSummary({ leagueId: phaseOneLeagueId, standingsRows: standingsData.rows }),
      getHighScoreSummary({ leagueId: phaseOneLeagueId, standingsRows: standingsData.rows }),
      calculateDraftOrderForLeague({
        leagueId: phaseOneLeagueId,
        targetSeason: phaseOneSeasonYear + 1,
        applyRoundOneTrades: false,
      }),
    ]);
    const rookieObligations = await buildRookieObligations({
      leagueId,
      rosters,
      users,
      draftOrderResult,
      latestMockDraft,
    });

    const rfaPreview = buildRfaPreview(contracts, effectiveContractYear);
    const freeAgencyCaps = buildCapSummary({ contracts, fines, draft: activeAuction?.draft || null });
    const promotionDelegation = buildPromotionDelegation(standingsData);
    const payload = buildPhasePayload({
      phase,
      champion,
      standingsRows: standingsData.rows,
      tradeSummary,
      highScore,
      leagueInfo: summaryLeagueInfo,
      draftOrderResult,
      promotionDelegation,
      rfaPreview,
      activeAuction,
      latestMockDraft,
      rookieObligations,
      holdoutSummary,
      freeAgencyCaps,
      currentRosterIdentityMap,
    });

    return NextResponse.json({
      leagueId,
      calendarMonth: currentMonth,
      nflWeek,
      leagueSeason: parseYear(leagueInfo?.season),
      phaseOneSeasonYear,
      effectiveContractYear,
      phase,
      phases: HOMEPAGE_PHASES,
      payload,
      diagnostics: {
        leagueStatus: normalizeLeagueStatus(leagueInfo?.status),
        summaryLeagueId: phaseOneLeagueId,
        summaryLeagueSeason: parseYear(summaryLeagueInfo?.season),
        auctionExists: Boolean(activeAuction),
        mockDraftExists: Boolean(latestMockDraft),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}