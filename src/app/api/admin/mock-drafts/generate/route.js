import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { generateMockDraft } from '@/lib/mockDraftGenerator';

export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === 'admin';
  if (!isAdmin) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { ok: true, session };
}

// Generation logic moved to src/lib/mockDraftGenerator.js

export async function POST(request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  try {
    const body = await request.json().catch(() => ({}));
    const {
      rounds = 7, // up to 7 rounds; we'll stop early if pool empties or order ends
      maxPicks = rounds * 12,
      seed = undefined,
      dryRun = false,
      trace = true,
      model = 'gpt-4o-mini',
      title = 'BBB AI Mock Draft',
      description = 'AI-generated mock draft with per-pick reasoning.',
      progressKey = null,
      // Safety valve for serverless timeouts. If we exceed this wall clock time, we stop early.
      // Vercel timeouts vary by plan; keeping a guard helps avoid 504s.
      maxSeconds = 50,
    } = body || {};

    const getBaseUrl = () => {
      if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
      if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
      return 'http://localhost:3000';
    };

    const result = await generateMockDraft({
      authSession: auth.session,
      rounds,
      maxPicks,
      seed,
      dryRun,
      trace,
      model,
      title,
      description,
      maxSeconds,
      onProgress: progressKey
        ? async ({ pickNumber, message }) => {
            try {
              const base = getBaseUrl();
              await fetch(`${base}/api/admin/mock-drafts/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: progressKey, currentPickNumber: pickNumber, message })
              });
            } catch {}
          }
        : null,
    });

    // Mark progress complete
    if (progressKey) {
      try {
        const base = getBaseUrl();
        await fetch(`${base}/api/admin/mock-drafts/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: progressKey, done: true, message: 'Mock draft generated and published.' })
        });
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      dryRun: !!dryRun,
      ...result,
    });
  } catch (err) {
    const msg = err?.message || 'Failed to generate mock draft';
    const status = /player pool/i.test(msg) ? 400 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        // Helpful diagnostics that are safe to expose
        diagnostics: {
          vercel: !!process.env.VERCEL,
          nodeEnv: process.env.NODE_ENV,
          hasMongo: !!process.env.MONGODB_URI,
          hasOpenAI: !!process.env.OPENAI_API_KEY,
        },
      },
      { status }
    );
  }
}
