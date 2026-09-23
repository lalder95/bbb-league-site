export const ROOKIE_SALARY_SCALE = {
  1: [15.0, 14.3, 13.7, 13.0, 12.3, 11.7, 11.0, 10.3, 9.7, 9.0, 8.3, 7.7],
  2: [7.0, 6.8, 6.7, 6.5, 6.3, 6.2, 6.0, 5.8, 5.7, 5.5, 5.3, 5.2],
  3: [5.0, 4.9, 4.8, 4.8, 4.7, 4.6, 4.5, 4.4, 4.3, 4.3, 4.2, 4.1],
  4: [4.0, 3.9, 3.8, 3.8, 3.7, 3.6, 3.5, 3.4, 3.3, 3.3, 3.2, 3.1],
  5: [3.0, 2.9, 2.8, 2.8, 2.7, 2.6, 2.5, 2.4, 2.3, 2.3, 2.2, 2.1],
  6: [2.0, 1.9, 1.8, 1.8, 1.7, 1.6, 1.5, 1.4, 1.3, 1.3, 1.2, 1.1],
  7: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
};

export const ROOKIE_DEAD_MONEY_BY_ROUND = {
  1: 50,
  2: 35,
  3: 20,
  4: 10,
  5: 5,
  6: 0,
  7: 0,
};

export const ROOKIE_CONTRACT_YEARS_BY_ROUND = {
  1: 3,
  2: 3,
  3: 3,
  4: 2,
  5: 2,
  6: 2,
  7: 2,
};

export function getRookieContractYears(round) {
  return ROOKIE_CONTRACT_YEARS_BY_ROUND[Number(round)] || 0;
}

export function getRookieDeadMoneyRate(round) {
  return ROOKIE_DEAD_MONEY_BY_ROUND[Number(round)] || 0;
}

export function getRookieSalary(round, pickPosition) {
  const numericRound = Number(round);
  const numericPosition = Number(pickPosition);
  const roundScale = ROOKIE_SALARY_SCALE[numericRound];

  if (!Array.isArray(roundScale) || roundScale.length === 0) return 0;

  const clampedPosition = Math.min(
    Math.max(Number.isFinite(numericPosition) ? numericPosition : 1, 1),
    roundScale.length,
  );

  return roundScale[clampedPosition - 1] || 0;
}

export function getRookieSalaryGrid() {
  return Object.entries(ROOKIE_SALARY_SCALE).map(([round, salaries]) => ({
    round: Number(round),
    years: getRookieContractYears(round),
    deadMoney: getRookieDeadMoneyRate(round),
    salaries: salaries.map((salary, index) => ({
      pickPosition: index + 1,
      salary,
    })),
  }));
}
