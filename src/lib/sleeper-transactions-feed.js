import {
  getMediaFeedSyncState,
  updateMediaFeedSyncState,
  upsertMediaFeedItem,
} from '@/lib/db-helpers';
import { generateCutReaction, generateTradeReactions } from '@/lib/sleeper-transaction-reactions';

const USER_ID = '456973480269705216';
const CONTRACTS_CSV_URL = 'https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv';
const FINES_CSV_URL = 'https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_TeamFines.csv';

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed request ${response.status}: ${url}`);
  }
  return response.json();
}

async function resolveBBBLeagueId() {
  const state = await fetchJson('https://api.sleeper.app/v1/state/nfl');
  const currentSeason = state?.season;
  if (!currentSeason) {
    throw new Error('Could not resolve NFL season');
  }

  const seasons = [String(currentSeason), String(Number(currentSeason) - 1)];
  for (const season of seasons) {
    const leagues = await fetchJson(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${season}`);
    const matches = (Array.isArray(leagues) ? leagues : []).filter((league) => {
      const name = String(league?.name || '').toLowerCase();
      return name.includes('budget blitz bowl') || name.includes('bbb') || (name.includes('budget') && name.includes('blitz'));
    });
    if (matches.length > 0) {
      return matches.sort((left, right) => Number(right?.season) - Number(left?.season))[0]?.league_id || null;
    }
  }

  throw new Error('No BBB league found for commissioner');
}

function parseContractPlayerRows(csvText) {
  const rows = String(csvText || '').split('\n').filter((row) => row.trim());
  if (rows.length <= 1) return [];

  const headers = rows[0].split(',').map((header) => header.trim());
  const headerMap = new Map(headers.map((header, index) => [header, index]));
  const getIndex = (headerName, fallback) => headerMap.has(headerName) ? headerMap.get(headerName) : fallback;

  const playerIdIndex = getIndex('Player ID', 0);
  const playerNameIndex = getIndex('Player Name', 1);
  const teamIndex = getIndex('TeamDisplayName', 33);
  const ktcIndex = getIndex('Current KTC Value', 34);

  return rows.slice(1).map((line) => {
    const values = line.split(',');
    return {
      playerId: String(values[playerIdIndex] || '').trim(),
      playerName: String(values[playerNameIndex] || '').trim(),
      teamName: String(values[teamIndex] || '').trim(),
      ktcValue: Number(values[ktcIndex] || 0) || 0,
      curYear: Number(values[15] || 0) || 0,
      year2: Number(values[16] || 0) || 0,
      year3: Number(values[17] || 0) || 0,
      year4: Number(values[18] || 0) || 0,
      deadCurYear: Number(values[24] || 0) || 0,
      deadYear2: Number(values[25] || 0) || 0,
      deadYear3: Number(values[26] || 0) || 0,
      deadYear4: Number(values[27] || 0) || 0,
    };
  }).filter((row) => row.playerId);
}

function buildRosterMaps(rosters, users) {
  const usersById = new Map((Array.isArray(users) ? users : []).map((user) => [String(user.user_id), user]));
  return new Map((Array.isArray(rosters) ? rosters : []).map((roster) => {
    const owner = usersById.get(String(roster.owner_id));
    return [Number(roster.roster_id), {
      rosterId: Number(roster.roster_id),
      ownerId: String(roster.owner_id || ''),
      ownerName: owner?.display_name || owner?.team_name || `Team ${roster.roster_id}`,
    }];
  }));
}

function formatPickLabel(pick) {
  return `${pick.season} Round ${pick.round}`;
}

function createEmptyCap() {
  return {
    curYear: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
    year2: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
    year3: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
    year4: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
  };
}

function parseCapContracts(csvText) {
  return String(csvText || '')
    .split('\n')
    .slice(1)
    .filter((row) => row.trim())
    .map((row) => {
      const values = row.split(',');
      return {
        team: String(values[33] || '').trim(),
        curYear: Number(values[15] || 0) || 0,
        year2: Number(values[16] || 0) || 0,
        year3: Number(values[17] || 0) || 0,
        year4: Number(values[18] || 0) || 0,
        deadCurYear: Number(values[24] || 0) || 0,
        deadYear2: Number(values[25] || 0) || 0,
        deadYear3: Number(values[26] || 0) || 0,
        deadYear4: Number(values[27] || 0) || 0,
      };
    })
    .filter((row) => row.team);
}

