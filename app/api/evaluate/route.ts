// Feature 3d — Evaluate. POST { conceptId, transcript, brainId? } → embed → KNN
// → Claude → persist mastery + misconceptions → EvaluationResult.
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { embed, toFloat32Buffer } from '@/lib/embed';
import { claudeTool } from '@/lib/claude';
import { USER_ID } from '@/lib/constants';
import { resolveBrainId, conceptKey, masteryKey } from '@/lib/brains';
import { statusFromScore } from '@/lib/mastery';
import { withinBrainKnnQuery, crossBrainKnnQuery, parseSearchResults } from '@/lib/retrieve';
import { buildEvalPrompt, normalizeEvaluation, EVALUATION_TOOL } from '@/lib/evaluate';
import { blendMastery } from '@/lib/score';
import { readMisconceptions, mergeMisconceptions } from '@/lib/memory';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const conceptId = body?.conceptId;
  const transcript = body?.transcript;
  if (!conceptId || typeof conceptId !== 'string' || !transcript || typeof transcript !== 'string') {
    return NextResponse.json({ error: 'conceptId and transcript (strings) required' }, { status: 400 });
  }
  const brainId = resolveBrainId(body?.brainId);

  const redis = await getRedis();

  // 1. retrieve related concept nodes via KNN (the Redis "beyond caching" proof) (Rule 2)
  const queryEmbedding = await embed(transcript, 'query');
  const searchRes = await redis.ft.search('idx:concepts', withinBrainKnnQuery(5, USER_ID, brainId), {
    PARAMS: { vec: toFloat32Buffer(queryEmbedding) },
    DIALECT: 2,
    RETURN: ['name', 'summary', 'masteryScore', 'score'],
    SORTBY: 'score', // COSINE distance ascending = closest
  });
  const related = parseSearchResults(searchRes).filter((r) => r.id !== conceptId);

  // 1b. cross-brain analogical bridges (Feature 4): same index, drop the brain
  // filter to search OTHER brains. Graceful (empty) when only one brain exists.
  const crossRes = await redis.ft.search('idx:concepts', crossBrainKnnQuery(3, USER_ID, brainId), {
    PARAMS: { vec: toFloat32Buffer(queryEmbedding) },
    DIALECT: 2,
    RETURN: ['name', 'summary', 'brainId', 'masteryScore'],
  });
  const crossBrain = parseSearchResults(crossRes);

  // 2. target concept (omit embedding) + known misconceptions from long-term memory
  const [name, summary] = await redis.hmGet(conceptKey(USER_ID, brainId, conceptId), [
    'name',
    'summary',
  ]);
  // Prior mastery + attempt count drive the decay blend (Feature 4).
  const [priorRaw, attemptsRaw] = await redis.hmGet(conceptKey(USER_ID, brainId, conceptId), [
    'masteryScore',
    'attempts',
  ]);
  const priorScore = Number(priorRaw) || 0;
  const priorAttempts = Number(attemptsRaw) || 0;
  const known = await readMisconceptions(redis, USER_ID, brainId);

  // 3. Claude evaluation, grounded in retrieved nodes. Forced tool use
  // guarantees structure; normalizeEvaluation still clamps as defense (Rule 6).
  const raw = await claudeTool(
    buildEvalPrompt(
      { name: name ?? conceptId, summary: summary ?? '' },
      transcript,
      related,
      known,
      crossBrain,
    ),
    EVALUATION_TOOL,
  );
  const evaluation = normalizeEvaluation(raw);

  // 3b. blend this turn's score into prior mastery with decay so history counts
  // and one weak turn doesn't tank the score (Feature 4).
  const masteryScore = blendMastery(priorScore, evaluation.masteryScore, priorAttempts);

  // 4. persist blended mastery (HSET + ZADD), bump attempts, append misconceptions
  const status = statusFromScore(masteryScore);
  await redis.hSet(conceptKey(USER_ID, brainId, conceptId), {
    masteryScore: String(masteryScore),
    status,
    attempts: String(priorAttempts + 1),
  });
  await redis.zAdd(masteryKey(USER_ID, brainId), {
    score: masteryScore,
    value: conceptId,
  });
  if (evaluation.misconceptions.length) {
    await mergeMisconceptions(redis, known, evaluation.misconceptions, USER_ID, brainId);
  }

  // masteryScore reflects the blended value the UI should recolor to; turnScore
  // is this explanation's standalone score.
  return NextResponse.json({
    ...evaluation,
    masteryScore,
    turnScore: evaluation.masteryScore,
    status,
    related,
    crossBrain,
  });
}
