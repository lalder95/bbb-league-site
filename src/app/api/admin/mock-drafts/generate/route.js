import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { OpenAI } from 'openai';
import { loadPlayerPool, popPlayerByName } from '@/utils/playerPoolUtils';
import {
  createRng,
  buildArticleIntro,
  buildRoundIntro,
  buildPickLeadIn,
  buildPickCoda,
  buildStyleToken,
  buildReasonTemplate,
} from '@/utils/mockDraftVoice';
import {
  parseBBBContractsCsv,
  buildTeamNeeds,
  formatTeamNeedsForPrompt,
  pickWindowScore,
} from '@/utils/teamNeedsUtils';

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

function buildSystemPrompt(teamProfile, styleToken, quality) {
  // Persona adds stylistic variation
  const persona = teamProfile.persona || 'Balanced Strategist';
  return `You are the AI GM for ${teamProfile.teamName} in a closed-universe fantasy football league (no NFL teams/contracts). Adopt the persona: "${persona}" for tone and decision style.
Follow constraints strictly:
- Only draft from the provided Available Players list.
- Only select from the TOP 10 ranked players remaining in the pool.
- This is FANTASY FOOTBALL analysis in a custom league context. Do NOT write as if you are coaching a real team.
- Do not mention NFL teams/franchises, jerseys, coordinators, playbooks, or real-life contracts.
- Do not use real-football coaching/strategy language. Avoid phrases like: "balanced offense", "stretch the field", "receiver corps", "gameplan", "play-calling", "two-high", "Cover 2", "route tree", "in the slot/out wide" (as a scheme note), "red zone packages", "snap counts", "special teams", "scheme", "coordinator", "playbook", "system".
- Do use fantasy framing: weekly start/sit impact, scoring output, positional room, tier/value, floor/ceiling, roster construction, and opportunity (targets/touches) in general terms.
- Draft-stage realism: Quality spectrum = ${quality.slider}. Band: "${quality.band}". ${quality.guidance}
- Do NOT call late-round picks "studs" or "lock starters" by default. Only call someone a starter if you explicitly qualify it (e.g., "has a path to starting" or "can earn a weekly role").
- Prioritize upgrading likely starters first; consider depth second.
Avoid overemphasizing scarcity; focus on roster fit, role clarity, and value.
Style guidance: ${styleToken}. Aim for variety—change sentence openings, avoid stock phrases, avoid repeating identical adjectives.
Anti-repetition rules:
- Do NOT reuse the same first-sentence pattern across consecutive picks.
- Avoid boilerplate like "brings speed and playmaking ability", "clear role", "synergy", "perfectly complements", "fits seamlessly", "impossible to pass up", "solidifies".
- Avoid "Compared to other available [position]" style sentences.
Your response MUST be valid JSON only with two keys and no extra text: { "pick": "Exact Player Name", "reason": "3-5 sentences that mention the chosen player's name within the first 2 sentences and explain fantasy roster fit, weekly scoring upside/floor, and value vs generic alternatives. Reflect draft-stage realism (later rounds = more uncertainty). End with one minor risk/concern framed as volatility/usage uncertainty/injury risk (NOT coaching/playbook)." }`;
}

function buildUserPrompt({ pickNumber, round, available, leagueHints, teamProfile, reasonTemplate, quality }) {
  const top10 = available.slice(0, 10);
  const availableList = top10.map(p => `${p.name} (${p.position}) [rank ${p.rank}${p.value > 0 ? `, value ${p.value}` : ''}]`).join('\n');
  return `Pick: ${pickNumber}
Round: ${round}
Team: ${teamProfile.teamName}

Draft context: ${leagueHints}
Draft-stage realism: Spectrum ${quality.slider} | Band: ${quality.band} — ${quality.guidance}
Use this writing pattern: ${reasonTemplate}

Available Players (TOP 10 ONLY):\n${availableList}

Choose the best pick for this team from ONLY the top 10 above and return JSON as specified.`;
}

function buildUserPromptTopN({ pickNumber, round, available, leagueHints, teamProfile, reasonTemplate, quality, topN = 8, teamNeedsText = '' }) {
  const window = available.slice(0, Math.max(1, Number(topN) || 8));
  const availableList = window.map(p => `${p.name} (${p.position}) [rank ${p.rank}${p.value > 0 ? `, value ${p.value}` : ''}]`).join('\n');
  return `Pick: ${pickNumber}
Round: ${round}
Team: ${teamProfile.teamName}

Draft context: ${leagueHints}
Draft-stage realism: Spectrum ${quality.slider} | Band: ${quality.band} — ${quality.guidance}
${teamNeedsText ? `\n${teamNeedsText}\n` : ''}

Use this writing pattern: ${reasonTemplate}

Available Players (TOP ${Math.max(1, Number(topN) || 8)} ONLY):\n${availableList}

Choose the best pick for this team from ONLY the top ${Math.max(1, Number(topN) || 8)} above and return JSON as specified.`;
}

