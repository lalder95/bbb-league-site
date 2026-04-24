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
  const anchor = trade.players[0]?.name || trade.picks[0]?.label || 'the deal';
  const lines = [
    `${teams} just pushed through a trade built around ${anchor}, and this is the kind of dynasty swing that is going to get graded for months.`,
    `${teams} finally made a move, and the balance between immediate roster fit and long-range value is messy enough that nobody is leaving the group chat neutral.`,
    `${teams} got a trade over the line, and whether this is sharp roster construction or pure gamble comes down to how much you trust the incoming value.`,
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

  return {
    systemPrompt: `You are a fantasy football media simulator for the BBB league bAnker feed. Return valid JSON only in the shape {"notes":[...]}. The notes array must contain exactly ${reactionCount} objects. Each object must include name, role, persona, and reaction. Each reaction must be 1-2 sentences, explicitly mention at least one of these teams: ${teamNames}, and react to the trade as a dynasty fantasy football move. Focus on roster fit, market value, and trade fairness. Do not mention real NFL cities or divisions.`,
    userPrompt: `Trade context:\nTeams involved: ${teamNames}\nPlayers moved: ${playersText}\nPicks moved: ${picksText}\nTransaction note: ${trade.note}`,
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