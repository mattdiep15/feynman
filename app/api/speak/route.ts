// Feature 3e — Speak. POST { text } → Deepgram TTS → audio/mpeg stream.
import { NextResponse } from 'next/server';
import { synthesize } from '@/lib/deepgram';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = body?.text;
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text (string) required' }, { status: 400 });
  }
  const stream = await synthesize(text);
  return new Response(stream, { headers: { 'content-type': 'audio/mpeg' } });
}
