import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { OpenAI } from 'openai';
import { buildPlayerPoolWithNews, popPlayerByName } from '@/utils/playerPoolUtils';
import {
  createRng,
  buildArticleIntro,
  buildRoundIntro,
  buildStyleToken,
  pickNonRepeating,
} from '@/utils/mockDraftVoice';
import {
  parseBBBContractsCsv,
  buildTeamNeeds,
  formatTeamNeedsForPrompt,
  pickWindowScore,
  shouldApplyValueOverride,
} from '@/utils/teamNeedsUtils';
import { expandDraftOrderPreview } from '@/utils/mockDraftOrderPreview';

export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === 'admin';
  if (!isAdmin) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { ok: true, session };
}

// Utility: find BBB league id for the commissioner account
async function resolveBBBLeagueId() {
  const USER_ID = '456973480269705216';
  const state = await fetch('https://api.sleeper.app/v1/state/nfl', { cache: 'no-store' }).then(r => r.json());
  const currentSeason = state?.season;
  if (!currentSeason) throw new Error('Could not resolve NFL season');
  const leagues = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${currentSeason}`, { cache: 'no-store' }).then(r => r.json());
  let bbb = leagues.filter(league => {
    const name = (league?.name || '').toLowerCase();
    return name.includes('budget blitz bowl') || name.includes('bbb') || (name.includes('budget') && name.includes('blitz'));
  });
  if (bbb.length === 0) {
    const prev = String(Number(currentSeason) - 1);
    const prevLeagues = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${prev}`, { cache: 'no-store' }).then(r => r.json());
    bbb = prevLeagues.filter(league => {
      const name = (league?.name || '').toLowerCase();
      return name.includes('budget blitz bowl') || name.includes('bbb') || (name.includes('budget') && name.includes('blitz'));
    });
  }
  if (bbb.length === 0) throw new Error('No BBB league found for commissioner');
  const mostRecent = bbb.sort((a, b) => Number(b.season) - Number(a.season))[0];
  return mostRecent.league_id;
}

function summarizeRoster(roster, users) {
  const positions = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, BN: 0 };
  try {
    const starters = Array.isArray(roster.starters) ? roster.starters : [];
    const allPlayers = Array.isArray(roster.players) ? roster.players : [];
    const depth = allPlayers.filter(pid => !starters.includes(pid));
    return {
      roster_id: roster.roster_id,
      owner_id: roster.owner_id,
      startersCount: starters.length,
      depthCount: depth.length,
      positions,
    };
  } catch {
    return { roster_id: roster.roster_id, owner_id: roster.owner_id, startersCount: 0, depthCount: 0, positions: {} };
  }
}

function buildTeamProfile(ownerId, users, rosters) {
  const roster = rosters.find(r => r.owner_id === ownerId);
  const user = users.find(u => u.user_id === ownerId);
  const teamName = user?.display_name || user?.username || `Team ${ownerId?.slice?.(0, 4)}`;
  const summary = roster ? summarizeRoster(roster, users) : {};
  return { teamName, ownerId, rosterSummary: summary };
}

