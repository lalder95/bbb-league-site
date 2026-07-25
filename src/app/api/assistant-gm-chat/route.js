import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getAssistantGMSettings } from '@/lib/db-helpers';

// Force Node.js runtime to ensure OpenAI SDK compatibility in production
export const runtime = 'nodejs';

const DEFAULT_ASSISTANT_GM_MODEL = 'gpt-4o';

export async function POST(request) {
  try {
    // If you need authentication, add it here (see below for a note)
    const { messages } = await request.json();
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Server misconfiguration: OPENAI_API_KEY missing' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const settingsResult = await getAssistantGMSettings();
    const model = settingsResult?.success
      ? settingsResult.settings?.model || DEFAULT_ASSISTANT_GM_MODEL
      : DEFAULT_ASSISTANT_GM_MODEL;

    const completion = await openai.chat.completions.create({
      model,
      messages,
      max_tokens: 600,
    });

    const reply = completion?.choices?.[0]?.message?.content || '';
    return NextResponse.json({ reply });
  } catch (err) {
    const msg = (err && (err.message || String(err))) || 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}