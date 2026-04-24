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

async function loadRandomCharacter(seed) {
  const [fans, journalists] = await Promise.all([
    readCharacters(FANS_FILE_PATH, 'fan'),
    readCharacters(JOURNALISTS_FILE_PATH, 'journalist'),
  ]);

  const pool = [...journalists, ...fans];
  if (pool.length === 0) {
    return { name: 'bAnker', role: 'journalist', persona: 'league desk' };
  }

  const rng = createRng({ seed, salt: 'free-agent-auction-character' });
  return pool[rng.int(0, pool.length - 1)];
}

function buildFallbackReaction(params) {
  if (params.eventType === 'winner') {
    return `${params.teamName} closes out the auction on ${params.playerName} at $${params.salary}/year for ${params.years} years, and that final number is going to get judged like a statement win or an overpay.`;
  }

  if (params.eventType === 'blind-reveal') {
    if (params.isTie) {
      return `${params.playerName} comes out of the blind reveal with a tie at ${params.topScore} contract points between ${params.leaderNames.join(', ')}, which is exactly the kind of chaos this format invites.`;
    }

    return `${params.teamName} comes out of the blind reveal with ${params.playerName} at $${params.salary}/year for ${params.years} years, and the room is going to argue whether that sealed value or just won the envelope race.`;
  }

  return `${params.teamName} just pushed ${params.playerName} to $${params.salary}/year for ${params.years} years, and that bid lands somewhere between aggressive roster building and a future cap-space headache.`;
}

function buildPromptContext(params) {
  if (params.eventType === 'winner') {
    return {
      instruction: `Write a short fantasy-football media reaction to a NON-BLIND auction winner. Explicitly mention ${params.teamName}, ${params.playerName}, and the winning contract of $${params.salary}/year for ${params.years} years. Frame it as the auction having ended.`,
      context: `Event: non-blind auction winner\nTeam: ${params.teamName}\nPlayer: ${params.playerName}\nWinning contract: $${params.salary}/year for ${params.years} years\nContract points: ${params.contractPoints}`,
    };
  }

  if (params.eventType === 'blind-reveal') {
    const revealSummary = params.isTie
      ? `Blind reveal resulted in a tie at ${params.topScore} contract points between ${params.leaderNames.join(', ')}.`
      : `Blind reveal winner: ${params.teamName} won ${params.playerName} for $${params.salary}/year for ${params.years} years at ${params.topScore} contract points.`;

    return {
      instruction: `Write a short fantasy-football media reaction to a BLIND auction result reveal. Explicitly mention ${params.playerName} and the reveal outcome. ${params.isTie ? 'This was a tie, so do not invent a single winner.' : `Mention ${params.teamName} as the winning team.`}`,
      context: `Event: blind auction reveal\nPlayer: ${params.playerName}\n${revealSummary}`,
    };
  }

  return {
    instruction: `Write a short fantasy-football media reaction to a NON-BLIND auction bid. Explicitly mention ${params.teamName}, ${params.playerName}, and the contract of $${params.salary}/year for ${params.years} years.`,
    context: `Event: non-blind auction bid\nTeam: ${params.teamName}\nPlayer: ${params.playerName}\nBid: $${params.salary}/year for ${params.years} years\nContract points: ${params.contractPoints}`,
  };
}

export async function generateAuctionReaction(params) {
  const character = await loadRandomCharacter(params.seed || `${params.eventType}|${params.playerName || 'unknown'}`);
  const fallbackReaction = buildFallbackReaction(params);

  if (!process.env.OPENAI_API_KEY) {
    return [{ ...character, reaction: fallbackReaction }];
  }

  const { instruction, context } = buildPromptContext(params);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const systemPrompt = `You are ${character.name}, a ${character.role} in a fantasy football media simulator. Persona: ${character.persona}. Return valid JSON only in the shape {"reaction":"..."}. Keep the reaction to 1-2 sentences, fantasy-focused, and in character. Do not mention real NFL cities or divisions.`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${instruction}\n\n${context}` },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices?.[0]?.message?.content || '';
    try {
      const parsed = JSON.parse(content);
      const reaction = String(parsed?.reaction || '').trim();
      if (reaction) {
        return [{ ...character, reaction }];
      }
    } catch {
      // fall through to retry
    }
  }

  return [{ ...character, reaction: fallbackReaction }];
}