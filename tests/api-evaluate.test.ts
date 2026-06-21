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
// Two reads per request: name/summary, then masteryScore/attempts (decay input).
// hmGet returns (string | null)[] — missing fields come back as null.
const hmGet = vi.fn(
  async (_key: string, fields: string[]): Promise<(string | null)[]> =>
    fields.includes('masteryScore') ? ['40', '2'] : ['Compound Interest', 'grows over time'],
);
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
  // Rubric sub-scores (20+18+10+7 = 55); the total is computed, not free-typed.
  claudeTool: vi.fn(async () => ({
    coreAccuracy: 20,
    keyRelationships: 18,
    absenceOfMisconceptions: 10,
    connectsToRelated: 7,
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
  hmGet.mockClear();
  hmGet.mockImplementation(async (_key: string, fields: string[]) =>
    fields.includes('masteryScore') ? ['40', '2'] : ['Compound Interest', 'grows over time'],
  );
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

    // Decay blend: prior 40 (2 attempts) + turn 55 → 0.4*55 + 0.6*40 = 46.
    // Persisted blended score, derived status, and bumped attempt count.
    expect(hSet).toHaveBeenCalledWith('concept:demo:finance:compound_interest', {
      masteryScore: '46',
      status: 'shaky',
      attempts: '3',
    });
    expect(zAdd).toHaveBeenCalledWith('mastery:demo:finance', { score: 46, value: 'compound_interest' });

    // misconceptions appended to long-term memory
    expect(hSet).toHaveBeenCalledWith('memory:longterm:demo:finance', {
      misconceptions: JSON.stringify(['thinks interest is linear']),
    });

    // response shape: blended masteryScore + standalone turnScore, target excluded
    expect(json.masteryScore).toBe(46);
    expect(json.turnScore).toBe(55);
    expect(json.status).toBe('shaky');
    expect(json.related.map((r: any) => r.id)).toEqual(['principal']);
  });

  it('counts the first attempt in full (no prior history to blend)', async () => {
    // Fresh concept: score 0, no attempts recorded yet.
    hmGet.mockImplementation(async (_key: string, fields: string[]) =>
      fields.includes('masteryScore') ? ['0', null] : ['Compound Interest', 'grows over time'],
    );

    const res = await POST(post({ conceptId: 'compound_interest', transcript: 'it grows' }));
    const json = await res.json();

    // turn score 55 applied directly; attempts initialized to 1.
    expect(json.masteryScore).toBe(55);
    expect(hSet).toHaveBeenCalledWith('concept:demo:finance:compound_interest', {
      masteryScore: '55',
      status: 'shaky',
      attempts: '1',
    });
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
