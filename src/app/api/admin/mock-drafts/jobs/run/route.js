import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getMockDraftJob, isValidObjectId, markJobDone, markJobError, markJobRunning, updateJobProgress } from '@/lib/mockDraftJobs';
import { generateMockDraft } from '@/lib/mockDraftGenerator';

export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === 'admin';
  if (!isAdmin) return { ok: false, res: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  return { ok: true, session };
}

// This route is designed to be triggered in a "fire and forget" manner.
// In Vercel production, you should turn this into a Scheduled Function (cron)
// or a proper queue/worker if you want strong guarantees.
export async function POST(request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const body = await request.json().catch(() => ({}));
    const jobId = body?.jobId;
    if (!jobId || !isValidObjectId(jobId)) {
      return NextResponse.json({ ok: false, error: 'Missing or invalid jobId' }, { status: 400 });
    }

    const job = await getMockDraftJob(jobId);
    if (!job) return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 });

    if (job.status === 'running') return NextResponse.json({ ok: true, status: 'running' });
    if (job.status === 'done') return NextResponse.json({ ok: true, status: 'done' });

    await markJobRunning(jobId);

    await updateJobProgress(jobId, {
      message: 'Fetching league context…',
      event: { type: 'info', message: 'Runner started' },
    });

    const result = await generateMockDraft({
      authSession: auth.session,
      rounds: job.rounds,
      maxPicks: job.maxPicks,
      dryRun: false,
      trace: job.trace,
      model: job.model,
      title: job.title,
      description: job.description,
      // Prefer a larger time budget for this worker route. If your Vercel plan is still short,
      // we will still stop early and return a partial draft rather than 504.
      maxSeconds: 250,
      onProgress: async ({ pickNumber, message, generatedPicks, totalPicks }) => {
        await updateJobProgress(jobId, {
          message,
          currentPickNumber: pickNumber,
          generatedPicks: typeof generatedPicks === 'number' ? generatedPicks : undefined,
          totalPicks: typeof totalPicks === 'number' ? totalPicks : undefined,
          event: { type: 'pick', message: message || `Progress ${pickNumber}`, pickNumber },
        });
      },
    });

    await markJobDone(jobId, result);
    return NextResponse.json({ ok: true, status: 'done', jobId });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    try {
      const body = await request.json().catch(() => ({}));
      const jobId = body?.jobId;
      if (jobId && isValidObjectId(jobId)) await markJobError(jobId, err);
    } catch {}

    return NextResponse.json({ ok: false, error: err.message || 'Job failed' }, { status: 500 });
  }
}
