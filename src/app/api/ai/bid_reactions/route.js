import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const FANS_FILE_PATH = path.join(process.cwd(), 'src/app/api/ai/fans.txt');
const JOURNALISTS_FILE_PATH = path.join(process.cwd(), 'src/app/api/ai/journalists.txt');

function parseCharactersFromText(text, role) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const results = [];
  for (const raw of lines) {
    const line = raw.replace(/^\uFEFF/, '').trim();
    if (!line) continue;
    if (line.startsWith('**') || line.startsWith('#')) continue;
    const stripped = line
      .replace(/^\s*[-*]\s*/, '')
      .replace(/^\s*\d+\.\s*/, '')
      .trim();
    const m = stripped.match(/^(.+?)\s*[—–-]\s*(.+)$/);
    if (m) {
      results.push({ name: m[1].trim(), persona: m[2].trim(), role });
    }
  }
  return results;
}

function pickRandomFans(allFans) {
  if (!allFans.length) return [];
  const min = 3, max = 5;
  const count = Math.min(allFans.length, Math.floor(Math.random() * (max - min + 1)) + min);
  const copy = allFans.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export async function POST(req) {
  const url = new URL(req.url);
  const debugEnabled = url.searchParams.get('debug') === '1';
  const debug = [];
  const log = (...args) => { if (debugEnabled) debug.push(args.join(' ')); };

  try {
    const { username, playerName, salary, years } = await req.json();
    if (!username || !playerName || !salary || !years) {
      return Response.json({ error: 'Missing required fields (username, playerName, salary, years).' }, { status: 400 });
    }

    const [fansTxt, journTxt] = await Promise.all([
      fs.readFile(FANS_FILE_PATH, 'utf8').catch(() => ''),
      fs.readFile(JOURNALISTS_FILE_PATH, 'utf8').catch(() => '')
    ]);

    const allFans = parseCharactersFromText(fansTxt, 'fan');
    const allJournalists = parseCharactersFromText(journTxt, 'journalist');
    const selectedFans = pickRandomFans(allFans);
    const characters = [...allJournalists, ...selectedFans];

    if (!characters.length) {
      return Response.json({ reactions: [], warning: 'No characters available.' }, { status: 200 });
    }

    const systemPrompt = `You are a fantasy football media simulator. Given a bid in a NON-BLIND free agent auction, generate one short reaction per character (1-2 sentences). Each must explicitly mention the bidding team (${username}), the player (${playerName}), and the contract (${salary}/year for ${years} years). Do not mention real NFL cities or divisions. Return ONLY valid JSON array.`.trim();

    const charactersList = characters.map(c => `- ${c.name} — ${c.persona} (${c.role})`).join('\n');
    const userMessage = `Characters:\n${charactersList}`;

    let raw = null;
    let parsed = null;
    let error = null;

    for (let attempt = 1; attempt <= 5; attempt++) {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4.1-nano',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 1.0,
          max_tokens: 1200
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        error = { status: resp.status, details: data };
        continue;
      }
      raw = data.choices?.[0]?.message?.content || '';
      if (!raw) { error = { message: 'Empty response' }; continue; }
      try {
        parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) break;
        error = { message: 'Not an array' };
      } catch (e) {
        error = { message: 'Invalid JSON', raw };
        if (attempt < 3) {
          // Strengthen instruction
        }
      }
    }

    if (!parsed) {
      return Response.json({ reactions: [], error: error || { message: 'AI failed' } }, { status: 200 });
    }

    // Normalize reaction objects
    const reactions = parsed.map(r => ({
      name: r.name ?? '',
      role: r.role ?? '',
      persona: r.persona ?? '',
      reaction: r.reaction ?? ''
    }));

    return Response.json({ reactions, debug: debugEnabled ? debug : undefined }, { status: 200 });
  } catch (e) {
    return Response.json({ reactions: [], error: e.message }, { status: 500 });
  }
}