function parseTeamFines(csvText) {
  return String(csvText || '')
    .split('\n')
    .slice(1)
    .filter((row) => row.trim())
    .reduce((accumulator, row) => {
      const [team, year1, year2, year3, year4] = row.split(',');
      const teamName = String(team || '').trim();
      if (!teamName) return accumulator;
      accumulator[teamName] = {
        curYear: Number(year1 || 0) || 0,
        year2: Number(year2 || 0) || 0,
        year3: Number(year3 || 0) || 0,
        year4: Number(year4 || 0) || 0,
      };
      return accumulator;
    }, {});
}

function buildTeamCapMap(contractsCsvText, finesCsvText) {
  const teamCaps = {};
  parseCapContracts(contractsCsvText).forEach((contract) => {
    if (!teamCaps[contract.team]) {
      teamCaps[contract.team] = createEmptyCap();
    }

    const cap = teamCaps[contract.team];
    cap.curYear.active += contract.curYear;
    cap.curYear.dead += contract.deadCurYear;
    cap.year2.active += contract.year2;
    cap.year2.dead += contract.deadYear2;
    cap.year3.active += contract.year3;
    cap.year3.dead += contract.deadYear3;
    cap.year4.active += contract.year4;
    cap.year4.dead += contract.deadYear4;
  });

  const finesByTeam = parseTeamFines(finesCsvText);
  Object.entries(teamCaps).forEach(([teamName, cap]) => {
    const teamFines = finesByTeam[teamName] || { curYear: 0, year2: 0, year3: 0, year4: 0 };
    cap.curYear.fines = teamFines.curYear;
    cap.year2.fines = teamFines.year2;
    cap.year3.fines = teamFines.year3;
    cap.year4.fines = teamFines.year4;

    ['curYear', 'year2', 'year3', 'year4'].forEach((yearKey) => {
      cap[yearKey].remaining = cap[yearKey].total - cap[yearKey].active - cap[yearKey].dead - cap[yearKey].fines;
    });
  });

  return teamCaps;
}

function cloneCap(cap) {
  return JSON.parse(JSON.stringify(cap || createEmptyCap()));
}

function applyOutgoingContract(cap, contract) {
  if (!contract) return;
  cap.curYear.active -= Number(contract.curYear || 0);
  cap.curYear.dead -= Number(contract.deadCurYear || 0);
  cap.year2.active -= Number(contract.year2 || 0);
  cap.year2.dead -= Number(contract.deadYear2 || 0);
  cap.year3.active -= Number(contract.year3 || 0);
  cap.year3.dead -= Number(contract.deadYear3 || 0);
  cap.year4.active -= Number(contract.year4 || 0);
  cap.year4.dead -= Number(contract.deadYear4 || 0);
}

function applyIncomingContract(cap, contract) {
  if (!contract) return;
  cap.curYear.active += Number(contract.curYear || 0);
  cap.year2.active += Number(contract.year2 || 0);
  cap.year3.active += Number(contract.year3 || 0);
  cap.year4.active += Number(contract.year4 || 0);
}

function refreshCapRemaining(cap) {
  ['curYear', 'year2', 'year3', 'year4'].forEach((yearKey) => {
    cap[yearKey].remaining = cap[yearKey].total - cap[yearKey].active - cap[yearKey].dead - cap[yearKey].fines;
  });
}

function describeCapPressure(remaining) {
  if (!Number.isFinite(remaining)) return 'unknown';
  if (remaining < 25) return 'tight';
  if (remaining < 60) return 'moderate';
  return 'comfortable';
}

