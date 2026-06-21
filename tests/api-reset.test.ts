import { describe, it, expect, vi } from 'vitest';

const keys = vi.fn(async (pattern: string) =>
  pattern.startsWith('concept:')
    ? ['concept:demo:finance:compound_interest', 'concept:demo:finance:principal']
    : pattern.startsWith('edges:')
      ? ['edges:demo:finance:compound_interest']
      : [],
);
const del = vi.fn(async (k: string[]) => k.length);

vi.mock('@/lib/redis', () => ({ getRedis: async () => ({ keys, del }) }));

import { POST } from '@/app/api/reset/route';

describe('POST /api/reset', () => {
  it('deletes concept/edge keys plus mastery, memory, and brain keys', async () => {
    const res = await POST();
    const json = await res.json();

    expect(keys).toHaveBeenCalledWith('concept:demo:finance:*');
    expect(keys).toHaveBeenCalledWith('edges:demo:finance:*');
    expect(del).toHaveBeenCalledWith([
      'concept:demo:finance:compound_interest',
      'concept:demo:finance:principal',
      'edges:demo:finance:compound_interest',
      'mastery:demo:finance',
      'memory:longterm:demo',
      'brain:demo:finance',
    ]);
    expect(json).toEqual({ ok: true, deleted: 6 });
  });
});
