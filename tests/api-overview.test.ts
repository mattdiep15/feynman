import { describe, it, expect, vi } from 'vitest';

// Real key builders, mocked listBrains (its own Redis access is tested elsewhere).
vi.mock('@/lib/brains', async () => {
  const actual = await vi.importActual<typeof import('@/lib/brains')>('@/lib/brains');
  return {
    ...actual,
    listBrains: vi.fn(async () => [
      { id: 'finance', name: 'Finance', icon: '💰', conceptCount: 1, avgMastery: 50 },
      { id: 'math', name: 'Math', icon: '📐', conceptCount: 1, avgMastery: 70 },
      { id: 'empty', name: 'Empty', icon: '🧠', conceptCount: 0, avgMastery: 0 },
    ]),
  };
});

const f32 = (a: number[]) => Buffer.from(new Float32Array(a).buffer);

const zRange = vi.fn(async (key: string) => {
  if (key.includes('finance')) return ['fc'];
  if (key.includes('math')) return ['mc'];
  return []; // empty brain
});
// Vectors: finance and math are similar (high cosine) → should link.
const hGet = vi.fn(async (_opts: unknown, key: string) =>
  key.includes('finance') ? f32([1, 0, 0]) : f32([0.9, 0.1, 0]),
);

vi.mock('@/lib/redis', () => ({ getRedis: async () => ({ zRange, hGet }) }));

import { GET } from '@/app/api/overview/route';

describe('GET /api/overview', () => {
  it('returns every brain and a dotted link between similar ones', async () => {
    const res = await GET();
    const json = await res.json();

    expect(json.brains.map((b: any) => b.id)).toEqual(['finance', 'math', 'empty']);

    // finance ↔ math are similar; the empty brain (no vector) has no links.
    expect(json.links).toHaveLength(1);
    expect(json.links[0]).toMatchObject({ source: 'finance', target: 'math' });
    expect(json.links[0].score).toBeGreaterThan(0.5);
    expect(json.links[0].score).toBeLessThanOrEqual(1);
  });
});