function calculateTradeCapImpact({ teamCapMap, ownerName, incomingContracts, outgoingContracts }) {
  const before = cloneCap(teamCapMap?.[ownerName] || createEmptyCap());
  const after = cloneCap(before);

  outgoingContracts.forEach((contract) => applyOutgoingContract(after, contract));
  incomingContracts.forEach((contract) => applyIncomingContract(after, contract));
  refreshCapRemaining(after);

  return {
    owner_name: ownerName,
    pressureBefore: describeCapPressure(Number(before.curYear.remaining)),
    pressureAfter: describeCapPressure(Number(after.curYear.remaining)),
    before: {
      curYearRemaining: Number(before.curYear.remaining.toFixed(1)),
      year2Remaining: Number(before.year2.remaining.toFixed(1)),
      active: Number(before.curYear.active.toFixed(1)),
      dead: Number(before.curYear.dead.toFixed(1)),
      fines: Number(before.curYear.fines.toFixed(1)),
    },
    after: {
      curYearRemaining: Number(after.curYear.remaining.toFixed(1)),
      year2Remaining: Number(after.year2.remaining.toFixed(1)),
      active: Number(after.curYear.active.toFixed(1)),
    },
    delta: {
      curYearRemaining: Number((after.curYear.remaining - before.curYear.remaining).toFixed(1)),
      year2Remaining: Number((after.year2.remaining - before.year2.remaining).toFixed(1)),
      active: Number((after.curYear.active - before.curYear.active).toFixed(1)),
    },
  };
}

function summarizeCapContext(teamCapMap, ownerName) {
  const cap = teamCapMap?.[ownerName];
  if (!cap) {
    return {
      owner_name: ownerName,
      curYearRemaining: null,
      year2Remaining: null,
      active: null,
      dead: null,
      fines: null,
      pressure: 'unknown',
    };
  }

  const remaining = Number(cap.curYear.remaining);
  let pressure = 'comfortable';
  if (remaining < 25) pressure = 'tight';
  else if (remaining < 60) pressure = 'moderate';

  return {
    owner_name: ownerName,
    curYearRemaining: Number(cap.curYear.remaining.toFixed(1)),
    year2Remaining: Number(cap.year2.remaining.toFixed(1)),
    active: Number(cap.curYear.active.toFixed(1)),
    dead: Number(cap.curYear.dead.toFixed(1)),
    fines: Number(cap.curYear.fines.toFixed(1)),
    pressure,
  };
}

function buildTradeCapSummaries({ teamSummaries, players, playerCatalog, teamCapMap }) {
  return teamSummaries.map((team) => {
    const incomingContracts = players
      .filter((player) => player.to_owner_name === team.owner_name)
      .map((player) => playerCatalog.get(String(player.player_id)) || null)
      .filter(Boolean);
    const outgoingContracts = players
      .filter((player) => player.from_owner_name === team.owner_name)
      .map((player) => playerCatalog.get(String(player.player_id)) || null)
      .filter(Boolean);

    const baseline = summarizeCapContext(teamCapMap, team.owner_name);
    const impact = calculateTradeCapImpact({
      teamCapMap,
      ownerName: team.owner_name,
      incomingContracts,
      outgoingContracts,
    });

    return {
      ...baseline,
      ...impact,
    };
  });
}

function summarizeTradeTeams(teams, players, picks) {
  return teams.map((team) => {
    const ownerName = team.owner_name || 'Unknown';
    const receivedPlayers = players
      .filter((player) => player.to_owner_name === ownerName)
      .map((player) => player.name);
    const sentPlayers = players
      .filter((player) => player.from_owner_name === ownerName)
      .map((player) => player.name);
    const receivedPicks = picks
      .filter((pick) => pick.to_owner_name === ownerName)
      .map((pick) => pick.label);
    const sentPicks = picks
      .filter((pick) => pick.from_owner_name === ownerName)
      .map((pick) => pick.label);

    return {
      owner_name: ownerName,
      receives: [...receivedPlayers, ...receivedPicks],
      sends: [...sentPlayers, ...sentPicks],
    };
  });
}

