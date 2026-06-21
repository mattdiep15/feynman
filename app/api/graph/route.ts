// Feature 2 — Graph. GET ?brainId → nodes + links for react-force-graph (no embedding).
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { USER_ID } from '@/lib/constants';
import { resolveBrainId, masteryKey, conceptKey, edgesKey } from '@/lib/brains';
import { nodeFromHash, memberToLink } from '@/lib/graph';

export async function GET(req: Request) {
  const brainId = resolveBrainId(new URL(req.url).searchParams.get('brainId'));
  const redis = await getRedis();
  const ids = await redis.zRange(masteryKey(USER_ID, brainId), 0, -1);

  const nodes = await Promise.all(
    ids.map(async (id) => {
      // Never read `embedding` back — it's a binary Buffer (Rule 2).
      const fields = await redis.hmGet(conceptKey(USER_ID, brainId, id), [
        'name',
        'summary',
        'masteryScore',
        'status',
      ]);
      return nodeFromHash(id, fields);
    }),
  );

  const links = (
    await Promise.all(
      ids.map(async (id) => {
        const members = await redis.sMembers(edgesKey(USER_ID, brainId, id));
        return members.map((m) => memberToLink(id, m));
      }),
    )
  ).flat();

  return NextResponse.json({ nodes, links });
}
