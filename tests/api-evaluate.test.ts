import { describe, it, expect, vi, beforeEach } from 'vitest';

const ftSearch = vi.fn(async (_idx: string, query: string) =>
  query.includes('-@brainId')
    ? {
        // cross-brain hit from another brain
        total: 1,
        documents: [
          { id: 'concept:demo:math:exp_growth', value: { name: 'Exponential Growth', summary: 'fast', brainId: 'math', masteryScore: '80' } },
        ],
      }
    : {
        total: 2,
        documents: [
          { id: 'concept:demo:finance:principal', value: { name: 'Principal', summary: 'base', masteryScore: '0', score: '0.2' } },
          { id: 'concept:demo:finance:compound_interest', value: { name: 'Compound Interest', summary: 'grows', masteryScore: '0', score: '0.05' } },
        ],
      },
);
const hmGet = vi.fn(async () => ['Compound Interest', 'grows over time']);
const hGet = vi.fn(async () => null);
const hSet = vi.fn(async () => 1);
const zAdd = vi.fn(async () => 1);

vi.mock('@/lib/redis', () => ({
  getRedis: async () => ({ ft: { search: ftSearch }, hmGet, hGet, hSet, zAdd }),
}));
vi.mock('@/lib/embed', () => ({
  embed: vi.fn(async () => [0.1, 0.2, 0.3]),
  toFloat32Buffer: (a: number[]) => Buffer.from(new Float32Array(a).buffer),
}));
vi.mock('@/lib/claude', () => ({
  claudeTool: vi.fn(async () => ({
    masteryScore: 55,
    correct: ['defined principal'],
    missing: ['role of time'],
    misconceptions: ['thinks interest is linear'],
    feedbackMessage: 'Good start — you skipped how time compounds.',
    followUpQuestion: 'What happens over more years?',
  })),
}));

import { POST } from '@/app/api/evaluate/route';

function post(body: unknown) {
  return new Request('http://x/api/evaluate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  hSet.mockClear();
  zAdd.mockClear();
  ftSearch.mockClear();
});

describe('POST /api/evaluate', () => {
  it('requires conceptId and transcript', async () => {
    expect((await POST(post({ conceptId: 'x' }))).status).toBe(400);
    expect((await POST(post({ transcript: 'x' }))).status).toBe(400);
  });

  it('runs KNN, persists mastery + status, excludes the target from related', async () => {
    const res = await POST(post({ conceptId: 'compound_interest', transcript: 'it grows' }));
    const json = await res.json();

    // KNN query used the within-brain filter (Rule 2)
    expect(ftSearch).toHaveBeenCalledWith(
      'idx:concepts',
      '(@userId:{demo} @brainId:{finance})=>[KNN 5 @embedding $vec AS score]',
      expect.objectContaining({ DIALECT: 2, SORTBY: 'score' }),
    );

    // mastery persisted (HSET status derived from score 55 → shaky) + ZADD
    expect(hSet).toHaveBeenCalledWith('concept:demo:finance:compound_interest', {
      masteryScore: '55',
      status: 'shaky',
    });
    expect(zAdd).toHaveBeenCalledWith('mastery:demo:finance', { score: 55, value: 'compound_interest' });

    // misconceptions appended to long-term memory
    expect(hSet).toHaveBeenCalledWith('memory:longterm:demo:finance', {
      misconceptions: JSON.stringify(['thinks interest is linear']),
    });

    // response shape + target excluded from related
    expect(json.masteryScore).toBe(55);
    expect(json.status).toBe('shaky');
    expect(json.related.map((r: any) => r.id)).toEqual(['principal']);
  });

  it('runs a cross-brain search and returns bridges from other brains (Feature 4)', async () => {
    const res = await POST(post({ conceptId: 'compound_interest', transcript: 'it grows' }));
    const json = await res.json();

    expect(ftSearch).toHaveBeenCalledWith(
      'idx:concepts',
      '(@userId:{demo} -@brainId:{finance})=>[KNN 3 @embedding $vec AS score]',
      expect.objectContaining({ RETURN: ['name', 'summary', 'brainId', 'masteryScore'] }),
    );
    expect(json.crossBrain).toEqual([
      { id: 'exp_growth', name: 'Exponential Growth', summary: 'fast', masteryScore: 80, score: 0, brainId: 'math' },
    ]);
  });
});
