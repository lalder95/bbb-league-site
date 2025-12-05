import { NextResponse } from 'next/server';

// Simple in-memory progress store. Resets on server restart.
const globalStore = globalThis.__bbbMockDraftProgressStore || new Map();
globalThis.__bbbMockDraftProgressStore = globalStore;

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if (!key) return NextResponse.json({ ok: false, error: 'Missing key' }, { status: 400 });
    const value = globalStore.get(key) || { status: 'idle' };
    return NextResponse.json({ ok: true, ...value });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Failed to read progress' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { key, currentPickNumber, message, done } = body || {};
    if (!key) return NextResponse.json({ ok: false, error: 'Missing key' }, { status: 400 });
    const prev = globalStore.get(key) || {};
    const value = {
      status: done ? 'done' : 'running',
      currentPickNumber: currentPickNumber || prev.currentPickNumber || null,
      message: message || prev.message || 'Generating AI mock draft...'
    };
    globalStore.set(key, value);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Failed to update progress' }, { status: 500 });
  }
}
