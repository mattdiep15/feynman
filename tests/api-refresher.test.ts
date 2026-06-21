import { describe, it, expect, vi } from 'vitest';

const zRange = vi.fn(async () => ['untested_a', 'weak_b']);
const hmGet = vi.fn(async (key: string) =>
  key.endsWith('untested_a') ? ['Concept A', '0', 'untested'] : ['Concept B', '20', 'weak'],
);

vi.mock('@/lib/redis', () => ({ getRedis: async () => ({ zRange, hmGet }) }));

import { GET } from '@/app/api/refresher/route';

describe('GET /api/refresher', () => {
  it('returns the weakest 4 concepts (ZRANGE 0..3 ascending)', async () => {
    const res = await GET();
    const { concepts } = await res.json();

    expect(zRange).toHaveBeenCalledWith('mastery:demo:finance', 0, 3);
    expect(concepts).toEqual([
      { id: 'untested_a', name: 'Concept A', masteryScore: 0, status: 'untested' },
      { id: 'weak_b', name: 'Concept B', masteryScore: 20, status: 'weak' },
    ]);
  });
});
