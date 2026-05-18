import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createNotification } from '@/utils/notificationUtils';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { outbidUsername, playerName } = body;

    if (!outbidUsername || !playerName) {
      return NextResponse.json({ error: 'outbidUsername and playerName are required' }, { status: 400 });
    }

    // Do not notify if the acting user is the same as the outbid user (self-outbid guard)
    if (outbidUsername === session.user.name) {
      return NextResponse.json({ success: true });
    }

    await createNotification(outbidUsername, {
      title: 'Outbid in FA Auction',
      message: `You've been outbid on ${playerName} by ${session.user.name}.`,
      link: '/free-agent-auction',
      type: 'system',
      prefKey: 'auction_outbid',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
