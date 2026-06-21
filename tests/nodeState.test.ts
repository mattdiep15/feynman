import { describe, it, expect } from 'vitest';
import { smoothstep, hoverScale, expandedRadius } from '../lib/nodeState';

describe('smoothstep', () => {
  it('pins the endpoints and clamps out-of-range input', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(-5)).toBe(0);
    expect(smoothstep(5)).toBe(1);
  });

  it('eases through the midpoint (S-curve, not linear)', () => {
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 5);
    // below the midpoint the curve sits under the line y=x
    expect(smoothstep(0.25)).toBeLessThan(0.25);
    expect(smoothstep(0.75)).toBeGreaterThan(0.75);
  });
});

describe('hoverScale', () => {
  it('is 1 on the node and 0 at/after the influence radius', () => {
    expect(hoverScale(0, 150)).toBe(1);
    expect(hoverScale(150, 150)).toBe(0);
    expect(hoverScale(300, 150)).toBe(0);
  });

  it('decreases monotonically with distance', () => {
    const near = hoverScale(30, 150);
    const far = hoverScale(120, 150);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(0);
  });
});

describe('expandedRadius', () => {
  it('returns the base dot at t=0 and the expanded size at t=1', () => {
    expect(expandedRadius(0, 4.5, 20)).toBe(4.5);
    expect(expandedRadius(1, 4.5, 20)).toBe(20);
  });

  it('interpolates linearly in t', () => {
    expect(expandedRadius(0.5, 4, 20)).toBe(12);
  });
});
