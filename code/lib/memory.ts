// Long-term memory: misconceptions live as a JSON array in the
// memory:longterm:${userId}:${brainId} hash field "misconceptions" (per-brain,
// so one subject's misconceptions don't bleed into another).
import { memoryKey } from './brains';

const MAX = 50; // keep the most recent N

type RedisLike = {
  hGet: (key: string, field: string) => Promise<string | null | undefined>;
  hSet: (key: string, value: Record<string, string>) => Promise<unknown>;
};

// Pure: dedupe known + fresh, keep most recent MAX.
export function mergeMisconceptionLists(known: string[], fresh: string[]): string[] {
  return Array.from(new Set([...known, ...fresh])).slice(-MAX);
}

export async function readMisconceptions(
  redis: RedisLike,
  userId: string,
  brainId: string,
): Promise<string[]> {
  const raw = await redis.hGet(memoryKey(userId, brainId), 'misconceptions');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function mergeMisconceptions(
  redis: RedisLike,
  known: string[],
  fresh: string[],
  userId: string,
  brainId: string,
): Promise<void> {
  const merged = mergeMisconceptionLists(known, fresh);
  await redis.hSet(memoryKey(userId, brainId), { misconceptions: JSON.stringify(merged) });
}
