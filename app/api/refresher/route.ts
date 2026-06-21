// Refresher Mode — the weakest concepts to review next (nearly free via ZSET).
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { USER_ID } from '@/lib/constants';
import { resolveBrainId, masteryKey, conceptKey } from '@/lib/brains';
import { statusFromScore } from '@/lib/mastery';

export async function GET(req: Request) {
  const brainId = resolveBrainId(new URL(req.url).searchParams.get('brainId'));
  const redis = await getRedis();
  // ascending score → weakest first; 0..3 = weakest 4
  const ids = await redis.zRange(masteryKey(USER_ID, brainId), 0, 3);

  const concepts = await Promise.all(
    ids.map(async (id) => {
      const [name, masteryScore, status] = await redis.hmGet(conceptKey(USER_ID, brainId, id), [
        'name',
        'masteryScore',
        'status',
      ]);
      const score = Number(masteryScore ?? 0) || 0;
      return { id, name: name ?? id, masteryScore: score, status: status ?? statusFromScore(score) };
    }),
  );

  return NextResponse.json({ concepts });
}
