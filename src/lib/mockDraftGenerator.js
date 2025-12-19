import clientPromise from '@/lib/mongodb';
import { OpenAI } from 'openai';
import { loadPlayerPool, loadPlayerPoolAsync, popPlayerByName } from '@/utils/playerPoolUtils';

// NOTE: This pulls the generation logic out of the API route so it can run
// both synchronously and from a background job.

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

function summarizeRoster(roster) {
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
  const summary = roster ? summarizeRoster(roster) : {};
  return { teamName, ownerId, rosterSummary: summary };
}

function formatPickNumber(round, slot) {
  const s = String(slot).padStart(2, '0');
  return `${round}.${s}`;
}

function buildSystemPrompt(teamProfile, styleToken) {
  const persona = teamProfile.persona || 'Balanced Strategist';
  return `You are the AI GM for ${teamProfile.teamName} in a closed-universe fantasy football league (no NFL teams/contracts). Adopt the persona: "${persona}" for tone and decision style.
Follow constraints strictly:
- Only draft from the provided Available Players list.
- Only select from the TOP 10 ranked players remaining in the pool.
- Do not mention real-life contracts or NFL franchises.
- Prioritize upgrading likely starters first; consider depth second.
Avoid overemphasizing scarcity; focus on roster fit, role clarity, and value.
Style guidance: ${styleToken}. Aim for variety—change sentence openings, avoid stock phrases, avoid repeating identical adjectives.
Your response MUST be valid JSON only with two keys and no extra text: { "pick": "Exact Player Name", "reason": "3-5 sentences that start by restating the chosen player's name and explain team fit, role clarity, value vs alternatives (generic only, no names), and one minor risk/concern." }`;
}

function buildUserPrompt({ pickNumber, available, leagueHints, teamProfile, reasonTemplate }) {
  const top10 = available.slice(0, 10);
  const availableList = top10
    .map(p => `${p.name} (${p.position}) [rank ${p.rank}${p.value > 0 ? `, value ${p.value}` : ''}]`)
    .join('\n');
  return `Pick: ${pickNumber}
Team: ${teamProfile.teamName}

Draft context: ${leagueHints}
Use this writing pattern: ${reasonTemplate}

Available Players (TOP 10 ONLY):\n${availableList}

Choose the best pick for this team from ONLY the top 10 above and return JSON as specified.`;
}

function safeJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function sanitizeReason(reason, pickedName) {
  const banned = [
    /medium scarcity/gi,
    /explosive playmaking ability/gi,
    /perfect fit/gi,
    /elite (cornerback|matchups)/gi,
    /balanced risk profile/gi,
    /immediate impact potential/gi,
    /scheme-diverse/gi,
    /well-rounded skill set/gi,
  ];
  let out = (reason || '').trim();
  for (const rx of banned) out = out.replace(rx, '');
  out = out.replace(/\s{2,}/g, ' ').trim();
  const lname = pickedName.split(' ').slice(-1)[0];
  if (!out.toLowerCase().includes(lname.toLowerCase())) {
    out = `${pickedName} fits the current roster plan and projected role. ` + out;
  }
  const sentenceCount = out.split('.').filter(Boolean).length;
  if (sentenceCount < 3) {
    out += ' He offers practical value now while leaving room for growth without overcommitting to one dimension.';
  }
  return out;
}

function toMarkdownArticle({ title, picks, leagueName }) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(
    `With the rookie draft approaching in ${leagueName}, here's a data-assisted mock based on team needs, positional value, and a shared player pool.`
  );
  lines.push('');
  let currentRound = null;
  for (const p of picks) {
    const round = Number(String(p.pickNumber).split('.')[0] || 1);
    if (currentRound !== round) {
      currentRound = round;
      lines.push(`## Round ${currentRound}`);
      lines.push('');
    }
    lines.push(`### ${p.pickNumber} - Team ${p.teamName}`);
    lines.push(`**Projected Pick: ${p.player.name}, ${p.player.position}**`);
    lines.push('');
    lines.push(p.reason);
    lines.push('');
  }
  return lines.join('\n');
}

export async function publishMockDraft({ authSession, title, description, picks, article, trace, leagueId, model }) {
  const client = await clientPromise;
  const db = client.db();

  const doc = {
    title,
    description,
    content: article,
    author: authSession?.user?.username || 'Commissioner',
    date: new Date().toISOString().split('T')[0],
    active: true,
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    meta: {
      leagueId: leagueId || null,
      model: model || null,
      picks: picks || [],
      trace: trace || undefined,
    },
  };

  await db.collection('mockDrafts').updateMany({ active: true }, { $set: { active: false } });
  const result = await db.collection('mockDrafts').insertOne(doc);
  return { id: result.insertedId };
}

