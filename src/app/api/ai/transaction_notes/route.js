import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

const ORG_ID = "org-viUBWDhO88NeV3MOzEmxKeGC";

const FANS_FILE_PATH = path.join(process.cwd(), "src/app/api/ai/fans.txt");
const JOURNALISTS_FILE_PATH = path.join(process.cwd(), "src/app/api/ai/journalists.txt");

// Fetches text from a public asset using the request's origin
async function readLocalText(filePath, log) {
  try {
    const txt = await fs.readFile(filePath, "utf8");
    log(`Read ${txt.length} bytes from ${filePath}`);
    return txt;
  } catch (e) {
    log(`[AI ROUTE] Exception reading ${filePath}: ${e.message}`);
    throw e; // <--- throw instead of returning ""
  }
}

// More tolerant parser:
// - ignores headings/markdown bullets
// - supports em dash, en dash, or hyphen
// - ignores leading numbering like "1." or "7."
// - trims BOM and whitespace
function parseCharactersFromText(text, role, log) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const results = [];
  for (const raw of lines) {
    const line = raw.replace(/^\uFEFF/, "").trim();
    if (!line) continue;
    if (line.startsWith("**") || line.startsWith("#")) continue; // skip headings
    // remove leading bullets or numbering
    const stripped = line
      .replace(/^\s*[-*]\s*/, "")
      .replace(/^\s*\d+\.\s*/, "")
      .trim();

    // Match "Name — Persona" with em dash, en dash, or hyphen
    const m = stripped.match(/^(.+?)\s*[—–-]\s*(.+)$/);
    if (m) {
      results.push({
        name: m[1].trim(),
        persona: m[2].trim(),
        role,
      });
    }
  }
  log(`Parsed ${results.length} ${role}s`);
  return results;
}

function pickRandomSubset(arr, minCount, maxCount) {
  const count = Math.min(
    arr.length,
    Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount
  );
  // Fisher–Yates shuffle
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function buildCharactersSection(journalists, fans) {
  const fansList = fans.map(f => `- ${f.name} — ${f.persona}`).join("\n");
  const journList = journalists.map(j => `- ${j.name} — ${j.persona}`).join("\n");
  return `FAN CHARACTERS (screen handles):
${fansList}

JOURNALIST CHARACTERS (real names):
${journList}`;
}

export async function POST(req) {
  // Debugging
  const url = new URL(req.url);
  const debugEnabled = url.searchParams.get("debug") === "1";
  const debug = [];
  const log = (...args) => {
    const msg = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    // eslint-disable-next-line no-console
    console.log("[AI ROUTE]", msg);
    debug.push(msg);
  };

  try {
    const { contractChange } = await req.json();

    // Fetch character definitions from local files
    const [fansTxt, journTxt] = await Promise.all([
      readLocalText(FANS_FILE_PATH, log),
      readLocalText(JOURNALISTS_FILE_PATH, log),
    ]);

    log(`fansTxt length: ${fansTxt.length}`);
    log(`journTxt length: ${journTxt.length}`);

    const allFans = parseCharactersFromText(fansTxt, "fan", log);
    const allJournalists = parseCharactersFromText(journTxt, "journalist", log);

    log(`allFans: ${JSON.stringify(allFans)}`);
    log(`allJournalists: ${JSON.stringify(allJournalists)}`);

    const selectedFans = pickRandomSubset(allFans, 3, 5);
    const characters = [...allJournalists, ...selectedFans];

    log(`selectedFans: ${JSON.stringify(selectedFans)}`);
    log(`characters: ${JSON.stringify(characters)}`);

    if (characters.length === 0) {
      log("No characters parsed; returning error.");
      return Response.json(
        {
          ai_notes: {
            error: "No characters available from files.",
            team: contractChange?.team,
            playerName: contractChange?.playerName,
          },
          debug: debugEnabled ? debug : undefined,
        },
        { status: 500 }
      );
    }

    const reactionCount = characters.length;
    const charactersSection = buildCharactersSection(allJournalists, selectedFans);

    let systemPrompt = `
You are a fantasy football media simulator.

Your job is to take a league event — such as a contract extension, trade, or cut — and generate in-character reactions from the specific characters listed below.

Input fields:
- team: the fantasy football team making the move
- player: the NFL player involved
- note: a short description of the transaction (e.g., “Extension (2 years, $14/year)” or “Traded for 2026 2nd-round pick”)

Your response must be a JSON array of ${reactionCount} unique character reactions — exactly one per character listed below.
Each object must include:
- name: exactly as listed
- role: "fan" or "journalist", exactly as listed
- persona: exactly as listed
- reaction: 1–2 sentences in the character’s voice

Characters to use:
${charactersSection}

Instructions:
- Every reaction must explicitly mention the team, the player, and the note.
- Each reaction must reflect the character’s unique voice and personality.
- Never change, autocorrect, or re-interpret the provided team or player names.
- Do not reference real NFL teams, real team affiliations, divisions, or cities — respond only in the context of the fantasy league.
- Avoid referencing real-world contracts, news, or league mechanics.
- Return only valid JSON — no extra text, markdown, or explanation.
    `.trim();

    const userMessage = `team: ${contractChange.team}\nplayer: ${contractChange.playerName}\nnote: ${contractChange.notes}`;

    let ai_notes = null;
    let ai_notes_raw = null;
    let error = null;

    for (let attempt = 1; attempt <= 10; attempt++) {
      log(`LLM attempt ${attempt}`);
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-nano",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
          ],
          max_tokens: 4000,
          temperature: 1.0,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        error = { 
          error: "API error", 
          status: response.status, 
          statusText: response.statusText, 
          details: data, 
          raw: ai_notes_raw 
        };
        log("LLM API error", error);
        continue;
      }

      ai_notes_raw = data.choices?.[0]?.message?.content || "AI summary unavailable.";
      log(`LLM raw length: ${ai_notes_raw.length}`);

      if (!ai_notes_raw || ai_notes_raw === "AI summary unavailable.") {
        error = { error: "Empty or unavailable AI response", raw: ai_notes_raw };
        log("LLM empty/unavailable");
        continue;
      }

      try {
        ai_notes = JSON.parse(ai_notes_raw);
        error = null;
        log("LLM JSON parse ok");
        break;
      } catch (e) {
        error = { error: "Invalid JSON from model", raw: ai_notes_raw };
        log("LLM JSON parse failed");
        if (attempt < 3) {
          systemPrompt += "\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a valid JSON array as described. Do not include any extra text.";
        }
      }
    }

    if (error) {
      return Response.json(
        { ai_notes: { ...error }, debug: debugEnabled ? debug : undefined },
        { status: 500 }
      );
    }

    return Response.json({ ai_notes, debug: debugEnabled ? debug : undefined });
  } catch (err) {
    console.error("[AI ROUTE] Exception:", err);
    return Response.json({ ai_notes: { error: "AI summary unavailable.", details: err.message } }, { status: 500 });
  }
}