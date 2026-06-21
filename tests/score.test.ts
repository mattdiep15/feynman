import { describe, it, expect } from 'vitest';
import { computeMastery, clampComponent, blendMastery, DECAY_ALPHA } from '../lib/score';

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

describe('blendMastery', () => {
  it('counts the first attempt in full (no history)', () => {
    expect(blendMastery(0, 80, 0)).toBe(80);
    // prior is ignored on the first attempt regardless of its value
    expect(blendMastery(55, 80, 0)).toBe(80);
  });

  it('a single weak session only partially drags down a strong prior', () => {
    // prior 90, weak session 20, alpha 0.25 → 0.25*20 + 0.75*90 = 72.5 (not 20)
    const blended = blendMastery(90, 20, 3);
    expect(blended).toBe(72.5);
    expect(blended).toBeGreaterThan(20);
  });

  it('repeated high scores converge upward; repeated low scores decay downward', () => {
    let s = 40;
    for (let i = 0; i < 5; i++) s = blendMastery(s, 95, i + 1);
    expect(s).toBeGreaterThan(80); // climbs toward the strong turns

    let d = 90;
    for (let i = 0; i < 5; i++) d = blendMastery(d, 10, i + 1);
    expect(d).toBeLessThan(35); // erodes toward the weak turns
  });

  it('honors the alpha weighting and exposes a default', () => {
    expect(DECAY_ALPHA).toBeGreaterThan(0);
    expect(DECAY_ALPHA).toBeLessThan(1);
    // alpha 1 = fully reactive (ignore prior); alpha 0 = fully sticky (ignore current)
    expect(blendMastery(40, 90, 2, 1)).toBe(90);
    expect(blendMastery(40, 90, 2, 0)).toBe(40);
  });
});
