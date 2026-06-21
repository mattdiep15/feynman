// Feature 2 — Graph. GET → nodes + links for react-force-graph (no embedding).
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { USER_ID, BRAIN_ID } from '@/lib/constants';
import { nodeFromHash, memberToLink } from '@/lib/graph';

export async function GET() {
  const redis = await getRedis();
  const ids = await redis.zRange(`mastery:${USER_ID}:${BRAIN_ID}`, 0, -1);

  const nodes = await Promise.all(
    ids.map(async (id) => {
      // Never read `embedding` back — it's a binary Buffer (Rule 2).
      const fields = await redis.hmGet(`concept:${USER_ID}:${BRAIN_ID}:${id}`, [
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
        const members = await redis.sMembers(`edges:${USER_ID}:${BRAIN_ID}:${id}`);
        return members.map((m) => memberToLink(id, m));
      }),
    )
  ).flat();

  return NextResponse.json({ nodes, links });
}
