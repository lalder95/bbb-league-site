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

Your response must be a **JSON array** of 14 unique character reactions. Each character object must include:

- **name**: the character’s full name or screen handle
- **role**: either "fan" or "journalist"
- **persona**: a short label for the character type (e.g., "The Stat Geek", "The Hot Take Machine")
- **reaction**: an in-character response to the event, using the player, team, and note

Characters must match the following list:

**FAN CHARACTERS (screen handles):**
1. @GridironGuru69 — The Armchair Coach  
2. @SadSundays — The Doom & Gloom Fan  
3. @OGBenchwarmer — The Die-Hard Lifer  
4. @TailgateTitan — The Overly Drunk
5. @TrashTalkTony — The Rival Team Fan  
6. @Painted4Points — The 4/20 Hippy

**JOURNALIST CHARACTERS (real names):**
7. Adam Glazerport — The News Breaker
8. Dexley K. Quants — The Stat Whisperer 
9. Skye Dramatica — The Clickbait Vulture  
10. Becca Beatline — The Local Beat Writer   

**Instructions:**
- Reactions must explicitly acknowledge the transaction (**team**, player, and note)
- Each reaction must reflect the character’s unique voice and personality
- **Never change, autocorrect, or re-interpret the provided team or player names** (e.g., do not change "lalder" to "ladder")
- **Do not reference real NFL teams, real team affiliations, divisions, or cities** — respond only in the context of the fantasy league
- Avoid referencing real-world contracts, news, or league mechanics
- It is **Extremely Important* that each message contains both the team name, and the plyer name.
- Don't menthion the user name **ever**. Only use the team name.
- Responses should be concise (1–2 sentences)
- Return **only valid JSON** — no extra text, markdown, or explanation
    `.trim();

    const userMessage = `team: ${contractChange.team}\nplayer: ${contractChange.playerName}\nnote: ${contractChange.notes}`;

    let ai_notes = null;
    let ai_notes_raw = null;
    let error = null;

    for (let attempt = 1; attempt <= 10; attempt++) {
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
      return Response.json({ ai_notes: { ...error } }, { status: 500 });
    }

    return Response.json({ ai_notes });
  } catch (err) {
    console.error('[AI ROUTE] Exception:', err);
    // Save the error message in ai_notes
    return Response.json({ ai_notes: { error: "AI summary unavailable.", details: err.message } }, { status: 500 });
  }
}