function safeJson(str) {
  try { return JSON.parse(str); } catch { return null; }
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

function hash32(str) {
  // Tiny non-crypto hash for debug grouping.
  let h = 2166136261;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
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
      model = 'gpt-4o-mini',
      title = 'BBB AI Mock Draft',
      description = 'AI-generated mock draft with per-pick reasoning.',
      progressKey = null,
      topN = 8,
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
    const rosterIdToUserId = Object.fromEntries((rosters || []).map(r => [r.roster_id, r.owner_id]));
    const userIdToDisplay = Object.fromEntries((users || []).map(u => [u.user_id, u.display_name || u.username || 'Unknown Team']));

    let order = [];
    const totalRounds = Math.max(1, Math.min(7, Number(rounds) || 1));
    for (let r = 1; r <= totalRounds; r++) {
      const tradesForRound = (Array.isArray(traded) ? traded : []).filter(tp => String(tp.season) === String(targetSeason) && Number(tp.round) === r);
      const roundOrder = base
        .sort((a, b) => Number(a.slot) - Number(b.slot))
        .map(entry => {
          const trade = tradesForRound.find(tp => Number(tp.roster_id) === Number(entry.roster_id));
          const rosterId = trade ? trade.owner_id : entry.roster_id;
          const ownerUserId = rosterIdToUserId[rosterId] ?? null;
          const teamName = ownerUserId ? (userIdToDisplay[ownerUserId] || 'Unknown Team') : 'Unknown Team';
          return { round: r, userId: ownerUserId, slot: Number(entry.slot), teamName };
        });
      order.push(...roundOrder);
    }
    order = order.slice(0, Math.max(12, Math.min(84, Number(maxPicks) || 12)));

    // Player pool
    let pool = loadPlayerPool();
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
    const recentLeadIns = [];
    const recentReasonTemplates = [];

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

      const positionHint = pool?.[0]?.position || pool?.[0]?.pos || 'FLEX';
      const reasonTemplate = buildReasonTemplate({
        rng: voiceRng,
        position: positionHint,
        quality,
        recent: recentReasonTemplates,
        window: 8,
      });
    const styleToken = buildStyleToken({ rng: voiceRng });
  const system = buildSystemPrompt(teamProfile, styleToken, quality);

      // Compute needs-weighted "best" pick in the allowed window (topN)
      const windowN = Math.max(1, Math.min(8, Number(topN) || 8));
      const window = pool.slice(0, windowN);
      const needsText = teamNeeds ? formatTeamNeedsForPrompt(teamNeeds, teamProfile.teamName) : '';

      let weightedBpaName = window[0]?.name;
      if (teamNeeds && window.length) {
        const teamRow = teamNeeds.teams.find(t => t.teamName === teamProfile.teamName);
        if (teamRow) {
          let best = null;
          for (const cand of window) {
            const pos = String(cand.position || '').toUpperCase();
            const weight = teamRow.positions?.[pos]?.needWeight ?? 1.0;
            const score = pickWindowScore({ candidate: cand, needWeight: weight });
            if (!best || score > best.score) best = { name: cand.name, score };
          }
          if (best?.name) weightedBpaName = best.name;
        }
      }

      const userMsg = buildUserPromptTopN({
        pickNumber,
        round: Number(o.round ?? 1),
        available: pool,
        leagueHints,
        teamProfile,
        reasonTemplate,
        quality,
        topN: windowN,
        teamNeedsText: needsText,
      });

      // Track templates to reduce back-to-back structural repetition.
      recentReasonTemplates.push(reasonTemplate);

      const templateId = hash32(reasonTemplate);

      // Seed debug entry for this pick (we'll fill raw/sanitized later)
      const debugEntry = {
        pickNumber,
        teamName: teamProfile.teamName,
        slot: Number(o.slot ?? (i % 12) + 1),
        round: Number(o.round ?? 1),
        persona: teamProfile.persona,
        qualityBand: quality?.band,
  leadInCategory: null,
        templateId,
        templatePreview: clip(reasonTemplate, 160),
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
        // Voice-driven fallback reason to avoid obvious repetition when the model output is malformed.
        const leadInRaw = buildPickLeadIn({
          pickNumber,
          teamName: teamProfile.teamName,
          position: fallback.position,
          rng: voiceRng,
          recent: recentLeadIns,
        });
        recentLeadIns.push(leadInRaw);
        debugEntry.leadInCategory = String(leadInRaw || '').includes('|') ? String(leadInRaw).split('|')[0] : null;
        const leadIn = String(leadInRaw || '').includes('|') ? String(leadInRaw).split('|').slice(1).join('|') : String(leadInRaw || '');

        const fallbackTemplate = buildReasonTemplate({
          rng: voiceRng,
          position: fallback.position,
          quality,
          recent: recentReasonTemplates,
          window: 8,
        });
        recentReasonTemplates.push(fallbackTemplate);

        const coda = buildPickCoda({ rng: voiceRng });

        // Keep this intentionally simple: one lead-in line + a compact 3-sentence reason + optional coda.
  const rawFallbackReason = `${leadIn} ${fallback.name} is a clean roster-value pick here: it gives ${teamProfile.teamName} another usable ${fallback.position} option with a realistic path to fantasy points. The upside is lineup flexibility and the chance at a few startable weeks if the role opens up. The risk is volatility — this could stay bench-only and take time (or never fully click).`;
  const sfb = sanitizeReason(rawFallbackReason, fallback.name, { mode: 'light', withMeta: true });
  let reason = sfb.text;
        if (coda) reason = `${reason} ${coda}`;

        debugEntry.usedFallback = true;
        debugEntry.parseError = 'Malformed LLM JSON';
        debugEntry.rawReasonPreview = clip(content, 220);
        debugEntry.sanitizedReasonPreview = clip(reason, 220);
  debugEntry.sanitizeEscalated = !!sfb.escalated;
  debugEntry.sanitizedChanged = rawFallbackReason !== sfb.text;
  debugEntry.sanitizeDeltaChars = (sfb.text || '').length - (rawFallbackReason || '').length;
  debugEntry.sanitizeSkipped = false;
        generationDebug.picks.push(debugEntry);

        picks.push({ pickNumber, teamName: teamProfile.teamName, player: fallback, reason });
        pool = popPlayerByName(pool, fallback.name).nextPool;
        trace && traceLog.push({ pickNumber, team: teamProfile.teamName, error: 'Malformed LLM JSON', raw: content });
        continue;
      }

      const desired = parsed.pick;
      // Enforce TOP-N constraint strictly (default top 8)
      const topNames = pool.slice(0, windowN).map(p => p.name);
      let chosenName = desired;
      if (!topNames.includes(chosenName)) {
        chosenName = weightedBpaName || topNames[0];
        trace && traceLog.push({ pickNumber, team: teamProfile.teamName, warning: `Choice outside top-${windowN}; auto-corrected`, originalChoice: desired, correctedTo: chosenName });
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

        picks.push({ pickNumber, teamName: teamProfile.teamName, player: fallback, reason });
        pool = popPlayerByName(pool, fallback.name).nextPool;
        trace && traceLog.push({ pickNumber, team: teamProfile.teamName, warning: 'LLM chose out-of-pool after correction', choice: desired });
        continue;
      }

  // For successful LLM picks, use the raw reason as-is (no sanitizer).
  const rawReason = parsed.reason || '';
  let reason = String(rawReason || '').trim();

      // Add a short human lead-in and (occasionally) a coda for flavor.
      // Keep it to 1 line to avoid bloating the article.
      const leadRaw = buildPickLeadIn({
        pickNumber,
        teamName: teamProfile.teamName,
        position: picked.position,
        rng: voiceRng,
        recent: recentLeadIns,
      });
      recentLeadIns.push(leadRaw);
      debugEntry.leadInCategory = String(leadRaw || '').includes('|') ? String(leadRaw).split('|')[0] : null;
      const lead = String(leadRaw).includes('|') ? String(leadRaw).split('|').slice(1).join('|') : String(leadRaw);
      const coda = buildPickCoda({ rng: voiceRng });
      reason = `${lead}\n\n${reason}${coda ? `\n\n*${coda}*` : ''}`;

  debugEntry.rawReasonPreview = clip(rawReason, 220);
  debugEntry.sanitizedReasonPreview = clip(reason, 220);
  debugEntry.sanitizeMode = 'skipped';
  debugEntry.sanitizeEscalated = false;
  debugEntry.sanitizedChanged = false;
  debugEntry.sanitizeDeltaChars = 0;
  debugEntry.sanitizeSkipped = true;
  generationDebug.picks.push(debugEntry);

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
