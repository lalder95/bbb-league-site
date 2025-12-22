import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { OpenAI } from 'openai';
import { loadPlayerPool, popPlayerByName } from '@/utils/playerPoolUtils';

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

function buildSystemPrompt(teamProfile, styleToken) {
  // Persona adds stylistic variation
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
  const availableList = top10.map(p => `${p.name} (${p.position}) [rank ${p.rank}${p.value > 0 ? `, value ${p.value}` : ''}]`).join('\n');
  return `Pick: ${pickNumber}
Team: ${teamProfile.teamName}

Draft context: ${leagueHints}
Use this writing pattern: ${reasonTemplate}

Available Players (TOP 10 ONLY):\n${availableList}

Choose the best pick for this team from ONLY the top 10 above and return JSON as specified.`;
}

function safeJson(str) {
  try { return JSON.parse(str); } catch { return null; }
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
  lines.push(`With the rookie draft approaching in ${leagueName}, here\'s a data-assisted mock based on team needs, positional value, and a shared player pool.`);
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

    // League-wide hints (very light for now; could compute scarcity later)
  // Neutral hints to discourage scarcity emphasis
  const leagueHints = `Focus on player fit, role clarity, and overall value. Avoid repeating the same adjectives or stock phrases.`;

  const reasonTemplates = [
    // Core structures
    'Start with player name and role fit; follow with value vs generic alternatives; conclude with a minor risk.',
    'Open with player name + how he improves the lineup; compare to generic options; end with a tempered concern.',
    'Lead with player name and expected role contribution; discuss value and timing; add a light caveat.',
    'Begin with player name and team fit; touch on development path and value; mention one risk to monitor.',
    'Introduce player name with tactical fit; outline why this value works now; finish with a manageable risk.',
    // Variations on framing
    'Start with player name and one standout trait; connect it to the team’s immediate plan; end with a reasonable caveat.',
    'Open with player name and how he shifts matchups; address depth implications; finish with a minor watch‑item.',
    'Lead with player name and how snaps/usage project; relate to scheme; close with a modest uncertainty.',
    'Begin with player name and fit within positional room; discuss roster construction; end with a small risk.',
    'Introduce player name and explain why the board supports this choice; add a realistic limitation to monitor.',
    // Value and timing spins
    'Start with player name and where he adds value now; mention future upside; finish with a practical risk.',
    'Open with player name and how he stabilizes a unit; nod to long‑term growth; add a mild concern.',
    'Lead with player name and the role clarity he brings; reference timing across the season; end with a restraint.',
    'Begin with player name and how he complements existing personnel; call out value; note one constraint.',
    'Introduce player name and why his acquisition sequence makes sense; close with balanced caution.',
    // Tactical and development blends
    'Start with player name and tactical utility; add development pathway; end with a measured risk.',
    'Open with player name and a simple tactical upgrade; outline how reps could expand; add a small caveat.',
    'Lead with player name and expected situational usage; highlight value; finish with limited downside.',
    'Begin with player name and the baseline contribution; project improvement; mention one monitoring point.',
    'Introduce player name and synergy with coordinator tendencies; add value note; close with modest risk.',
    // Different rhetorical flows
    'Start with player name and a concise fit statement; add two short value points; end with one risk sentence.',
    'Open with player name; pose a rhetorical consideration of alternatives (generic); answer with fit; end with caution.',
    'Lead with player name and a comparison to generic profiles; justify fit; finish with a watch point.',
    'Begin with player name and a declarative fit; provide one supporting example; end with a constraint.',
    'Introduce player name; describe role, value, and pacing; add a single pragmatic concern.',
    // Narrative angle options
    'Start with player name and immediate plan; touch on how this shapes future flexibility; end with a small risk.',
    'Open with player name and current depth chart impact; address rotation; finish with tempered uncertainty.',
    'Lead with player name and why the board aligns; discuss roster balance; end with a manageable limitation.',
    'Begin with player name and how he addresses one defined need; connect to overall value; add caveat.',
    'Introduce player name and team‑building rationale; articulate value; finish with cautious note.',
    // Role clarity and constraints
    'Start with player name and define primary role; add two concise value points; end with one constraint to manage.',
    'Open with player name and expected alignment with packages; outline value add; close with rotational caveat.',
    'Lead with player name and utilization window; justify board position; finish with workload note.',
    'Begin with player name and where he slots on depth chart; mention value; add one limiter.',
    'Introduce player name and outline role hierarchy impact; add practical value; end with situational caveat.',
    // Fit and synergy angles
    'Start with player name and synergy with current personnel groups; tie to fit; end with minor uncertainty.',
    'Open with player name and complementary traits; explain why it works with existing starters; add caveat.',
    'Lead with player name and expected synergy with coordinator preferences; discuss value; close with watch item.',
    'Begin with player name and package synergy; include a nod to pacing; end with one measured risk.',
    'Introduce player name and explain fit within sub‑packages; add value timing; finish with pragmatic concern.',
    // Board/alternatives framing (generic)
    'Start with player name and succinct board justification; reference generic alternatives; end with modest risk.',
    'Open with player name and why the board favors this direction; address generic options; finish with restraint.',
    'Lead with player name and a short board note; offer generic comparison; end with small caveat.',
    'Begin with player name and the board context; mention generic pathways; close with manageable limitation.',
    'Introduce player name and board alignment; outline value; end with one realistic concern.',
    // Development pacing
    'Start with player name and immediate role; sketch development pacing; end with one mild risk.',
    'Open with player name and short‑term usage; add how reps evolve; finish with adjustment caveat.',
    'Lead with player name and baseline contribution; add medium‑term growth line; end with constraint.',
    'Begin with player name and near‑term plan; mention skill refinement; close with measured caution.',
    'Introduce player name and a practical ramp‑up path; connect value; end with tempered uncertainty.',
    // Scenario‑specific notes
    'Start with player name and situational utility (third‑down/red‑zone as applicable); add value; end with one limiter.',
    'Open with player name and matchup flexibility; discuss practical value; finish with a single caveat.',
    'Lead with player name and special teams or package utility when relevant; tie to value; end with mild risk.',
    'Begin with player name and rotation impact; outline the why; close with usage constraint.',
    'Introduce player name and contingency coverage; articulate value; finish with pragmatic watch point.',
    // Position-tailored generic frames (no other names)
    'QB: Start with player name and pocket/processing fit; outline value in drive consistency; end with one learning curve note.',
    'RB: Open with player name and run concept alignment; mention value in early downs; close with workload caveat.',
    'WR: Lead with player name and route/spacing fit; add value in chain-moving; finish with one refinement note.',
    'TE: Begin with player name and inline/split role fit; outline value in personnel flexibility; end with modest usage caveat.',
    'DB: Introduce player name and coverage/assignment fit; add value in sub-packages; close with a single constraint.',
    // Game-state and sequencing frames
    'Start with player name and impact on early downs; add sequencing value; end with practical limitation.',
    'Open with player name and third-down utility; tie to sustained drives; finish with measured risk.',
    'Lead with player name and red-zone contribution; connect to situational value; end with one caveat.',
    'Begin with player name and two-minute usage; outline pacing value; close with realistic concern.',
    'Introduce player name and end-of-game tendencies; mention execution value; finish with minor caution.',
    // Risk-balanced rationales
    'Start with player name and primary fit statement; add two value points; conclude with a balanced risk sentence.',
    'Open with player name and plain-fit note; provide concise value justification; end with contained risk.',
    'Lead with player name and role clarity; add compact value reasoning; finish with a bounded caveat.',
    'Begin with player name and clear contribution; share brief value logic; close with a limited uncertainty.',
    'Introduce player name and straightforward fit; include value rationale; end with one constrained risk.',
  ];
  const styleTokens = [
    'Write with concise sentences; avoid clichés.',
    'Use varied sentence openings; keep the tone analytical.',
    'Favor plain language; avoid buzzwords.',
    'Blend tactical and developmental notes; avoid repetition.',
    'Keep it practical and grounded; avoid sweeping claims.',
    'Prioritize clarity; prefer short clauses over stacked adjectives.',
    'Maintain neutral tone; avoid hype language.',
    'Prefer concrete role terminology; avoid vague superlatives.',
    'Vary cadence: mix short and medium sentences.',
    'Avoid template phrases; rephrase common constructions.',
    'Keep verbs active; minimize filler adverbs.',
    'Prefer specific nouns over broad labels.',
    'Limit subordinate clauses; favor clarity.',
    'Avoid repetitive sentence skeletons across picks.',
    'Let each sentence carry one idea; avoid chaining multiple clauses.',
    'Prefer concrete role verbs: anchor, stretch, occupy, trigger, protect.',
    'Use neutral qualifiers; avoid hype and absolutes.',
    'Rotate transitions (Moreover, In addition, Meanwhile, Conversely) sparingly.',
  ];

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

  const reasonTemplate = reasonTemplates[i % reasonTemplates.length];
  const styleToken = styleTokens[(i + Math.floor(Math.random() * 3)) % styleTokens.length];
  const system = buildSystemPrompt(teamProfile, styleToken);
  const userMsg = buildUserPrompt({ pickNumber, available: pool, leagueHints, teamProfile, reasonTemplate });

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
  let reason = `${fallback.name} fits ${teamProfile.teamName}'s roster build and projected role. He provides actionable value now while keeping future options open. A minor concern is the adjustment curve at the pro level.`;
  reason = sanitizeReason(reason, fallback.name);
        picks.push({ pickNumber, teamName: teamProfile.teamName, player: fallback, reason });
        pool = popPlayerByName(pool, fallback.name).nextPool;
        trace && traceLog.push({ pickNumber, team: teamProfile.teamName, error: 'Malformed LLM JSON', raw: content });
        continue;
      }

      const desired = parsed.pick;
      // Enforce TOP 10 constraint strictly
      const top10Names = pool.slice(0, 10).map(p => p.name);
      let chosenName = desired;
      if (!top10Names.includes(chosenName)) {
        chosenName = top10Names[0]; // best available within top 10
        trace && traceLog.push({ pickNumber, team: teamProfile.teamName, warning: 'Choice outside top-10; auto-corrected', originalChoice: desired, correctedTo: chosenName });
      }
      const { picked, nextPool } = popPlayerByName(pool, chosenName);
      if (!picked) {
        // If the model chose someone not in pool, take BPA to enforce constraint
        const fallback = pool[0];
  let reason = parsed.reason || 'Adjusted to best available from valid pool.';
  reason = sanitizeReason(reason, fallback.name);
        picks.push({ pickNumber, teamName: teamProfile.teamName, player: fallback, reason });
        pool = popPlayerByName(pool, fallback.name).nextPool;
        trace && traceLog.push({ pickNumber, team: teamProfile.teamName, warning: 'LLM chose out-of-pool after correction', choice: desired });
        continue;
      }

      // Ensure the reason refers to the picked player and not another name
      let reason = sanitizeReason(parsed.reason || '', picked.name);
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
  const article = toMarkdownArticle({ title, picks, leagueName });

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
