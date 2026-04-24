import { promises as fs } from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import {
  getMediaFeedSyncState,
  updateMediaFeedSyncState,
  upsertMediaFeedItem,
} from '@/lib/db-helpers';
import { buildPlayerPoolWithNews } from '@/utils/playerPoolUtils';
import { buildStyleToken, createRng } from '@/utils/mockDraftVoice';
import {
  buildTeamNeeds,
  formatTeamNeedsForPrompt,
  parseBBBContractsCsv,
  pickWindowScore,
  shouldApplyValueOverride,
} from '@/utils/teamNeedsUtils';

const USER_ID = '456973480269705216';
const FANS_FILE_PATH = path.join(process.cwd(), 'src/app/api/ai/fans.txt');
const JOURNALISTS_FILE_PATH = path.join(process.cwd(), 'src/app/api/ai/journalists.txt');
const CONTRACTS_CSV_URL = 'https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv';
const OPENAI_MODEL = 'gpt-4.1-nano';

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function draftFlexForPick(pickIndex) {
  const pickNumber = Math.max(1, Number(pickIndex) + 1 || 1);
  if (pickNumber <= 3) return 0;
  if (pickNumber >= 25) return 1;
  return (pickNumber - 3) / 22;
}

function pickStatusPriority(status) {
  const value = String(status || '').toLowerCase();
  const priorities = {
    drafting: 0,
    in_progress: 1,
    paused: 2,
    pre_draft: 3,
    upcoming: 4,
  };
  return priorities[value] ?? 99;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed request ${response.status}: ${url}`);
  }
  return response.json();
}

async function readCharacters(filePath, role) {
  const text = await fs.readFile(filePath, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, '').trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('**') && !line.startsWith('#'))
    .map((line) => line.replace(/^\s*[-*]\s*/, '').replace(/^\s*\d+\.\s*/, '').trim())
    .map((line) => {
      const match = line.match(/^(.+?)\s*[—–-]\s*(.+)$/);
      if (!match) return null;
      return {
        name: match[1].trim(),
        persona: match[2].trim(),
        role,
      };
    })
    .filter(Boolean);
}

function shuffleWithRng(items, rng) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.int(0, index);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

async function loadCharactersForPick(seed, reactionCount) {
  const [fans, journalists] = await Promise.all([
    readCharacters(FANS_FILE_PATH, 'fan'),
    readCharacters(JOURNALISTS_FILE_PATH, 'journalist'),
  ]);

  const rng = createRng({ seed, salt: 'rookie-draft-feed-characters' });
  const pool = shuffleWithRng([...journalists, ...fans], rng);
  return pool.slice(0, Math.max(1, reactionCount));
}

async function resolveBBBLeagueId() {
  const state = await fetchJson('https://api.sleeper.app/v1/state/nfl');
  const currentSeason = state?.season;
  if (!currentSeason) {
    throw new Error('Could not resolve NFL season');
  }

  const seasons = [String(currentSeason), String(Number(currentSeason) - 1)];
  for (const season of seasons) {
    const leagues = await fetchJson(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${season}`);
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

function pickActiveLinearDraft(drafts) {
  return (Array.isArray(drafts) ? drafts : [])
    .filter((draft) => String(draft?.type || '').toLowerCase() === 'linear')
    .filter((draft) => String(draft?.status || '').toLowerCase() !== 'complete')
    .sort((left, right) => {
      const priority = pickStatusPriority(left?.status) - pickStatusPriority(right?.status);
      if (priority !== 0) return priority;
      return Number(right?.start_time || 0) - Number(left?.start_time || 0);
    })[0] || null;
}

function buildRosterMaps(rosters, users) {
  const usersById = new Map((Array.isArray(users) ? users : []).map((user) => [String(user.user_id), user]));
  const rosterById = new Map();
  const rosterByOwnerId = new Map();

  for (const roster of Array.isArray(rosters) ? rosters : []) {
    const ownerId = String(roster?.owner_id || '');
    const rosterId = Number(roster?.roster_id);
    const user = usersById.get(ownerId);
    const teamName = user?.display_name || user?.team_name || `Team ${rosterId}`;
    const team = {
      rosterId,
      ownerId,
      teamName,
    };
    rosterById.set(rosterId, team);
    if (ownerId) {
      rosterByOwnerId.set(ownerId, team);
    }
  }

  return { rosterById, rosterByOwnerId };
}

