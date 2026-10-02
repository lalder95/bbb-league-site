import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { evaluateAssistantGMTrade } from '@/lib/assistant-gm/trade-evaluator';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { proposal } = await request.json();
    if (!proposal || typeof proposal !== 'object') {
      return NextResponse.json({ error: 'A structured trade proposal is required.' }, { status: 400 });
    }

    const evaluation = await evaluateAssistantGMTrade(proposal);
    return NextResponse.json({ evaluation }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Unable to evaluate trade.' }, { status: 500 });
  }
}