// src/utils/mockDraftVoice.js
// Lightweight, deterministic "voice" helpers for AI mock drafts.
// Goal: add personality, pacing, and variety without breaking parity or coherence.

/**
 * Mulberry32 PRNG (fast, deterministic)
 * @param {number} a
 */
export function mulberry32(a) {
  let t = a >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a string into a 32-bit unsigned int.
 * @param {string} str
 */
export function hashStringToSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Create a small RNG helper set.
 * @param {object} opts
 * @param {number|string|undefined} opts.seed
 * @param {string} opts.salt
 */
export function createRng({ seed, salt = '' } = {}) {
  const base = typeof seed === 'number'
    ? seed >>> 0
    : hashStringToSeed(String(seed ?? 'bbb') + '|' + salt);
  const r = mulberry32(base);

  return {
    /** @returns {number} */
    rand: () => r(),
    /**
     * @template T
     * @param {T[]} arr
     * @returns {T}
     */
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    /**
     * @param {number} p probability in [0,1]
     * @returns {boolean}
     */
    chance: (p) => r() < p,
    /**
     * @param {number} min
     * @param {number} max
     */
    int: (min, max) => Math.floor(r() * (max - min + 1)) + min,
  };
}

/**
 * Pick an item from a list while trying to avoid recently-used items.
 * Deterministic as long as rng is deterministic.
 *
 * @template T
 * @param {{ rng: { int: (min:number, max:number)=>number }, items: T[], recent: T[], window?: number }} params
 */
export function pickNonRepeating({ rng, items, recent, window = 3 }) {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  if (!Array.isArray(recent) || recent.length === 0) return items[rng.int(0, items.length - 1)];

  const blocked = new Set(recent.slice(-window));
  const candidates = items.filter(i => !blocked.has(i));
  const pool = candidates.length > 0 ? candidates : items;
  return pool[rng.int(0, pool.length - 1)];
}

/**
 * Nickname pack used sparingly to avoid cringe.
 * Keep these generic and not inside in-jokes that could age poorly.
 */
const NICKNAMES = [
  'war room',
  'front office',
  'brain trust',
  'strategy desk',
  'film room',
];

const ROUND_OPENERS = [
  "New round, new problems.",
  "Alright, we’re back on the clock.",
  "Round starts — and the board’s already doing that thing.",
  "Fresh round. Same chaos.",
  "Here we go again.",
];

const ROUND_THEMES = [
  "The safe value is tempting, but so is the shiny upside.",
  "You can feel the positional dominoes lining up.",
  "This is usually where teams get brave… or get weird.",
  "Everyone says ‘best player available’ until the clock starts melting.",
];

const ARTICLE_INTROS = [
  "Coffee poured, spreadsheets open — let’s spin a mock.",
  "Welcome to another episode of ‘who panics first’.",
  "We ran the numbers, stared at the board, and tried not to overthink it (no promises).",
  "A mock draft is basically group therapy with rookies. Let’s do it.",
];

const OUTROS = [
  "If this ends up even 30% right, I’m taking a victory lap.",
  "Now imagine this with trades. Absolute scenes.",
  "Bookmark the receipts — we’ll revisit the hit rate after the chaos.",
  "If your team hates this, that probably means it’s accurate.",
];

export function buildArticleIntro({ title, leagueName, rng }) {
  const line1 = rng.pick(ARTICLE_INTROS);
  const line2 = `Here’s a spark-notes mock for ${leagueName}: roster fit, value, and just enough spice to keep it readable.`;
  // Title remains in markdown header from calling code.
  return `${line1} ${line2}`;
}

export function buildRoundIntro({ round, rng }) {
  const opener = rng.pick(ROUND_OPENERS);
  const theme = rng.pick(ROUND_THEMES);
  const extra = rng.chance(0.25) ? ` (${rng.pick(NICKNAMES)} voice: “don’t reach.”)` : '';
  return `*${opener}* ${theme}${extra}`;
}

/**
 * Add a short transition line before the actual pick reason.
 * This is meant to be tiny, not a paragraph.
 */
export function buildPickLeadIn({ pickNumber, teamName, position, rng, recent = [] }) {
  // A big library of hooks to reduce repetition. Keep these PG and broadly evergreen.
  // We’ll pick from categories to vary cadence and sentence skeletons.
  const hooks = {
    // Direct / podium / on-the-clock
    direct: [
      `Pick ${pickNumber}: ${teamName} steps to the podium.`,
      `${teamName} is on the clock at ${pickNumber}.`,
      `At ${pickNumber}, it’s ${teamName}’s turn to make the room uncomfortable.`,
      `We hit ${pickNumber} and it’s ${teamName}’s pick to make.`,
      `At ${pickNumber}, ${teamName} finally gets a say in the chaos.`,
      `${pickNumber} comes up fast — ${teamName} is live.`,
      `${teamName} clocks in at ${pickNumber}.`,
      `Pick ${pickNumber} belongs to ${teamName}.`,
      `${pickNumber}: ${teamName} is up and the board is staring back.`,
      `${teamName} takes the stage at ${pickNumber}.`,
    ],

    // “Board talks” framing
    board: [
      `${teamName} is up at ${pickNumber} and the board actually cooperates.`,
      `At ${pickNumber}, the board leaves ${teamName} a real decision instead of a gift.`,
      `${pickNumber} — the board is messy, but ${teamName} can still work with it.`,
      `At ${pickNumber}, the board gives ${teamName} choices (the most dangerous thing in a draft).`,
      `${teamName} gets to ${pickNumber} and suddenly there are *too many* good names.`,
      `${pickNumber}: the board’s been whispering “take the value” at ${teamName} for a minute.`,
      `${teamName} reaches ${pickNumber} and the board finally stops being rude.`,
      `At ${pickNumber}, the board sets a trap… or a bargain.`,
      `${pickNumber} hits and ${teamName} finds the sweet spot between need and value.`,
      `At ${pickNumber}, the board offers ${teamName} a couple clean exits.`,
    ],

    // Confident / decisive tone
    decisive: [
      `At ${pickNumber}, ${teamName} wastes zero time.`,
      `${pickNumber}: ${teamName} makes the adult decision.`,
      `At ${pickNumber}, ${teamName} keeps it simple and takes the value.`,
      `${teamName} hits ${pickNumber} and doesn’t get cute.`,
      `${pickNumber} — ${teamName} sees the opening and takes it.`,
      `At ${pickNumber}, ${teamName} plays it straight, no detours.`,
      `${teamName} arrives at ${pickNumber} and pulls the trigger.`,
      `Pick ${pickNumber}: decisive, clean, and on to the next.`,
      `${pickNumber}: ${teamName} reads the room and makes the obvious move.`,
      `At ${pickNumber}, ${teamName} takes the layup.`,
    ],

    // Slightly funny / chatty
    banter: [
      `At ${pickNumber}, ${teamName} goes shopping in the “this is too good to pass” aisle.`,
      `${pickNumber}: ${teamName} opens the fridge, sees leftovers, and still eats well.`,
      `At ${pickNumber}, ${teamName} chooses peace (and value).`,
      `${pickNumber} — ${teamName} tries to be responsible. Tries.`,
      `At ${pickNumber}, ${teamName} makes a pick that won’t start a group chat war (probably).`,
      `${pickNumber}: ${teamName} takes a deep breath and ignores the temptations.`,
      `At ${pickNumber}, ${teamName} resists the urge to galaxy-brain this.`,
      `${pickNumber}: ${teamName} doesn’t need a miracle — just a solid hit.`,
      `At ${pickNumber}, ${teamName} opts for “boring good” over “funny bad.”`,
      `${pickNumber}: ${teamName} chooses the option that’ll age the best in receipts season.`,
    ],

    // Cautious / measured tone
    cautious: [
      `At ${pickNumber}, ${teamName} chooses the safer lane and lives with it.`,
      `${pickNumber}: ${teamName} leans toward stability over fireworks.`,
      `At ${pickNumber}, ${teamName} settles the room with a pragmatic choice.`,
      `${pickNumber} — ${teamName} takes the pick with fewer ways to go sideways.`,
      `At ${pickNumber}, ${teamName} protects the floor first.`,
      `${pickNumber}: ${teamName} goes for reliability and calls it a win.`,
      `At ${pickNumber}, ${teamName} values role clarity over the mystery box.`,
      `${pickNumber}: ${teamName} takes the pick with the cleanest path to usage.`,
      `At ${pickNumber}, ${teamName} keeps the miss risk in check.`,
      `${pickNumber}: ${teamName} opts for the pick that won’t require a pep talk.`,
    ],

    // Aggressive / spicy tone (still PG)
    spicy: [
      `${pickNumber}: ${teamName} swings a little harder than expected.`,
      `At ${pickNumber}, ${teamName} plays for ceiling, not comfort.`,
      `${pickNumber} — ${teamName} bets on talent and figures out the rest later.`,
      `At ${pickNumber}, ${teamName} pushes the chips forward.`,
      `${pickNumber}: ${teamName} plays for ceiling and accepts the noise.`,
      `At ${pickNumber}, ${teamName} makes the kind of pick that gets a reaction.`,
      `${pickNumber} — ${teamName} chooses upside and dares the league to complain.`,
      `At ${pickNumber}, ${teamName} makes a statement more than a selection.`,
      `${pickNumber}: ${teamName} takes a swing and calls it good process.`,
      `At ${pickNumber}, ${teamName} turns the dial slightly past “safe.”`,
    ],
  };

  // Category selection to avoid repetitive skeletons.
  const categories = Object.keys(hooks);
  const category = pickNonRepeating({ rng, items: categories, recent: recent.map(r => String(r).split('|')[0]), window: 2 }) || rng.pick(categories);
  const hook = pickNonRepeating({ rng, items: hooks[category], recent, window: 6 });
  const positionWinks = {
    QB: ["signal-caller", "QB", "quarterback"],
    RB: ["RB", "runner", "back"],
    WR: ["WR", "wideout", "receiver"],
    TE: ["TE", "tight end"],
    default: ["piece", "prospect"],
  };
  const wink = rng.pick(positionWinks[position] || positionWinks.default);
  const tag = rng.chance(0.12) ? ` (${wink} question answered.)` : '';
  // Store the category in the string so the generator can avoid repeating categories too.
  return `${category}|${(hook ?? rng.pick(hooks[category]))}${tag}`;
}

export function buildPickCoda({ rng }) {
  const codas = [
    "No fireworks — just good process.",
    "That’s the kind of pick you make and sleep fine.",
    "It’s not flashy, but it’s functional.",
    "Nothing cute. Just value.",
    "Clean pick. Next.",
  ];
  return rng.chance(0.22) ? rng.pick(codas) : '';
}

/**
 * Provide a styleToken string that nudges the model into more human rhythm.
 * We keep it short to avoid “prompty” effects.
 */
export function buildStyleToken({ rng }) {
  const tokens = [
    'Write like a human GM with personality; use one tasteful metaphor max.',
    'Keep it punchy; one short sentence is encouraged.',
    'Add a tiny bit of swagger, but stay grounded and specific.',
    'Mix cadence (short + medium sentences); avoid corporate tone.',
    'Be conversational; avoid generic draft clichés.',
  ];
  return rng.pick(tokens);
}

/**
 * Provide a reasonTemplate that encourages variety and avoids sameness.
 */
export function buildReasonTemplate({ rng, position, quality, recent = [], window = 6 }) {
  const lateRound = quality?.band === 'depth/upside' || quality?.band === 'dart throw' || quality?.band === 'rotation/bench' || quality?.band === 'solid contributor / rotation';
  const qualityLine = lateRound
    ? 'Draft-stage note: late-round talent. Use “bench/depth/stash/dart throw” language and avoid calling this a locked-in starter.'
    : 'Draft-stage note: earlier-round talent. It’s fine to discuss starter paths and weekly relevance.';

  // Big template library. These are "instructions" we embed in the prompt to force varied structure.
  // Keep them fantasy-focused and avoid NFL-coaching wording.
  const common = [
    // Classic 4-sentence arc
    `Structure: Sentence 1 mentions the player name and pick value; Sentence 2 explains roster fit; Sentence 3 sets a realistic outcome range (floor/ceiling); Sentence 4 is a minor risk. ${qualityLine}`,
    // Bullet-ish cadence (still sentences)
    `Write 4 short sentences. 1) player name + quick sell. 2) lineup impact. 3) roster construction angle (depth vs starter). 4) one concern. ${qualityLine}`,
    // “Why now” with alternatives
    `Open with a non-player-name sentence about the draft board/value, then mention the player name in sentence 2. Add a quick "why this over similar options" line (generic, no names). End with risk. ${qualityLine}`,
    // Risk-first twist
    `Start with player name and one tiny concern in the same sentence. Then 2-3 sentences of upside/fit/value that address the concern. ${qualityLine}`,
    // Value + roster slot
    `Start with player name; state whether this is a weekly starter bet, FLEX/streamer, or stash. Mention what position room it stabilizes. Close with one volatility note. ${qualityLine}`,
    // Comparison without “compared to other available” phrasing
    `Lead with player name. Include one sentence about what type of profile you are buying here (floor vs ceiling) without naming other players. Close with a "watch this" risk item. ${qualityLine}`,
    // Two-clause opener
    `Use a compound opening sentence that includes the player name and the reason in one breath. Then add 2-3 medium sentences with fit/value and a small risk. ${qualityLine}`,
    // Short-long-short cadence
    `Cadence: short sentence that mentions the player name. Then 1 longer sentence explaining roster fit/value. Then 1 short sentence with the risk/uncertainty. ${qualityLine}`,
    // “Stash” framing
    `If late draft: frame this as a stash/bench depth pick. Mention the pathway to becoming usable. Avoid declaring a guaranteed starter. End with risk. ${qualityLine}`,
    // “Weekly points” framing
    `Mention weekly scoring output explicitly (floor/ceiling) and how it changes lineup decisions. Keep it fantasy-only. End with one concern. ${qualityLine}`,
    // Chatty but structured
    `Write like a league chat message: one quick vibe sentence, then player name + fit sentence, then risk sentence. Keep it clean and fantasy-focused. ${qualityLine}`,
    // Two-scenario structure
    `Describe two quick scenarios: best-case and realistic-case, both tied to fantasy usage. Include player name early. Finish with a minor risk. ${qualityLine}`,
    // “Roster math”
    `Include one sentence that sounds like roster math (e.g., "this gives them a usable WR4" / "this keeps FLEX options open"). Mention player name. End with risk. ${qualityLine}`,
    // “Don’t overpromise”
    `Explicitly avoid overpromising: use phrases like "path to" / "could be" / "if it breaks right" especially late. Mention player name. End with risk. ${qualityLine}`,
    // “Reliability vs spike weeks”
    `Frame the pick as either weekly stability or spike-week hunting (choose one). Mention player name and team fit. End with a risk. ${qualityLine}`,
    // “Timeline”
    `Include a timeline note: early season vs later season value. Mention player name. End with a risk. ${qualityLine}`,
    // “Roster hedge”
    `Call this a roster hedge: depth now, upside later. Mention player name and what position it insures. End with a risk. ${qualityLine}`,
    // “If-then”
    `Use one if-then clause ("If X happens, then Y is the payoff") tied to fantasy usage. Mention player name. End with risk. ${qualityLine}`,

    // --- Expanded variety pack (aiming for ~100+ common templates) ---
    `Open with a one-line vibe about roster construction, then name the player and connect it to weekly points. End with a small risk. ${qualityLine}`,
    `Start with player name. Use a 2-sentence value case (why this pick matters), then 1 sentence on realistic usage, then 1 risk. ${qualityLine}`,
    `Write 3 sentences total: 1) player name + what the roster gains; 2) ceiling vs floor; 3) risk. ${qualityLine}`,
    `Write 5 sentences: quick opener, player name, roster fit, weekly upside, and a risk. Keep each sentence short. ${qualityLine}`,
    `Start with a short sentence that is NOT the player name. Sentence 2 names the player and makes the main point. Close with one risk. ${qualityLine}`,
    `Mention the player name in sentence 1 or 2. Include one sentence that uses "floor" and one that uses "ceiling". End with risk. ${qualityLine}`,
    `Do a "because" opener: start with player name, then "because" and the main fantasy reason. Add 1 support sentence and a risk. ${qualityLine}`,
    `Do a "so what" structure: player name + what it changes for the lineup this season. Add a range-of-outcomes sentence and a risk. ${qualityLine}`,
    `Use a "buying a profile" line (floor vs upside) in sentence 2. Mention player name early. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about roster flexibility (bench/FLEX/bye weeks). End with risk. ${qualityLine}`,
    `Lead with player name. Give one sentence on immediate utility and one on longer runway. End with risk. ${qualityLine}`,
    `Open with the pick value ("at this spot" / "at this part of the draft"), then name the player. End with one concern. ${qualityLine}`,
    `Write like a quick scouting note but fantasy-only: player name, what they score with, how you’d use them, and a risk. ${qualityLine}`,
    `Start with player name. Then write a sentence that begins with "The bet is…" about fantasy usage. End with risk. ${qualityLine}`,
    `Make the second sentence start with "If" and describe the payoff. Mention player name in sentence 1. End with risk. ${qualityLine}`,
    `Use a "two reasons" format: player name, then "Reason 1:" and "Reason 2:" but keep them as sentences. End with risk. ${qualityLine}`,
    `Start with player name and a calm statement. Sentence 2 adds a spicy upside. Sentence 3 is the risk. ${qualityLine}`,
    `Start with player name. Include a sentence that frames this as "depth that can start" or "starter bet" depending on qualityLine. End with risk. ${qualityLine}`,
    `Begin with a one-sentence roster problem, then give the solution: player name + role. Close with risk. ${qualityLine}`,
    `Write 4 sentences where each starts differently (avoid repeating "This" or the player name). Mention player name within first 2 sentences. End with risk. ${qualityLine}`,
    `Open with "In this league…" and describe positional scoring/lineup pressure. Then name the player and fit. End with risk. ${qualityLine}`,
    `Start with "The appeal:" then name the player. Add one sentence on weekly viability and one on risk. ${qualityLine}`,
    `Start with player name. Include one sentence that uses "usable" and one that uses "volatile" (or "variance"). End with risk. ${qualityLine}`,
    `Start with player name. Use a "good process" line about not reaching. Close with risk. ${qualityLine}`,
    `Start with a one-liner about value pockets in drafts, then name the player and tie to roster fit. End with risk. ${qualityLine}`,
    `Make sentence 1 a short hype check (keep it grounded). Sentence 2 names the player and why. Sentence 3 risk. ${qualityLine}`,
    `Mention player name early. Include one sentence that begins with "Realistically," and keeps expectations in check. End with risk. ${qualityLine}`,
    `Start with player name. Add one sentence about bye-week coverage and bench utility. End with risk. ${qualityLine}`,
    `Frame it as a "rotation piece" for fantasy: player name, when you’d start them, and what could go wrong. ${qualityLine}`,
    `Use a "floor first" approach in sentence 2, then a "ceiling" note in sentence 3. Mention player name early. End with risk. ${qualityLine}`,
    `Start with an honest downside clause ("There’s risk…"). Then name the player and explain why it’s still worth it. ${qualityLine}`,
    `Start with player name. Use one sentence that starts with "What you’re buying" and describe the fantasy outcome. End with risk. ${qualityLine}`,
    `Open with "This is a bet on…" then mention player name in sentence 2. Close with risk. ${qualityLine}`,
    `Start with player name. Sentence 2 begins with "Bottom line:" and states the lineup impact. Sentence 3 risk. ${qualityLine}`,
    `Write 3-4 sentences. Include exactly one semicolon for cadence. Mention player name early. End with risk. ${qualityLine}`,
    `Start with player name. Use a sentence that begins with "Even if" to describe the floor. End with risk. ${qualityLine}`,
    `Start with player name in sentence 1 or 2. Include a sentence that begins with "The path:" describing how they become startable. End with risk. ${qualityLine}`,
    `Write it as a quick "bench plan": player name, stash use, when to deploy, and risk. ${qualityLine}`,
    `Start with a short sentence ending in an em dash, then name the player and why. Close with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that explicitly says what this pick lets them do in later rounds. End with risk. ${qualityLine}`,
    `Open with a statement about positional room strength, then name the player as the fix. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about "value insulation" (floor) and one about upside. End with risk. ${qualityLine}`,
    `Start with player name. Use a "set-and-forget" vs "matchup" contrast (choose one). End with risk. ${qualityLine}`,
    `Make the last sentence a short risk sentence starting with "But…". Mention player name early. ${qualityLine}`,
    `Start with "At this point" and describe draft stage. Mention player name in sentence 2. End with risk. ${qualityLine}`,
    `Start with player name. Include a sentence that begins with "The case:" then a sentence that begins with "The worry:". ${qualityLine}`,
    `Start with player name. Add one sentence that uses "weekly" and another that uses "bench". End with risk. ${qualityLine}`,
    `Write one sentence that is only 6–10 words (not the player name). Mention player name within first 2 sentences. End with risk. ${qualityLine}`,
    `Start with player name. Use a "range" line: "anything from X to Y" in fantasy terms. End with risk. ${qualityLine}`,
    `Open with "Not flashy, but…" then name the player. End with risk. ${qualityLine}`,
    `Open with "This is how you win the margins" then mention player name. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about "starting requirements" (how many starters/FLEX) without league-specific numbers. End with risk. ${qualityLine}`,
    `Start with player name. Mention whether this is a "safe points" pick or a "spike-week" hunt. End with risk. ${qualityLine}`,
    `Start with a sentence about roster balance (QB/RB/WR/TE mix), then name the player and fit. End with risk. ${qualityLine}`,
    `Write 4 sentences and make sentence 3 a rhetorical question. Mention player name early. End with risk. ${qualityLine}`,
    `Start with player name. Add one sentence that begins with "Injuries happen," and connect to contingency value. End with risk. ${qualityLine}`,
    `Start with player name. Add a sentence that begins with "The underrated part:". End with risk. ${qualityLine}`,
    `Open with "If you’re building for depth" then name the player. End with risk. ${qualityLine}`,
    `Open with "If you’re building for upside" then name the player. End with risk. ${qualityLine}`,
    `Start with player name. Add one sentence about "trade value" or "market value" in fantasy terms. End with risk. ${qualityLine}`,
    `Start with player name. Make one sentence a quick advice line ("stash him" / "stream him" / "hold"), appropriate to draft stage. End with risk. ${qualityLine}`,
    `Start with player name. Use a sentence that begins with "The floor:" and another that begins with "The ceiling:". End with risk. ${qualityLine}`,
    `Start with player name. Use one sentence that begins with "If it breaks right," and describe best-case. End with risk. ${qualityLine}`,
    `Open with "The board says value" then mention player name and why. End with risk. ${qualityLine}`,
    `Open with "This pick is about optionality" then name the player. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about "lineup headache" reduction (fewer bad start/sit decisions). End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about "replacement level" at the position (fantasy-only). End with risk. ${qualityLine}`,
    `Start with a quick one-liner that begins with "Honestly," then mention player name in sentence 2. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that says what weeks they matter (early/mid/late season). End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that begins with "The realistic takeaway:". End with risk. ${qualityLine}`,
    `Start with a one-liner about patience, then name the player and stash value. End with risk. ${qualityLine}`,
    `Write 3 sentences. Sentence 2 must include the phrase "fantasy points". Mention player name in sentence 1 or 2. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about "bench churn" (who you can cut/upgrade) without naming another player. End with risk. ${qualityLine}`,
    `Start with player name. Include a sentence that begins with "The win condition:" describing the upside. End with risk. ${qualityLine}`,
    `Open with "Scoreboard over style" then mention player name and weekly value. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that treats this as a "portfolio" bet (diversifying outcomes). End with risk. ${qualityLine}`,
    `Open with "This is a roster tax" (depth you have to pay) then name the player. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that uses "stream" or "streaming" when appropriate. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that begins with "In the meantime," and describes bench usage. End with risk. ${qualityLine}`,
    `Open with "The safe play is…" then name the player. End with risk. ${qualityLine}`,
    `Open with "The fun play is…" then name the player. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that ends with an exclamation point (only one). End with risk. ${qualityLine}`,
    `Start with player name. Put the risk sentence in the middle (sentence 2 or 3) instead of the end, then close with a calm summary. ${qualityLine}`,
    `Start with player name. Write one sentence in parentheses as a quick aside. End with risk. ${qualityLine}`,
    `Start with a short sentence that uses "value". Name the player in sentence 2. End with risk. ${qualityLine}`,
    `Start with player name. Make sentence 2 start with "Because" (capital B). End with risk. ${qualityLine}`,
    `Start with player name. Make sentence 2 start with "And" for a chatty tone. End with risk. ${qualityLine}`,
    `Start with player name. Make sentence 2 start with "Also," and add a roster fit note. End with risk. ${qualityLine}`,
    `Start with player name. Make sentence 2 start with "But" and then defend the pick. End with risk. ${qualityLine}`,
    `Start with player name. Use one sentence that begins with "This is less about" and clarify the actual fantasy bet. End with risk. ${qualityLine}`,
    `Open with a line about team identity (fantasy roster build), then name the player and fit. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about "weekly start rate" (how often you’d actually start them). End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that begins with "The sneaky part:". End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that begins with "The boring part:" (and make it a compliment). End with risk. ${qualityLine}`,
    `Open with "Depth is a weapon" then name the player and why. End with risk. ${qualityLine}`,
    `Open with "Upside is a weapon" then name the player and why. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that uses "stash" and one that uses "FLEX" (if applicable). End with risk. ${qualityLine}`,
    `Start with player name. Add a sentence that begins with "Best case:" and another that begins with "Most likely:". End with risk. ${qualityLine}`,
    `Start with a one-line hedge about uncertainty, then name the player and the payoff. End with risk. ${qualityLine}`,
    `Start with player name. Include a "what changes if they hit" line. End with risk. ${qualityLine}`,
    `Start with player name. Include a sentence that begins with "Even in a bad outcome," describing the floor. End with risk. ${qualityLine}`,
    `Open with "This is the kind of pick" then mention player name in sentence 2. End with risk. ${qualityLine}`,
    `Start with player name. Make one sentence a direct recommendation ("startable"/"stash") that matches draft stage. End with risk. ${qualityLine}`,
    `Start with player name. Use a sentence that begins with "You’re fine with" describing what you accept (volatility/bench). End with risk. ${qualityLine}`,
    `Start with player name. Use a sentence that begins with "You’re hoping for" describing the upside. End with risk. ${qualityLine}`,
    `Open with "Roster spot matters" then name the player and why they’re worth it. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about "week-to-week" decision-making. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about "points per roster slot" (value density). End with risk. ${qualityLine}`,
    `Start with player name. Keep it to exactly 3 sentences. End with risk. ${qualityLine}`,
    `Start with player name. Keep it to exactly 4 sentences. End with risk. ${qualityLine}`,
    `Open with "Process over panic" then name the player and tie to value. End with risk. ${qualityLine}`,
    `Open with "No panic trade-ups" then mention player name and why it’s value. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about "bench depth that keeps you from overbidding" (fantasy-only). End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about "injury insurance" without naming any player. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about "bye week" relief. End with risk. ${qualityLine}`,
    `Start with player name. Use a sentence that begins with "The short version:" then summarize. End with risk. ${qualityLine}`,
    `Start with player name. Use a sentence that begins with "The long version:" then one supporting detail. End with risk. ${qualityLine}`,
    `Open with a one-liner about not chasing highlights, then name the player and why. End with risk. ${qualityLine}`,
    `Start with player name. Make one sentence start with "Either way" to emphasize floor. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that begins with "By November," describing possible value. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that begins with "Week 1" and keep it realistic. End with risk. ${qualityLine}`,
    `Open with "This is a stash with benefits" then mention player name. End with risk. ${qualityLine}`,
    `Open with "This is a bet with guardrails" then mention player name. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that begins with "The upside is obvious:" and keep it short. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that begins with "The downside is also obvious:" and keep it short. End with risk. ${qualityLine}`,
    `Open with "Drafting is probability" then name the player and talk outcomes. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about "start percentage" (how often they crack your lineup). End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence about "waiver replacement" cost (fantasy-only). End with risk. ${qualityLine}`,
    `Open with "You don’t need perfection here" then mention player name and role. End with risk. ${qualityLine}`,
    `Start with player name. Include a sentence that begins with "The bet isn’t" and clarify what you’re actually betting on. End with risk. ${qualityLine}`,
    `Start with player name. End the second sentence with a short, punchy fragment. End with risk. ${qualityLine}`,
    `Open with a one-sentence "draft room" observation, then name the player and fit. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that begins with "In a perfect world," and keep it fantasy-focused. End with risk. ${qualityLine}`,
    `Start with player name. Include one sentence that begins with "In a messy world," and keep it fantasy-focused. End with risk. ${qualityLine}`,
    `Open with "This is less sexy than it sounds" then name the player and why it works. End with risk. ${qualityLine}`,
    `Start with player name. Include a sentence that begins with "The hidden value:". End with risk. ${qualityLine}`,
    `Start with player name. Include a sentence that begins with "The obvious value:". End with risk. ${qualityLine}`,
    `Open with "Drafts are won in the middle" then mention player name and value. End with risk. ${qualityLine}`,
    `Open with "This is the glue pick" then mention player name and roster role. End with risk. ${qualityLine}`,
    `Start with player name. Use one sentence that begins with "Call it" (e.g., "Call it a stash"). End with risk. ${qualityLine}`,
    `Start with player name. Use one sentence that begins with "Consider" (e.g., "Consider the floor"). End with risk. ${qualityLine}`,
    `Start with player name. Use one sentence that begins with "Picture" (fantasy lineup scenario). End with risk. ${qualityLine}`,
    `Open with "We’re chasing points" then mention player name and the type of points (floor/ceiling). End with risk. ${qualityLine}`,
    `Start with player name. Keep the tone dry and matter-of-fact, then end with a tiny joke in the last clause. ${qualityLine}`,
    `Start with player name. Use a sentence that begins with "This doesn’t have to be" to keep expectations realistic. End with risk. ${qualityLine}`,
    `Start with player name. Include a sentence that begins with "If you squint," but keep it grounded. End with risk. ${qualityLine}`,
    `Start with player name. Include a sentence that begins with "The simplest explanation:" then summarize. End with risk. ${qualityLine}`,
    `Start with a short sentence about avoiding tilt, then mention player name and why it’s steady. End with risk. ${qualityLine}`,
    `Open with "This is a bench win" then mention player name and roster fit. End with risk. ${qualityLine}`,
    `Open with "This is a lineup win" then mention player name and weekly role. End with risk. ${qualityLine}`,
    `Start with player name. Use one sentence that begins with "The median outcome:" and keep it realistic. End with risk. ${qualityLine}`,
    `Start with player name. Use one sentence that begins with "The 90th percentile outcome:" and keep it realistic. End with risk. ${qualityLine}`,
    `Start with player name. Use one sentence that begins with "The 10th percentile outcome:" and keep it realistic. End with risk. ${qualityLine}`,
  ];

  const byPos = {
    QB: [
      `QB: Start with player name; tie to weekly stability and replacement-level QB scoring; end with one volatility or learning-curve concern. ${qualityLine}`,
      `QB: Open with the roster problem ("QB2" / "streaming") then name the player. Mention floor/ceiling weeks. End with risk. ${qualityLine}`,
      `QB: Mention the value of starts in this league (weeks you can confidently plug in). Include one best-case scenario. End with risk. ${qualityLine}`,
      `QB: Write 3 tight sentences: player name + role path; lineup impact; risk (injury/volatility/uncertainty). ${qualityLine}`,
      `QB: Late draft framing: stash QB with a path to spot starts; avoid saying locked starter. End with risk. ${qualityLine}`,
      `QB: Start with a value line about stabilizing the QB room, then name the player. Mention weekly start/sit stress reduction. End with risk. ${qualityLine}`,
      `QB: Mention player name early. Add one sentence about spike weeks vs dud weeks. End with risk. ${qualityLine}`,
      `QB: Use a "floor" sentence, then a "ceiling" sentence, both in fantasy terms. Mention player name within first 2 sentences. End with risk. ${qualityLine}`,
    ],
    RB: [
      `RB: Start with player name; talk about touch/usage *opportunity* in general terms; tie to weekly floor/ceiling; end with a workload/role caveat. ${qualityLine}`,
      `RB: Open with "bench RBs win weeks" vibe, then name the player. Mention contingency value and spike-week potential. End with risk. ${qualityLine}`,
      `RB: Mention whether this is a PPR helper, goal-line bet (fantasy-only), or pure depth. Include one downside. ${qualityLine}`,
      `RB: Frame as insurance: who it protects (RB room / FLEX). Mention player name early. End with injury/role volatility concern. ${qualityLine}`,
      `RB: Late draft: explicitly call it a dart throw with a narrow but real path to usability. End with risk. ${qualityLine}`,
      `RB: Mention player name early. Include one sentence about startable weeks being matchup/injury-driven. End with risk. ${qualityLine}`,
      `RB: Start with a roster math line ("RB4 with upside" / "FLEX contingency"). Mention player name. End with risk. ${qualityLine}`,
      `RB: Use a short 3-sentence arc: player name + role, payoff scenario, risk. ${qualityLine}`,
    ],
    WR: [
      `WR: Start with player name; tie to target *opportunity* and weekly scoring upside; end with one volatility or refinement concern. ${qualityLine}`,
      `WR: Open with what the roster needs (WR depth / FLEX points), then introduce the player name. Mention floor vs spike weeks. End with risk. ${qualityLine}`,
      `WR: Use 4 micro-sentences: player name; lineup role (WR4/WR5/FLEX); what type of weeks they can create; one concern. ${qualityLine}`,
      `WR: Describe best-case as "usable weekly" and realistic-case as "matchup-driven." Mention player name early. End with risk. ${qualityLine}`,
      `WR: Late draft: call it a bench stash with upside, not a starter. Mention a pathway to relevance. End with risk. ${qualityLine}`,
      `WR: Mention player name early. Include one sentence about consistency vs volatility (choose one). End with risk. ${qualityLine}`,
      `WR: Start with a lineup pressure sentence (FLEX spots / bye weeks), then name the player. End with risk. ${qualityLine}`,
      `WR: Use "floor" and "ceiling" explicitly, but keep it grounded. Mention player name within first 2 sentences. End with risk. ${qualityLine}`,
    ],
    TE: [
      `TE: Start with player name; tie to weekly TE scoring landscape; mention how they could become startable; end with usage volatility note. ${qualityLine}`,
      `TE: Open with "TE is a weekly headache" framing, then name the player. Mention startable weeks and patience. End with risk. ${qualityLine}`,
      `TE: Mention the payoff if they become a top-12 weekly option; keep it realistic. Include player name early. End with risk. ${qualityLine}`,
      `TE: 3 sentences: player name + stash value; what it does for roster flexibility; risk/uncertainty. ${qualityLine}`,
      `TE: Late draft: explicitly a dart throw TE with long runway; avoid calling it immediate starter. End with risk. ${qualityLine}`,
      `TE: Mention player name early. Frame it as reducing the "TE roulette" problem. End with risk. ${qualityLine}`,
      `TE: Start with a roster flexibility line (streaming vs holding). Mention player name within first 2 sentences. End with risk. ${qualityLine}`,
      `TE: Use a two-scenario structure: best-case weekly startable, realistic-case bench. Mention player name. End with risk. ${qualityLine}`,
    ],
    FLEX: [
      `FLEX: Mention player name; describe how they compete for weekly FLEX points; keep it realistic; end with a risk. ${qualityLine}`,
      `FLEX: One sentence each for: fit, weekly usability, upside, and risk. Mention player name in the first two sentences. ${qualityLine}`,
    ],
  };

  const pool = (byPos[position] || []).concat(common);
  return pickNonRepeating({ rng, items: pool, recent, window }) ?? rng.pick(pool);
}
