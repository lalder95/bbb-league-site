// src/utils/teamNeedsUtils.js
// Compute simple roster-based team needs from BBB_Contracts (ACTIVE rows).
// This is intentionally lightweight: it doesn't require projections, only contract metadata.

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function normalizePos(pos) {
  const p = String(pos || '').toUpperCase().trim();
  if (p === 'QBS') return 'QB';
  if (p === 'RBS') return 'RB';
  if (p === 'WRS') return 'WR';
  if (p === 'TES') return 'TE';
  return p;
}

function computeStrength({ count, ktcValues, totalKtc }) {
  const sorted = [...ktcValues].sort((a, b) => b - a);
  const top1 = sorted[0] ?? 0;
  const top2 = sorted[1] ?? 0;
  // Heuristic: top-end KTC matters most, with a small nod to total KTC and depth.
  return {
    top1Ktc: top1,
    top2Ktc: top2,
    strength: top1 * 0.55 + top2 * 0.25 + totalKtc * 0.15 + count * 0.05,
  };
}

function rankToNeedWeight(rank, teamCount) {
  // rank: 1 (strongest) ... teamCount (weakest)
  const pct = clamp01(rank / Math.max(1, teamCount));
  if (pct <= 1 / 3) return 0.85;     // strong room
  if (pct <= 2 / 3) return 0.95;     // fine
  // weak room
  return rank >= teamCount - 1 ? 1.25 : 1.10; // bottom ~2 get extra bump
}

/**
 * Parse BBB_Contracts.csv text (from GitHub raw) into minimal rows.
 * We keep this tolerant to column order/changes by using best-effort indices.
 *
 * Known usage elsewhere in repo: values[14] === "Active", values[21] position, values[15] salary, values[33] team name.
 */
export function parseBBBContractsCsv(csvText) {
  const rows = String(csvText || '').split('\n').filter(r => r.trim());
  if (rows.length <= 1) return [];

  const out = [];
  for (const line of rows.slice(1)) {
    const values = line.split(',');
    const status = values[14];
    if (status !== 'Active') continue;

    const teamName = values[33]; // TeamDisplayName
    const position = normalizePos(values[21]);
    const ktc = toNumber(values[34]); // Current KTC Value
    if (!teamName || !POSITIONS.includes(position)) continue;

    out.push({ teamName, position, ktc });
  }

  return out;
}

/**
 * Build per-team needs based on ACTIVE contracts.
 * Output is compact and prompt-friendly.
 */
export function buildTeamNeeds({ activeContracts, teamNames }) {
  const teamCount = teamNames.length;

  const teams = Object.fromEntries(teamNames.map(t => [t, {
    teamName: t,
    positions: Object.fromEntries(POSITIONS.map(p => [p, {
      count: 0,
      ktcValues: [],
      totalKtc: 0,
      top1Ktc: 0,
      top2Ktc: 0,
      strength: 0,
      rank: teamCount,
      needWeight: 1.0,
    }]))
  }]));

  for (const row of activeContracts) {
    const t = teams[row.teamName];
    if (!t) continue;
    const pos = normalizePos(row.position);
    if (!POSITIONS.includes(pos)) continue;

    const p = t.positions[pos];
    p.count += 1;
    p.totalKtc += toNumber(row.ktc);
    p.ktcValues.push(toNumber(row.ktc));
  }

  // compute strength
  for (const teamName of teamNames) {
    for (const pos of POSITIONS) {
      const p = teams[teamName].positions[pos];
      const r = computeStrength(p);
      p.top1Ktc = r.top1Ktc;
      p.top2Ktc = r.top2Ktc;
      p.strength = r.strength;
      delete p.ktcValues;
    }
  }

  // ranks per position
  for (const pos of POSITIONS) {
    const sorted = teamNames
      .map(teamName => ({ teamName, strength: teams[teamName].positions[pos].strength }))
      .sort((a, b) => b.strength - a.strength);

    sorted.forEach((item, idx) => {
      teams[item.teamName].positions[pos].rank = idx + 1;
    });

    for (const teamName of teamNames) {
      const p = teams[teamName].positions[pos];
      p.needWeight = rankToNeedWeight(p.rank, teamCount);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    teamCount,
    teams: teamNames.map(t => teams[t]),
  };
}

export function formatTeamNeedsForPrompt(teamNeeds, teamName) {
  const t = teamNeeds?.teams?.find(x => x.teamName === teamName);
  if (!t) return '';

  const qb = t.positions.QB;
  const rb = t.positions.RB;
  const wr = t.positions.WR;
  const te = t.positions.TE;

  return [
    'Roster context from BBB_Contracts (ACTIVE only, KTC-based room strength):',
    `- Positional ranks (1=strongest, ${teamNeeds.teamCount}=weakest): QB ${qb.rank}/${teamNeeds.teamCount}, RB ${rb.rank}/${teamNeeds.teamCount}, WR ${wr.rank}/${teamNeeds.teamCount}, TE ${te.rank}/${teamNeeds.teamCount}`,
    `- Active counts: QB ${qb.count}, RB ${rb.count}, WR ${wr.count}, TE ${te.count}`,
    `- Need weights (higher => bigger need): QB ${qb.needWeight.toFixed(2)}, RB ${rb.needWeight.toFixed(2)}, WR ${wr.needWeight.toFixed(2)}, TE ${te.needWeight.toFixed(2)}`,
    'Guideline: Use needs as a tie-breaker among similarly ranked rookies; do not make big reaches outside the allowed top-N window.',
  ].join('\n');
}

export function pickWindowScore({ candidate, needWeight }) {
  // candidate.rank is assumed ascending (1 best). Convert to a base score where higher is better.
  const base = 1 / Math.max(1, Number(candidate.rank) || 1);
  return base * (Number(needWeight) || 1);
}
