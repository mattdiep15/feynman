import { describe, it, expect } from 'vitest';
import {
  conceptKey,
  masteryKey,
  edgesKey,
  brainKey,
  brainsSetKey,
  memoryKey,
  slugify,
  isValidBrainId,
} from '@/lib/brains';

describe('brain key builders', () => {
  it('build the documented key patterns', () => {
    expect(conceptKey('demo', 'finance', 'compound_interest')).toBe(
      'concept:demo:finance:compound_interest',
    );
    expect(masteryKey('demo', 'finance')).toBe('mastery:demo:finance');
    expect(edgesKey('demo', 'finance', 'principal')).toBe('edges:demo:finance:principal');
    expect(brainKey('demo', 'finance')).toBe('brain:demo:finance');
    expect(brainsSetKey('demo')).toBe('brains:demo');
    expect(memoryKey('demo', 'finance')).toBe('memory:longterm:demo:finance');
  });
});

describe('slugify', () => {
  it('lowercases, replaces non-alphanumerics with hyphens, trims', () => {
    expect(slugify('Personal Finance')).toBe('personal-finance');
    expect(slugify('  Math 101!! ')).toBe('math-101');
    expect(slugify('C++ & Rust')).toBe('c-rust');
  });
  it('falls back to "brain" when nothing usable remains', () => {
    expect(slugify('!!!')).toBe('brain');
    expect(slugify('')).toBe('brain');
  });
});

describe('isValidBrainId', () => {
  it('accepts slugs and rejects unsafe ids', () => {
    expect(isValidBrainId('finance')).toBe(true);
    expect(isValidBrainId('math-101')).toBe(true);
    expect(isValidBrainId('Finance')).toBe(false); // uppercase
    expect(isValidBrainId('a b')).toBe(false); // space
    expect(isValidBrainId('a:b')).toBe(false); // colon would break keys/TAG
    expect(isValidBrainId('')).toBe(false);
  });
});
