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
  mongoLogging,
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
    mongoLogging: !!mongoLogging,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,

    nextPickIndex: 0,
    leaseId: null,
    leaseUntil: null,

    progress: {
      message: 'Queued…',
      currentPickNumber: null,
      generatedPicks: 0,
      totalPicks: maxPicks,
      heartbeatAt: now,
    },

    events: [
      {
        at: now,
        type: 'created',
        message: 'Job created',
      },
    ],

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
  const job = await db.collection(COLLECTION).findOne({ _id }, { projection: { mongoLogging: 1 } });
  const mongoLogging = !!job?.mongoLogging;

  const update = {
    $set: {
      status: 'running',
      // only set startedAt once
      startedAt: job?.startedAt || now,
      updatedAt: now,
      'progress.message': 'Starting generation…',
      'progress.heartbeatAt': now,
    },
  };
  if (mongoLogging) {
    update.$push = {
      events: {
        $each: [{ at: now, type: 'running', message: 'Job marked running' }],
        $slice: -400,
      },
    };
  }

  await db.collection(COLLECTION).updateOne({ _id }, update);
}

// Acquire a short lease/lock for this job to prevent overlapping runners.
// Returns { ok: true, lockId, lockedUntil } when acquired.
// Returns { ok: false } when another runner holds the lease.
export async function tryAcquireJobLease(jobId, { leaseMs = 45000 } = {}) {
  const client = await clientPromise;
  const db = client.db();
  const _id = new ObjectId(jobId);
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + Math.max(5000, Number(leaseMs) || 45000));
  const lockId = new ObjectId();

  const res = await db.collection(COLLECTION).findOneAndUpdate(
    {
      _id,
      status: { $in: ['queued', 'running'] },
      $or: [
        { leaseUntil: { $exists: false } },
        { leaseUntil: null },
        { leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        leaseId: lockId,
        leaseUntil: lockedUntil,
        updatedAt: now,
        'progress.heartbeatAt': now,
      },
    },
    { returnDocument: 'after' }
  );

  if (!res?.value) return { ok: false };
  return { ok: true, lockId: String(lockId), lockedUntil };
}

export async function renewJobLease(jobId, { lockId, leaseMs = 45000 } = {}) {
  if (!lockId) return { ok: false };
  const client = await clientPromise;
  const db = client.db();
  const _id = new ObjectId(jobId);
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + Math.max(5000, Number(leaseMs) || 45000));

  const res = await db.collection(COLLECTION).updateOne(
    { _id, leaseId: new ObjectId(lockId) },
    {
      $set: {
        leaseUntil: lockedUntil,
        updatedAt: now,
        'progress.heartbeatAt': now,
      },
    }
  );
  return { ok: res?.modifiedCount === 1, lockedUntil };
}

export async function releaseJobLease(jobId, { lockId } = {}) {
  if (!lockId) return;
  const client = await clientPromise;
  const db = client.db();
  const _id = new ObjectId(jobId);
  const now = new Date();
  await db.collection(COLLECTION).updateOne(
    { _id, leaseId: new ObjectId(lockId) },
    {
      $set: {
        leaseId: null,
        leaseUntil: null,
        updatedAt: now,
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

  const job = await db.collection(COLLECTION).findOne({ _id }, { projection: { mongoLogging: 1 } });
  const mongoLogging = !!job?.mongoLogging;

  if (patch?.message !== undefined) $set['progress.message'] = patch.message;
  if (patch?.currentPickNumber !== undefined) $set['progress.currentPickNumber'] = patch.currentPickNumber;
  if (patch?.generatedPicks !== undefined) $set['progress.generatedPicks'] = patch.generatedPicks;
  $set['progress.heartbeatAt'] = now;

  const event = patch?.event;
  const update = { $set };
  if (event && mongoLogging) {
    update.$push = {
      events: {
        $each: [{ at: now, ...event }],
        $slice: -400,
      },
    };
  }

  await db.collection(COLLECTION).updateOne({ _id }, update);
}

export async function markJobDone(jobId, result) {
  const client = await clientPromise;
  const db = client.db();
  const _id = new ObjectId(jobId);
  const now = new Date();

  const job = await db.collection(COLLECTION).findOne({ _id }, { projection: { mongoLogging: 1 } });
  const mongoLogging = !!job?.mongoLogging;

  const update = {
    $set: {
      status: 'done',
      finishedAt: now,
      updatedAt: now,
      progress: {
        message: 'Complete.',
        currentPickNumber: result?.progress?.currentPickNumber || null,
        generatedPicks: result?.picks?.length || 0,
        totalPicks: result?.progress?.totalPicks || (result?.picks?.length || 0),
        heartbeatAt: now,
      },
      result: {
        draftId: result?.draftId || null,
        picks: result?.picks || [],
        article: result?.article || '',
        trace: result?.trace || [],
      },
      error: null,
    },
  };
  if (mongoLogging) {
    update.$push = {
      events: {
        $each: [{ at: now, type: 'done', message: 'Job completed' }],
        $slice: -400,
      },
    };
  }

  await db.collection(COLLECTION).updateOne({ _id }, update);
}

export async function markJobError(jobId, error) {
  const client = await clientPromise;
  const db = client.db();
  const _id = new ObjectId(jobId);
  const now = new Date();
  const job = await db.collection(COLLECTION).findOne({ _id }, { projection: { mongoLogging: 1 } });
  const mongoLogging = !!job?.mongoLogging;

  const update = {
    $set: {
      status: 'error',
      finishedAt: now,
      updatedAt: now,
      error: {
        message: error?.message || String(error || 'Unknown error'),
        stack: error?.stack || null,
      },
    },
  };
  if (mongoLogging) {
    update.$push = {
      events: {
        $each: [{ at: now, type: 'error', message: error?.message || 'Job failed' }],
        $slice: -400,
      },
    };
  }

  await db.collection(COLLECTION).updateOne({ _id }, update);
}
