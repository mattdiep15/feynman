// Reset — wipe the current brain's data for a clean demo. Leaves the
// idx:concepts index intact (it re-applies to new concept:* hashes).
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { USER_ID, BRAIN_ID } from '@/lib/constants';

export async function POST() {
  const redis = await getRedis();

  const keys = [
    ...(await redis.keys(`concept:${USER_ID}:${BRAIN_ID}:*`)),
    ...(await redis.keys(`edges:${USER_ID}:${BRAIN_ID}:*`)),
    `mastery:${USER_ID}:${BRAIN_ID}`,
    `memory:longterm:${USER_ID}`,
    `brain:${USER_ID}:${BRAIN_ID}`,
  ];

  const deleted = keys.length ? await redis.del(keys) : 0; // del ignores missing keys
  return NextResponse.json({ ok: true, deleted });
}
