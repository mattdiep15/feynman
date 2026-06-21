import { describe, it, expect, vi } from 'vitest';
import { mergeMisconceptionLists, readMisconceptions, mergeMisconceptions } from '../lib/memory';

describe('mergeMisconceptionLists', () => {
  it('dedupes known + fresh', () => {
    expect(mergeMisconceptionLists(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('caps at the most recent 50', () => {
    const known = Array.from({ length: 60 }, (_, i) => `m${i}`);
    const out = mergeMisconceptionLists(known, ['new']);
    expect(out).toHaveLength(50);
    expect(out[out.length - 1]).toBe('new');
  });
});

describe('readMisconceptions', () => {
  it('parses the JSON array field', async () => {
    const redis = { hGet: vi.fn(async () => JSON.stringify(['x', 'y'])), hSet: vi.fn() };
    expect(await readMisconceptions(redis as any)).toEqual(['x', 'y']);
  });

  it('returns [] when absent or corrupt', async () => {
    expect(await readMisconceptions({ hGet: async () => null, hSet: vi.fn() } as any)).toEqual([]);
    expect(await readMisconceptions({ hGet: async () => 'not json', hSet: vi.fn() } as any)).toEqual([]);
  });
});

describe('mergeMisconceptions', () => {
  it('writes the merged JSON back to the long-term key', async () => {
    const hSet = vi.fn(async () => 1);
    await mergeMisconceptions({ hGet: vi.fn(), hSet } as any, ['a'], ['b']);
    expect(hSet).toHaveBeenCalledWith('memory:longterm:demo', {
      misconceptions: JSON.stringify(['a', 'b']),
    });
  });
});