function formatPickNumber(round, slot) {
  const s = String(slot).padStart(2, '0');
  return `${round}.${s}`;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function draftNeedFlexForPick(pickIndex) {
  const pickNumber = Math.max(1, Number(pickIndex) + 1 || 1);
  if (pickNumber <= 3) return 0;
  if (pickNumber >= 25) return 1;
  return (pickNumber - 3) / 22;
}

// Smooth spectrum from 0 (Blue Chip) to 1 (Dart Throw).
// We saturate around pick ~40 for a gradual transition.
function qualitySpectrumForPick(pickIndex, maxBlueChipPicks = 40) {
  const i = Math.max(0, Number(pickIndex) || 0);
  const t = clamp01(i / Math.max(1, Number(maxBlueChipPicks) || 40));

  // Nice labels that gradually shift.
  let band;
  if (t <= 0.12) band = 'blue-chip';
  else if (t <= 0.30) band = 'high-end starter';
  else if (t <= 0.55) band = 'solid contributor';
  else if (t <= 0.78) band = 'depth/upside';
  else band = 'dart throw';

  const guidance = t < 0.30
    ? 'Early picks: it’s fair to talk about weekly starters and higher confidence roles.'
    : t < 0.60
      ? 'Mid-draft: strong contributors, but outcomes vary. Discuss realistic role paths and a range of results.'
      : t < 0.80
        ? 'Late-ish: bench/depth with upside pockets. Emphasize volatility, contingency value, and matchup-driven starts.'
        : 'Late: dart-throw territory. Stash/lottery ticket language; low confidence, high variance, uncertain weekly usability.';

  return {
    t, // 0..1
    band,
    guidance,
    // A compact human-readable slider.
    slider: `Blue Chip ${Math.round((1 - t) * 100)}%  Dart Throw ${Math.round(t * 100)}%`,
  };
}

function formatPlayerWindowForPrompt(window) {
  return window.map((player, index) => {
    const rank = Number(player.rank) || (index + 1);
    const value = Number(player.value) || 0;
    let tier = 'Depth';
    if (rank <= 4) tier = 'Blue Chip';
    else if (rank <= 8) tier = 'Priority Target';
    else if (rank <= 16) tier = 'Strong Value';
    else if (rank <= 28) tier = 'Upside Bet';

    const notes = [`rank ${rank}`, `tier ${tier}`];
    if (value > 0) notes.push(`value ${value}`);
    if (player.news?.headline) {
      const compactHeadline = String(player.news.headline).replace(/\s+/g, ' ').trim();
      notes.push(`news ${compactHeadline}`);
    }

    return `${player.name} (${player.position}) [${notes.join(', ')}]`;
  }).join('\n');
}

function extractOpeningFingerprint(text) {
  const firstSentence = String(text || '')
    .split(/[.!?]/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  if (!firstSentence) return '';

  return firstSentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 6)
    .join(' ');
}

function buildRecentVariationGuard({ recentOpeners = [], recentLensLabels = [] }) {
  const openerList = Array.from(new Set(recentOpeners.filter(Boolean))).slice(-3);
  const lensList = Array.from(new Set(recentLensLabels.filter(Boolean))).slice(-3);
  if (openerList.length === 0 && lensList.length === 0) return '';

  const lines = ['Recent anti-repetition guard:'];
  if (lensList.length > 0) {
    lines.push(`- Recent decision angles already used: ${lensList.join(', ')}`);
  }
  if (openerList.length > 0) {
    lines.push(`- Avoid opening the reason like these recent patterns: ${openerList.map(item => `"${item}"`).join(', ')}`);
  }
  lines.push('- Prefer a fresh argument and a fresh first sentence unless the board genuinely calls for the same logic.');
  return lines.join('\n');
}

function buildDecisionLens({ rng, quality, teamRow, window, recent = [] }) {
  const topNeed = teamRow
    ? Object.entries(teamRow.positions || {})
      .map(([pos, data]) => ({ pos, ...data }))
      .sort((a, b) => {
        if (b.needWeight !== a.needWeight) return b.needWeight - a.needWeight;
        if (b.rank !== a.rank) return b.rank - a.rank;
        return a.pos.localeCompare(b.pos);
      })[0]
    : null;
  const strongestRoom = teamRow
    ? Object.entries(teamRow.positions || {})
      .map(([pos, data]) => ({ pos, ...data }))
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.pos.localeCompare(b.pos);
      })[0]
    : null;
  const candidatePositions = new Set((window || []).map(player => String(player.position || '').toUpperCase()));
  const lateRound = quality?.band === 'depth/upside' || quality?.band === 'dart throw';

  const options = [];
  if (topNeed && candidatePositions.has(topNeed.pos)) {
    options.push({
      key: 'starter-path upgrade',
      instruction: `Center the explanation on solving a weaker ${topNeed.pos} room. Explain why this pick improves the path to usable weekly starts or credible lineup pressure at ${topNeed.pos}.`,
    });
    options.push({
      key: 'roster insulation',
      instruction: `Center the explanation on protecting the roster against thin depth at ${topNeed.pos}. Explain how this pick reduces weekly lineup stress and adds functional cover rather than pure hype.`,
    });
  }

  if (lateRound) {
    options.push({
      key: 'stash upside',
      instruction: 'Center the explanation on a stash-upside bet. Emphasize patience, bench value, and what has to break right for the pick to become usable.',
    });
    options.push({
      key: 'contingency bet',
      instruction: 'Center the explanation on contingency value. Focus on how this player matters if depth gets stressed or a role opens later, without overselling immediate impact.',
    });
  } else {
    options.push({
      key: 'weekly floor',
      instruction: 'Center the explanation on bankable weekly usability. Focus on how this pick raises the lineup floor and makes weekly start decisions cleaner.',
    });
    options.push({
      key: 'ceiling swing',
      instruction: 'Center the explanation on upside. Explain what payoff makes this worth the pick, but keep the outcome realistic for the draft stage.',
    });
  }

  options.push({
    key: 'market value',
    instruction: 'Center the explanation on value versus draft slot. Make the case that this is the right price for the talent and roster context, not just a generic best-player note.',
  });

  if (strongestRoom) {
    options.push({
      key: 'roster balance',
      instruction: `Center the explanation on balancing the roster. Explain why adding strength outside the current ${strongestRoom.pos} room keeps the build healthier or more flexible.`,
    });
  }

  const chosen = pickNonRepeating({
    rng,
    items: options,
    recent,
    window: 3,
  }) || options[0] || {
    key: 'market value',
    instruction: 'Center the explanation on clean value and realistic fantasy usefulness.',
  };

  return {
    key: chosen.key,
    label: chosen.key,
    instruction: chosen.instruction,
  };
}

