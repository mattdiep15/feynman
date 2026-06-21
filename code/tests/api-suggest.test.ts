import { describe, it, expect, vi, beforeEach } from 'vitest';

const zRangeWithScores = vi.fn(async () => [
  { value: 'compound_interest', score: 80 }, // mastered
  { value: 'principal', score: 20 }, // below threshold
]);
const hmGet = vi.fn(async () => ['Compound Interest', 'grows over time']);
const exists = vi.fn(async () => 0);
const hSet = vi.fn(async () => 1);
const zAdd = vi.fn(async () => 1);
const sAdd = vi.fn(async () => 1);

vi.mock('@/lib/redis', () => ({
  getRedis: async () => ({ zRangeWithScores, hmGet, exists, hSet, zAdd, sAdd }),
}));
vi.mock('@/lib/embed', () => ({
  embed: vi.fn(async () => [0.1, 0.2, 0.3]),
  toFloat32Buffer: (a: number[]) => Buffer.from(new Float32Array(a).buffer),
}));
vi.mock('@/lib/claude', () => ({
  claudeTool: vi.fn(async () => ({
    suggestions: [
      { sourceId: 'compound_interest', name: 'Net Present Value', summary: 'discounting future cash' },
      { sourceId: 'principal', name: 'Should Be Dropped', summary: 'bad source' }, // not mastered
    ],
  })),
}));

import { GET, POST } from '@/app/api/suggest/route';
import { claudeTool } from '@/lib/claude';

beforeEach(() => {
  hSet.mockClear();
  zAdd.mockClear();
  sAdd.mockClear();
  exists.mockClear();
  exists.mockResolvedValue(0);
});

describe('GET /api/suggest', () => {
  it('seeds suggestions only from mastered nodes and drops invalid sources', async () => {
    const res = await GET(new Request('http://x/api/suggest?brainId=finance'));
    const json = await res.json();

    // Only the mastered concept seeds Claude (prompt names compound_interest).
    expect(claudeTool).toHaveBeenCalled();
    const prompt = (claudeTool as any).mock.calls[0][0] as string;
    expect(prompt).toContain('compound_interest');
    expect(prompt).not.toContain('principal');

    // The suggestion from a non-mastered source is dropped by normalization.
    expect(json.suggestions).toEqual([
      {
        id: 'net_present_value',
        name: 'Net Present Value',
        summary: 'discounting future cash',
        sourceId: 'compound_interest',
      },
    ]);
  });

  it('returns no suggestions when nothing is mastered', async () => {
    zRangeWithScores.mockResolvedValueOnce([{ value: 'principal', score: 10 }]);
    const res = await GET(new Request('http://x/api/suggest?brainId=finance'));
    const json = await res.json();
    expect(json.suggestions).toEqual([]);
  });
});

describe('POST /api/suggest', () => {
  function post(body: unknown) {
    return new Request('http://x/api/suggest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('promotes a suggestion into a real concept linked to its source', async () => {
    const res = await POST(
      post({
        brainId: 'finance',
        sourceId: 'compound_interest',
        id: 'net_present_value',
        name: 'Net Present Value',
        summary: 'discounting future cash',
      }),
    );
    const json = await res.json();
    expect(json).toEqual({ ok: true, id: 'net_present_value' });

    expect(hSet).toHaveBeenCalledWith(
      'concept:demo:finance:net_present_value',
      expect.objectContaining({ name: 'Net Present Value', masteryScore: '0', status: 'untested' }),
    );
    expect(zAdd).toHaveBeenCalledWith('mastery:demo:finance', { score: 0, value: 'net_present_value' });
    expect(sAdd).toHaveBeenCalledWith('edges:demo:finance:compound_interest', 'net_present_value:relates_to');
  });

  it('does not overwrite an existing concept, but still links it', async () => {
    exists.mockResolvedValue(1);
    await POST(
      post({ brainId: 'finance', sourceId: 'compound_interest', id: 'principal', name: 'Principal', summary: 'x' }),
    );
    expect(hSet).not.toHaveBeenCalled();
    expect(zAdd).not.toHaveBeenCalled();
    expect(sAdd).toHaveBeenCalledWith('edges:demo:finance:compound_interest', 'principal:relates_to');
  });

  it('rejects missing fields with 400', async () => {
    expect((await POST(post({ brainId: 'finance', sourceId: 'x' }))).status).toBe(400);
  });
});
