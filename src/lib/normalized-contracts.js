import Papa from 'papaparse';

const BBB_USER_ID = '456973480269705216';
const CONTRACTS_CSV_URL = 'https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv';
const ACTIVE_LIKE_STATUSES = new Set(['Active', 'Future']);
const RELATIVE_SALARY_FIELDS = [
  'Relative Year 1 Salary',
  'Relative Year 2 Salary',
  'Relative Year 3 Salary',
  'Relative Year 4 Salary',
];
const RELATIVE_DEAD_FIELDS = [
  'Relative Year 1 Dead',
  'Relative Year 2 Dead',
  'Relative Year 3 Dead',
  'Relative Year 4 Dead',
];

function toNumber(value) {
  const normalized = String(value ?? '').replace(/[$,]/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCsvNumber(value) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 10000) / 10000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed request ${response.status}: ${url}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed request ${response.status}: ${url}`);
  }
  return response.text();
}

export async function resolveBBBLeagueId() {
  const state = await fetchJson('https://api.sleeper.app/v1/state/nfl');
  const currentSeason = state?.season;
  if (!currentSeason) {
    throw new Error('Could not resolve NFL season');
  }

  const candidateSeasons = [String(currentSeason), String(Number(currentSeason) - 1)];
  for (const season of candidateSeasons) {
    const leagues = await fetchJson(`https://api.sleeper.app/v1/user/${BBB_USER_ID}/leagues/nfl/${season}`);
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

async function fetchSleeperOwnershipMap(leagueId) {
  const [users, rosters] = await Promise.all([
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/users`),
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
  ]);

  const ownerNameByUserId = new Map(
    (Array.isArray(users) ? users : []).map((user) => [
      String(user?.user_id || ''),
      user?.display_name || user?.username || '',
    ])
  );

  const ownerByPlayerId = new Map();
  for (const roster of Array.isArray(rosters) ? rosters : []) {
    const ownerName = ownerNameByUserId.get(String(roster?.owner_id || '')) || '';
    for (const playerId of Array.isArray(roster?.players) ? roster.players : []) {
      ownerByPlayerId.set(String(playerId), ownerName);
    }
  }

  return ownerByPlayerId;
}

function normalizeContractRow(row, ownerByPlayerId) {
  const originalStatus = String(row?.Status || '').trim();
  const originalTeam = String(row?.TeamDisplayName || '').trim();
  const playerId = String(row?.['Player ID'] || '').trim();
  const sleeperOwner = ACTIVE_LIKE_STATUSES.has(originalStatus)
    ? String(ownerByPlayerId.get(playerId) || '').trim()
    : '';

  let resolvedStatus = originalStatus;
  let resolvedOwner = originalTeam;
  let ownershipSource = 'bbb';
  let forcedDeadCap = false;

  if (ACTIVE_LIKE_STATUSES.has(originalStatus)) {
    if (sleeperOwner) {
      resolvedOwner = sleeperOwner;
      ownershipSource = 'sleeper';
    } else {
      resolvedOwner = originalTeam;
      resolvedStatus = 'Expired';
      ownershipSource = originalTeam ? 'bbb-fallback-dead-cap' : 'unowned-dead-cap';
      forcedDeadCap = true;
    }
  }

  const normalizedRow = {
    ...row,
    Status: resolvedStatus,
    TeamDisplayName: resolvedOwner,
  };

  if (forcedDeadCap) {
    const deadCapRate = toNumber(row?.['Dead Cap Rate']);
    RELATIVE_SALARY_FIELDS.forEach((salaryField, index) => {
      const salaryValue = toNumber(row?.[salaryField]);
      normalizedRow[salaryField] = '0';
      normalizedRow[RELATIVE_DEAD_FIELDS[index]] = formatCsvNumber(salaryValue * deadCapRate);
    });
    normalizedRow['Cut?'] = 'TRUE';
  }

  normalizedRow['Original TeamDisplayName'] = originalTeam;
  normalizedRow['Original Status'] = originalStatus;
  normalizedRow['Resolved Owner'] = resolvedOwner;
  normalizedRow['Ownership Source'] = ownershipSource;
  normalizedRow['Forced Dead Cap'] = forcedDeadCap ? 'TRUE' : 'FALSE';

  return normalizedRow;
}

export function serializeContractsCsv(rows, baseFields = []) {
  const extraFields = [
    'Original TeamDisplayName',
    'Original Status',
    'Resolved Owner',
    'Ownership Source',
    'Forced Dead Cap',
  ];
  const fields = [...baseFields, ...extraFields.filter((field) => !baseFields.includes(field))];

  return Papa.unparse(rows, {
    header: true,
    columns: fields,
    newline: '\n',
  });
}

export async function getNormalizedContractsData() {
  const [leagueId, contractsCsvText] = await Promise.all([
    resolveBBBLeagueId(),
    fetchText(CONTRACTS_CSV_URL),
  ]);

  const ownerByPlayerId = await fetchSleeperOwnershipMap(leagueId);
  const parseResult = Papa.parse(contractsCsvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => String(header || '').trim(),
  });

  if (parseResult.errors?.length) {
    const firstError = parseResult.errors[0];
    throw new Error(firstError?.message || 'Failed to parse contracts CSV');
  }

  const baseFields = Array.isArray(parseResult.meta?.fields) ? parseResult.meta.fields : [];
  const rows = (Array.isArray(parseResult.data) ? parseResult.data : [])
    .filter((row) => row && String(row['Player ID'] || '').trim())
    .map((row) => normalizeContractRow(row, ownerByPlayerId));

  return {
    leagueId,
    rows,
    csvText: serializeContractsCsv(rows, baseFields),
  };
}

export async function getNormalizedContractsCsvText() {
  const { csvText } = await getNormalizedContractsData();
  return csvText;
}