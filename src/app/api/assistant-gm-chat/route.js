import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

export async function POST(request) {
  try {
    // If you need authentication, add it here (see below for a note)
    const { messages } = await request.json();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 600,
    });

    const reply = completion.choices[0].message.content;
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}