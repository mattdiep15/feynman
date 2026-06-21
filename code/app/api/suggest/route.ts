// Feature 6 — Coverage suggestions. GET ?brainId → ephemeral adjacent-concept
// suggestions seeded from mastered nodes. POST promotes one into a real concept.
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { embed, toFloat32Buffer } from '@/lib/embed';
import { claudeTool } from '@/lib/claude';
import { USER_ID } from '@/lib/constants';
import { resolveBrainId, conceptKey, masteryKey, edgesKey } from '@/lib/brains';
import {
  SUGGEST_THRESHOLD,
  SUGGESTION_TOOL,
  buildSuggestPrompt,
  normalizeSuggestions,
  type MasteredConcept,
} from '@/lib/suggest';

export async function GET(req: Request) {
  const brainId = resolveBrainId(new URL(req.url).searchParams.get('brainId'));
  const redis = await getRedis();

  // All concepts (to avoid suggesting ones that already exist) + the mastered
  // subset that seeds suggestions.
  const scored = await redis.zRangeWithScores(masteryKey(USER_ID, brainId), 0, -1);
  const existingIds = new Set(scored.map((s) => s.value));
  const masteredIds = scored.filter((s) => s.score >= SUGGEST_THRESHOLD).map((s) => s.value);
  if (!masteredIds.length) return NextResponse.json({ suggestions: [] });

  const mastered: MasteredConcept[] = await Promise.all(
    masteredIds.map(async (id) => {
      const [name, summary] = await redis.hmGet(conceptKey(USER_ID, brainId, id), ['name', 'summary']);
      return { id, name: name ?? id, summary: summary ?? '' };
    }),
  );

  const raw = await claudeTool(buildSuggestPrompt(mastered), SUGGESTION_TOOL);
  const suggestions = normalizeSuggestions(raw, new Set(masteredIds), existingIds);
  return NextResponse.json({ suggestions });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const sourceId = body?.sourceId;
  const id = body?.id;
  const name = body?.name;
  const summary = typeof body?.summary === 'string' ? body.summary : '';
  if (
    typeof sourceId !== 'string' ||
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    !id ||
    !name
  ) {
    return NextResponse.json({ error: 'sourceId, id and name (strings) required' }, { status: 400 });
  }
  const brainId = resolveBrainId(body?.brainId);

  const redis = await getRedis();
  const key = conceptKey(USER_ID, brainId, id);

  // Additive, mirroring extract: don't clobber an existing concept (Feature 2).
  if (!(await redis.exists(key))) {
    await redis.hSet(key, {
      name,
      summary,
      masteryScore: '0',
      status: 'untested',
      userId: USER_ID,
      brainId,
      embedding: toFloat32Buffer(await embed(summary || name, 'document')),
    });
    await redis.zAdd(masteryKey(USER_ID, brainId), { score: 0, value: id });
  }
  // Link the new concept to the mastered concept it extends.
  await redis.sAdd(edgesKey(USER_ID, brainId, sourceId), `${id}:relates_to`);

  return NextResponse.json({ ok: true, id });
}