function resolvePickTeam(pick, rosterMaps) {
  const ownerRosterId = parseNumber(pick?.owner_id);
  if (ownerRosterId != null && rosterMaps.rosterById.has(ownerRosterId)) {
    return rosterMaps.rosterById.get(ownerRosterId);
  }

  const rosterId = parseNumber(pick?.roster_id);
  if (rosterId != null && rosterMaps.rosterById.has(rosterId)) {
    return rosterMaps.rosterById.get(rosterId);
  }

  const pickedBy = String(pick?.picked_by || '');
  if (pickedBy && rosterMaps.rosterByOwnerId.has(pickedBy)) {
    return rosterMaps.rosterByOwnerId.get(pickedBy);
  }

  return {
    rosterId: ownerRosterId ?? rosterId ?? null,
    ownerId: pickedBy || null,
    teamName: 'Unknown Team',
  };
}

function resolvePickedPlayerName(pick) {
  const metadata = pick?.metadata || {};
  const fromFields = [metadata.first_name, metadata.last_name].filter(Boolean).join(' ').trim();
  return fromFields || metadata.player_name || metadata.name || pick?.player_name || '';
}

function resolvePickedPlayerPosition(pick, poolPlayer) {
  return String(
    pick?.metadata?.position ||
    pick?.position ||
    poolPlayer?.position ||
    'R'
  ).toUpperCase();
}

function buildBoardBeforePick(pool, priorPicks) {
  const draftedNames = new Set(
    priorPicks
      .map((pick) => normalizeName(resolvePickedPlayerName(pick)))
      .filter(Boolean)
  );

  return pool.filter((player) => !draftedNames.has(normalizeName(player.name)));
}

function getNeedWeight(teamNeeds, teamName, position) {
  const teamRow = teamNeeds?.teams?.find((entry) => entry.teamName === teamName);
  const posRow = teamRow?.positions?.[String(position || '').toUpperCase()];
  return {
    teamRow,
    value: Number(posRow?.needWeight) || 1,
  };
}

function buildValueSummary({ teamNeeds, teamName, pickedPlayer, boardBeforePick, boardAfterPick, pickNo }) {
  const fallback = {
    tone: 'mixed',
    summary: 'The board was messy enough that this lands as a fit-driven pick more than a pure value dunk or reach.',
    alternatives: boardAfterPick.slice(0, 3).map((player) => player.name),
  };

  if (!pickedPlayer || boardBeforePick.length === 0) {
    return fallback;
  }

  const draftFlex = draftFlexForPick((Number(pickNo) || 1) - 1);
  const window = boardBeforePick.slice(0, 8);
  const windowValues = window.map((player) => Number(player.value) || 0);
  const windowMaxValue = windowValues.length ? Math.max(...windowValues) : 0;
  const windowMinValue = windowValues.length ? Math.min(...windowValues) : 0;
  const topValueCandidate = window[0] || pickedPlayer;
  const { teamRow, value: needWeight } = getNeedWeight(teamNeeds, teamName, pickedPlayer.position);

  const scoredWindow = window
    .map((candidate) => ({
      candidate,
      score: pickWindowScore({
        candidate,
        needWeight: Number(teamRow?.positions?.[candidate.position]?.needWeight) || 1,
        windowMaxValue,
        windowMinValue,
        draftFlex,
      }),
    }))
    .sort((left, right) => right.score - left.score);

  const bestScoreCandidate = scoredWindow[0]?.candidate || topValueCandidate;
  const negative = shouldApplyValueOverride({
    candidate: pickedPlayer,
    topValueCandidate,
    needWeight,
    draftFlex,
  });
  const positive = normalizeName(bestScoreCandidate?.name) === normalizeName(pickedPlayer.name)
    || normalizeName(topValueCandidate?.name) === normalizeName(pickedPlayer.name);

  if (positive) {
    return {
      tone: 'positive',
      summary: `${pickedPlayer.name} was right in the best-value pocket, so this reads as the board cooperating with the roster fit instead of forcing a reach.`,
      alternatives: boardAfterPick.slice(0, 3).map((player) => player.name),
    };
  }

  if (negative) {
    return {
      tone: 'negative',
      summary: `${pickedPlayer.name} fits a need, but the board still had stronger value sitting there, so the reaction should treat this as a reach relative to the remaining options.`,
      alternatives: boardAfterPick.slice(0, 3).map((player) => player.name),
    };
  }

  return {
    tone: 'mixed',
    summary: `${pickedPlayer.name} makes enough roster sense to defend, but there were still comparable alternatives available, so the reaction should land in the middle instead of all praise or all panic.`,
    alternatives: boardAfterPick.slice(0, 3).map((player) => player.name),
  };
}

