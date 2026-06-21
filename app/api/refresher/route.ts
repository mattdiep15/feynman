// Refresher Mode — the weakest concepts to review next (nearly free via ZSET).
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { USER_ID, BRAIN_ID } from '@/lib/constants';
import { statusFromScore } from '@/lib/mastery';

export async function GET() {
  const redis = await getRedis();
  // ascending score → weakest first; 0..3 = weakest 4
  const ids = await redis.zRange(`mastery:${USER_ID}:${BRAIN_ID}`, 0, 3);

  const concepts = await Promise.all(
    ids.map(async (id) => {
      const [name, masteryScore, status] = await redis.hmGet(
        `concept:${USER_ID}:${BRAIN_ID}:${id}`,
        ['name', 'masteryScore', 'status'],
      );
      const score = Number(masteryScore ?? 0) || 0;
      return { id, name: name ?? id, masteryScore: score, status: status ?? statusFromScore(score) };
    }),
  );

  return NextResponse.json({ concepts });
}