function buildOpeningStyle({ rng, recent = [] }) {
  const options = [
    {
      key: 'board-first',
      label: 'board-first opener',
      instruction: 'Open with the board, draft slot, or decision pressure first. Mention the player in the second sentence if that sounds cleaner.',
    },
    {
      key: 'need-first',
      label: 'need-first opener',
      instruction: 'Open with the roster problem or team need first, then bring in the player as the answer.',
    },
    {
      key: 'player-fragment',
      label: 'player-fragment opener',
      instruction: 'Open with the player name in a short fragment or blunt statement, but do not follow it with "makes sense here because" or "is the pick because".',
    },
    {
      key: 'value-first',
      label: 'value-first opener',
      instruction: 'Open with the value proposition or price point first, then explain why the player fits the spot.',
    },
    {
      key: 'timeline-first',
      label: 'timeline-first opener',
      instruction: 'Open with the likely timeline or path to fantasy relevance first, then tie it back to the player and roster.',
    },
  ];

  const chosen = pickNonRepeating({
    rng,
    items: options,
    recent,
    window: 3,
  }) || options[0];

  return {
    key: chosen.key,
    label: chosen.label,
    instruction: chosen.instruction,
  };
}

function buildSystemPrompt(teamProfile, styleToken, quality, topN, decisionLens, openingStyle) {
  // Persona adds stylistic variation
  const persona = teamProfile.persona || 'Balanced Strategist';
  return `You're in the draft room for ${teamProfile.teamName}. This is fantasy football in a custom league, not real-life NFL coaching. Adopt the vibe of a "${persona}" and sound like a sharp league mate talking through the pick, not a columnist writing a report.
Follow constraints strictly:
- Only draft from the provided Available Players list.
- Only select from the TOP ${Math.max(1, Number(topN) || 8)} ranked players remaining in the pool.
- This is FANTASY FOOTBALL analysis in a custom league context. Do NOT write as if you are coaching a real team.
- Do not mention NFL teams/franchises, jerseys, coordinators, playbooks, or real-life contracts.
- Do not use real-football coaching/strategy language. Avoid phrases like: "balanced offense", "stretch the field", "receiver corps", "gameplan", "play-calling", "two-high", "Cover 2", "route tree", "in the slot/out wide" (as a scheme note), "red zone packages", "snap counts", "special teams", "scheme", "coordinator", "playbook", "system".
- Do use fantasy framing: weekly start/sit impact, scoring output, positional room, tier/value, floor/ceiling, roster construction, and opportunity (targets/touches) in general terms.
- Draft-stage realism: Quality spectrum = ${quality.slider}. Band: "${quality.band}". ${quality.guidance}
- Do NOT call late-round picks "studs" or "lock starters" by default. Only call someone a starter if you explicitly qualify it (e.g., "has a path to starting" or "can earn a weekly role").
- Prioritize upgrading likely starters first; consider depth second.
- Use the roster context to decide whether this pick is solving a starter need, improving weekly flexibility, or adding a stash with upside.
- Each pick should feel meaningfully different from the previous ones. Change the argument, not just the adjectives.
- Use the provided Primary Decision Lens as the center of the thought instead of defaulting to a generic "good value and good fit" paragraph.
Avoid overemphasizing scarcity; focus on roster fit, role clarity, and value.
Style guidance: ${styleToken}. Aim for variety—change sentence openings, avoid stock phrases, and let some picks be blunt while others breathe a little more.
Anti-repetition rules:
- Do NOT reuse the same first-sentence pattern across consecutive picks.
- Speak as if you are a member of the team (e.g. "Our", not "Your"), but avoid overusing "we/our" to start sentences.
- Avoid boilerplate like "brings speed and playmaking ability", "clear role", "synergy", "perfectly complements", "fits seamlessly", "impossible to pass up", "solidifies".
- Avoid "Compared to other available [position]" style sentences.
- Do NOT start the reason with "[Player] makes sense here because", "[Player] is the pick because", or any close variation.
- Primary Decision Lens for this pick: ${decisionLens?.label || 'market value'}.
- Opening Style for this pick: ${openingStyle?.label || 'board-first opener'}.
Your response MUST be valid JSON only with two keys and no extra text: { "pick": "Exact Player Name", "reason": "A short natural fantasy-football take. Mention the chosen player's name within the first two sentences. Keep it conversational, specific, and grounded in roster fit, weekly usability, value, and realistic uncertainty for this draft stage. Do not force separate setup, upside, and downside sentences or write like a formal report." }`;
}

