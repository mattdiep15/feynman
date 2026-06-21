// Feature 7 / R1 — Overview. GET → the unified brain field: every concept of
// every brain as a node (clustered per brain into a lobe on the client), plus
// intra-brain edges and dotted links between semantically similar brains.
import { NextResponse } from 'next/server';
import { commandOptions } from 'redis';
import { getRedis } from '@/lib/redis';
import { fromFloat32Buffer } from '@/lib/embed';
import { USER_ID } from '@/lib/constants';
import { listBrains, conceptKey, masteryKey, edgesKey } from '@/lib/brains';
import { nodeFromHash, memberToLink } from '@/lib/graph';
import {
  meanVector,
  pairwiseLinks,
  type BrainPoint,
  type OverviewNode,
  type OverviewConceptLink,
} from '@/lib/overview';

export async function GET() {
  const redis = await getRedis();
  const metas = await listBrains(redis, USER_ID);

  const perBrain = await Promise.all(
    metas.map(async (m) => {
      const ids = await redis.zRange(masteryKey(USER_ID, m.id), 0, -1);

      // Concept nodes, namespaced by brain. Never read `embedding` here — it's a
      // binary Buffer (Rule 2).
      const nodes: OverviewNode[] = await Promise.all(
        ids.map(async (id) => {
          const fields = await redis.hmGet(conceptKey(USER_ID, m.id, id), [
            'name',
            'summary',
            'masteryScore',
            'status',
          ]);
          const n = nodeFromHash(id, fields);
          return {
            id: `${m.id}::${id}`,
            conceptId: id,
            brainId: m.id,
            name: n.name,
            masteryScore: n.masteryScore,
            status: n.status,
          };
        }),
      );

      // Intra-brain edges, endpoints namespaced to match the nodes.
      const links: OverviewConceptLink[] = (
        await Promise.all(
          ids.map(async (id) => {
            const members = await redis.sMembers(edgesKey(USER_ID, m.id, id));
            return members.map((mem) => {
              const l = memberToLink(id, mem);
              return { source: `${m.id}::${l.source}`, target: `${m.id}::${l.target}`, brainId: m.id };
            });
          }),
        )
      ).flat();

      // Centroid of the brain's concept vectors → brain-level similarity links.
      const vectors = (
        await Promise.all(
          ids.map(async (id) => {
            const buf = await redis.hGet(
              commandOptions({ returnBuffers: true }),
              conceptKey(USER_ID, m.id, id),
              'embedding',
            );
            return buf ? fromFloat32Buffer(buf) : null;
          }),
        )
      ).filter((v): v is number[] => v !== null);

      return { meta: m, nodes, links, vector: meanVector(vectors) };
    }),
  );

  const brains: BrainPoint[] = perBrain.map((b) => b.meta);
  const nodes = perBrain.flatMap((b) => b.nodes);
  const conceptLinks = perBrain.flatMap((b) => b.links);
  const links = pairwiseLinks(perBrain.map((b) => ({ id: b.meta.id, vector: b.vector })));

  return NextResponse.json({ brains, nodes, conceptLinks, links });
}
