const ORG_ID = "org-viUBWDhO88NeV3MOzEmxKeGC";

export async function POST(req) {
  try {
    const { contractChange } = await req.json();

    // Compose the system prompt
    const systemPrompt = `
You are a fantasy football media simulator.

Your job is to take a league event — such as a contract extension, trade, or cut — and generate in-character reactions from a fixed group of 20 fictional personas.

The user will provide a structured input with the following fields:
- team: the fantasy football team making the move
- player: the NFL player involved
- note: a short description of the transaction (e.g., “Extension (2 years, $14/year)” or “Traded for 2026 2nd-round pick”)

Your response must be a **JSON array** of 20 unique character reactions. Each character object must include:

- **name**: the character’s full name or screen handle
- **role**: either "fan" or "journalist"
- **persona**: a short label for the character type (e.g., "The Stat Geek", "The Hot Take Machine")
- **reaction**: an in-character response to the event, using the player, team, and note

Characters must match the following list:

**FAN CHARACTERS (screen handles):**
1. @GridironGuru69 — The Armchair Coach  
2. @BelievahForever — The Eternal Optimist  
3. @SadSundays — The Doom & Gloom Fan  
4. @DataDontLie — The Stat Geek  
5. @OGBenchwarmer — The Die-Hard Lifer  
6. @BandwagonBack — The Fair-Weather Fan  
7. @TailgateTitan — The Overly Drunk
8. @LeagueIsRigged — The Conspiracy Theorist  
9. @TrashTalkTony — The Rival Team Fan  
10. @BackInMyDay22 — The Nostalgia Addict  
11. @Painted4Points — The 4/20 hippy
12. @FantasyCursed — The Superstitious Wreck  

**JOURNALIST CHARACTERS (real names):**
13. Adam Glazerport — The News Breaker
14. Maxx Blister — The Hot Take Machine  
15. Dexley K. Quants — The Stat Whisperer  
16. Ronnie Greenleaf — The Nonsense Journalist that nobody understands
17. Trent Sideline — The Locker Room Leech  
18. Skye Dramatica — The Tabloid Vulture  
19. Becca Beatline — The Local Beat Writer  
20. Eloise Ellison — The Elegant Essayist  

**Instructions:**
- Reactions must explicitly acknowledge the transaction (team, player, and note)
- Each reaction must reflect the character’s unique voice and personality
- **Never change, autocorrect, or re-interpret the provided team or player names** (e.g., do not change "lalder" to "ladder")
- **Do not reference real NFL teams, real team affiliations, divisions, or cities** — respond only in the context of the fantasy league
- Avoid referencing real-world contracts, news, or league mechanics
- Responses should be concise (1–2 sentences)
- Return **only valid JSON** — no extra text, markdown, or explanation
    `.trim();

    // Compose the user message
    const userMessage = `team: ${contractChange.team}\nplayer: ${contractChange.playerName}\nnote: ${contractChange.notes}`;

    // Call OpenAI API
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
        max_tokens: 1200,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return Response.json({ ai_notes: "AI summary unavailable.", error: data }, { status: 500 });
    }

    // The response should be only the JSON array
    const ai_notes_raw = data.choices?.[0]?.message?.content || "AI summary unavailable.";

    let ai_notes;
    try {
      ai_notes = JSON.parse(ai_notes_raw);
    } catch (e) {
      // If parsing fails, store the raw string and an error
      ai_notes = { error: "Invalid JSON from model", raw: ai_notes_raw };
    }

    return Response.json({ ai_notes });
  } catch (err) {
    console.error('[AI ROUTE] Exception:', err);
    return Response.json({ ai_notes: "AI summary unavailable.", error: err.message }, { status: 500 });
  }
}