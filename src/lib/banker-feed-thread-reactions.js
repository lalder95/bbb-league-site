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

function normalizeDisplayName(value) {
  return String(value || '').replace(/^@/, '').trim().toLowerCase();
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

async function loadCharacters(seed) {
  const [fans, journalists] = await Promise.all([
    readCharacters(FANS_FILE_PATH, 'fan'),
    readCharacters(JOURNALISTS_FILE_PATH, 'journalist'),
  ]);

  const pool = [...journalists, ...fans];
  if (pool.length === 0) {
    return [{ name: 'bAnker', role: 'journalist', persona: 'league desk' }];
  }

  const rng = createRng({ seed, salt: 'banker-feed-thread-replies' });
  return shuffleWithRng(pool, rng);
}

function buildFallbackReply({ participant, latestUserMessage, parentTweet }) {
  const opener = String(parentTweet?.reaction || '').trim();
  const topic = String(latestUserMessage?.content || '').trim() || opener || 'that take';
  return `${participant.name} is not backing off the original stance here. ${topic.slice(0, 140)}${topic.length > 140 ? '...' : ''} is exactly the kind of thing ${participant.role === 'journalist' ? 'deserves a harsher headline' : 'starts another league-group-chat spiral'}.`;
}

export async function selectBankerThreadParticipants({ seed, parentTweet, maxParticipants = 2 }) {
  const pool = await loadCharacters(seed);
  const normalizedParentName = normalizeDisplayName(parentTweet?.name);
  const chosen = [];

  const parentParticipant = pool.find((character) => normalizeDisplayName(character.name) === normalizedParentName)
    || (normalizedParentName
      ? {
        name: String(parentTweet?.name || '').replace(/^@/, '').trim() || 'bAnker',
        role: parentTweet?.role || 'journalist',
        persona: parentTweet?.persona || 'league desk',
      }
      : null);

  if (parentParticipant) {
    chosen.push(parentParticipant);
  }

  for (const character of pool) {
    if (chosen.length >= Math.max(1, maxParticipants)) break;
    if (chosen.some((existing) => normalizeDisplayName(existing.name) === normalizeDisplayName(character.name))) {
      continue;
    }
    chosen.push(character);
  }

  return chosen.slice(0, Math.max(1, maxParticipants));
}

export async function generateBankerThreadReplies({
  participants,
  parentTweet,
  threadMessages,
  latestUserMessage,
  seed,
}) {
  const normalizedParticipants = Array.isArray(participants) ? participants.filter(Boolean) : [];
  if (normalizedParticipants.length === 0) {
    return [];
  }

  const fallbackReplies = normalizedParticipants.map((participant, index) => ({
    id: `${seed}:ai:${index}`,
    authorType: 'ai',
    name: `@${participant.name.replace(/^@/, '')}`,
    role: participant.role || 'fan',
    persona: participant.persona || '',
    content: buildFallbackReply({ participant, latestUserMessage, parentTweet }),
    parentMessageId: latestUserMessage?.id || null,
    createdAt: new Date(),
  }));

  if (!process.env.OPENAI_API_KEY) {
    return fallbackReplies;
  }

  const conversation = (Array.isArray(threadMessages) ? threadMessages : [])
    .slice(-8)
    .map((message) => {
      if (message?.authorType === 'user') {
        return `${message.username || 'User'}: ${message.content || ''}`;
      }
      return `${String(message?.name || '').replace(/^@/, '') || 'AI'} (${message?.role || 'fan'}): ${message?.content || ''}`;
    })
    .join('\n');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const systemPrompt = `You are generating in-character thread replies for the BBB league bAnker feed. Return valid JSON only in the shape {"replies":[...]}. The replies array must contain exactly ${normalizedParticipants.length} objects. Each object must include only one field: reaction. The reactions must align exactly by index with the supplied character list. Do not return name, role, or persona fields. Every reaction must be 1-2 sentences, stay fully in character, and continue the thread naturally in response to the user's latest message. Keep each reaction distinct to the assigned character voice. Do not break character, do not mention being an AI model, and do not invent league facts not present in the context.`;
  const userPrompt = `Original feed post author: ${parentTweet?.name || 'Unknown'}\nOriginal feed post: ${parentTweet?.reaction || ''}\nParent notes: ${parentTweet?._parentNotes || 'None'}\nThread so far:\n${conversation || 'No prior replies yet.'}\n\nLatest user message:\n${latestUserMessage?.content || ''}\n\nCharacters that must reply in this exact order by array index:\n${normalizedParticipants.map((participant, index) => `${index + 1}. ${participant.name} (${participant.role}) — ${participant.persona}`).join('\n')}\n\nReturn only the reactions in the same order as that list.`;

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
      const replies = Array.isArray(parsed?.replies) ? parsed.replies : [];
      const normalized = replies.map((reply, index) => ({
        id: `${seed}:ai:${index}`,
        authorType: 'ai',
        name: `@${String(normalizedParticipants[index]?.name || 'Unknown').replace(/^@/, '')}`,
        role: normalizedParticipants[index]?.role || 'fan',
        persona: normalizedParticipants[index]?.persona || '',
        content: String(reply?.reaction || '').trim(),
        parentMessageId: latestUserMessage?.id || null,
        createdAt: new Date(),
      })).filter((reply) => reply.content);

      if (normalized.length === normalizedParticipants.length) {
        return normalized;
      }
    } catch {
      // fall through to retry
    }
  }

  return fallbackReplies;
}