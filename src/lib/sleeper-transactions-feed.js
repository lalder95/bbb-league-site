import {
  getMediaFeedSyncState,
  updateMediaFeedSyncState,
  upsertMediaFeedItem,
} from '@/lib/db-helpers';
import { generateCutReaction, generateTradeReactions } from '@/lib/sleeper-transaction-reactions';

const USER_ID = '456973480269705216';
const CONTRACTS_CSV_URL = 'https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv';

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

function toDateFromSleeper(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function buildTradeEvent(transaction, rosterMap, playerCatalog) {
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

  return {
    tradeId: String(transaction.transaction_id || ''),
    teams,
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
  const [users, rosters, csvText] = await Promise.all([
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/users`),
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    fetch(CONTRACTS_CSV_URL, { cache: 'no-store' }).then((response) => response.text()),
  ]);

  const rosterMap = buildRosterMaps(rosters, users);
  const playerCatalog = new Map(parseContractPlayerRows(csvText).map((row) => [row.playerId, row]));
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
        const tradeEvent = buildTradeEvent(transaction, rosterMap, playerCatalog);
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