function buildUserPromptTopN({ pickNumber, round, available, leagueHints, teamProfile, quality, topN = 8, teamNeedsText = '', decisionLens = null, openingStyle = null, recentVariationGuard = '' }) {
  const window = available.slice(0, Math.max(1, Number(topN) || 8));
  const availableList = formatPlayerWindowForPrompt(window);
  const newsSection = window
    .map(p => p.news ? `${p.name}: ${p.news.headline}` : '')
    .filter(Boolean)
    .join('\n');
  return `Pick: ${pickNumber}
Round: ${round}
Team: ${teamProfile.teamName}

Draft context: ${leagueHints}
Draft-stage realism: Spectrum ${quality.slider} | Band: ${quality.band} — ${quality.guidance}
${teamNeedsText ? `\n${teamNeedsText}\n` : ''}
${decisionLens ? `Primary Decision Lens:\n- ${decisionLens.label}: ${decisionLens.instruction}\n` : ''}
${openingStyle ? `Opening Style:\n- ${openingStyle.label}: ${openingStyle.instruction}\n` : ''}
${recentVariationGuard ? `\n${recentVariationGuard}\n` : ''}

Write the reason like a natural league-chat thought: concise, conversational, and fantasy-focused. Let the argument flow naturally instead of forcing a template or a separate upside/downside structure.

Available Players (TOP ${Math.max(1, Number(topN) || 8)} ONLY):\n${availableList}
${newsSection ? `\nRecent News:\n${newsSection}` : ''}

Choose the best pick for this team from ONLY the top ${Math.max(1, Number(topN) || 8)} above. When two players are close, break ties using roster pressure, value tier, and the cleanest path to fantasy usefulness. Make the explanation feel distinct from recent picks by honoring the decision lens and the recent opening-pattern guard, but write it like a natural thought, not a report. Return JSON as specified.`;
}

function safeJson(str) {
  const raw = String(str || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {}
  }

  return null;
}

