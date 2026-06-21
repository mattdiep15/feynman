// Rule 3 — ensureIndexes() runs before any FT.SEARCH and is idempotent.
// DIM is imported from lib/embed.ts — never typed twice.
import { createClient, SchemaFieldTypes, VectorAlgorithms } from 'redis';
import { EMBEDDING_DIM } from './embed';

export const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', (e) => console.error('Redis error', e));

// Connect once (memoized so concurrent requests don't double-open the socket);
// index separately so a failed ensureIndexes() doesn't trigger a re-connect.
let connectPromise: Promise<unknown> | null = null;
let indexed = false;
export async function getRedis() {
  if (!redis.isOpen) {
    if (!connectPromise) {
      connectPromise = redis.connect().catch((e) => {
        connectPromise = null; // allow a retry on the next request
        throw e;
      });
    }
    await connectPromise;
  }
  if (!indexed) {
    await ensureIndexes();
    indexed = true; // only flips on success; retries until Search is available
  }
  return redis;
}

export async function ensureIndexes() {
  // idempotent — safe on every cold start
  try {
    await redis.ft.create(
      'idx:concepts',
      {
        userId: { type: SchemaFieldTypes.TAG },
        brainId: { type: SchemaFieldTypes.TAG },
        masteryScore: { type: SchemaFieldTypes.NUMERIC },
        name: { type: SchemaFieldTypes.TEXT },
        summary: { type: SchemaFieldTypes.TEXT },
        embedding: {
          type: SchemaFieldTypes.VECTOR,
          ALGORITHM: VectorAlgorithms.FLAT,
          TYPE: 'FLOAT32',
          DIM: EMBEDDING_DIM, // ✅ single source of truth
          DISTANCE_METRIC: 'COSINE',
        },
      },
      { ON: 'HASH', PREFIX: 'concept:' },
    );
  } catch (e: any) {
    if (!String(e?.message ?? e).includes('Index already exists')) throw e;
  }
}
