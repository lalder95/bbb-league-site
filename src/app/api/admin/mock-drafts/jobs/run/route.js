import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getMockDraftJob,
  isValidObjectId,
  markJobDone,
  markJobError,
  markJobRunning,
  releaseJobLease,
  renewJobLease,
  tryAcquireJobLease,
  updateJobProgress,
} from '@/lib/mockDraftJobs';
import { generateMockDraft, publishMockDraft } from '@/lib/mockDraftGenerator';
import { appendLiveLog, clearLiveLogs } from '@/lib/mockDraftLiveLogStore';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export const runtime = 'nodejs';

const JOBS_COLLECTION = 'mockDraftJobs';

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

  // If already running, we still allow a call to proceed (for batching/resume),
  // but a lease will prevent overlapping runners.
    if (job.status === 'done') return NextResponse.json({ ok: true, status: 'done' });

    // Acquire a short lease to prevent overlapping runners.
    const lease = await tryAcquireJobLease(jobId, { leaseMs: 45000 });
    if (!lease.ok) {
      return NextResponse.json({ ok: true, status: 'running', note: 'Runner lease not acquired (another runner active)' });
    }

    const lockId = lease.lockId;

    await markJobRunning(jobId);

    // Only clear logs at the start of a job, not on resumes.
    const nextPickIndex = Number(job?.nextPickIndex || 0);
    if (nextPickIndex === 0) {
      clearLiveLogs(jobId);
    }
    appendLiveLog(jobId, { type: 'running', message: `Runner started (from pick index ${nextPickIndex})` });

    await updateJobProgress(jobId, {
      message: 'Fetching league context…',
      event: { type: 'info', message: 'Fetching league context…' },
    });
    appendLiveLog(jobId, { type: 'info', message: 'Fetching league context…' });

    // Batch settings: keep each invocation small to avoid serverless limits and hangs.
    const BATCH_PICKS = 4;
    const MAX_SECONDS_THIS_RUN = 60;

    // Resume from the last saved pick index and already-generated picks.
    const startIndex = Number(job?.nextPickIndex || 0);
    const existingPicks = Array.isArray(job?.result?.picks) ? job.result.picks : [];

    // Heartbeat/lease renew while we work.
    const leaseRenewId = setInterval(() => {
      renewJobLease(jobId, { lockId, leaseMs: 45000 }).catch(() => {});
    }, 15000);

    let batchResult;
    try {
      batchResult = await generateMockDraft({
        authSession: auth.session,
        rounds: job.rounds,
        maxPicks: job.maxPicks,
        dryRun: true, // generate partial picks only; we'll persist into job doc until done
        trace: job.trace,
        model: job.model,
        title: job.title,
        description: job.description,
        maxSeconds: MAX_SECONDS_THIS_RUN,
        startIndex,
        maxPicksToGenerate: BATCH_PICKS,
        onProgress: async ({ pickNumber, message, generatedPicks, totalPicks }) => {
          appendLiveLog(jobId, { type: 'pick', message: message || `Progress ${pickNumber}`, pickNumber });
          await updateJobProgress(jobId, {
            message,
            currentPickNumber: pickNumber,
            generatedPicks: typeof generatedPicks === 'number' ? (existingPicks.length + generatedPicks) : undefined,
            totalPicks: typeof totalPicks === 'number' ? totalPicks : undefined,
          });
        },
      });
    } finally {
      clearInterval(leaseRenewId);
    }

    const newPicks = Array.isArray(batchResult?.picks) ? batchResult.picks : [];
    const mergedPicks = [...existingPicks, ...newPicks];
    const nextIndex = startIndex + newPicks.length;
    const totalPicks = Number(job?.maxPicks || mergedPicks.length);

    // Persist partial progress. Keep trace small.
    const client = await clientPromise;
    const db = client.db();
    const _id = new ObjectId(jobId);
    const now = new Date();
    await db.collection(JOBS_COLLECTION).updateOne(
      { _id },
      {
        $set: {
          updatedAt: now,
          nextPickIndex: nextIndex,
          'progress.message': batchResult?.progress?.currentPickNumber ? `Generated through ${batchResult.progress.currentPickNumber}` : 'Generated batch…',
          'progress.currentPickNumber': batchResult?.progress?.currentPickNumber || null,
          'progress.generatedPicks': mergedPicks.length,
          'progress.totalPicks': totalPicks,
          'progress.heartbeatAt': now,
          'result.picks': mergedPicks,
          'result.trace': job.trace ? (Array.isArray(job?.result?.trace) ? job.result.trace : []) : [],
        },
      }
    );

    // Determine completion: either reached maxPicks OR generator could not add more picks.
    const isComplete = mergedPicks.length >= totalPicks || newPicks.length === 0;

    if (isComplete) {
      // Finalize and publish the draft from the already-generated picks.
      const article = batchResult?.article || '';
      const draft = await publishMockDraft({
        authSession: auth.session,
        title: job.title,
        description: job.description,
        picks: mergedPicks,
        article,
        trace: job.trace ? (batchResult?.trace || []) : undefined,
        leagueId: null,
        model: job.model,
      });

      await markJobDone(jobId, {
        draftId: draft?.id || null,
        picks: mergedPicks,
        article,
        trace: job.trace ? (batchResult?.trace || []) : undefined,
        progress: { totalPicks, currentPickNumber: mergedPicks[mergedPicks.length - 1]?.pickNumber || null },
      });
      appendLiveLog(jobId, { type: 'done', message: 'Job completed' });
      await releaseJobLease(jobId, { lockId });
      return NextResponse.json({ ok: true, status: 'done', jobId });
    }

    // Best-effort: trigger the next batch asynchronously.
    appendLiveLog(jobId, { type: 'info', message: `Scheduling next batch (next index ${nextIndex})…` });
    fetch(new URL('/api/admin/mock-drafts/jobs/run', request.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    }).catch(() => {});

    await releaseJobLease(jobId, { lockId });
    return NextResponse.json({ ok: true, status: 'running', jobId, nextPickIndex: nextIndex });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    try {
      // best-effort attempt to append logs if we can recover jobId
      const body = await request.json().catch(() => ({}));
      const jobId = body?.jobId;
      if (jobId) appendLiveLog(jobId, { type: 'error', message: err.message || 'Job failed' });
    } catch {}
    try {
      const body = await request.json().catch(() => ({}));
      const jobId = body?.jobId;
      if (jobId && isValidObjectId(jobId)) await markJobError(jobId, err);
    } catch {}

    return NextResponse.json({ ok: false, error: err.message || 'Job failed' }, { status: 500 });
  }
}
