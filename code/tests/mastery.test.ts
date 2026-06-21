import { describe, it, expect } from 'vitest';
import { statusFromScore, masteryColor, clampScore } from '../lib/mastery';

describe('statusFromScore', () => {
  it('maps scores to the four mastery states', () => {
    expect(statusFromScore(0)).toBe('untested');
    expect(statusFromScore(1)).toBe('weak');
    expect(statusFromScore(39)).toBe('weak');
    expect(statusFromScore(40)).toBe('shaky');
    expect(statusFromScore(69)).toBe('shaky');
    expect(statusFromScore(70)).toBe('learned');
    expect(statusFromScore(100)).toBe('learned');
  });
});

describe('masteryColor', () => {
  it('colors by mastery band', () => {
    expect(masteryColor(0)).toBe('#6b7280'); // gray
    expect(masteryColor(20)).toBe('#ef4444'); // red
    expect(masteryColor(50)).toBe('#f59e0b'); // amber
    expect(masteryColor(80)).toBe('#22c55e'); // green
  });
});

describe('clampScore', () => {
  it('clamps into 0–100 and rounds', () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(42.6)).toBe(43);
    expect(clampScore(NaN)).toBe(0);
  });
});
