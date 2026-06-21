// R3 — Commit a session's running score to mastery. POST { conceptId, brainId?,
// sessionScore, misconceptions? }. Called once when the student leaves a concept
// (node switch / brain switch / page unload). Blends the session score into
// prior mastery with decay (so one weak session can't tank it), bumps the
// attempt count by one per session, and merges any misconceptions surfaced.
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { USER_ID } from '@/lib/constants';
import { resolveBrainId, conceptKey, masteryKey } from '@/lib/brains';
import { statusFromScore } from '@/lib/mastery';
import { blendMastery } from '@/lib/score';
import { readMisconceptions, mergeMisconceptions } from '@/lib/memory';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const conceptId = body?.conceptId;
  const sessionScore = Number(body?.sessionScore);
  if (!conceptId || typeof conceptId !== 'string' || !Number.isFinite(sessionScore)) {
    return NextResponse.json({ error: 'conceptId (string) and sessionScore (number) required' }, { status: 400 });
  }
  const brainId = resolveBrainId(body?.brainId);
  const misconceptions: string[] = Array.isArray(body?.misconceptions)
    ? body.misconceptions.filter((m: unknown): m is string => typeof m === 'string')
    : [];

  const redis = await getRedis();

  // Prior mastery + attempt count drive the decay blend; first attempt counts
  // in full (blendMastery handles priorAttempts <= 0).
  const [priorRaw, attemptsRaw] = await redis.hmGet(conceptKey(USER_ID, brainId, conceptId), [
    'masteryScore',
    'attempts',
  ]);
  const priorScore = Number(priorRaw) || 0;
  const priorAttempts = Number(attemptsRaw) || 0;

  const masteryScore = blendMastery(priorScore, sessionScore, priorAttempts);
  const status = statusFromScore(masteryScore);

  await redis.hSet(conceptKey(USER_ID, brainId, conceptId), {
    masteryScore: String(masteryScore),
    status,
    attempts: String(priorAttempts + 1),
  });
  await redis.zAdd(masteryKey(USER_ID, brainId), { score: masteryScore, value: conceptId });

  if (misconceptions.length) {
    const known = await readMisconceptions(redis, USER_ID, brainId);
    await mergeMisconceptions(redis, known, misconceptions, USER_ID, brainId);
  }

  return NextResponse.json({ masteryScore, status });
}