function buildPickNote({ pick, pickedPlayerName, valueTone }) {
  const round = Number(pick?.round) || 1;
  const slot = Number(pick?.draft_slot) || null;
  const pickNo = Number(pick?.pick_no) || null;
  const slotText = slot != null ? `${round}.${String(slot).padStart(2, '0')}` : `Round ${round}`;
  return `${slotText} • ${pickedPlayerName || 'Unknown Player'} • ${valueTone}` + (pickNo ? ` • Pick ${pickNo}` : '');
}

async function generateDraftReactions({
  draftId,
  pick,
  team,
  pickedPlayer,
  boardAfterPick,
  teamNeedsText,
  valueSummary,
}) {
  const pickNo = Number(pick?.pick_no) || 0;
  const reactionCount = Number(pick?.round) === 1 ? 3 : 1;
  const seed = `${draftId}|${pickNo}|${team.teamName}|${pickedPlayer?.name || resolvePickedPlayerName(pick)}`;
  const rng = createRng({ seed, salt: 'rookie-draft-feed' });
  const characters = await loadCharactersForPick(seed, reactionCount);
  const styleToken = buildStyleToken({ rng });
  const availableNames = boardAfterPick.slice(0, 5).map((player) => `${player.name} (${player.position})`).join(', ');
  const pickedPlayerName = pickedPlayer?.name || resolvePickedPlayerName(pick) || 'Unknown Player';
  const pickedPlayerPosition = resolvePickedPlayerPosition(pick, pickedPlayer);

  if (!process.env.OPENAI_API_KEY) {
    return characters.map((character) => ({
      ...character,
      reaction: `${team.teamName} taking ${pickedPlayerName} is a ${valueSummary.tone} board call, but the fit still comes down to whether that ${pickedPlayerPosition} room needed another fantasy piece more than the names still sitting there.`,
    }));
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `You are a fantasy football media simulator for the BBB league bAnker feed.
Return valid JSON only in the shape {"notes":[...]}. The notes array must contain exactly ${characters.length} objects, one per character provided.
Each object must include name, role, persona, and reaction.
Each reaction must be 1-2 sentences, sound like the listed character, and explicitly mention ${team.teamName} and ${pickedPlayerName}.
Each reaction must include two ideas: roster construction fit, and whether the value against the remaining board is positive, negative, or mixed.
Do not write about real NFL coaching or scheme. Stay fantasy-focused: weekly usability, roster build, depth, floor, ceiling, stash value, and reach/value language.
Use this board verdict as a hard anchor: ${valueSummary.tone.toUpperCase()}.
Style note: ${styleToken}`;

  const userPrompt = `Pick context:
- Draft: ${draftId}
- Pick number: ${pickNo || 'unknown'}
- Round: ${Number(pick?.round) || 1}
- Team: ${team.teamName}
- Player: ${pickedPlayerName}
- Position: ${pickedPlayerPosition}
- Board verdict: ${valueSummary.summary}
- Best remaining alternatives after the pick: ${availableNames || 'No clear alternatives available'}

Roster context:
${teamNeedsText || 'Roster context unavailable. Keep the fit language broad but still fantasy-focused.'}

Characters to use:
${characters.map((character) => `- ${character.name} (${character.role}) — ${character.persona}`).join('\n')}

Return JSON only.`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices?.[0]?.message?.content || '';
    try {
      const parsed = JSON.parse(content);
      const notes = Array.isArray(parsed?.notes) ? parsed.notes : [];
      const normalized = notes
        .filter((note) => note && typeof note === 'object')
        .map((note, index) => ({
          name: note.name || characters[index]?.name || 'Unknown',
          role: note.role || characters[index]?.role || 'fan',
          persona: note.persona || characters[index]?.persona || '',
          reaction: String(note.reaction || '').trim(),
        }))
        .filter((note) => note.reaction);

      if (normalized.length === characters.length) {
        return normalized;
      }
    } catch {
      // Retry with the same prompt. The caller falls back if parsing still fails.
    }
  }

  return characters.map((character) => ({
    ...character,
    reaction: `${team.teamName} taking ${pickedPlayerName} is a ${valueSummary.tone} board call, but the fit still comes down to how much that ${pickedPlayerPosition} room needed another real fantasy option.`,
  }));
}

async function loadTeamNeedsContext(rosters, users) {
  const csvText = await fetch(CONTRACTS_CSV_URL, { cache: 'no-store' }).then((response) => response.text());
  const activeContracts = parseBBBContractsCsv(csvText);
  const teamNames = (Array.isArray(rosters) ? rosters : []).map((roster) => {
    const user = (Array.isArray(users) ? users : []).find((entry) => entry.user_id === roster.owner_id);
    return user?.display_name || user?.team_name || `Team ${roster.roster_id}`;
  });
  return buildTeamNeeds({ activeContracts, teamNames });
}

