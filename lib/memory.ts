// Long-term memory: misconceptions live as a JSON array in the
// memory:longterm:${USER_ID} hash field "misconceptions".
import { USER_ID } from './constants';

const KEY = `memory:longterm:${USER_ID}`;
const MAX = 50; // keep the most recent N

type RedisLike = {
  hGet: (key: string, field: string) => Promise<string | null | undefined>;
  hSet: (key: string, value: Record<string, string>) => Promise<unknown>;
};

// Pure: dedupe known + fresh, keep most recent MAX.
export function mergeMisconceptionLists(known: string[], fresh: string[]): string[] {
  return Array.from(new Set([...known, ...fresh])).slice(-MAX);
}

export async function readMisconceptions(redis: RedisLike): Promise<string[]> {
  const raw = await redis.hGet(KEY, 'misconceptions');
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
): Promise<void> {
  const merged = mergeMisconceptionLists(known, fresh);
  await redis.hSet(KEY, { misconceptions: JSON.stringify(merged) });
}
