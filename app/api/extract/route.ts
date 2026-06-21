// Feature 1 — Notes → Graph. POST { notes } → Claude JSON → embed → Redis.
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { embed, toFloat32Buffer } from '@/lib/embed';
import { claudeJson } from '@/lib/claude';
import { USER_ID, BRAIN_ID } from '@/lib/constants';
import { buildExtractPrompt, normalizeExtraction } from '@/lib/extract';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const notes = body?.notes;
  if (!notes || typeof notes !== 'string') {
    return NextResponse.json({ error: 'notes (string) required' }, { status: 400 });
  }

  const redis = await getRedis();

  // 1. Claude → defensively-parsed JSON → validated concepts/edges (Rule 6).
  // Generous max_tokens: a notes dump can yield many concepts/edges, and a
  // truncated response is unterminated JSON that parseJson can't recover.
  const raw = await claudeJson(buildExtractPrompt(notes), { maxTokens: 8192 });
  const { concepts, edges } = normalizeExtraction(raw);

  // 2. each concept: HSET (incl. Buffer embedding, userId, brainId) + ZADD mastery (Rule 2)
  for (const concept of concepts) {
    await redis.hSet(`concept:${USER_ID}:${BRAIN_ID}:${concept.id}`, {
      name: concept.name,
      summary: concept.summary,
      masteryScore: '0',
      status: 'untested',
      userId: USER_ID,
      brainId: BRAIN_ID,
      embedding: toFloat32Buffer(await embed(concept.summary, 'document')),
    });
    await redis.zAdd(`mastery:${USER_ID}:${BRAIN_ID}`, { score: 0, value: concept.id });
  }

  // 3. each edge: SADD edges:${USER_ID}:${BRAIN_ID}:${from}  `${to}:${type}`
  for (const edge of edges) {
    await redis.sAdd(`edges:${USER_ID}:${BRAIN_ID}:${edge.from}`, `${edge.to}:${edge.type}`);
  }

  return NextResponse.json({ concepts, edges });
}
