// Feature 3d — Evaluate. POST { conceptId, transcript } → embed → KNN → Claude
// → persist mastery + misconceptions → EvaluationResult.
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { embed, toFloat32Buffer } from '@/lib/embed';
import { claudeJson } from '@/lib/claude';
import { USER_ID, BRAIN_ID } from '@/lib/constants';
import { statusFromScore } from '@/lib/mastery';
import { withinBrainKnnQuery, parseSearchResults } from '@/lib/retrieve';
import { buildEvalPrompt, normalizeEvaluation } from '@/lib/evaluate';
import { readMisconceptions, mergeMisconceptions } from '@/lib/memory';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const conceptId = body?.conceptId;
  const transcript = body?.transcript;
  if (!conceptId || typeof conceptId !== 'string' || !transcript || typeof transcript !== 'string') {
    return NextResponse.json({ error: 'conceptId and transcript (strings) required' }, { status: 400 });
  }

  const redis = await getRedis();

  // 1. retrieve related concept nodes via KNN (the Redis "beyond caching" proof) (Rule 2)
  const queryEmbedding = await embed(transcript, 'query');
  const searchRes = await redis.ft.search('idx:concepts', withinBrainKnnQuery(5), {
    PARAMS: { vec: toFloat32Buffer(queryEmbedding) },
    DIALECT: 2,
    RETURN: ['name', 'summary', 'masteryScore', 'score'],
    SORTBY: 'score', // COSINE distance ascending = closest
  });
  const related = parseSearchResults(searchRes).filter((r) => r.id !== conceptId);

  // 2. target concept (omit embedding) + known misconceptions from long-term memory
  const [name, summary] = await redis.hmGet(`concept:${USER_ID}:${BRAIN_ID}:${conceptId}`, [
    'name',
    'summary',
  ]);
  const known = await readMisconceptions(redis);

  // 3. Claude evaluation, grounded in retrieved nodes (defensive parse, Rule 6)
  const raw = await claudeJson(
    buildEvalPrompt({ name: name ?? conceptId, summary: summary ?? '' }, transcript, related, known),
  );
  const evaluation = normalizeEvaluation(raw);

  // 4. persist mastery (HSET + ZADD) + append misconceptions to long-term memory
  const status = statusFromScore(evaluation.masteryScore);
  await redis.hSet(`concept:${USER_ID}:${BRAIN_ID}:${conceptId}`, {
    masteryScore: String(evaluation.masteryScore),
    status,
  });
  await redis.zAdd(`mastery:${USER_ID}:${BRAIN_ID}`, {
    score: evaluation.masteryScore,
    value: conceptId,
  });
  if (evaluation.misconceptions.length) {
    await mergeMisconceptions(redis, known, evaluation.misconceptions);
  }

  return NextResponse.json({ ...evaluation, status, related });
}
