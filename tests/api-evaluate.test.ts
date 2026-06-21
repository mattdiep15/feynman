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
// Target read: name/summary only. (R3 no longer reads prior score here — that
// moved to /api/commit.)
const hmGet = vi.fn(async (): Promise<(string | null)[]> => ['Compound Interest', 'grows over time']);
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
  // Rubric sub-scores (20+18+10+7 = 55); scorable defaults handled by normalize.
  claudeTool: vi.fn(async () => ({
    scorable: true,
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
import { claudeTool } from '@/lib/claude';

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
  (claudeTool as ReturnType<typeof vi.fn>).mockClear();
});

describe('POST /api/evaluate', () => {
  it('requires conceptId and transcript', async () => {
    expect((await POST(post({ conceptId: 'x' }))).status).toBe(400);
    expect((await POST(post({ transcript: 'x' }))).status).toBe(400);
  });

  it('returns the cumulative session score without persisting (R3)', async () => {
    const res = await POST(post({ conceptId: 'compound_interest', transcript: 'it grows' }));
    const json = await res.json();

    // KNN query used the within-brain filter (Rule 2)
    expect(ftSearch).toHaveBeenCalledWith(
      'idx:concepts',
      '(@userId:{demo} @brainId:{finance})=>[KNN 5 @embedding $vec AS score]',
      expect.objectContaining({ DIALECT: 2, SORTBY: 'score' }),
    );

    // Score computed from the rubric (55); scorable flagged; target excluded.
    expect(json.sessionScore).toBe(55);
    expect(json.masteryScore).toBe(55);
    expect(json.scorable).toBe(true);
    expect(json.related.map((r: any) => r.id)).toEqual(['principal']);

    // Scoring no longer writes to Redis here — that's deferred to /api/commit.
    expect(hSet).not.toHaveBeenCalled();
    expect(zAdd).not.toHaveBeenCalled();
  });

  it('feeds prior session turns into the prompt for cumulative scoring', async () => {
    await POST(
      post({
        conceptId: 'income',
        transcript: 'take-home pay is after tax',
        priorTurns: ['income is money you earn from working'],
      }),
    );
    const prompt = (claudeTool as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('EARLIER IN THIS SESSION');
    expect(prompt).toContain('income is money you earn from working');
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
