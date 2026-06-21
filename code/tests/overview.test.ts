import { describe, it, expect } from 'vitest';
import { meanVector, cosineSimilarity, pairwiseLinks, brainAnchors } from '../lib/overview';

describe('meanVector', () => {
  it('averages concept vectors into a centroid', () => {
    expect(meanVector([[0, 2], [2, 0]])).toEqual([1, 1]);
    expect(meanVector([[1, 2, 3]])).toEqual([1, 2, 3]);
  });

  it('returns null when there are no concepts', () => {
    expect(meanVector([])).toBeNull();
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical, 0 for orthogonal, -1 for opposite, and symmetric', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
    expect(cosineSimilarity([1, 2], [3, 4])).toBeCloseTo(cosineSimilarity([3, 4], [1, 2]), 6);
  });

  it('stays within [-1, 1] and handles zero vectors', () => {
    const s = cosineSimilarity([0.3, 0.7, -0.2], [0.1, 0.9, 0.4]);
    expect(s).toBeGreaterThanOrEqual(-1);
    expect(s).toBeLessThanOrEqual(1);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('pairwiseLinks', () => {
  it('links only brain pairs above the threshold', () => {
    const brains = [
      { id: 'a', vector: [1, 0] },
      { id: 'b', vector: [0.9, 0.1] }, // close to a
      { id: 'c', vector: [0, 1] }, // orthogonal to a
    ];
    const links = pairwiseLinks(brains, 0.5);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ source: 'a', target: 'b' });
    expect(links[0].score).toBeGreaterThan(0.5);
  });

  it('skips brains without a vector (no concepts)', () => {
    const links = pairwiseLinks([
      { id: 'a', vector: [1, 0] },
      { id: 'b', vector: null },
    ]);
    expect(links).toEqual([]);
  });
});

describe('brainAnchors', () => {
  it('puts a single brain at the origin', () => {
    expect(brainAnchors(['only'], 200)).toEqual({ only: { x: 0, y: 0 } });
  });

  it('spaces multiple brains evenly on a circle of the given radius', () => {
    const a = brainAnchors(['a', 'b', 'c', 'd'], 100);
    // every anchor sits on the circle
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(Math.hypot(a[id].x, a[id].y)).toBeCloseTo(100, 6);
    }
    // first at angle 0, third diametrically opposite it
    expect(a.a.x).toBeCloseTo(100, 6);
    expect(a.c.x).toBeCloseTo(-100, 6);
  });
});
