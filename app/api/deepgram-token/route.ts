// R5 — mint a short-lived, scoped Deepgram key for the browser's live STT
// WebSocket. The master key stays server-side; this returns a 60s key the client
// uses to authenticate `wss://api.deepgram.com/v1/listen`.
import { NextResponse } from 'next/server';
import { createScopedKey } from '@/lib/deepgram';

export async function POST() {
  try {
    const { key, expiresIn } = await createScopedKey(60);
    return NextResponse.json({ key, expiresIn });
  } catch (e) {
    // Non-fatal: the client falls back to prerecorded /api/transcribe.
    console.error('deepgram-token error', e);
    return NextResponse.json({ error: 'could not mint token' }, { status: 502 });
  }
}
