// Feature 7 — Overview. GET → every brain as a point in shared embedding space
// (centroid of its concept vectors) plus dotted links between similar brains.
import { NextResponse } from 'next/server';
import { commandOptions } from 'redis';
import { getRedis } from '@/lib/redis';
import { fromFloat32Buffer } from '@/lib/embed';
import { USER_ID } from '@/lib/constants';
import { listBrains, conceptKey, masteryKey } from '@/lib/brains';
import { meanVector, pairwiseLinks, type BrainPoint } from '@/lib/overview';

export async function GET() {
  const redis = await getRedis();
  const metas = await listBrains(redis, USER_ID);

  const brains = await Promise.all(
    metas.map(async (m) => {
      const ids = await redis.zRange(masteryKey(USER_ID, m.id), 0, -1);
      const vectors = (
        await Promise.all(
          ids.map(async (id) => {
            // Binary field → read as a Buffer, not a (corrupting) utf8 string.
            const buf = await redis.hGet(
              commandOptions({ returnBuffers: true }),
              conceptKey(USER_ID, m.id, id),
              'embedding',
            );
            return buf ? fromFloat32Buffer(buf) : null;
          }),
        )
      ).filter((v): v is number[] => v !== null);
      return { meta: m, vector: meanVector(vectors) };
    }),
  );

  const points: BrainPoint[] = brains.map((b) => b.meta);
  const links = pairwiseLinks(brains.map((b) => ({ id: b.meta.id, vector: b.vector })));

  return NextResponse.json({ brains: points, links });
}
