import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getContractManagementSettings } from '@/lib/db-helpers';

export const runtime = 'nodejs';

const USER_ID = '456973480269705216';
const CONTRACTS_CSV_URL = 'https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv';
const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function isAdminSession(session) {
  return !!(session?.user && session.user.role === 'admin');
}

function isBbbLeague(league) {
  const name = String(league?.name || '').toLowerCase();
  return name.includes('budget blitz bowl') || name.includes('bbb') || (name.includes('budget') && name.includes('blitz'));
}

function findHeaderIndex(headers, matcher, fallback = -1) {
  const index = headers.findIndex((header) => matcher.test(String(header || '').trim()));
  return index >= 0 ? index : fallback;
}

function toInt(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.text();
}

async function resolveContractYear() {
  try {
    const settingsResult = await getContractManagementSettings();
    if (settingsResult?.success) {
      const override = toInt(settingsResult?.settings?.contractYearOverride);
      if (override !== null) return override;
    }
  } catch {}

  try {
    const state = await fetchJson('https://api.sleeper.app/v1/state/nfl');
    const season = toInt(state?.season);
    if (season !== null) return season;
  } catch {}

  return new Date().getFullYear();
}

async function resolveCurrentBbbLeague() {
  const state = await fetchJson('https://api.sleeper.app/v1/state/nfl');
  const currentSeason = String(toInt(state?.season) ?? new Date().getFullYear());
  const seasonsToTry = [currentSeason, String((toInt(currentSeason) ?? new Date().getFullYear()) - 1)];

  for (const season of seasonsToTry) {
    const leagues = await fetchJson(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${season}`);
    if (!Array.isArray(leagues) || leagues.length === 0) continue;

    const candidates = leagues
      .filter(isBbbLeague)
      .sort((a, b) => (toInt(b?.season) || 0) - (toInt(a?.season) || 0));

    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  throw new Error('Unable to locate the current BBB league on Sleeper');
}

function parseContractsCsv(csvText) {
  const lines = String(csvText || '').split('\n').filter((line) => line.trim());
  if (lines.length <= 1) return [];

  const headers = lines[0].split(',').map((header) => header.trim());
  const indexes = {
    playerId: findHeaderIndex(headers, /^(player\s*id|playerid)$/i, 0),
    playerName: findHeaderIndex(headers, /^player\s*name$/i, 1),
    contractType: findHeaderIndex(headers, /^contract\s*type$/i, 2),
    status: findHeaderIndex(headers, /^status$/i, 14),
    position: findHeaderIndex(headers, /^(pos|position)$/i, 21),
    contractFinalYear: findHeaderIndex(headers, /^contract\s*final\s*year$/i, 31),
    teamDisplayName: findHeaderIndex(headers, /^teamdisplayname$/i, 33),
  };

  return lines.slice(1)
    .map((line) => line.split(','))
    .filter((values) => values.length >= headers.length)
    .map((values) => ({
      playerId: String(values[indexes.playerId] || '').trim(),
      playerName: String(values[indexes.playerName] || '').trim(),
      contractType: String(values[indexes.contractType] || '').trim(),
      status: String(values[indexes.status] || '').trim(),
      position: String(values[indexes.position] || '').trim(),
      team: String(values[indexes.teamDisplayName] || '').trim(),
      contractFinalYear: toInt(values[indexes.contractFinalYear]),
    }))
    .filter((row) => row.playerId);
}

function buildContractSummary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 'None';
  return rows
    .map((row) => {
      const finalYearText = row.contractFinalYear ? ` thru ${row.contractFinalYear}` : '';
      const teamText = row.team || 'No team';
      const statusText = row.status || 'Unknown';
      const typeText = row.contractType ? ` • ${row.contractType}` : '';
      return `${teamText} • ${statusText}${typeText}${finalYearText}`;
    })
    .join(' | ');
}

function describeIssue({ ownerTeam, activeCurrentRows, allRows, contractYear }) {
  if (activeCurrentRows.length > 0) {
    const contractTeams = Array.from(new Set(activeCurrentRows.map((row) => row.team).filter(Boolean)));
    return {
      issueType: 'wrong-team',
      issueLabel: 'Active contract belongs to another team',
      issueDetail: `Rostered by ${ownerTeam}, but active contract is assigned to ${contractTeams.join(', ')}.`
    };
  }

  const expiredActiveRows = allRows.filter((row) => row.status === 'Active' && row.contractFinalYear !== null && row.contractFinalYear < contractYear);
  if (expiredActiveRows.length > 0) {
    return {
      issueType: 'expired',
      issueLabel: 'Only expired active rows found',
      issueDetail: `Last active contract ended before ${contractYear}.`
    };
  }

  if (allRows.length > 0) {
    return {
      issueType: 'inactive-only',
      issueLabel: 'No active current-season contract row',
      issueDetail: 'Contract rows exist, but none are active for the current season.'
    };
  }

  return {
    issueType: 'missing',
    issueLabel: 'No contract rows found',
    issueDetail: 'Player is rostered, but no contract data exists in BBB_Contracts.csv.'
  };
}

async function getPlayerLookupForIds(playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) return new Map();

  const rawPlayers = await fetchJson(SLEEPER_PLAYERS_URL);
  const lookup = new Map();

  playerIds.forEach((playerId) => {
    const player = rawPlayers?.[playerId];
    if (!player) return;
    lookup.set(String(playerId), {
      playerName: player.full_name || player.search_full_name || `Player ${playerId}`,
      position: player.position || '',
      nflTeam: player.team || '',
    });
  });

  return lookup;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminSession(session) && process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [contractYear, league, contractsCsv] = await Promise.all([
      resolveContractYear(),
      resolveCurrentBbbLeague(),
      fetchText(CONTRACTS_CSV_URL),
    ]);

    const [rosters, users] = await Promise.all([
      fetchJson(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`),
      fetchJson(`https://api.sleeper.app/v1/league/${league.league_id}/users`),
    ]);

    const usersById = new Map((Array.isArray(users) ? users : []).map((user) => [String(user.user_id), user]));
    const contractRows = parseContractsCsv(contractsCsv);
    const contractsByPlayerId = new Map();

    contractRows.forEach((row) => {
      if (!contractsByPlayerId.has(row.playerId)) {
        contractsByPlayerId.set(row.playerId, []);
      }
      contractsByPlayerId.get(row.playerId).push(row);
    });

    const auditRows = [];

    (Array.isArray(rosters) ? rosters : []).forEach((roster) => {
      const owner = usersById.get(String(roster?.owner_id));
      const ownerTeam = owner?.display_name || owner?.metadata?.team_name || owner?.username || `Roster ${roster?.roster_id}`;
      const playerIds = Array.isArray(roster?.players) ? roster.players : [];

      playerIds.forEach((playerId) => {
        const normalizedPlayerId = String(playerId || '').trim();
        if (!normalizedPlayerId) return;

        const rows = contractsByPlayerId.get(normalizedPlayerId) || [];
        const activeCurrentRows = rows.filter((row) => row.status === 'Active' && (row.contractFinalYear === null || row.contractFinalYear >= contractYear));
        const hasMatchingActiveContract = activeCurrentRows.some((row) => normalize(row.team) === normalize(ownerTeam));

        if (hasMatchingActiveContract) return;

        const issue = describeIssue({ ownerTeam, activeCurrentRows, allRows: rows, contractYear });
        const preferredRow = activeCurrentRows[0] || rows[0] || null;

        auditRows.push({
          playerId: normalizedPlayerId,
          playerName: preferredRow?.playerName || '',
          position: preferredRow?.position || '',
          ownerTeam,
          rosterId: roster?.roster_id ?? null,
          contractSummary: buildContractSummary(rows),
          issueType: issue.issueType,
          issueLabel: issue.issueLabel,
          issueDetail: issue.issueDetail,
          contractTeams: Array.from(new Set(rows.map((row) => row.team).filter(Boolean))),
        });
      });
    });

    const missingLookupIds = auditRows
      .filter((row) => !row.playerName || !row.position)
      .map((row) => row.playerId);

    const sleeperLookup = await getPlayerLookupForIds(missingLookupIds);

    const enrichedAuditRows = auditRows
      .map((row) => {
        const sleeperMeta = sleeperLookup.get(row.playerId);
        return {
          ...row,
          playerName: row.playerName || sleeperMeta?.playerName || `Player ${row.playerId}`,
          position: row.position || sleeperMeta?.position || '—',
          nflTeam: sleeperMeta?.nflTeam || '',
        };
      })
      .sort((a, b) => {
        const teamCompare = a.ownerTeam.localeCompare(b.ownerTeam, undefined, { sensitivity: 'base' });
        if (teamCompare !== 0) return teamCompare;
        return a.playerName.localeCompare(b.playerName, undefined, { sensitivity: 'base' });
      });

    const issuesByTeam = enrichedAuditRows.reduce((acc, row) => {
      acc[row.ownerTeam] = (acc[row.ownerTeam] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      contractYear,
      leagueId: league.league_id,
      leagueSeason: toInt(league?.season),
      issueCount: enrichedAuditRows.length,
      rosterCount: Array.isArray(rosters) ? rosters.length : 0,
      issuesByTeam: Object.entries(issuesByTeam)
        .map(([teamName, count]) => ({ teamName, count }))
        .sort((a, b) => b.count - a.count || a.teamName.localeCompare(b.teamName, undefined, { sensitivity: 'base' })),
      issues: enrichedAuditRows,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to build contract audit' }, { status: 500 });
  }
}