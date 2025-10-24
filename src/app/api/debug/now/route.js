// src/app/api/debug/now/route.js
import { NextResponse } from 'next/server';

export async function GET() {
  const now = new Date();
  return NextResponse.json({
    nowIso: now.toISOString(),
    nowLocale: now.toString(),
    epoch: now.getTime(),
    tzOffsetMinutes: now.getTimezoneOffset(),
  });
}
