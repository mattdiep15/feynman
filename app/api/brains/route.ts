// Multi-brain registry — GET lists the user's brains (with live stats),
// POST creates a new one from a name + icon, DELETE removes one entirely.
import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { USER_ID } from '@/lib/constants';
import {
  listBrains,
  createBrain,
  deleteBrain,
  renameBrain,
  setBrainIcon,
  isValidBrainId,
} from '@/lib/brains';
import { DEFAULT_BRAIN_ICON, isBrainIconKey } from '@/lib/brainIcons';

export async function GET() {
  const redis = await getRedis();
  const brains = await listBrains(redis, USER_ID);
  return NextResponse.json({ brains });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const icon = isBrainIconKey(body?.icon) ? body.icon : DEFAULT_BRAIN_ICON;
  if (!name) {
    return NextResponse.json({ error: 'name (string) required' }, { status: 400 });
  }
  const redis = await getRedis();
  const brain = await createBrain(redis, USER_ID, name, icon);
  return NextResponse.json({ brain }, { status: 201 });
}

// Update a brain's display name and/or icon (id/slug stays the same).
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const brainId = typeof body?.brainId === 'string' ? body.brainId : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const icon = isBrainIconKey(body?.icon) ? body.icon : '';
  if (!brainId || !isValidBrainId(brainId) || (!name && !icon)) {
    return NextResponse.json({ error: 'valid brainId and name or icon required' }, { status: 400 });
  }
  const redis = await getRedis();
  if (name) await renameBrain(redis, USER_ID, brainId, name);
  if (icon) await setBrainIcon(redis, USER_ID, brainId, icon);
  return NextResponse.json({ ok: true });
}

// Delete a brain entirely (data + registry entry). brainId comes from the query
// string; require an explicit, valid id so a missing param can't fall through to
// the default brain.
export async function DELETE(req: Request) {
  const brainId = new URL(req.url).searchParams.get('brainId');
  if (!brainId || !isValidBrainId(brainId)) {
    return NextResponse.json({ error: 'valid brainId required' }, { status: 400 });
  }
  const redis = await getRedis();
  const deleted = await deleteBrain(redis, USER_ID, brainId);
  return NextResponse.json({ deleted });
}
