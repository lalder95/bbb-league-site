import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

const COLLECTION = 'mockDraftJobs';

export function isValidObjectId(id) {
  try {
    // eslint-disable-next-line no-new
    new ObjectId(id);
    return true;
  } catch {
    return false;
  }
}

export async function createMockDraftJob({
  createdBy,
  title,
  description,
  rounds,
  maxPicks,
  model,
  trace,
}) {
  const client = await clientPromise;
  const db = client.db();
  const now = new Date();

  const doc = {
    status: 'queued', // queued | running | done | error
    createdBy: createdBy || null,
    title,
    description,
    rounds,
    maxPicks,
    model,
    trace: !!trace,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,

    progress: {
      message: 'Queued…',
      currentPickNumber: null,
      generatedPicks: 0,
      totalPicks: maxPicks,
    },

    result: {
      draftId: null,
      picks: [],
      article: '',
      trace: [],
    },

    error: null,
  };

  const res = await db.collection(COLLECTION).insertOne(doc);
  return String(res.insertedId);
}

export async function getMockDraftJob(jobId) {
  const client = await clientPromise;
  const db = client.db();
  const _id = new ObjectId(jobId);
  const doc = await db.collection(COLLECTION).findOne({ _id });
  if (!doc) return null;
  return {
    ...doc,
    _id: String(doc._id),
  };
}

export async function markJobRunning(jobId) {
  const client = await clientPromise;
  const db = client.db();
  const _id = new ObjectId(jobId);
  const now = new Date();
  await db.collection(COLLECTION).updateOne(
    { _id },
    {
      $set: {
        status: 'running',
        startedAt: now,
        updatedAt: now,
        'progress.message': 'Starting generation…',
      },
    }
  );
}

export async function updateJobProgress(jobId, patch) {
  const client = await clientPromise;
  const db = client.db();
  const _id = new ObjectId(jobId);
  const now = new Date();
  const $set = { updatedAt: now };

  if (patch?.message !== undefined) $set['progress.message'] = patch.message;
  if (patch?.currentPickNumber !== undefined) $set['progress.currentPickNumber'] = patch.currentPickNumber;
  if (patch?.generatedPicks !== undefined) $set['progress.generatedPicks'] = patch.generatedPicks;

  await db.collection(COLLECTION).updateOne({ _id }, { $set });
}

export async function markJobDone(jobId, result) {
  const client = await clientPromise;
  const db = client.db();
  const _id = new ObjectId(jobId);
  const now = new Date();

  await db.collection(COLLECTION).updateOne(
    { _id },
    {
      $set: {
        status: 'done',
        finishedAt: now,
        updatedAt: now,
        progress: {
          message: 'Complete.',
          currentPickNumber: result?.progress?.currentPickNumber || null,
          generatedPicks: result?.picks?.length || 0,
          totalPicks: result?.progress?.totalPicks || (result?.picks?.length || 0),
        },
        result: {
          draftId: result?.draftId || null,
          picks: result?.picks || [],
          article: result?.article || '',
          trace: result?.trace || [],
        },
        error: null,
      },
    }
  );
}

export async function markJobError(jobId, error) {
  const client = await clientPromise;
  const db = client.db();
  const _id = new ObjectId(jobId);
  const now = new Date();
  await db.collection(COLLECTION).updateOne(
    { _id },
    {
      $set: {
        status: 'error',
        finishedAt: now,
        updatedAt: now,
        error: {
          message: error?.message || String(error || 'Unknown error'),
          stack: error?.stack || null,
        },
      },
    }
  );
}
