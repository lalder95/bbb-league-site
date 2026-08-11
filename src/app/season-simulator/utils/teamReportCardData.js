export const DEPTH_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'BENCH'];

export function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function average(values = []) {
  const numeric = values.map(number).filter(Number.isFinite);
  if (!numeric.length) return 0;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

export function curveGrade(value, values, direction = 'high') {
  const clean = values.map(number).filter(Number.isFinite);
  if (!clean.length) return 'C';

  const transform = (raw) => direction === 'low' ? -number(raw) : number(raw);
  const transformed = clean.map(transform);
  const current = transform(value);
  const min = Math.min(...transformed);
  const max = Math.max(...transformed);
  const mean = average(transformed);

  if (Math.abs(max - min) < 0.000001) return 'C';
  if (Math.abs(current - max) < 0.000001) return 'A+';
  if (Math.abs(current - min) < 0.000001) return 'F';

  if (current >= mean) {
    const span = Math.max(0.000001, max - mean);
    const progress = Math.max(0, Math.min(1, (current - mean) / span));
    if (progress >= 0.80) return 'A';
    if (progress >= 0.62) return 'A-';
    if (progress >= 0.44) return 'B+';
    if (progress >= 0.27) return 'B';
    if (progress >= 0.11) return 'B-';
    if (progress > 0.015) return 'C+';
    return 'C';
  }

  const span = Math.max(0.000001, mean - min);
  const progress = Math.max(0, Math.min(1, (mean - current) / span));
  if (progress < 0.18) return 'C-';
  if (progress < 0.40) return 'D+';
  if (progress < 0.64) return 'D';
  if (progress < 0.84) return 'D-';
  return 'F';
}

export function qualityScore(value, values, direction = 'high') {
  const clean = values.map(number).filter(Number.isFinite);
  if (!clean.length) return 50;
  const transform = (raw) => direction === 'low' ? -number(raw) : number(raw);
  const transformed = clean.map(transform);
  const current = transform(value);
  const min = Math.min(...transformed);
  const max = Math.max(...transformed);
  if (Math.abs(max - min) < 0.000001) return 50;
  return ((current - min) / (max - min)) * 100;
}

export function formatPercent(value, decimals = 1) {
  return `${number(value).toFixed(decimals)}%`;
}

export function formatPoints(value, signed = false, decimals = 1) {
  const numeric = number(value);
  return `${signed && numeric > 0 ? '+' : ''}${numeric.toFixed(decimals)} pts`;
}

export function formatSlotLabel(slot) {
  return String(slot || '')
    .replaceAll('_', ' ')
    .replace('SUPER FLEX', 'SUPERFLEX');
}

export function avatarUrl(avatar) {
  const raw = String(avatar || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://sleepercdn.com/avatars/thumbs/${raw}`;
}

export function getRosterDivision(roster) {
  const candidates = [
    roster?.settings?.division,
    roster?.division,
    roster?.metadata?.division,
  ];
  const value = candidates.find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim() !== '');
  return value === undefined ? null : String(value);
}

export function buildDivisionMap(teams = [], rosters = []) {
  const map = new Map();

  for (const team of Array.isArray(teams) ? teams : []) {
    const rosterId = team?.rosterId ?? team?.roster_id;
    const rawDivision = team?.division;
    if (rosterId === undefined || rosterId === null || rawDivision === undefined || rawDivision === null || String(rawDivision).trim() === '') continue;
    map.set(String(rosterId), String(rawDivision));
  }

  for (const roster of Array.isArray(rosters) ? rosters : []) {
    const rosterId = roster?.roster_id ?? roster?.rosterId;
    if (map.has(String(rosterId))) continue;
    const division = getRosterDivision(roster);
    if (rosterId === undefined || rosterId === null || division === null) continue;
    map.set(String(rosterId), division);
  }

  return map;
}

export function isDivisionOpponent(rosterId, selectedRosterId, divisionByRosterId) {
  if (String(rosterId) === String(selectedRosterId)) return false;
  const selectedDivision = divisionByRosterId?.get(String(selectedRosterId));
  const otherDivision = divisionByRosterId?.get(String(rosterId));
  return selectedDivision !== undefined && otherDivision !== undefined && selectedDivision === otherDivision;
}

export function getSlotValue(team, slot) {
  return number((team?.slotAverages || []).find((row) => String(row.slot) === String(slot))?.avgPoints);
}

export function getDepthValue(team, position) {
  return number((team?.depthAverages || []).find((row) => String(row.position) === String(position))?.avgPoints);
}

export function getDepthPlayers(team, position) {
  return number((team?.depthAverages || []).find((row) => String(row.position) === String(position))?.avgPlayers);
}

export function getHeadToHeadPower(team) {
  return average((team?.headToHead || []).map((row) => row.winOdds));
}

export function getSlotPositionGroup(slot) {
  const normalized = String(slot || '').toUpperCase().replaceAll(' ', '').replaceAll('_', '');
  if (normalized.startsWith('SUPERFLEX')) return ['QB', 'RB', 'WR', 'TE'];
  if (normalized.startsWith('FLEX')) return ['RB', 'WR', 'TE'];
  if (normalized.startsWith('QB')) return ['QB'];
  if (normalized.startsWith('RB')) return ['RB'];
  if (normalized.startsWith('WR')) return ['WR'];
  if (normalized.startsWith('TE')) return ['TE'];
  return [];
}

export function getPositionGroupPlayers(team, positions = []) {
  const allowed = new Set((positions || []).map((position) => String(position).toUpperCase()));
  return (Array.isArray(team?.positionGroupPlayers) ? team.positionGroupPlayers : [])
    .filter((player) => allowed.has(String(player?.position || '').toUpperCase()))
    .slice()
    .sort((left, right) => (
      number(right?.avgProjectedPoints) - number(left?.avgProjectedPoints)
      || number(right?.starterRate) - number(left?.starterRate)
      || String(left?.name || '').localeCompare(String(right?.name || ''))
    ));
}

export function buildReportData(teams = [], slotLabels = []) {
  const safeTeams = Array.isArray(teams) ? teams : [];
  const slots = slotLabels.length
    ? slotLabels
    : Array.from(new Set(safeTeams.flatMap((team) => (team.slotAverages || []).map((row) => row.slot))));

  const metricDefinitions = new Map();
  const rankings = new Map();

  function registerMetric({ key, label, direction = 'high', getValue, formatValue, description, positionGroupPositions = [] }) {
    const values = safeTeams.map(getValue);
    const rows = safeTeams
      .map((team) => {
        const value = getValue(team);
        return {
          team,
          value,
          grade: curveGrade(value, values, direction),
        };
      })
      .sort((left, right) => direction === 'low' ? left.value - right.value : right.value - left.value)
      .map((row, index) => ({ ...row, rank: index + 1 }));

    metricDefinitions.set(key, { key, label, direction, getValue, formatValue, description, positionGroupPositions });
    rankings.set(key, rows);
  }

  for (const slot of slots) {
    registerMetric({
      key: `slot:${slot}`,
      label: `${formatSlotLabel(slot)} Starter Production`,
      getValue: (team) => getSlotValue(team, slot),
      formatValue: (value) => formatPoints(value),
      description: 'Average simulated weekly score from this starting lineup slot.',
      positionGroupPositions: getSlotPositionGroup(slot),
    });
  }

  for (const position of DEPTH_POSITIONS) {
    registerMetric({
      key: `depth:${position}`,
      label: position === 'BENCH' ? 'Overall Bench Depth' : `${position} Depth`,
      getValue: (team) => getDepthValue(team, position),
      formatValue: (value) => formatPoints(value),
      description: position === 'BENCH'
        ? 'Replacement-depth blend across QB, RB, WR, and TE. Missing required backup spots count as zero.'
        : position === 'RB' || position === 'WR'
          ? `Average weekly projection of the best two non-starting ${position} players. Missing a second replacement counts as zero.`
          : `Weekly projection of the best non-starting ${position} player. Missing a replacement counts as zero.`,
      positionGroupPositions: position === 'BENCH' ? ['QB', 'RB', 'WR', 'TE'] : [position],
    });
  }

  registerMetric({
    key: 'margin',
    label: 'Scoring Margin',
    getValue: (team) => number(team.averageWeeklyMargin ?? team.averageMargin),
    formatValue: (value) => formatPoints(value, true),
    description: 'Average simulated weekly points scored minus points allowed.',
  });
  registerMetric({
    key: 'playoffs',
    label: 'Playoff Odds',
    getValue: (team) => number(team.playoffOdds),
    formatValue: formatPercent,
    description: 'Chance of reaching the playoffs in the completed simulation.',
  });
  registerMetric({
    key: 'championship',
    label: 'Championship Odds',
    getValue: (team) => number(team.championshipOdds),
    formatValue: formatPercent,
    description: 'Chance of winning the league championship.',
  });
  registerMetric({
    key: 'firstPick',
    label: '#1 Overall Pick Odds',
    direction: 'high',
    getValue: (team) => number(team.firstPickOdds),
    formatValue: formatPercent,
    description: 'Chance of finishing with the #1 overall pick. Higher odds earn the stronger grade, reflecting draft-position upside.',
  });
  registerMetric({
    key: 'volatility',
    label: 'Scoring Consistency',
    direction: 'low',
    getValue: (team) => number(team.scoringVolatility ?? team.pointsForVolatility),
    formatValue: (value) => `${number(value).toFixed(1)} SD`,
    description: 'Standard deviation of simulated weekly team scores. Lower volatility earns the stronger grade.',
  });
  registerMetric({
    key: 'h2hPower',
    label: 'Head-to-Head Power',
    getValue: getHeadToHeadPower,
    formatValue: formatPercent,
    description: 'Average neutral-site win probability against every other team, using the same simulated weekly score draws.',
  });

  const reports = new Map();
  const metricRowsByTeam = new Map();
  for (const [metricKey, rows] of rankings.entries()) {
    for (const row of rows) {
      const teamKey = String(row.team.rosterId);
      if (!metricRowsByTeam.has(teamKey)) metricRowsByTeam.set(teamKey, new Map());
      metricRowsByTeam.get(teamKey).set(metricKey, row);
    }
  }

  const slotValuesByLabel = new Map(
    slots.map((slot) => [slot, safeTeams.map((team) => getSlotValue(team, slot))])
  );
  const starterQualityValues = safeTeams.map((team) => average(
    slots.map((slot) => qualityScore(getSlotValue(team, slot), slotValuesByLabel.get(slot) || [], 'high'))
  ));
  const depthGroupValues = safeTeams.map((team) => getDepthValue(team, 'BENCH'));
  const marginValues = safeTeams.map((team) => number(team.averageWeeklyMargin ?? team.averageMargin));
  const volatilityValues = safeTeams.map((team) => number(team.scoringVolatility ?? team.pointsForVolatility));

  const overallRaw = safeTeams.map((team, index) => (
    starterQualityValues[index] * 0.50
    + qualityScore(depthGroupValues[index], depthGroupValues, 'high') * 0.20
    + qualityScore(marginValues[index], marginValues, 'high') * 0.20
    + qualityScore(volatilityValues[index], volatilityValues, 'low') * 0.10
  ));

  const overallRows = safeTeams
    .map((team, index) => ({
      team,
      value: overallRaw[index],
      grade: curveGrade(overallRaw[index], overallRaw, 'high'),
    }))
    .sort((left, right) => right.value - left.value)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  metricDefinitions.set('overall', {
    key: 'overall',
    label: 'Overall Report Card',
    direction: 'high',
    getValue: (team) => overallRows.find((row) => String(row.team.rosterId) === String(team.rosterId))?.value || 0,
    formatValue: (value) => `${number(value).toFixed(1)} composite`,
    description: 'Team-quality composite: 50% starter production, 20% replacement depth, 20% scoring margin, and 10% scoring consistency. Playoff, championship, and #1-pick odds are intentionally excluded.',
  });
  rankings.set('overall', overallRows);

  for (const team of safeTeams) {
    const key = String(team.rosterId);
    const metricRows = metricRowsByTeam.get(key) || new Map();
    const overall = overallRows.find((row) => String(row.team.rosterId) === key);
    reports.set(key, {
      team,
      slots: slots.map((slot) => ({
        slot,
        value: getSlotValue(team, slot),
        ...metricRows.get(`slot:${slot}`),
      })),
      depth: DEPTH_POSITIONS.map((position) => ({
        position,
        value: getDepthValue(team, position),
        avgPlayers: getDepthPlayers(team, position),
        ...metricRows.get(`depth:${position}`),
      })),
      margin: metricRows.get('margin'),
      playoffs: metricRows.get('playoffs'),
      championship: metricRows.get('championship'),
      firstPick: metricRows.get('firstPick'),
      volatility: metricRows.get('volatility'),
      h2hPower: metricRows.get('h2hPower'),
      overall,
    });
  }

  return { reports, rankings, metricDefinitions, slots };
}
