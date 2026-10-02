import { getRookieSalary } from '@/utils/rookieSalaryScale';

export const CAP_YEAR_KEYS = ['curYear', 'year2', 'year3', 'year4'];
export const SALARY_CAP = 300;

const YEAR_FIELD_MAP = {
  curYear: { salary: 'Relative Year 1 Salary', dead: 'Relative Year 1 Dead', offset: 0 },
  year2: { salary: 'Relative Year 2 Salary', dead: 'Relative Year 2 Dead', offset: 1 },
  year3: { salary: 'Relative Year 3 Salary', dead: 'Relative Year 3 Dead', offset: 2 },
  year4: { salary: 'Relative Year 4 Salary', dead: 'Relative Year 4 Dead', offset: 3 },
};

function toNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function createCapYear() {
  return { total: SALARY_CAP, active: 0, dead: 0, fines: 0, rookie: 0, remaining: SALARY_CAP };
}

export function createEmptyCap() {
  return CAP_YEAR_KEYS.reduce((cap, yearKey) => {
    cap[yearKey] = createCapYear();
    return cap;
  }, {});
}

export function parseTeamFinesCsv(csvText) {
  return String(csvText || '')
    .split(/\r?\n/)
    .slice(1)
    .filter((row) => row.trim())
    .reduce((finesByTeam, row) => {
      const [team, curYear, year2, year3, year4] = row.split(',');
      if (!team?.trim()) return finesByTeam;
      finesByTeam[team.trim()] = {
        curYear: toNumber(curYear),
        year2: toNumber(year2),
        year3: toNumber(year3),
        year4: toNumber(year4),
      };
      return finesByTeam;
    }, {});
}

export function getDraftPickYearAmount(pick, capYear) {
  const salary = toNumber(pick?.salary ?? pick?.pickSalary);
  const pickSeason = Number(pick?.season);
  const resolvedCapYear = Number(capYear);

  if (!salary || !Number.isFinite(pickSeason) || !Number.isFinite(resolvedCapYear)) return 0;
  if (resolvedCapYear < pickSeason || resolvedCapYear > pickSeason + 2) return 0;

  const offset = resolvedCapYear - pickSeason;
  const multiplier = offset === 0 ? 1 : offset === 1 ? 1.1 : 1.21;
  return Math.round(salary * multiplier * 10) / 10;
}

export function getCapYearForKey(yearKey, baseSeason) {
  const baseYear = Number(baseSeason) || new Date().getFullYear();
  return baseYear + (YEAR_FIELD_MAP[yearKey]?.offset || 0);
}

export function calculateTeamCapSnapshot({
  teamName,
  contracts = [],
  finesByTeam = {},
  rookiePicks = [],
  baseSeason,
  includeRookieObligations = false,
}) {
  const cap = createEmptyCap();
  const normalizedTeam = String(teamName || '').trim();

  contracts
    .filter((contract) => String(contract?.TeamDisplayName ?? contract?.team ?? '').trim() === normalizedTeam)
    .forEach((contract) => {
      const isActive = ['Active', 'Future'].includes(String(contract?.Status ?? contract?.status ?? '').trim());
      CAP_YEAR_KEYS.forEach((yearKey) => {
        const fields = YEAR_FIELD_MAP[yearKey];
        const value = toNumber(isActive
          ? contract?.[fields.salary] ?? contract?.[yearKey]
          : contract?.[fields.dead] ?? contract?.[`dead${yearKey.charAt(0).toUpperCase()}${yearKey.slice(1)}`]);
        cap[yearKey][isActive ? 'active' : 'dead'] += value;
      });
    });

  const teamFines = finesByTeam[normalizedTeam] || {};
  CAP_YEAR_KEYS.forEach((yearKey) => {
    cap[yearKey].fines = toNumber(teamFines[yearKey]);
    if (includeRookieObligations) {
      const capYear = getCapYearForKey(yearKey, baseSeason);
      cap[yearKey].rookie = rookiePicks.reduce((sum, pick) => sum + getDraftPickYearAmount(pick, capYear), 0);
    }
    cap[yearKey].remaining = cap[yearKey].total
      - cap[yearKey].active
      - cap[yearKey].dead
      - cap[yearKey].fines
      - cap[yearKey].rookie;
  });

  return cap;
}

export function createRookiePickObligation({ season, round, pickPosition }) {
  return {
    season: Number(season),
    salary: getRookieSalary(Number(round), Number(pickPosition)),
  };
}