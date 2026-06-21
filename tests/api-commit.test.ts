import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prior mastery 40 over 2 attempts by default; hGet (misconceptions) empty.
const hmGet = vi.fn(async (): Promise<(string | null)[]> => ['40', '2']);
const hGet = vi.fn(async () => null);
const hSet = vi.fn(async () => 1);
const zAdd = vi.fn(async () => 1);

vi.mock('@/lib/redis', () => ({
  getRedis: async () => ({ hmGet, hGet, hSet, zAdd }),
}));

import { POST } from '@/app/api/commit/route';

function post(body: unknown) {
  return new Request('http://x/api/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  hmGet.mockClear();
  hGet.mockClear();
  hSet.mockClear();
  zAdd.mockClear();
  hmGet.mockImplementation(async (): Promise<(string | null)[]> => ['40', '2']);
});

describe('POST /api/commit', () => {
  it('requires conceptId and a numeric sessionScore', async () => {
    expect((await POST(post({ sessionScore: 80 }))).status).toBe(400);
    expect((await POST(post({ conceptId: 'x' }))).status).toBe(400);
    expect((await POST(post({ conceptId: 'x', sessionScore: 'nope' }))).status).toBe(400);
  });

  it('blends the session score into prior mastery and persists once (alpha 0.25)', async () => {
    const res = await POST(post({ conceptId: 'compound_interest', brainId: 'finance', sessionScore: 80 }));
    const json = await res.json();

    // prior 40 (2 attempts) + session 80 → 0.25*80 + 0.75*40 = 50; attempts → 3.
    expect(json.masteryScore).toBe(50);
    expect(json.status).toBe('shaky');
    expect(hSet).toHaveBeenCalledWith('concept:demo:finance:compound_interest', {
      masteryScore: '50',
      status: 'shaky',
      attempts: '3',
    });
    expect(zAdd).toHaveBeenCalledWith('mastery:demo:finance', { score: 50, value: 'compound_interest' });
  });

  it('counts the first session in full when there is no prior history', async () => {
    hmGet.mockImplementation(async (): Promise<(string | null)[]> => ['0', null]);
    const res = await POST(post({ conceptId: 'fresh', brainId: 'finance', sessionScore: 72 }));
    const json = await res.json();

    expect(json.masteryScore).toBe(72);
    expect(hSet).toHaveBeenCalledWith('concept:demo:finance:fresh', {
      masteryScore: '72',
      status: 'learned',
      attempts: '1',
    });
  });

  it('merges surfaced misconceptions into long-term memory', async () => {
    await POST(
      post({
        conceptId: 'compound_interest',
        brainId: 'finance',
        sessionScore: 80,
        misconceptions: ['thinks interest is linear'],
      }),
    );
    expect(hSet).toHaveBeenCalledWith('memory:longterm:demo:finance', {
      misconceptions: JSON.stringify(['thinks interest is linear']),
    });
  });

  it('skips the memory write when no misconceptions are sent', async () => {
    await POST(post({ conceptId: 'compound_interest', brainId: 'finance', sessionScore: 80 }));
    expect(hSet).not.toHaveBeenCalledWith('memory:longterm:demo:finance', expect.anything());
  });
});
