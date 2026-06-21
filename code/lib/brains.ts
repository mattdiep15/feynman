// Multi-brain support. Centralizes every Redis key pattern (so brainId can be
// parameterized from one place) and the brain registry helpers that read/write
// the per-user list of brains.
import { DEFAULT_BRAIN_ID } from './constants';
import { normalizeIconKey } from './brainIcons';
import type { getRedis } from './redis';

type Redis = Awaited<ReturnType<typeof getRedis>>;

// ---- Key builders -------------------------------------------------------
export const conceptKey = (userId: string, brainId: string, conceptId: string) =>
  `concept:${userId}:${brainId}:${conceptId}`;
export const masteryKey = (userId: string, brainId: string) => `mastery:${userId}:${brainId}`;
export const edgesKey = (userId: string, brainId: string, from: string) =>
  `edges:${userId}:${brainId}:${from}`;
export const brainKey = (userId: string, brainId: string) => `brain:${userId}:${brainId}`;
export const brainsSetKey = (userId: string) => `brains:${userId}`;
export const memoryKey = (userId: string, brainId: string) => `memory:longterm:${userId}:${brainId}`;

// ---- Slug / validation --------------------------------------------------
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'brain';
}

const VALID_BRAIN_ID = /^[a-z0-9_-]{1,40}$/;
export function isValidBrainId(id: string): boolean {
  return VALID_BRAIN_ID.test(id);
}

// Resolve a brainId from request input (query/body), falling back to the
// default brain. Rejects unsafe values so they can't leak into TAG queries.
export function resolveBrainId(raw: unknown): string {
  return typeof raw === 'string' && isValidBrainId(raw) ? raw : DEFAULT_BRAIN_ID;
}

// ---- Registry -----------------------------------------------------------
export interface BrainMeta {
  id: string;
  name: string;
  icon: string;
  conceptCount: number;
  avgMastery: number;
}

// Pre-multibrain data has no registry entry. If the registry is empty but the
// default brain already has concepts, register it so today's data still shows.
export async function ensureDefaultBrain(redis: Redis, userId: string): Promise<void> {
  const ids = await redis.sMembers(brainsSetKey(userId));
  if (ids.length) return;
  const hasData = await redis.exists(masteryKey(userId, DEFAULT_BRAIN_ID));
  if (hasData) {
    await redis.sAdd(brainsSetKey(userId), DEFAULT_BRAIN_ID);
    await redis.hSet(brainKey(userId, DEFAULT_BRAIN_ID), {
      name: 'Personal Finance',
      icon: 'wallet',
      createdAt: '0',
    });
  }
}

export async function listBrains(redis: Redis, userId: string): Promise<BrainMeta[]> {
  await ensureDefaultBrain(redis, userId);
  const ids = await redis.sMembers(brainsSetKey(userId));
  const brains = await Promise.all(
    ids.map(async (id) => {
      const meta = await redis.hGetAll(brainKey(userId, id));
      const scored = await redis.zRangeWithScores(masteryKey(userId, id), 0, -1);
      const conceptCount = scored.length;
      const avgMastery = conceptCount
        ? Math.round(scored.reduce((sum, m) => sum + m.score, 0) / conceptCount)
        : 0;
      return { id, name: meta.name || id, icon: normalizeIconKey(meta.icon), conceptCount, avgMastery };
    }),
  );
  return brains.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createBrain(
  redis: Redis,
  userId: string,
  name: string,
  icon: string,
): Promise<BrainMeta> {
  const base = slugify(name);
  let id = base;
  let n = 1;
  while (await redis.sIsMember(brainsSetKey(userId), id)) {
    id = `${base}-${++n}`;
  }
  await redis.sAdd(brainsSetKey(userId), id);
  await redis.hSet(brainKey(userId, id), { name, icon, createdAt: String(Date.now()) });
  return { id, name, icon, conceptCount: 0, avgMastery: 0 };
}

// Rename a brain (its id/slug is unchanged — only the display name).
export async function renameBrain(
  redis: Redis,
  userId: string,
  brainId: string,
  name: string,
): Promise<void> {
  await redis.hSet(brainKey(userId, brainId), { name });
}

// Change a brain's icon (display only — id/slug is unchanged).
export async function setBrainIcon(
  redis: Redis,
  userId: string,
  brainId: string,
  icon: string,
): Promise<void> {
  await redis.hSet(brainKey(userId, brainId), { icon });
}

// Generalized reset: wipe one brain's data and drop it from the registry.
export async function deleteBrain(redis: Redis, userId: string, brainId: string): Promise<number> {
  const keys = [
    ...(await redis.keys(conceptKey(userId, brainId, '*'))),
    ...(await redis.keys(edgesKey(userId, brainId, '*'))),
    masteryKey(userId, brainId),
    memoryKey(userId, brainId),
    brainKey(userId, brainId),
  ];
  const deleted = keys.length ? await redis.del(keys) : 0;
  await redis.sRem(brainsSetKey(userId), brainId);
  return deleted;
}
