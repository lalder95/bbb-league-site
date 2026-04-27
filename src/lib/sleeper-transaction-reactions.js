import { promises as fs } from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import { createRng } from '@/utils/mockDraftVoice';

const FANS_FILE_PATH = path.join(process.cwd(), 'src/app/api/ai/fans.txt');
const JOURNALISTS_FILE_PATH = path.join(process.cwd(), 'src/app/api/ai/journalists.txt');
const OPENAI_MODEL = 'gpt-4.1-nano';

function normalizeCharacterLine(line, role) {
  const match = line.match(/^(.+?)\s*[—–-]\s*(.+)$/);
  if (!match) return null;
  return {
    name: match[1].trim(),
    persona: match[2].trim(),
    role,
  };
}

async function readCharacters(filePath, role) {
  const text = await fs.readFile(filePath, 'utf8').catch(() => '');
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, '').trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('**') && !line.startsWith('#'))
    .map((line) => line.replace(/^\s*[-*]\s*/, '').replace(/^\s*\d+\.\s*/, '').trim())
    .map((line) => normalizeCharacterLine(line, role))
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

async function loadCharacters(seed, reactionCount) {
  const [fans, journalists] = await Promise.all([
    readCharacters(FANS_FILE_PATH, 'fan'),
    readCharacters(JOURNALISTS_FILE_PATH, 'journalist'),
  ]);

  const pool = [...journalists, ...fans];
  if (pool.length === 0) {
    return [{ name: 'bAnker', role: 'journalist', persona: 'league desk' }];
  }

  const rng = createRng({ seed, salt: 'sleeper-transaction-reactions' });
  return shuffleWithRng(pool, rng).slice(0, Math.max(1, reactionCount));
}

function buildFallbackTradeReaction({ trade, index }) {
  const teams = trade.teams.map((team) => team.owner_name).join(' and ');
  const firstSummary = trade.teamSummaries?.[0];
  const secondSummary = trade.teamSummaries?.[1];
  const firstReceive = firstSummary?.receives?.[0] || trade.players[0]?.name || trade.picks[0]?.label || 'the deal';
  const secondReceive = secondSummary?.receives?.[0] || 'future value';
  const biggestCapSwing = [...(trade.capSummaries || [])]
    .filter((team) => Number.isFinite(team?.delta?.curYearRemaining))
    .sort((left, right) => Math.abs(right.delta.curYearRemaining) - Math.abs(left.delta.curYearRemaining))[0];
  const capLine = biggestCapSwing && Number.isFinite(biggestCapSwing.delta.curYearRemaining)
    ? ` ${biggestCapSwing.owner_name} ${biggestCapSwing.delta.curYearRemaining >= 0 ? 'opens up' : 'loses'} $${Math.abs(biggestCapSwing.delta.curYearRemaining)} of current-year room in the process, so the cap angle matters too.`
    : '';
  const lines = [
    `${firstSummary?.owner_name || teams} lands ${firstReceive} while ${secondSummary?.owner_name || 'the other side'} gets ${secondReceive}, and this is the kind of dynasty swing that is going to get graded for months.${capLine}`,
    `${teams} finally made a move, and the balance between ${firstSummary?.owner_name || 'one side'} getting ${firstReceive} and ${secondSummary?.owner_name || 'the other side'} getting ${secondReceive} is messy enough that nobody is leaving the group chat neutral.${capLine}`,
    `${teams} got a trade over the line, and whether ${firstSummary?.owner_name || 'one side'} winning ${firstReceive} or ${secondSummary?.owner_name || 'the other side'} winning ${secondReceive} matters more comes down to how much you trust the incoming value.${capLine}`,
  ];
  return lines[index % lines.length];
}

function buildFallbackCutReaction({ cut }) {
  return `${cut.teamName} cutting ${cut.playerName} with a ${cut.ktcValue} KTC tag is the sort of move that tells you cap pressure or roster churn just won the argument over raw asset value.`;
}

