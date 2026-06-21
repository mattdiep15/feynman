import { describe, it, expect, vi } from 'vitest';

const zRange = vi.fn(async () => ['compound_interest', 'principal']);
const hmGet = vi.fn(async (key: string) =>
  key.endsWith('compound_interest')
    ? ['Compound Interest', 'grows', '80', 'learned']
    : ['Principal', 'base', '0', 'untested'],
);
const sMembers = vi.fn(async (key: string) =>
  key.endsWith('compound_interest') ? ['principal:depends_on'] : [],
);

vi.mock('@/lib/redis', () => ({ getRedis: async () => ({ zRange, hmGet, sMembers }) }));

import { GET } from '@/app/api/graph/route';

describe('GET /api/graph', () => {
  it('returns nodes (no embedding) and links keyed by 3-part keys', async () => {
    const res = await GET(new Request('http://x/api/graph'));
    const { nodes, links } = await res.json();

    expect(zRange).toHaveBeenCalledWith('mastery:demo:finance', 0, -1);
    expect(hmGet).toHaveBeenCalledWith('concept:demo:finance:compound_interest', [
      'name',
      'summary',
      'masteryScore',
      'status',
    ]);

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ id: 'compound_interest', masteryScore: 80, status: 'learned' });
    // embedding must never be returned
    expect(nodes[0]).not.toHaveProperty('embedding');

    expect(links).toEqual([{ source: 'compound_interest', target: 'principal', type: 'depends_on' }]);
  });
});
