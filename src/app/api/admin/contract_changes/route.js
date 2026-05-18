import { NextResponse } from 'next/server';
import { getContractChanges, addContractChange, getAllUsers } from '@/lib/db-helpers';
import { createNotificationForMany } from '@/utils/notificationUtils';

export const runtime = 'nodejs';

export async function GET() {
  const result = await getContractChanges();
  if (result.success === false) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const change = {
      change_type: body.change_type,
      user: body.user,
      timestamp: new Date(body.timestamp),
      notes: body.notes,
      ai_notes: body.ai_notes,
      playerId: body.playerId,
      playerName: body.playerName,
      team: body.team,
      years: body.years,
      extensionSalaries: body.extensionSalaries,
    };
    const result = await addContractChange(change);
    if (result.success === false) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Fire notifications to all other league members
    let notificationResult = { skipped: true };
    try {
      const allUsers = await getAllUsers();
      const recipientIds = allUsers
        .map((u) => u.username)
        .filter((u) => u);

      let title, message;
      if (body.change_type === 'franchise_tag') {
        title = 'Franchise Tag Applied';
        message = `${body.team} has franchise tagged ${body.playerName}.`;
      } else if (body.change_type === 'rfa_tag') {
        title = 'RFA Tag Applied';
        message = `${body.team} has applied the RFA tag to ${body.playerName}.`;
      } else {
        // extension (and any future types)
        const salaryStr = Array.isArray(body.extensionSalaries)
          ? body.extensionSalaries.map((s) => `$${s}`).join(', ')
          : '';
        const yearsLabel = body.years === 1 ? '1 year' : `${body.years} years`;
        title = 'Contract Extension';
        message = `${body.team} has extended ${body.playerName} for ${yearsLabel}${salaryStr ? ` at ${salaryStr}` : ''}.`;
      }

      const prefKey = body.change_type === 'extension'
        ? 'contract_extension'
        : body.change_type === 'franchise_tag'
          ? 'franchise_tag'
          : 'rfa_tag';

      if (recipientIds.length > 0) {
        notificationResult = await createNotificationForMany(recipientIds, {
          title,
          message,
          link: '/my-team/contract-management',
          type: 'system',
          prefKey,
        });
        notificationResult.recipientCount = recipientIds.length;
        notificationResult.recipientIds = recipientIds;
      } else {
        notificationResult = { skipped: true, reason: 'no_recipients', totalUsers: allUsers.length, bodyUser: body.user };
      }
    } catch (notifErr) {
      console.error('contract_changes notification error:', notifErr);
      notificationResult = { error: notifErr.message };
    }

    return NextResponse.json({ success: true, change: result.change, notificationResult });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}