function normalizePickTimestamp(value) {
  if (value == null || value === '') {
    return new Date();
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function syncActiveRookieDraftFeed() {
  const leagueId = await resolveBBBLeagueId();
  const [drafts, rosters, users] = await Promise.all([
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/drafts`),
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/users`),
  ]);

  const activeDraft = pickActiveLinearDraft(drafts);
  if (!activeDraft) {
    return { ok: true, status: 'no-active-linear-draft', created: 0, inspected: 0 };
  }

  const [playerPool, teamNeeds] = await Promise.all([
    buildPlayerPoolWithNews(),
    loadTeamNeedsContext(rosters, users),
  ]);

  const picks = await fetchJson(`https://api.sleeper.app/v1/draft/${activeDraft.draft_id}/picks`);
  const sortedPicks = (Array.isArray(picks) ? picks : [])
    .slice()
    .sort((left, right) => Number(left?.pick_no || 0) - Number(right?.pick_no || 0));
  const currentMaxPickNo = sortedPicks.length ? Number(sortedPicks[sortedPicks.length - 1]?.pick_no || 0) : 0;
  const syncKey = `rookie-draft:${activeDraft.draft_id}`;
  const syncStateResult = await getMediaFeedSyncState(syncKey);
  const syncState = syncStateResult?.success === false ? null : syncStateResult?.state;
  const isFirstSync = !syncState;
  const lastSeenPickNo = Number(syncState?.lastSeenPickNo || 0);
  const unseenPicks = sortedPicks.filter((pick) => Number(pick?.pick_no || 0) > lastSeenPickNo);
  const rosterMaps = buildRosterMaps(rosters, users);
  let created = 0;

  for (const pick of unseenPicks) {
    const pickNo = Number(pick?.pick_no || 0);
    const boardBeforePick = buildBoardBeforePick(playerPool, sortedPicks.filter((entry) => Number(entry?.pick_no || 0) < pickNo));
    const pickedPlayerName = resolvePickedPlayerName(pick);
    const pickedPlayer = boardBeforePick.find((player) => normalizeName(player.name) === normalizeName(pickedPlayerName))
      || playerPool.find((player) => normalizeName(player.name) === normalizeName(pickedPlayerName))
      || null;
    const boardAfterPick = boardBeforePick.filter((player) => normalizeName(player.name) !== normalizeName(pickedPlayerName));
    const team = resolvePickTeam(pick, rosterMaps);
    const valueSummary = buildValueSummary({
      teamNeeds,
      teamName: team.teamName,
      pickedPlayer,
      boardBeforePick,
      boardAfterPick,
      pickNo,
    });
    const teamNeedsText = formatTeamNeedsForPrompt(teamNeeds, team.teamName);
    const aiNotes = await generateDraftReactions({
      draftId: activeDraft.draft_id,
      pick,
      team,
      pickedPlayer,
      boardAfterPick,
      teamNeedsText,
      valueSummary,
    });

    const timestampSource = pick?.picked_at || pick?.picked_at_ms || pick?.created || null;
    const timestamp = normalizePickTimestamp(timestampSource);
    const item = {
      source: 'rookie-draft',
      sourceKey: `rookie-draft:${activeDraft.draft_id}:${pickNo}`,
      leagueId,
      draftId: activeDraft.draft_id,
      draftType: activeDraft.type,
      pickNo,
      round: Number(pick?.round) || 1,
      rosterId: team.rosterId,
      userId: team.ownerId,
      team: team.teamName,
      playerId: String(pick?.player_id || pickedPlayer?.id || '').trim() || null,
      playerName: pickedPlayerName || pickedPlayer?.name || 'Unknown Player',
      notes: buildPickNote({ pick, pickedPlayerName, valueTone: valueSummary.tone }),
      timestamp,
      ai_notes: aiNotes,
      meta: {
        valueTone: valueSummary.tone,
        alternatives: valueSummary.alternatives,
      },
    };

    const result = await upsertMediaFeedItem(item);
    if (result?.inserted) {
      created += 1;
    }
  }

  await updateMediaFeedSyncState(syncKey, {
    draftId: activeDraft.draft_id,
    leagueId,
    lastSeenPickNo: currentMaxPickNo,
    initializedWithBackfill: true,
  });

  return {
    ok: true,
    status: isFirstSync
      ? (unseenPicks.length > 0 ? 'backfilled-existing-picks' : 'initialized-empty-draft')
      : (unseenPicks.length > 0 ? 'processed-new-picks' : 'up-to-date'),
    created,
    inspected: unseenPicks.length,
    draftId: activeDraft.draft_id,
    lastSeenPickNo: currentMaxPickNo,
    backfilledPickCount: isFirstSync ? unseenPicks.length : 0,
  };
}