function sanitizeReason(reason, pickedName, opts = {}) {
  const mode = opts.mode || 'light';
  const withMeta = !!opts.withMeta;
  let out = String(reason || '').trim();

  // Always normalize whitespace minimally (safe and non-destructive).
  out = out.replace(/\s+/g, ' ').trim();
  if (!out) {
    const safe = pickedName ? `${pickedName} is the pick here.` : '';
    return withMeta ? { text: safe, escalated: false } : safe;
  }

  // If the text contains real-football/coaching language, escalate even in "light".
  const triggerRxs = [
    /\b(stretch the field|balanced offense|receiver corps|receiving corps|route tree|coverage|cover\s*2|two[- ]high|scheme|play[- ]calling|gameplan|snap count[s]?)\b/i,
    /\b(offensive|defensive) coordinator\b/i,
    /\bplaybook\b/i,
    /\bspecial teams\b/i,
    /\bsub-?packages?\b/i,
    /\balignment\b/i,
    /\bfilm\b/i,
    /\bin the slot\b|\bout wide\b/i,
  ];

  const escalated = triggerRxs.some(rx => rx.test(out));
  const strict = mode === 'strict' || escalated;

  if (!strict) {
    // Light mode: preserve wording; only ensure the player's name is present.
    if (pickedName && !new RegExp(`\\b${String(pickedName).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i').test(out)) {
      out = `${pickedName}: ${out}`;
    }
    return withMeta ? { text: out, escalated } : out;
  }

  // Strict mode: targeted replacements/removals only (avoid homogenizing the whole paragraph).
  const removePhrases = [
    /\bthe adjustment curve at the pro level\b[\.,;:]*/gi,
    /\bcompared to (other|the) available\b[\s\S]*?(\.|$)/gi,
    /\bthe synergy with\b[\s\S]*?(\.|$)/gi,
    /\bmedium scarcity\b[\.,;:]*/gi,
    // Overconfident labels
    /\bstud\b/gi,
    /\b(locked[- ]in|lock)\s*(weekly\s*)?starter\b/gi,
    /\bday[- ]one\s*starter\b/gi,
    /\binstant\s*starter\b/gi,
    /\bcan\s*step\s*in\s*and\s*start\s*immediately\b/gi,
  ];
  for (const rx of removePhrases) out = out.replace(rx, '').replace(/\s+/g, ' ').trim();

  const replacements = [
    [/\breceiver corps\b/gi, 'WR room'],
    [/\breceiving corps\b/gi, 'WR room'],
    [/\bwide receiver\s+room\b/gi, 'WR room'],
    [/\bquarterback\s+room\b/gi, 'QB room'],
    [/\btight end\s+room\b/gi, 'TE room'],
    [/\bbackfield\b/gi, 'RB room'],
    [/\bstretch the field\b/gi, 'create spike-week upside'],
    [/\bbalanced offense\b/gi, 'balanced fantasy roster'],
    [/\bplay[- ]calling\b/gi, 'usage'],
    [/\bgameplan\b/gi, 'weekly deployment'],
    [/\bsnap count(s)?\b/gi, 'weekly usage'],
    [/\broute tree\b/gi, 'role'],
    [/\bscheme(?:\s*fit)?\b/gi, 'role'],
    [/\bplay\s*action\b/gi, ''],
    [/\b(offense|defense)\b/gi, 'roster'],
    [/\bcoach(?:ing)?\b/gi, ''],
  ];
  for (const [from, to] of replacements) out = out.replace(from, to).replace(/\s+/g, ' ').trim();

  if (pickedName && !new RegExp(`\\b${String(pickedName).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i').test(out)) {
    out = `${pickedName}: ${out}`;
  }

  return withMeta ? { text: out, escalated } : out;
}

function clip(str, n) {
  const s = String(str ?? '');
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
function toMarkdownArticle({ title, picks, leagueName, seed }) {
  const rng = createRng({ seed, salt: `mock-article|${title}|${leagueName}` });
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(buildArticleIntro({ title, leagueName, rng }));
  lines.push('');
  let currentRound = null;
  for (let idx = 0; idx < picks.length; idx++) {
    const p = picks[idx];
    const round = Number(String(p.pickNumber).split('.')[0] || 1);
    if (currentRound !== round) {
      currentRound = round;
      lines.push(`## Round ${currentRound}`);
      lines.push('');
      lines.push(buildRoundIntro({ round: currentRound, rng }));
      lines.push('');
    }
    lines.push(`### ${p.pickNumber} - Team ${p.teamName}`);
    lines.push(`**Projected Pick: ${p.player.name}, ${p.player.position}**`);
    lines.push('');

    lines.push(p.reason);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(rng.pick([
    'That’s the board. Now it’s your turn to overreact responsibly.',
    'If this mock nailed your next pick: you’re welcome. If it didn’t: blame the simulation.',
    'Draft day is coming. Hydrate, charge your phone, and don’t trade future firsts out of boredom.',
    'The only guarantee: someone will hate this mock loud enough for all of us.',
  ]));
  return lines.join('\n');
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  try {
    const body = await request.json().catch(() => ({}));
    const {
      rounds = 7, // up to 7 rounds; we'll stop early if pool empties or order ends
      maxPicks = rounds * 12,
      seed = undefined,
      dryRun = false,
      trace = true,
      model = 'gpt-4o',
      title = 'BBB AI Mock Draft',
      description = 'AI-generated mock draft with per-pick reasoning.',
      progressKey = null,
      topN = 8,

      draftOrder = undefined,
    } = body || {};

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY missing' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Load league context
    const leagueId = await resolveBBBLeagueId();
    const [users, rosters, drafts] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/drafts`, { cache: 'no-store' }).then(r => r.json()),
    ]);

    // Determine upcoming draft (do not fall back to completed drafts for picks)
    // Build multi-round order consistently with Admin preview: base on MaxPF + winners bracket, apply traded picks per round
    const upcoming = drafts.find(d => d.status === 'upcoming') || null;
    // Compute target season
    const state = await fetch('https://api.sleeper.app/v1/state/nfl', { cache: 'no-store' }).then(r => r.json());
    const currentSeason = Number(state?.season || new Date().getFullYear());
    const targetSeason = (!upcoming || upcoming.status === 'complete') ? (currentSeason + 1) : Number(upcoming.season);

    // 1) MaxPF
    let maxpfMap;
    try {
      const { calculateSeasonMaxPF } = await import('@/utils/maxpf');
      maxpfMap = await calculateSeasonMaxPF({ leagueId });
    } catch {
      maxpfMap = {};
    }

    // 2) winners bracket
    let winnersBracket = [];
    try {
      winnersBracket = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/winners_bracket`, { cache: 'no-store' }).then(r => r.json());
    } catch {}

    // 3) base order (round 1)
    const { buildDraftOrder } = await import('@/utils/draftOrderUtils');
    const base = buildDraftOrder({ rosters, maxpfMap, winnersBracket });

    // 4) traded picks for all rounds
    const traded = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, { cache: 'no-store' }).then(r => r.json());


    const totalRounds = Math.max(1, Math.min(7, Number(rounds) || 1));
    const maxTotalPicks = Math.max(12, Math.min(84, Number(maxPicks) || 12));

    const fallbackRoundOneOrder = base
      .slice()
      .sort((a, b) => Number(a.slot) - Number(b.slot))
      .map((entry) => ({
        round: 1,
        slot: Number(entry.slot),
        rosterId: Number(entry.roster_id),
        originalRosterId: Number(entry.roster_id),
      }));

    const order = expandDraftOrderPreview({
      draftOrder: Array.isArray(draftOrder) && draftOrder.length > 0 ? draftOrder : fallbackRoundOneOrder,
      rosters,
      users,
      tradedPicks: Array.isArray(traded) ? traded : [],
      targetSeason,
      rounds: totalRounds,
      maxPicks: maxTotalPicks,
    });

    // Player pool with news
    let pool = await buildPlayerPoolWithNews();
    if (!Array.isArray(pool) || pool.length === 0) {
      return NextResponse.json({ error: 'Player pool is empty' }, { status: 400 });
    }

    // League-wide hints
    const leagueHints = `Write like you’re talking to the league chat: clear, confident, and a little fun. Keep it respectful. Focus on roster fit, role clarity, and value. Avoid repeating the same adjectives or stock phrases.`;

    // Roster-needs context from BBB_Contracts (Active only)
    let teamNeeds = null;
    try {
      const csvUrl = 'https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv';
      const csvRes = await fetch(csvUrl, { cache: 'no-store' });
      if (csvRes.ok) {
        const csvText = await csvRes.text();
        const activeContracts = parseBBBContractsCsv(csvText);
        const teamNames = Array.from(new Set(order.map(o => o.teamName))).filter(Boolean);
        if (teamNames.length) {
          teamNeeds = buildTeamNeeds({ activeContracts, teamNames });
        }
      }
    } catch {
      teamNeeds = null;
    }

    // Deterministic voice RNG: if seed is provided, personality/variety becomes stable.
    const voiceRng = createRng({ seed: (seed ?? Date.now()), salt: `mock-voice|${title}` });

    // Stored in Mongo (meta.generationDebug) for diagnosing repetition.
    // Keep the payload bounded and admin-only route already restricts access.
    const generationDebug = {
      version: 1,
      seed: seed ?? null,
      topN: Number(topN) || 8,
      model,
      picks: [],
    };

    const traceLog = [];
    const picks = [];
    const recentDecisionLensKeys = [];
    const recentDecisionLensLabels = [];
    const recentOpeningStyleKeys = [];
    const recentReasonOpeners = [];

    // Iterate until all picks used or player pool becomes empty
    // Define 12 personas mapped by slot 1..12 for stylistic variety
    const personas = [
      'Balanced Strategist',
      'Ceiling Chaser',
      'Risk-Averse Planner',
      'Positional Scarcity Maximizer',
      'Immediate Impact Seeker',
      'Depth-First Builder',
      'Value Arbitrage Analyst',
      'Scheme Fit Purist',
      'Late Bloom Optimist',
      'Trade-Up Visionary',
      'Injury-Aware Realist',
      'Long-Term Dynasty Architect',
    ];

    for (let i = 0; i < order.length && pool.length > 0; i++) {
      const o = order[i];
      const teamProfile = buildTeamProfile(o.userId, users, rosters);
      teamProfile.persona = personas[(Number(o.slot) - 1) % 12];
      const pickNumber = formatPickNumber(Number(o.round ?? 1), Number(o.slot ?? (i % 12) + 1));
  const quality = qualitySpectrumForPick(i, 40);

      // Update progress (best-effort, non-blocking)
      if (progressKey) {
        try {
          const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          await fetch(`${base}/api/admin/mock-drafts/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: progressKey, currentPickNumber: pickNumber, message: `Generating AI mock draft... Pick ${pickNumber}` })
          });
        } catch {}
      }

      const styleToken = buildStyleToken({ rng: voiceRng });
      const windowN = Math.max(1, Math.min(8, Number(topN) || 8));
      const draftFlex = draftNeedFlexForPick(i);

      // Compute needs-weighted "best" pick in the allowed window (topN)
      const window = pool.slice(0, windowN);
      const teamRow = teamNeeds?.teams?.find(t => t.teamName === teamProfile.teamName) || null;
      const needsText = teamNeeds ? formatTeamNeedsForPrompt(teamNeeds, teamProfile.teamName) : '';
      const decisionLens = buildDecisionLens({
        rng: voiceRng,
        quality,
        teamRow,
        window,
        recent: recentDecisionLensKeys,
      });
      const openingStyle = buildOpeningStyle({
        rng: voiceRng,
        recent: recentOpeningStyleKeys,
      });
      const recentVariationGuard = buildRecentVariationGuard({
        recentOpeners: recentReasonOpeners,
        recentLensLabels: recentDecisionLensLabels,
      });
      const system = buildSystemPrompt(teamProfile, styleToken, quality, windowN, decisionLens, openingStyle);

      const windowValues = window
        .map(candidate => Number(candidate.value) || 0)
        .filter(value => Number.isFinite(value) && value > 0);
      const windowMaxValue = windowValues.length ? Math.max(...windowValues) : 0;
      const windowMinValue = windowValues.length ? Math.min(...windowValues) : 0;
      const topValueCandidate = window.reduce((best, candidate) => {
        if (!best) return candidate;
        return (Number(candidate.value) || 0) > (Number(best.value) || 0) ? candidate : best;
      }, null);
      const topValueTier = [...window]
        .sort((a, b) => {
          const valueDiff = (Number(b.value) || 0) - (Number(a.value) || 0);
          if (valueDiff !== 0) return valueDiff;
          return (Number(a.rank) || 999) - (Number(b.rank) || 999);
        })
        .slice(0, Number(pickNumber) <= 1.03 ? 2 : (draftFlex <= 0.06 ? 1 : 2));

      let weightedBpaName = window[0]?.name;
      let weightedBpaCandidate = window[0] || null;
      if (teamRow && window.length) {
          let best = null;
          for (const cand of window) {
            const pos = String(cand.position || '').toUpperCase();
            const weight = teamRow.positions?.[pos]?.needWeight ?? 1.0;
            const score = pickWindowScore({
              candidate: cand,
              needWeight: weight,
              windowMaxValue,
              windowMinValue,
              draftFlex,
            });
            if (!best || score > best.score) best = { candidate: cand, name: cand.name, score };
          }
          if (best?.name) {
            weightedBpaName = best.name;
            weightedBpaCandidate = best.candidate;
          }
      } else if (window.length) {
        weightedBpaCandidate = topValueCandidate || window[0];
        weightedBpaName = weightedBpaCandidate?.name || weightedBpaName;
      }

      const earlyBoardGuardActive = draftFlex <= 0.12 && topValueTier.length > 0;
      if (earlyBoardGuardActive && !topValueTier.some(candidate => candidate.name === weightedBpaName)) {
        weightedBpaCandidate = topValueTier[0];
        weightedBpaName = weightedBpaCandidate?.name || weightedBpaName;
      }

      const userMsg = buildUserPromptTopN({
        pickNumber,
        round: Number(o.round ?? 1),
        available: pool,
        leagueHints,
        teamProfile,
        quality,
        topN: windowN,
        teamNeedsText: needsText,
        decisionLens,
        openingStyle,
        recentVariationGuard,
      });

      recentDecisionLensKeys.push(decisionLens.key);
      recentDecisionLensLabels.push(decisionLens.label);
      recentOpeningStyleKeys.push(openingStyle.key);

      // Seed debug entry for this pick (we'll fill raw/sanitized later)
      const debugEntry = {
        pickNumber,
        teamName: teamProfile.teamName,
        slot: Number(o.slot ?? (i % 12) + 1),
        round: Number(o.round ?? 1),
        persona: teamProfile.persona,
        qualityBand: quality?.band,
        decisionLens: decisionLens.label,
        openingStyle: openingStyle.label,
        usedFallback: false,
        parseError: null,
        sanitizeMode: 'light',
        sanitizeEscalated: false,
        sanitizedChanged: false,
        sanitizeDeltaChars: 0,
        sanitizeSkipped: false,
        rawReasonPreview: null,
        sanitizedReasonPreview: null,
      };

      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ];

      const completion = await openai.chat.completions.create({
        model,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'mock_draft_pick',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                pick: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['pick', 'reason'],
            },
          },
        },
        temperature: 0.75,
        top_p: 0.9,
        frequency_penalty: 0.6,
        presence_penalty: 0.4,
        max_tokens: 500,
        seed,
      });

      const content = completion?.choices?.[0]?.message?.content?.trim?.() || '';
      const parsed = safeJson(content);
      if (!parsed || typeof parsed.pick !== 'string') {
        // Fallback to BPA from pool if model failed to follow
        const fallback = pool[0];
        const rawFallbackReason = `The board leaves ${teamProfile.teamName} with a reasonable swing on ${fallback.name} here. The value still works, and there is a believable path to fantasy relevance if the ${fallback.position} room needs help later even if this is more patience than instant payoff.`;
        const sfb = sanitizeReason(rawFallbackReason, fallback.name, { mode: 'light', withMeta: true });
        const reason = sfb.text;

        debugEntry.usedFallback = true;
        debugEntry.parseError = 'Malformed LLM JSON';
        debugEntry.rawReasonPreview = clip(content, 220);
        debugEntry.sanitizedReasonPreview = clip(reason, 220);
        debugEntry.sanitizeEscalated = !!sfb.escalated;
        debugEntry.sanitizedChanged = rawFallbackReason !== sfb.text;
        debugEntry.sanitizeDeltaChars = (sfb.text || '').length - (rawFallbackReason || '').length;
        debugEntry.sanitizeSkipped = false;
        generationDebug.picks.push(debugEntry);
        recentReasonOpeners.push(extractOpeningFingerprint(rawFallbackReason));

        picks.push({ pickNumber, teamName: teamProfile.teamName, player: fallback, reason });
        pool = popPlayerByName(pool, fallback.name).nextPool;
        trace && traceLog.push({ pickNumber, team: teamProfile.teamName, error: 'Malformed LLM JSON', raw: content });
        continue;
      }

      const desired = parsed.pick;
      // Enforce TOP-N constraint strictly.
      const topNames = pool.slice(0, windowN).map(p => p.name);
      let chosenName = desired;
      if (!topNames.includes(chosenName)) {
        chosenName = weightedBpaName || topNames[0];
        trace && traceLog.push({ pickNumber, team: teamProfile.teamName, warning: `Choice outside top-${windowN}; auto-corrected`, originalChoice: desired, correctedTo: chosenName });
      }
      const chosenCandidateInWindow = window.find(candidate => candidate.name === chosenName) || null;
      const chosenNeedWeight = chosenCandidateInWindow
        ? (teamRow?.positions?.[String(chosenCandidateInWindow.position || '').toUpperCase()]?.needWeight ?? 1.0)
        : 1.0;
      if (earlyBoardGuardActive && !topValueTier.some(candidate => candidate.name === chosenName)) {
        const correctedName = weightedBpaCandidate?.name || topValueTier[0]?.name;
        if (correctedName && correctedName !== chosenName) {
          trace && traceLog.push({
            pickNumber,
            team: teamProfile.teamName,
            warning: 'Choice failed early-pick board guardrail; auto-corrected',
            originalChoice: chosenName,
            correctedTo: correctedName,
            allowedTier: topValueTier.map(candidate => candidate.name),
          });
          chosenName = correctedName;
        }
      }
      if (
        chosenCandidateInWindow
        && topValueCandidate
        && weightedBpaCandidate
        && shouldApplyValueOverride({
          candidate: chosenCandidateInWindow,
          topValueCandidate,
          needWeight: chosenNeedWeight,
          draftFlex,
        })
      ) {
        const correctedName = weightedBpaCandidate.name || topValueCandidate.name;
        if (correctedName && correctedName !== chosenName) {
          trace && traceLog.push({
            pickNumber,
            team: teamProfile.teamName,
            warning: 'Choice failed KTC value guardrail; auto-corrected',
            originalChoice: chosenName,
            correctedTo: correctedName,
            topValuePlayer: topValueCandidate.name,
          });
          chosenName = correctedName;
        }
      }
      const { picked, nextPool } = popPlayerByName(pool, chosenName);
      if (!picked) {
        // If the model chose someone not in pool, take BPA to enforce constraint
        const fallback = pool[0];
        const rawFallbackReason = parsed.reason || 'Adjusted to best available from valid pool.';
        const sfb2 = sanitizeReason(rawFallbackReason, fallback.name, { mode: 'light', withMeta: true });
        let reason = sfb2.text;

        debugEntry.usedFallback = true;
        debugEntry.parseError = 'LLM chose out-of-pool after correction';
        debugEntry.rawReasonPreview = clip(rawFallbackReason, 220);
        debugEntry.sanitizedReasonPreview = clip(reason, 220);
        debugEntry.sanitizeMode = 'light';
        debugEntry.sanitizeEscalated = !!sfb2.escalated;
        debugEntry.sanitizedChanged = rawFallbackReason !== sfb2.text;
        debugEntry.sanitizeDeltaChars = (sfb2.text || '').length - (rawFallbackReason || '').length;
        debugEntry.sanitizeSkipped = false;
        generationDebug.picks.push(debugEntry);
        recentReasonOpeners.push(extractOpeningFingerprint(rawFallbackReason));

        picks.push({ pickNumber, teamName: teamProfile.teamName, player: fallback, reason });
        pool = popPlayerByName(pool, fallback.name).nextPool;
        trace && traceLog.push({ pickNumber, team: teamProfile.teamName, warning: 'LLM chose out-of-pool after correction', choice: desired });
        continue;
      }

      const rawReason = parsed.reason || '';
      const reason = String(rawReason || '').trim();

      debugEntry.rawReasonPreview = clip(rawReason, 220);
      debugEntry.sanitizedReasonPreview = clip(reason, 220);
      debugEntry.sanitizeMode = 'skipped';
      debugEntry.sanitizeEscalated = false;
      debugEntry.sanitizedChanged = false;
      debugEntry.sanitizeDeltaChars = 0;
      debugEntry.sanitizeSkipped = true;
      generationDebug.picks.push(debugEntry);
      recentReasonOpeners.push(extractOpeningFingerprint(rawReason));

      picks.push({ pickNumber, teamName: teamProfile.teamName, player: picked, reason });
      pool = nextPool;

      if (trace) {
        traceLog.push({
          pickNumber,
          team: teamProfile.teamName,
          promptPreview: userMsg.slice(0, 400),
          choice: picked.name,
          reason: parsed.reason || '',
        });
      }
    }

    // Compose article
    const leagueName = 'Budget Blitz Bowl';
    const article = toMarkdownArticle({ title, picks, leagueName, seed: (seed ?? Date.now()) });

    // Persist if not dryRun
    let saved = null;
    if (!dryRun) {
      const client = await clientPromise;
      const db = client.db();
      const doc = {
        title,
  description,
        content: article,
        author: auth.session.user?.username || 'Commissioner',
        date: new Date().toISOString().split('T')[0],
        active: true,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        meta: {
          leagueId,
          model,
          picks,
          trace: trace ? traceLog : undefined,
          generationDebug,
        },
      };
      // Make only one active
      await db.collection('mockDrafts').updateMany({ active: true }, { $set: { active: false } });
      const result = await db.collection('mockDrafts').insertOne(doc);
      saved = { id: result.insertedId };
    }

    // Mark progress complete
    if (progressKey) {
      try {
        const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        await fetch(`${base}/api/admin/mock-drafts/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: progressKey, done: true, message: 'Mock draft generated and published.' })
        });
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      dryRun: !!dryRun,
      draftId: saved?.id || null,
      picks,
      article,
      trace: trace ? traceLog : undefined,
    });
  } catch (err) {
    const msg = err?.message || 'Failed to generate mock draft';
    const status = /player pool/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