function buildTradePrompt(trade, reactionCount) {
  const teamNames = trade.teams.map((team) => team.owner_name).join(', ');
  const playersText = trade.players.length > 0
    ? trade.players.map((player) => `${player.name} (${player.from_owner_name} -> ${player.to_owner_name})`).join('; ')
    : 'No player movement recorded';
  const picksText = trade.picks.length > 0
    ? trade.picks.map((pick) => `${pick.label} (${pick.from_owner_name} -> ${pick.to_owner_name})`).join('; ')
    : 'No draft picks moved';
  const teamFlowText = Array.isArray(trade.teamSummaries) && trade.teamSummaries.length > 0
    ? trade.teamSummaries.map((team) => {
      const receives = team.receives.length > 0 ? team.receives.join(', ') : 'nothing explicit';
      const sends = team.sends.length > 0 ? team.sends.join(', ') : 'nothing explicit';
      return `${team.owner_name} receives: ${receives} | sends: ${sends}`;
    }).join('\n')
    : 'No per-team summary available';
  const capContextText = Array.isArray(trade.capSummaries) && trade.capSummaries.length > 0
    ? trade.capSummaries.map((team) => {
      const beforeCurrent = Number.isFinite(team.before?.curYearRemaining) ? `$${team.before.curYearRemaining}` : 'unknown';
      const afterCurrent = Number.isFinite(team.after?.curYearRemaining) ? `$${team.after.curYearRemaining}` : 'unknown';
      const beforeNext = Number.isFinite(team.before?.year2Remaining) ? `$${team.before.year2Remaining}` : 'unknown';
      const afterNext = Number.isFinite(team.after?.year2Remaining) ? `$${team.after.year2Remaining}` : 'unknown';
      const currentDelta = Number.isFinite(team.delta?.curYearRemaining) ? `${team.delta.curYearRemaining >= 0 ? '+' : ''}$${team.delta.curYearRemaining}` : 'unknown';
      const nextDelta = Number.isFinite(team.delta?.year2Remaining) ? `${team.delta.year2Remaining >= 0 ? '+' : ''}$${team.delta.year2Remaining}` : 'unknown';
      return `${team.owner_name}: current cap remaining before ${beforeCurrent}, after ${afterCurrent} (${currentDelta}); next-year cap before ${beforeNext}, after ${afterNext} (${nextDelta}); current active before ${Number.isFinite(team.before?.active) ? `$${team.before.active}` : 'unknown'}, after ${Number.isFinite(team.after?.active) ? `$${team.after.active}` : 'unknown'}; dead ${Number.isFinite(team.dead) ? `$${team.dead}` : 'unknown'}; fines ${Number.isFinite(team.fines) ? `$${team.fines}` : 'unknown'}; pressure before ${team.pressureBefore || team.pressure}, after ${team.pressureAfter || team.pressure}.`;
    }).join('\n')
    : 'No cap context available';

  return {
    systemPrompt: `You are a fantasy football media simulator for the BBB league bAnker feed. Return valid JSON only in the shape {"notes":[...]}. The notes array must contain exactly ${reactionCount} objects. Each object must include name, role, persona, and reaction. Each reaction must be 1-2 sentences, explicitly mention at least one of these teams: ${teamNames}, and react to the trade as a dynasty fantasy football move. Focus on roster fit, market value, trade fairness, and salary-cap pressure or flexibility when it is meaningful. Do not mention real NFL cities or divisions. If you mention specific assets, you must preserve the exact send/receive direction from the prompt. Do not reverse which team received a player or pick. Do not invent extra assets or summarize the packages ambiguously. Use the cap context as authoritative for who gains room, loses room, or stays squeezed after the move. Across the full set of notes, at least one reaction should mention the cap situation when the provided cap context shows a meaningful before/after change or tight/moderate pressure for either side.`,
    userPrompt: `Trade context:\nTeams involved: ${teamNames}\n\nPer-team asset flow (authoritative):\n${teamFlowText}\n\nCap context (same basis as the Salary Cap Space page):\n${capContextText}\n\nDetailed players moved: ${playersText}\nDetailed picks moved: ${picksText}\nTransaction note: ${trade.note}`,
  };
}

function buildCutPrompt(cut) {
  return {
    systemPrompt: `You are a fantasy football media simulator for the BBB league bAnker feed. Return valid JSON only in the shape {"notes":[...]}. The notes array must contain exactly 1 object with name, role, persona, and reaction. The reaction must be 1-2 sentences, explicitly mention ${cut.teamName} and ${cut.playerName}, and react to the surprise or logic of cutting a player who still carries meaningful dynasty value. Do not mention real NFL cities or divisions.`,
    userPrompt: `Cut context:\nTeam: ${cut.teamName}\nPlayer: ${cut.playerName}\nKTC value: ${cut.ktcValue}\nTransaction note: ${cut.note}`,
  };
}

export async function generateTradeReactions(trade) {
  const reactionCount = 3;
  const characters = await loadCharacters(trade.seed, reactionCount);

  if (!process.env.OPENAI_API_KEY) {
    return characters.map((character, index) => ({
      ...character,
      reaction: buildFallbackTradeReaction({ trade, index }),
    }));
  }

  const { systemPrompt, userPrompt } = buildTradePrompt(trade, characters.length);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${userPrompt}\n\nCharacters to use:\n${characters.map((character) => `- ${character.name} (${character.role}) — ${character.persona}`).join('\n')}` },
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
      // fall through to retry
    }
  }

  return characters.map((character, index) => ({
    ...character,
    reaction: buildFallbackTradeReaction({ trade, index }),
  }));
}

export async function generateCutReaction(cut) {
  const [character] = await loadCharacters(cut.seed, 1);
  const fallbackReaction = buildFallbackCutReaction({ cut });

  if (!process.env.OPENAI_API_KEY) {
    return [{ ...character, reaction: fallbackReaction }];
  }

  const { systemPrompt, userPrompt } = buildCutPrompt(cut);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 1,
      messages: [
        { role: 'system', content: `You are ${character.name}, a ${character.role} in a fantasy football media simulator. Persona: ${character.persona}. ${systemPrompt}` },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices?.[0]?.message?.content || '';
    try {
      const parsed = JSON.parse(content);
      const notes = Array.isArray(parsed?.notes) ? parsed.notes : [];
      const reaction = String(notes[0]?.reaction || '').trim();
      if (reaction) {
        return [{ ...character, reaction }];
      }
    } catch {
      // fall through to retry
    }
  }

  return [{ ...character, reaction: fallbackReaction }];
}