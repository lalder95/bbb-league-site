import { getNormalizedContractsData } from '@/lib/normalized-contracts';
import { getContractManagementSettings } from '@/lib/db-helpers';
import { fetchJson, fetchText } from '@/lib/assistant-gm/fetch';
import {
  calculateTeamCapSnapshot,
  createRookiePickObligation,
  parseTeamFinesCsv,
} from '@/lib/salary-cap-calculator';
import { calculateDraftOrderForLeague, resolveTargetDraftSeason } from '@/utils/draftOrderCalculator';
import { createDraftPickAsset, getAssetBudgetValue } from '@/utils/draftPickTradeUtils';
import { buildTradeSharePayload, encodeTradeSharePayload } from '@/utils/tradeShareUtils';

const FINES_CSV_URL = 'https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_TeamFines.csv';
const PICK_ROUNDS = [1, 2, 3, 4, 5, 6, 7];
const PICK_YEARS = 3;

async function measureStage(onStageTiming, stage, operation) {
  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    onStageTiming?.({ stage, durationMs: Date.now() - startedAt });
  }
}

function getTeamName(user) {
  return String(user?.display_name || user?.username || '').trim();
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function useOptionalFallback(error) {
  if (error?.code === 'REQUEST_DEADLINE_EXCEEDED') throw error;
  return [];
}

function buildRatios(contracts) {
  const activeContracts = contracts.filter((contract) => ['Active', 'Future'].includes(String(contract?.Status || '').trim()));
  const aggregate = activeContracts.reduce((result, contract) => {
    const position = String(contract?.Position || 'UNKNOWN').trim().toUpperCase();
    const salary = Number(contract?.['Relative Year 1 Salary']) || 0;
    const ktc = Number(contract?.['Current KTC Value']) || 0;
    result.salary += salary;
    result.ktc += ktc;
    if (!result.positions[position]) result.positions[position] = { salary: 0, ktc: 0, count: 0 };
    result.positions[position].salary += salary;
    result.positions[position].ktc += ktc;
    result.positions[position].count += 1;
    return result;
  }, { salary: 0, ktc: 0, positions: {} });

  return Object.entries(aggregate.positions).reduce((result, [position, values]) => {
    result.positionRatios[position] = values.salary ? values.ktc / values.salary : 0;
    result.avgKtcByPosition[position] = values.count ? values.ktc / values.count : 0;
    return result;
  }, {
    ktcPerDollar: aggregate.salary ? aggregate.ktc / aggregate.salary : 0,
    positionRatios: {},
    avgKtcByPosition: {},
  });
}

function toPlayerAsset(contract) {
  return {
    id: String(contract?.['Player ID'] || ''),
    uniqueKey: `player-${contract?.['Player ID'] || ''}`,
    playerName: contract?.['Player Name'] || 'Unknown Player',
    position: contract?.Position || '',
    team: contract?.TeamDisplayName || '',
    contractType: contract?.['Contract Type'] || '',
    status: contract?.Status || '',
    curYear: Number(contract?.['Relative Year 1 Salary']) || 0,
    year2: Number(contract?.['Relative Year 2 Salary']) || 0,
    year3: Number(contract?.['Relative Year 3 Salary']) || 0,
    year4: Number(contract?.['Relative Year 4 Salary']) || 0,
    age: contract?.Age || '',
    ktcValue: Number(contract?.['Current KTC Value']) || 0,
  };
}

function getProposalParticipants(proposal) {
  const participants = Array.isArray(proposal?.p) ? proposal.p : proposal?.participants;
  if (!Array.isArray(participants)) return [];
  return participants.map((participant) => ({
    team: String(participant?.t ?? participant?.team ?? '').trim(),
    assets: Array.isArray(participant?.a) ? participant.a : (participant?.assets || participant?.selectedPlayers || []),
  })).filter((participant) => participant.team);
}

function getAssetReference(asset) {
  if (asset?.k === 'pk' || asset?.assetType === 'pick') {
    return {
      kind: 'pick',
      season: String(asset?.s ?? asset?.season ?? ''),
      round: Number(asset?.r ?? asset?.round),
      originalOwner: String(asset?.o ?? asset?.originalTeam ?? ''),
      destination: String(asset?.d ?? asset?.toTeam ?? ''),
    };
  }
  return {
    kind: 'player',
    id: String(asset?.i ?? asset?.id ?? asset?.playerId ?? ''),
    destination: String(asset?.d ?? asset?.toTeam ?? ''),
  };
}

export async function getAssistantGMLeagueSnapshot({ onStageTiming, deadlineAt } = {}) {
  const fetchOptions = { deadlineAt };
  const [{ leagueId, rows: contracts, users, rosters }, contractSettings, state] = await Promise.all([
    measureStage(onStageTiming, 'normalizedContractsMs', () => getNormalizedContractsData(fetchOptions)),
    measureStage(onStageTiming, 'contractSettingsMs', () => getContractManagementSettings()),
    measureStage(onStageTiming, 'leagueStateMs', () => fetchJson('https://api.sleeper.app/v1/state/nfl', fetchOptions)),
  ]);
  const leagueYear = Number(state?.season);
  if (!Number.isFinite(leagueYear) || leagueYear < 2000) throw new Error('Could not resolve league year from Sleeper state');
  const [tradedPicks, finesText, drafts, league] = await Promise.all([
    measureStage(onStageTiming, 'tradedPicksMs', () => fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, fetchOptions).catch(useOptionalFallback)),
    measureStage(onStageTiming, 'finesCsvMs', () => fetchText(FINES_CSV_URL, fetchOptions)),
    measureStage(onStageTiming, 'draftsMs', () => fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/drafts`, fetchOptions).catch(useOptionalFallback)),
    measureStage(onStageTiming, 'leagueSettingsMs', () => fetchJson(`https://api.sleeper.app/v1/league/${leagueId}`, fetchOptions)),
  ]);
  const targetDraftSeason = await resolveTargetDraftSeason({ leagueId, leagueYear, drafts });
  const draftOrderResult = await measureStage(onStageTiming, 'draftOrderMs', () => calculateDraftOrderForLeague({
    leagueId,
    targetSeason: targetDraftSeason,
    users,
    rosters,
    tradedPicks,
    league,
    state,
    deadlineAt,
    onStageTiming,
  }));
  const teamNameByRosterId = Object.fromEntries((rosters || []).map((roster) => {
    const user = (users || []).find((entry) => String(entry?.user_id) === String(roster?.owner_id));
    return [String(roster?.roster_id), getTeamName(user) || `Team ${roster?.roster_id}`];
  }));
  const rosterIdByTeam = Object.fromEntries(Object.entries(teamNameByRosterId).map(([rosterId, team]) => [normalize(team), Number(rosterId)]));
  const slotsByOriginalRoster = Object.fromEntries((draftOrderResult?.draft_order || []).map((entry) => [String(entry.original_roster_id), Number(entry.slot)]));
  const years = Array.from({ length: PICK_YEARS }, (_, index) => String(Number(targetDraftSeason) + index));
  const pickInventory = [];

  years.forEach((season) => {
    PICK_ROUNDS.forEach((round) => {
      (rosters || []).forEach((roster) => {
        const trade = (tradedPicks || []).find((pick) => String(pick?.season) === season
          && Number(pick?.round) === round
          && String(pick?.roster_id) === String(roster?.roster_id));
        const originalRosterId = Number(roster?.roster_id);
        const ownerRosterId = Number(trade?.owner_id ?? originalRosterId);
        const pickPosition = season === String(targetDraftSeason) ? slotsByOriginalRoster[String(originalRosterId)] : null;
        const originalTeam = teamNameByRosterId[String(originalRosterId)] || String(originalRosterId);
        const currentOwner = teamNameByRosterId[String(ownerRosterId)] || String(ownerRosterId);
        pickInventory.push({
          season,
          round,
          originalRosterId,
          ownerRosterId,
          originalTeam,
          currentOwner,
          pickPosition,
          asset: createDraftPickAsset({
            season,
            round,
            pickPosition: pickPosition || 6,
            originalOwner: originalTeam,
            currentOwner,
            slotDetermined: Boolean(pickPosition),
          }),
        });
      });
    });
  });

  return {
    leagueId,
    leagueYear,
    baseSeason: contractSettings?.success && contractSettings.settings?.contractYearOverride
      ? contractSettings.settings.contractYearOverride
      : leagueYear,
    contracts,
    users: Array.isArray(users) ? users : [],
    rosters: Array.isArray(rosters) ? rosters : [],
    finesByTeam: parseTeamFinesCsv(finesText),
    teamNameByRosterId,
    rosterIdByTeam,
    targetDraftSeason,
    pickInventory,
  };
}

export async function getAssistantGMUserTeamSnapshot({ sleeperId, snapshot: providedSnapshot } = {}) {
  if (!sleeperId) {
    return { available: false, reason: 'No Sleeper ID is attached to this account.' };
  }

  const snapshot = providedSnapshot || await getAssistantGMLeagueSnapshot();
  const roster = snapshot.rosters.find((entry) => String(entry?.owner_id) === String(sleeperId));
  if (!roster) {
    return { available: false, reason: 'Could not find this manager in the active BBB league.' };
  }

  const teamName = snapshot.teamNameByRosterId[String(roster.roster_id)];
  const players = snapshot.contracts
    .filter((contract) => ['Active', 'Future'].includes(String(contract?.Status || '').trim()))
    .filter((contract) => normalize(contract?.TeamDisplayName) === normalize(teamName))
    .map(toPlayerAsset)
    .sort((left, right) => Number(right.curYear) - Number(left.curYear) || left.playerName.localeCompare(right.playerName));
  const picks = snapshot.pickInventory.filter((pick) => normalize(pick.currentOwner) === normalize(teamName));
  const rookiePicks = picks.map((pick) => createRookiePickObligation({
    season: pick.season,
    round: pick.round,
    pickPosition: pick.pickPosition || 6,
  }));

  return {
    available: true,
    teamName,
    cap: calculateTeamCapSnapshot({
      teamName,
      contracts: snapshot.contracts,
      finesByTeam: snapshot.finesByTeam,
      rookiePicks,
      baseSeason: snapshot.baseSeason,
      includeRookieObligations: true,
    }),
    players,
    picks: picks.map((pick) => pick.asset),
  };
}

export async function getAssistantGMTeamSnapshot({ teamName, snapshot: providedSnapshot } = {}) {
  const snapshot = providedSnapshot || await getAssistantGMLeagueSnapshot();
  const resolvedTeam = Object.values(snapshot.teamNameByRosterId)
    .find((team) => normalize(team) === normalize(teamName));
  if (!resolvedTeam) {
    return { available: false, reason: `Could not find team "${teamName}" in the active BBB league.` };
  }

  const players = snapshot.contracts
    .filter((contract) => ['Active', 'Future'].includes(String(contract?.Status || '').trim()))
    .filter((contract) => normalize(contract?.TeamDisplayName) === normalize(resolvedTeam))
    .map(toPlayerAsset)
    .sort((left, right) => Number(right.curYear) - Number(left.curYear) || left.playerName.localeCompare(right.playerName));
  const picks = snapshot.pickInventory.filter((pick) => normalize(pick.currentOwner) === normalize(resolvedTeam));
  const rookiePicks = picks.map((pick) => createRookiePickObligation({
    season: pick.season,
    round: pick.round,
    pickPosition: pick.pickPosition || 6,
  }));

  return {
    available: true,
    teamName: resolvedTeam,
    cap: calculateTeamCapSnapshot({
      teamName: resolvedTeam,
      contracts: snapshot.contracts,
      finesByTeam: snapshot.finesByTeam,
      rookiePicks,
      baseSeason: snapshot.baseSeason,
      includeRookieObligations: true,
    }),
    players,
    picks: picks.map((pick) => pick.asset),
  };
}

export async function searchAssistantGMAssets({ query, teamName, snapshot: providedSnapshot } = {}) {
  const normalizedQuery = normalize(query);
  const snapshot = providedSnapshot || await getAssistantGMLeagueSnapshot();
  const assets = snapshot.contracts
    .filter((contract) => ['Active', 'Future'].includes(String(contract?.Status || '').trim()))
    .filter((contract) => !teamName || normalize(contract?.TeamDisplayName) === normalize(teamName))
    .filter((contract) => !normalizedQuery || normalize(contract?.['Player Name']).includes(normalizedQuery))
    .slice(0, 12)
    .map(toPlayerAsset);

  return { query: String(query || ''), assets };
}

export async function evaluateAssistantGMTrade(proposal, { snapshot: providedSnapshot } = {}) {
  const snapshot = providedSnapshot || await getAssistantGMLeagueSnapshot();
  const participants = getProposalParticipants(proposal);
  const participantTeams = [...new Set(participants.map((participant) => participant.team))];
  const errors = [];
  if (participantTeams.length < 2) errors.push({ code: 'teams', message: 'A trade must include at least two teams.' });

  const playersById = new Map(snapshot.contracts
    .filter((contract) => ['Active', 'Future'].includes(String(contract?.Status || '').trim()))
    .map((contract) => [String(contract?.['Player ID']), contract]));
  const playerOwners = new Map(snapshot.contracts
    .filter((contract) => ['Active', 'Future'].includes(String(contract?.Status || '').trim()))
    .map((contract) => [String(contract?.['Player ID']), String(contract?.TeamDisplayName || '')]));
  const picksByKey = new Map(snapshot.pickInventory.map((pick) => [
    `${pick.season}:${pick.round}:${normalize(pick.originalTeam)}`,
    pick,
  ]));
  const seenAssets = new Set();
  const resolvedParticipants = participants.map((participant) => ({ ...participant, assets: [] }));

  participants.forEach((participant, participantIndex) => {
    participant.assets.forEach((rawAsset) => {
      const reference = getAssetReference(rawAsset);
      const destination = reference.destination || (participantTeams.length === 2
        ? participantTeams.find((team) => team !== participant.team) || ''
        : '');
      if (!destination || !participantTeams.includes(destination) || destination === participant.team) {
        errors.push({ code: 'destination', message: `Choose a valid destination for ${participant.team}'s asset.` });
        return;
      }
      const assetKey = reference.kind === 'player'
        ? `player:${reference.id}`
        : `pick:${reference.season}:${reference.round}:${normalize(reference.originalOwner)}`;
      if (seenAssets.has(assetKey)) {
        errors.push({ code: 'duplicate', message: 'The same asset cannot be included twice.' });
        return;
      }
      seenAssets.add(assetKey);

      if (reference.kind === 'player') {
        const contract = playersById.get(reference.id);
        if (!contract || normalize(playerOwners.get(reference.id)) !== normalize(participant.team)) {
          errors.push({ code: 'ownership', message: `Player ${reference.id || 'unknown'} is not owned by ${participant.team}.` });
          return;
        }
        resolvedParticipants[participantIndex].assets.push({ kind: 'player', destination, contract, asset: toPlayerAsset(contract) });
        return;
      }

      const pick = picksByKey.get(`${reference.season}:${reference.round}:${normalize(reference.originalOwner)}`);
      if (!pick || normalize(pick.currentOwner) !== normalize(participant.team)) {
        errors.push({ code: 'ownership', message: `That pick is not owned by ${participant.team}.` });
        return;
      }
      resolvedParticipants[participantIndex].assets.push({ kind: 'pick', destination, pick, asset: pick.asset });
    });
  });

  const beforeContracts = snapshot.contracts;
  const afterContracts = snapshot.contracts.map((contract) => ({ ...contract }));
  const afterPicks = snapshot.pickInventory.map((pick) => ({ ...pick }));
  resolvedParticipants.forEach((participant) => participant.assets.forEach((entry) => {
    if (entry.kind === 'player') {
      afterContracts
        .filter((row) => String(row?.['Player ID']) === String(entry.contract?.['Player ID']))
        .forEach((contract) => {
          contract.TeamDisplayName = entry.destination;
        });
    } else {
      const pick = afterPicks.find((candidate) => candidate.season === entry.pick.season
        && candidate.round === entry.pick.round
        && candidate.originalRosterId === entry.pick.originalRosterId);
      if (pick) pick.currentOwner = entry.destination;
    }
  }));

  const ratios = buildRatios(snapshot.contracts);
  const impactsByTeam = Object.fromEntries(participantTeams.map((team) => {
    const beforePicks = snapshot.pickInventory
      .filter((pick) => normalize(pick.currentOwner) === normalize(team))
      .map((pick) => createRookiePickObligation({ season: pick.season, round: pick.round, pickPosition: pick.pickPosition || 6 }));
    const afterTeamPicks = afterPicks
      .filter((pick) => normalize(pick.currentOwner) === normalize(team))
      .map((pick) => createRookiePickObligation({ season: pick.season, round: pick.round, pickPosition: pick.pickPosition || 6 }));
    return [team, {
      before: calculateTeamCapSnapshot({ teamName: team, contracts: beforeContracts, finesByTeam: snapshot.finesByTeam, rookiePicks: beforePicks, baseSeason: snapshot.baseSeason, includeRookieObligations: true }),
      after: calculateTeamCapSnapshot({ teamName: team, contracts: afterContracts, finesByTeam: snapshot.finesByTeam, rookiePicks: afterTeamPicks, baseSeason: snapshot.baseSeason, includeRookieObligations: true }),
    }];
  }));
  const valuesByTeam = Object.fromEntries(resolvedParticipants.map((participant) => [participant.team, participant.assets.reduce((totals, entry) => {
    totals.sentKtc += Number(entry.asset.ktcValue) || 0;
    totals.sentBudgetValue += getAssetBudgetValue(entry.asset, { ...ratios, usePositionRatios: true });
    return totals;
  }, { sentKtc: 0, sentBudgetValue: 0 })]));
  resolvedParticipants.forEach((participant) => participant.assets.forEach((entry) => {
    const totals = valuesByTeam[entry.destination] || (valuesByTeam[entry.destination] = { sentKtc: 0, sentBudgetValue: 0 });
    totals.receivedKtc = (totals.receivedKtc || 0) + (Number(entry.asset.ktcValue) || 0);
    totals.receivedBudgetValue = (totals.receivedBudgetValue || 0) + getAssetBudgetValue(entry.asset, { ...ratios, usePositionRatios: true });
  }));
  const capWarnings = participantTeams.flatMap((team) => Object.entries(impactsByTeam[team].after)
    .filter(([, cap]) => cap.remaining < 50)
    .map(([yearKey, cap]) => ({ team, yearKey, remaining: cap.remaining, severity: cap.remaining < 0 ? 'error' : 'warning' })));
  const shareParticipants = resolvedParticipants.map((participant, index) => ({
    id: index + 1,
    team: participant.team,
    selectedPlayers: participant.assets.map((entry) => ({ ...entry.asset, toTeam: entry.destination })),
  }));
  const sharePayload = buildTradeSharePayload({ participants: shareParticipants, leagueId: snapshot.leagueId, currentSeason: snapshot.leagueYear, showSummary: false });

  return {
    leagueId: snapshot.leagueId,
    baseSeason: snapshot.baseSeason,
    valid: errors.length === 0 && !capWarnings.some((warning) => warning.yearKey === 'curYear' && warning.remaining < 0),
    errors,
    warnings: capWarnings.filter((warning) => warning.severity === 'warning'),
    capWarnings,
    impactsByTeam,
    valuesByTeam,
    participants: resolvedParticipants.map((participant) => ({
      team: participant.team,
      assets: participant.assets.map((entry) => ({ ...entry.asset, toTeam: entry.destination })),
    })),
    tradeUrl: `/trade/share?s=${encodeTradeSharePayload(sharePayload)}`,
  };
}