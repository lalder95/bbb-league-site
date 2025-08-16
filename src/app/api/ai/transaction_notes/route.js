const ORG_ID = "org-viUBWDhO88NeV3MOzEmxKeGC";

export async function POST(req) {
  try {
    const { contractChange } = await req.json();

    let systemPrompt = `
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

    const userMessage = `team: ${contractChange.team}\nplayer: ${contractChange.playerName}\nnote: ${contractChange.notes}`;

    let ai_notes = null;
    let ai_notes_raw = null;
    let error = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
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
          max_tokens: 5000,
          temperature: 1.5,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        error = { error: "API error", details: data };
        // Retry on API error
        continue;
      }

      ai_notes_raw = data.choices?.[0]?.message?.content || "AI summary unavailable.";

      // Retry if model output is missing or fallback string
      if (!ai_notes_raw || ai_notes_raw === "AI summary unavailable.") {
        error = { error: "Empty or unavailable AI response", raw: ai_notes_raw };
        continue;
      }

      try {
        ai_notes = JSON.parse(ai_notes_raw);
        error = null;
        break; // Success!
      } catch (e) {
        error = { error: "Invalid JSON from model", raw: ai_notes_raw };
        if (attempt < 3) {
          systemPrompt += "\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a valid JSON array as described. Do not include any extra text.";
        }
      }
    }

    // If we failed after 3 attempts, always return an object with error info
    if (error) {
      // Save the full error object, including details and raw response
      return Response.json({ ai_notes: { ...error, raw: ai_notes_raw } }, { status: 500 });
    }

    return Response.json({ ai_notes });
  } catch (err) {
    console.error('[AI ROUTE] Exception:', err);
    // Save the error message in ai_notes
    return Response.json({ ai_notes: { error: "AI summary unavailable.", details: err.message } }, { status: 500 });
  }
}