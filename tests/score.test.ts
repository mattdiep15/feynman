import { describe, it, expect } from 'vitest';
import { computeMastery, clampComponent } from '../lib/score';

describe('computeMastery', () => {
  it('returns 0 when every dimension is 0', () => {
    expect(
      computeMastery({
        coreAccuracy: 0,
        keyRelationships: 0,
        absenceOfMisconceptions: 0,
        connectsToRelated: 0,
      }),
    ).toBe(0);
  });

  it('returns 100 when every dimension is maxed', () => {
    expect(
      computeMastery({
        coreAccuracy: 30,
        keyRelationships: 30,
        absenceOfMisconceptions: 20,
        connectsToRelated: 20,
      }),
    ).toBe(100);
  });

  it('sums the rubric for a mid-range score', () => {
    expect(
      computeMastery({
        coreAccuracy: 20,
        keyRelationships: 18,
        absenceOfMisconceptions: 10,
        connectsToRelated: 7,
      }),
    ).toBe(55);
  });

  it('is continuous: fractional components produce a fractional total (not bucketed)', () => {
    const a = computeMastery({
      coreAccuracy: 22.5,
      keyRelationships: 19.3,
      absenceOfMisconceptions: 11.1,
      connectsToRelated: 8.4,
    });
    const b = computeMastery({
      coreAccuracy: 22.6,
      keyRelationships: 19.3,
      absenceOfMisconceptions: 11.1,
      connectsToRelated: 8.4,
    });
    expect(a).toBeCloseTo(61.3, 5);
    expect(b).toBeCloseTo(61.4, 5);
    expect(a).not.toBe(b); // a 0.1 nudge in one dimension moves the total
  });

  it('clamps out-of-range and garbage components', () => {
    expect(
      computeMastery({
        coreAccuracy: 999, // over max → 30
        keyRelationships: -5, // negative → 0
        absenceOfMisconceptions: NaN, // garbage → 0
        connectsToRelated: 20,
      }),
    ).toBe(50); // 30 + 0 + 0 + 20
  });
});

describe('clampComponent', () => {
  it('clamps to [0, max] and maps NaN to 0', () => {
    expect(clampComponent(15, 30)).toBe(15);
    expect(clampComponent(40, 30)).toBe(30);
    expect(clampComponent(-1, 30)).toBe(0);
    expect(clampComponent(NaN, 20)).toBe(0);
  });
});
