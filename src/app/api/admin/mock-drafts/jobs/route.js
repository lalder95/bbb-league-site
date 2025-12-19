import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createMockDraftJob, getMockDraftJob, isValidObjectId } from '@/lib/mockDraftJobs';

export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === 'admin';
  if (!isAdmin) return { ok: false, res: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  return { ok: true, session };
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const body = await request.json().catch(() => ({}));
    const {
      rounds = 7,
      maxPicks = Number(rounds) * 12,
      trace = true,
      model = 'gpt-4o-mini',
      title = 'BBB AI Mock Draft',
      description = 'AI-generated mock draft with per-pick reasoning.',
      mongoLogging = false,
    } = body || {};

    const safeRounds = Math.max(1, Math.min(7, Number(rounds) || 1));
    const safeMaxPicks = Math.max(12, Math.min(84, Number(maxPicks) || safeRounds * 12));

    const jobId = await createMockDraftJob({
      createdBy: auth.session?.user?.username || auth.session?.user?.name || null,
      title,
      description,
      rounds: safeRounds,
      maxPicks: safeMaxPicks,
      model,
      trace,
      mongoLogging: !!mongoLogging,
    });

    return NextResponse.json({ ok: true, jobId });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed to create job' }, { status: 500 });
  }
}

export async function GET(request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  if (!jobId || !isValidObjectId(jobId)) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid jobId' }, { status: 400 });
  }

  const job = await getMockDraftJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 });

  // Keep payload reasonably small; the UI can show trace/article from result.
  return NextResponse.json({ ok: true, job });
}
