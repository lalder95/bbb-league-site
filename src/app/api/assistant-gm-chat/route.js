import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

// Force Node.js runtime to ensure OpenAI SDK compatibility in production
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    // If you need authentication, add it here (see below for a note)
    const { messages } = await request.json();
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Server misconfiguration: OPENAI_API_KEY missing' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
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