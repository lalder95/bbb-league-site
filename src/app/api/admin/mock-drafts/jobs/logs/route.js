import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isValidObjectId } from '@/lib/mockDraftJobs';
import { getLiveLogs } from '@/lib/mockDraftLiveLogStore';

export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === 'admin';
  if (!isAdmin) return { ok: false, res: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  return { ok: true, session };
}

export async function GET(request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const since = searchParams.get('since');

  if (!jobId || !isValidObjectId(jobId)) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid jobId' }, { status: 400 });
  }

  const logs = getLiveLogs(jobId, { since });
  return NextResponse.json({ ok: true, logs });
}
