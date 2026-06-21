// Multi-brain registry — GET lists the user's brains (with live stats),
// POST creates a new one from a name + icon.
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { USER_ID } from '@/lib/constants';
import { listBrains, createBrain } from '@/lib/brains';

export async function GET() {
  const redis = await getRedis();
  const brains = await listBrains(redis, USER_ID);
  return NextResponse.json({ brains });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const icon = typeof body?.icon === 'string' && body.icon ? body.icon : '🧠';
  if (!name) {
    return NextResponse.json({ error: 'name (string) required' }, { status: 400 });
  }
  const redis = await getRedis();
  const brain = await createBrain(redis, USER_ID, name, icon);
  return NextResponse.json({ brain }, { status: 201 });
}
