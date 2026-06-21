// Feature 3b — Transcribe. POST raw audio blob → Deepgram STT → { transcript }.
import { NextResponse } from 'next/server';
import { transcribe } from '@/lib/deepgram';

export async function POST(req: Request) {
  const audio = Buffer.from(await req.arrayBuffer());
  if (!audio.length) {
    return NextResponse.json({ error: 'empty audio' }, { status: 400 });
  }
  const transcript = await transcribe(audio);
  return NextResponse.json({ transcript });
}
