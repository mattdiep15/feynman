import { describe, it, expect, vi, beforeEach } from 'vitest';

const hSet = vi.fn(async () => 1);
const zAdd = vi.fn(async () => 1);
const sAdd = vi.fn(async () => 1);
// exists drives the additive upsert: 0 = new concept (write it), 1 = already
// present (skip to preserve mastery). Default: nothing exists yet.
const exists = vi.fn(async (_key: string) => 0);

vi.mock('@/lib/redis', () => ({ getRedis: async () => ({ hSet, zAdd, sAdd, exists }) }));
vi.mock('@/lib/embed', () => ({
  embed: vi.fn(async () => [0.1, 0.2, 0.3]),
  toFloat32Buffer: (a: number[]) => Buffer.from(new Float32Array(a).buffer),
}));
vi.mock('@/lib/claude', () => ({
  claudeJson: vi.fn(async () => ({
    concepts: [
      { id: 'compound_interest', name: 'Compound Interest', summary: 'grows over time' },
      { id: 'principal', name: 'Principal', summary: 'base amount' },
    ],
    edges: [{ from: 'compound_interest', to: 'principal', type: 'depends_on' }],
  })),
}));

import { POST } from '@/app/api/extract/route';
import { claudeJson } from '@/lib/claude';

function post(body: unknown) {
  return new Request('http://localhost/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  hSet.mockClear();
  zAdd.mockClear();
  sAdd.mockClear();
  exists.mockClear();
  exists.mockResolvedValue(0);
});

describe('POST /api/extract', () => {
  it('rejects missing notes with 400', async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
  });

  it('writes concepts with 3-part keys, Buffer embedding, and mastery zset (Rules 2 & 5)', async () => {
    const res = await POST(post({ notes: 'some finance notes' }));
    const json = await res.json();

    expect(json.concepts).toHaveLength(2);
    expect(json.edges).toHaveLength(1);

    // generous token budget so large extractions aren't truncated into bad JSON
    expect(claudeJson).toHaveBeenCalledWith(expect.any(String), { maxTokens: 8192 });

    expect(hSet).toHaveBeenCalledWith(
      'concept:demo:finance:compound_interest',
      expect.objectContaining({
        name: 'Compound Interest',
        summary: 'grows over time',
        masteryScore: '0',
        status: 'untested',
        userId: 'demo',
        brainId: 'finance',
      }),
    );
    // embedding must be a Buffer, never a raw array (Rule 2)
    const writtenEmbedding = hSet.mock.calls[0][1].embedding;
    expect(Buffer.isBuffer(writtenEmbedding)).toBe(true);

    expect(zAdd).toHaveBeenCalledWith('mastery:demo:finance', { score: 0, value: 'compound_interest' });
    expect(sAdd).toHaveBeenCalledWith('edges:demo:finance:compound_interest', 'principal:depends_on');
  });

  it('is additive: skips concepts that already exist so mastery is preserved', async () => {
    // compound_interest already in the brain (mastered), principal is new.
    exists.mockImplementation(async (key: string) =>
      key === 'concept:demo:finance:compound_interest' ? 1 : 0,
    );

    const res = await POST(post({ notes: 'more finance notes' }));
    const json = await res.json();

    // Only the new concept is written; the existing one is left untouched
    // (no HSET reset to score 0, no ZADD overwrite).
    expect(json.added).toBe(1);
    expect(hSet).toHaveBeenCalledTimes(1);
    expect(hSet).toHaveBeenCalledWith('concept:demo:finance:principal', expect.any(Object));
    expect(hSet).not.toHaveBeenCalledWith('concept:demo:finance:compound_interest', expect.anything());
    expect(zAdd).toHaveBeenCalledTimes(1);
    expect(zAdd).toHaveBeenCalledWith('mastery:demo:finance', { score: 0, value: 'principal' });

    // Edges are still added regardless (SADD is idempotent on a set).
    expect(sAdd).toHaveBeenCalledWith('edges:demo:finance:compound_interest', 'principal:depends_on');
  });
});