export async function generateMockDraft({
  authSession,
  rounds = 7,
  maxPicks,
  seed,
  dryRun = false,
  trace = true,
  model = 'gpt-4o-mini',
  title = 'BBB AI Mock Draft',
  description = 'AI-generated mock draft with per-pick reasoning.',
  maxSeconds = 50,
  // For background jobs: resume draft generation from a specific index.
  // Index is 0-based into the computed draft order.
  startIndex = 0,
  // For background jobs: limit how many picks to generate in this invocation.
  maxPicksToGenerate = null,
  // Prevent a single OpenAI call from hanging the whole job.
  perPickTimeoutMs = 25000,
  perPickMaxRetries = 2,
  onProgress,
}) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const leagueId = await resolveBBBLeagueId();
  const [users, rosters, drafts] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`, { cache: 'no-store' }).then(r => r.json()),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { cache: 'no-store' }).then(r => r.json()),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/drafts`, { cache: 'no-store' }).then(r => r.json()),
  ]);

  const upcoming = drafts.find(d => d.status === 'upcoming') || null;
  const state = await fetch('https://api.sleeper.app/v1/state/nfl', { cache: 'no-store' }).then(r => r.json());
  const currentSeason = Number(state?.season || new Date().getFullYear());
  const targetSeason = (!upcoming || upcoming.status === 'complete') ? (currentSeason + 1) : Number(upcoming.season);

  // MaxPF + winners bracket
  let maxpfMap;
  try {
    const { calculateSeasonMaxPF } = await import('@/utils/maxpf');
    maxpfMap = await calculateSeasonMaxPF({ leagueId });
  } catch {
    maxpfMap = {};
  }

  let winnersBracket = [];
  try {
    winnersBracket = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/winners_bracket`, { cache: 'no-store' }).then(r => r.json());
  } catch {}

  const { buildDraftOrder } = await import('@/utils/draftOrderUtils');
  const base = buildDraftOrder({ rosters, maxpfMap, winnersBracket });

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

  const cappedMax = Math.max(12, Math.min(84, Number(maxPicks) || totalRounds * 12));
  order = order.slice(0, cappedMax);

  let pool;
  try {
    pool = loadPlayerPool();
  } catch {
    pool = await loadPlayerPoolAsync();
  }
  if (!Array.isArray(pool) || pool.length === 0) throw new Error('Player pool is empty');

  const leagueHints = `Focus on player fit, role clarity, and overall value. Avoid repeating the same adjectives or stock phrases.`;

  const reasonTemplates = [
    'Start with player name and role fit; follow with value vs generic alternatives; conclude with a minor risk.',
    'Open with player name + how he improves the lineup; compare to generic options; end with a tempered concern.',
    'Lead with player name and expected role contribution; discuss value and timing; add a light caveat.',
    'Begin with player name and team fit; touch on development path and value; mention one risk to monitor.',
  ];

  const styleTokens = [
    'Write with concise sentences; avoid clichés.',
    'Use varied sentence openings; keep the tone analytical.',
    'Favor plain language; avoid buzzwords.',
    'Blend tactical and developmental notes; avoid repetition.',
    'Keep it practical and grounded; avoid sweeping claims.',
  ];

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

  const traceLog = [];
  const picks = [];

  async function callOpenAIWithRetry({ messages, pickNumber }) {
    const timeoutMs = Math.max(5000, Number(perPickTimeoutMs) || 25000);
    const maxRetries = Math.max(0, Number(perPickMaxRetries) || 0);

    let lastErr = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        if (attempt > 0 && onProgress) {
          await onProgress({
            pickNumber,
            message: `Retrying OpenAI for ${pickNumber} (attempt ${attempt + 1}/${maxRetries + 1})…`,
          });
        }

        const completion = await openai.chat.completions.create(
          {
            model,
            messages,
            temperature: 0.75,
            top_p: 0.9,
            frequency_penalty: 0.6,
            presence_penalty: 0.4,
            max_tokens: 450,
            seed,
          },
          { signal: controller.signal }
        );
        clearTimeout(t);
        return completion;
      } catch (e) {
        clearTimeout(t);
        lastErr = e;
        const msg = e?.name === 'AbortError' ? `OpenAI timeout after ${timeoutMs}ms` : (e?.message || String(e));
        trace && traceLog.push({ pickNumber, error: 'OpenAI call failed', attempt, message: msg });
        if (onProgress) {
          try {
            await onProgress({ pickNumber, message: `OpenAI issue on ${pickNumber}: ${msg}` });
          } catch {}
        }

        // Backoff before retrying
        if (attempt < maxRetries) {
          const backoff = 750 * (attempt + 1);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
      }
    }

    throw lastErr || new Error('OpenAI call failed');
  }

  const startedAt = Date.now();

  const safeStartIndex = Math.max(0, Math.min(order.length, Number(startIndex) || 0));
  const safeMaxInThisRun =
    maxPicksToGenerate === null || maxPicksToGenerate === undefined
      ? null
      : Math.max(1, Number(maxPicksToGenerate) || 1);

  for (let i = safeStartIndex; i < order.length && pool.length > 0; i++) {
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    if (Number(maxSeconds) > 0 && elapsedSeconds > Number(maxSeconds)) {
      trace && traceLog.push({ warning: 'Stopped early to avoid timeout', elapsedSeconds, generatedPicks: picks.length });
      break;
    }

    // Stop after a limited batch size (for serverless background job runner).
    if (safeMaxInThisRun !== null && picks.length >= safeMaxInThisRun) {
      trace && traceLog.push({ warning: 'Stopped after batch limit', generatedPicks: picks.length });
      break;
    }

    const o = order[i];
    const teamProfile = buildTeamProfile(o.userId, users, rosters);
    teamProfile.persona = personas[(Number(o.slot) - 1) % 12];
    const pickNumber = formatPickNumber(Number(o.round ?? 1), Number(o.slot ?? (i % 12) + 1));

    if (onProgress) {
      try {
        await onProgress({
          pickNumber,
          message: `Generating… Pick ${pickNumber}`,
          generatedPicks: picks.length,
          totalPicks: order.length,
        });
      } catch {}
    }

    const reasonTemplate = reasonTemplates[i % reasonTemplates.length];
    const styleToken = styleTokens[(i + Math.floor(Math.random() * 3)) % styleTokens.length];
    const system = buildSystemPrompt(teamProfile, styleToken);
    const userMsg = buildUserPrompt({ pickNumber, available: pool, leagueHints, teamProfile, reasonTemplate });

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ];

    let completion;
    try {
      completion = await callOpenAIWithRetry({ messages, pickNumber });
    } catch (e) {
      // Hard fallback: take BPA if OpenAI is unavailable/hanging.
      const fallback = pool[0];
      let reason = `${fallback.name} fits ${teamProfile.teamName}'s roster build and projected role. He provides actionable value now while keeping future options open. A minor concern is the adjustment curve at the pro level.`;
      reason = sanitizeReason(reason, fallback.name);
      picks.push({ pickNumber, teamName: teamProfile.teamName, player: fallback, reason });
      pool = popPlayerByName(pool, fallback.name).nextPool;
      trace && traceLog.push({ pickNumber, team: teamProfile.teamName, error: 'OpenAI unavailable; BPA fallback', message: e?.message || String(e) });
      continue;
    }

    const content = completion?.choices?.[0]?.message?.content?.trim?.() || '';
    const parsed = safeJson(content);

    if (!parsed || typeof parsed.pick !== 'string') {
      const fallback = pool[0];
      let reason = `${fallback.name} fits ${teamProfile.teamName}'s roster build and projected role. He provides actionable value now while keeping future options open. A minor concern is the adjustment curve at the pro level.`;
      reason = sanitizeReason(reason, fallback.name);
      picks.push({ pickNumber, teamName: teamProfile.teamName, player: fallback, reason });
      pool = popPlayerByName(pool, fallback.name).nextPool;
      trace && traceLog.push({ pickNumber, team: teamProfile.teamName, error: 'Malformed LLM JSON', raw: content });
      continue;
    }

    const desired = parsed.pick;
    const top10Names = pool.slice(0, 10).map(p => p.name);
    let chosenName = desired;
    if (!top10Names.includes(chosenName)) {
      chosenName = top10Names[0];
      trace && traceLog.push({ pickNumber, team: teamProfile.teamName, warning: 'Choice outside top-10; auto-corrected', originalChoice: desired, correctedTo: chosenName });
    }

    const { picked, nextPool } = popPlayerByName(pool, chosenName);
    if (!picked) {
      const fallback = pool[0];
      let reason = parsed.reason || 'Adjusted to best available from valid pool.';
      reason = sanitizeReason(reason, fallback.name);
      picks.push({ pickNumber, teamName: teamProfile.teamName, player: fallback, reason });
      pool = popPlayerByName(pool, fallback.name).nextPool;
      trace && traceLog.push({ pickNumber, team: teamProfile.teamName, warning: 'LLM chose out-of-pool after correction', choice: desired });
      continue;
    }

    let reason = sanitizeReason(parsed.reason || '', picked.name);
    picks.push({ pickNumber, teamName: teamProfile.teamName, player: picked, reason });
    pool = nextPool;

    if (trace) {
      traceLog.push({
        pickNumber,
        team: teamProfile.teamName,
        choice: picked.name,
        reason: parsed.reason || '',
      });
    }
  }

  const leagueName = 'Budget Blitz Bowl';
  const article = toMarkdownArticle({ title, picks, leagueName });

  let saved = null;
  if (!dryRun) {
    saved = await publishMockDraft({
      authSession,
      title,
      description,
      picks,
      article,
      trace: trace ? traceLog : undefined,
      leagueId,
      model,
    });
  }

  return {
    draftId: saved?.id || null,
    picks,
    article,
    trace: trace ? traceLog : undefined,
    progress: { totalPicks: order.length, currentPickNumber: picks[picks.length - 1]?.pickNumber || null },
  };
}
