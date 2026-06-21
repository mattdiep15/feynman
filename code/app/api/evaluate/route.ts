// Feature 3d — Evaluate (R3: session-based). POST { conceptId, transcript,
// brainId?, priorTurns? } → embed → KNN → Claude → cumulative session score.
// This route NO LONGER persists: scoring stays provisional in the chat until the
// session is committed (see /api/commit). It judges the student's cumulative
// understanding across priorTurns + the latest transcript.
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { embed, toFloat32Buffer } from '@/lib/embed';
import { claudeTool } from '@/lib/claude';
import { USER_ID } from '@/lib/constants';
import { resolveBrainId, conceptKey } from '@/lib/brains';
import { withinBrainKnnQuery, crossBrainKnnQuery, parseSearchResults } from '@/lib/retrieve';
import { buildEvalPrompt, normalizeEvaluation, EVALUATION_TOOL } from '@/lib/evaluate';
import { readMisconceptions } from '@/lib/memory';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const conceptId = body?.conceptId;
  const transcript = body?.transcript;
  if (!conceptId || typeof conceptId !== 'string' || !transcript || typeof transcript !== 'string') {
    return NextResponse.json({ error: 'conceptId and transcript (strings) required' }, { status: 400 });
  }
  const brainId = resolveBrainId(body?.brainId);
  // Earlier accepted turns this session — the cumulative context that fixes the
  // k=1 lookback problem (a follow-up no longer "forgets" the basics).
  const priorTurns: string[] = Array.isArray(body?.priorTurns)
    ? body.priorTurns.filter((t: unknown): t is string => typeof t === 'string')
    : [];
  const feedbackDetail: 'brief' | 'standard' | 'detailed' =
    body?.feedbackDetail === 'brief' || body?.feedbackDetail === 'detailed'
      ? body.feedbackDetail
      : 'standard';

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
  const known = await readMisconceptions(redis, USER_ID, brainId);

  // 3. Claude evaluation, grounded in retrieved nodes + the session so far.
  // Forced tool use guarantees structure; normalizeEvaluation still clamps.
  const raw = await claudeTool(
    buildEvalPrompt(
      { name: name ?? conceptId, summary: summary ?? '' },
      transcript,
      related,
      known,
      crossBrain,
      priorTurns.join('\n\n'),
      feedbackDetail,
    ),
    EVALUATION_TOOL,
  );
  const evaluation = normalizeEvaluation(raw);

  // No persistence here — masteryScore is the cumulative session score the chat
  // shows provisionally; it commits to mastery only via /api/commit on leave.
  return NextResponse.json({
    ...evaluation,
    sessionScore: evaluation.masteryScore,
    related,
    crossBrain,
  });
}