function toDateFromSleeper(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function buildTradeEvent(transaction, rosterMap, playerCatalog, teamCapMap) {
  const adds = transaction?.adds || {};
  const drops = transaction?.drops || {};
  const picks = Array.isArray(transaction?.draft_picks) ? transaction.draft_picks : [];
  const rosterIds = new Set((Array.isArray(transaction?.roster_ids) ? transaction.roster_ids : []).map((id) => Number(id)));
  Object.values(adds).forEach((rosterId) => rosterIds.add(Number(rosterId)));
  Object.values(drops).forEach((rosterId) => rosterIds.add(Number(rosterId)));
  picks.forEach((pick) => {
    if (pick.owner_id != null) rosterIds.add(Number(pick.owner_id));
    if (pick.previous_owner_id != null) rosterIds.add(Number(pick.previous_owner_id));
  });

  const teams = Array.from(rosterIds)
    .map((rosterId) => rosterMap.get(Number(rosterId)))
    .filter(Boolean)
    .map((team) => ({ roster_id: team.rosterId, owner_id: team.ownerId, owner_name: team.ownerName }));

  const players = Object.keys({ ...adds, ...drops }).map((playerId) => {
    const playerInfo = playerCatalog.get(String(playerId)) || null;
    const fromTeam = rosterMap.get(Number(drops[playerId])) || null;
    const toTeam = rosterMap.get(Number(adds[playerId])) || null;
    return {
      player_id: String(playerId),
      name: playerInfo?.playerName || `Player ${playerId}`,
      to_roster_id: adds[playerId] ? Number(adds[playerId]) : null,
      to_owner_name: toTeam?.ownerName || 'Unknown',
      from_roster_id: drops[playerId] ? Number(drops[playerId]) : null,
      from_owner_name: fromTeam?.ownerName || 'Unknown',
    };
  });

  const formattedPicks = picks.map((pick) => {
    const toTeam = rosterMap.get(Number(pick.owner_id)) || null;
    const fromTeam = rosterMap.get(Number(pick.previous_owner_id)) || null;
    return {
      season: pick.season,
      round: pick.round,
      label: formatPickLabel(pick),
      to_owner_name: toTeam?.ownerName || 'Unknown',
      from_owner_name: fromTeam?.ownerName || 'Unknown',
    };
  });

  const teamsLabel = teams.map((team) => team.owner_name).join(', ');
  const playerLabels = players.slice(0, 4).map((player) => player.name);
  const pickLabels = formattedPicks.slice(0, 3).map((pick) => pick.label);
  const movedAssets = [...playerLabels, ...pickLabels].filter(Boolean).join(', ');
  const teamSummaries = summarizeTradeTeams(teams, players, formattedPicks);
  const capSummaries = buildTradeCapSummaries({ teamSummaries, players, playerCatalog, teamCapMap });

  return {
    tradeId: String(transaction.transaction_id || ''),
    teams,
    teamSummaries,
    capSummaries,
    players,
    picks: formattedPicks,
    note: `Sleeper trade • ${teamsLabel}${movedAssets ? ` • ${movedAssets}` : ''}`,
    timestamp: toDateFromSleeper(transaction.created),
  };
}

function buildCutEvents(transaction, rosterMap, playerCatalog) {
  const drops = transaction?.drops || {};
  return Object.entries(drops).map(([playerId, rosterId]) => {
    const team = rosterMap.get(Number(rosterId)) || null;
    const playerInfo = playerCatalog.get(String(playerId)) || null;
    return {
      transactionId: String(transaction.transaction_id || ''),
      playerId: String(playerId),
      playerName: playerInfo?.playerName || `Player ${playerId}`,
      teamName: team?.ownerName || 'Unknown',
      rosterId: Number(rosterId),
      ktcValue: Number(playerInfo?.ktcValue || 0),
      note: `Sleeper cut • ${team?.ownerName || 'Unknown'} dropped ${playerInfo?.playerName || `Player ${playerId}`}`,
      timestamp: toDateFromSleeper(transaction.created),
    };
  });
}

export async function syncSleeperTransactionsFeed() {
  const leagueId = await resolveBBBLeagueId();
  const [users, rosters, csvText, finesText] = await Promise.all([
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/users`),
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    fetch(CONTRACTS_CSV_URL, { cache: 'no-store' }).then((response) => response.text()),
    fetch(FINES_CSV_URL, { cache: 'no-store' }).then((response) => response.text()),
  ]);

  const rosterMap = buildRosterMaps(rosters, users);
  const playerCatalog = new Map(parseContractPlayerRows(csvText).map((row) => [row.playerId, row]));
  const teamCapMap = buildTeamCapMap(csvText, finesText);
  const syncKey = `sleeper-transactions:${leagueId}`;
  const syncStateResult = await getMediaFeedSyncState(syncKey);
  const syncState = syncStateResult?.success === false ? null : syncStateResult?.state;
  const isFirstSync = !syncState;
  const processedEventKeys = new Set(Array.isArray(syncState?.processedEventKeys) ? syncState.processedEventKeys : []);

  let created = 0;
  let inspected = 0;
  let lastSeenWeek = Number(syncState?.lastSeenWeek || 0);
  let consecutiveEmpty = 0;

  for (let week = 1; week <= 18; week += 1) {
    const transactions = await fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`);
    if (!Array.isArray(transactions) || transactions.length === 0) {
      consecutiveEmpty += 1;
      if (consecutiveEmpty >= 2) {
        break;
      }
      continue;
    }

    consecutiveEmpty = 0;
    lastSeenWeek = Math.max(lastSeenWeek, week);
    const finalizedTransactions = transactions.filter((transaction) => String(transaction?.status || '').toLowerCase() === 'complete');

    for (const transaction of finalizedTransactions) {
      if (String(transaction?.type || '').toLowerCase() === 'trade') {
        const tradeEvent = buildTradeEvent(transaction, rosterMap, playerCatalog, teamCapMap);
        const sourceKey = `sleeper-trade:${leagueId}:${tradeEvent.tradeId}`;
        if (processedEventKeys.has(sourceKey)) {
          continue;
        }

        const aiNotes = await generateTradeReactions({
          ...tradeEvent,
          seed: sourceKey,
        });

        const result = await upsertMediaFeedItem({
          source: 'sleeper-transaction',
          sourceKey,
          eventType: 'trade',
          leagueId,
          team: tradeEvent.teams.map((team) => team.owner_name).join(', '),
          notes: tradeEvent.note,
          timestamp: tradeEvent.timestamp,
          ai_notes: aiNotes,
          meta: {
            week,
            transactionId: tradeEvent.tradeId,
            teams: tradeEvent.teams,
            teamSummaries: tradeEvent.teamSummaries,
            capSummaries: tradeEvent.capSummaries,
            players: tradeEvent.players,
            picks: tradeEvent.picks,
          },
        });

        if (result?.inserted) {
          created += 1;
        }
        inspected += 1;
        processedEventKeys.add(sourceKey);
        continue;
      }

      if (!['waiver', 'free_agent'].includes(String(transaction?.type || '').toLowerCase())) {
        continue;
      }

      const cutEvents = buildCutEvents(transaction, rosterMap, playerCatalog)
        .filter((cut) => cut.ktcValue > 3000);

      for (const cutEvent of cutEvents) {
        const sourceKey = `sleeper-cut:${leagueId}:${cutEvent.transactionId}:${cutEvent.playerId}`;
        if (processedEventKeys.has(sourceKey)) {
          continue;
        }

        const aiNotes = await generateCutReaction({
          ...cutEvent,
          seed: sourceKey,
        });

        const result = await upsertMediaFeedItem({
          source: 'sleeper-transaction',
          sourceKey,
          eventType: 'cut',
          leagueId,
          playerId: cutEvent.playerId,
          playerName: cutEvent.playerName,
          team: cutEvent.teamName,
          notes: cutEvent.note,
          timestamp: cutEvent.timestamp,
          ai_notes: aiNotes,
          meta: {
            week,
            transactionId: cutEvent.transactionId,
            ktcValue: cutEvent.ktcValue,
            rosterId: cutEvent.rosterId,
          },
        });

        if (result?.inserted) {
          created += 1;
        }
        inspected += 1;
        processedEventKeys.add(sourceKey);
      }
    }
  }

  await updateMediaFeedSyncState(syncKey, {
    leagueId,
    lastSeenWeek,
    processedEventKeys: Array.from(processedEventKeys),
    initializedWithBackfill: true,
  });

  return {
    ok: true,
    status: isFirstSync
      ? (created > 0 ? 'backfilled-sleeper-transactions' : 'initialized-sleeper-transactions')
      : (created > 0 ? 'processed-sleeper-transactions' : 'up-to-date'),
    created,
    inspected,
    leagueId,
    lastSeenWeek,
  };
}