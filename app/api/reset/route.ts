// Reset — wipe one brain's data for a clean demo (and drop it from the
// registry). Leaves the idx:concepts index intact (it re-applies to new
// concept:* hashes). brainId comes from the body; defaults to the default brain.
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { USER_ID } from '@/lib/constants';
import { resolveBrainId, deleteBrain } from '@/lib/brains';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const brainId = resolveBrainId(body?.brainId);
  const redis = await getRedis();
  const deleted = await deleteBrain(redis, USER_ID, brainId);
  return NextResponse.json({ ok: true, deleted });
}
