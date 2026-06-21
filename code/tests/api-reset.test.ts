import { describe, it, expect, vi } from 'vitest';

const keys = vi.fn(async (pattern: string) =>
  pattern.startsWith('concept:')
    ? ['concept:demo:finance:compound_interest', 'concept:demo:finance:principal']
    : pattern.startsWith('edges:')
      ? ['edges:demo:finance:compound_interest']
      : [],
);
const del = vi.fn(async (k: string[]) => k.length);
const sRem = vi.fn(async () => 1);

vi.mock('@/lib/redis', () => ({ getRedis: async () => ({ keys, del, sRem }) }));

import { POST } from '@/app/api/reset/route';

function post(body: unknown) {
  return new Request('http://x/api/reset', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/reset', () => {
  it('deletes concept/edge keys plus mastery, memory, and brain keys, and unregisters the brain', async () => {
    const res = await POST(post({}));
    const json = await res.json();

    expect(keys).toHaveBeenCalledWith('concept:demo:finance:*');
    expect(keys).toHaveBeenCalledWith('edges:demo:finance:*');
    expect(del).toHaveBeenCalledWith([
      'concept:demo:finance:compound_interest',
      'concept:demo:finance:principal',
      'edges:demo:finance:compound_interest',
      'mastery:demo:finance',
      'memory:longterm:demo:finance',
      'brain:demo:finance',
    ]);
    expect(sRem).toHaveBeenCalledWith('brains:demo', 'finance');
    expect(json).toEqual({ ok: true, deleted: 6 });
  });
});
