import { describe, it, expect } from 'vitest';
import { buildEvalPrompt, normalizeEvaluation } from '../lib/evaluate';

describe('buildEvalPrompt', () => {
  it('includes the rubric, transcript, related concepts and known misconceptions', () => {
    const p = buildEvalPrompt(
      { name: 'Compound Interest', summary: 'grows over time' },
      'it just adds up',
      [{ id: 'principal', name: 'Principal', summary: 'base', masteryScore: 0, score: 0.2 }],
      ['thinks interest is linear'],
    );
    expect(p).toContain('Core definition accuracy (0–30)');
    expect(p).toContain('it just adds up');
    expect(p).toContain('Principal: base');
    expect(p).toContain('thinks interest is linear');
    expect(p).toContain('Return ONLY valid JSON');
  });

  it('adds an analogical bridges section when cross-brain hits exist', () => {
    const p = buildEvalPrompt({ name: 'X', summary: 'y' }, 't', [], [], [
      { id: 'exp', name: 'Exponential Growth', summary: 'fast', masteryScore: 80, score: 0.1, brainId: 'math' },
    ]);
    expect(p).toContain('ANALOGICAL BRIDGES');
    expect(p).toContain('Exponential Growth (math)');
  });
});

describe('normalizeEvaluation', () => {
  it('clamps the score and coerces arrays', () => {
    const e = normalizeEvaluation({
      masteryScore: 150,
      correct: ['a', 2, 'b'],
      missing: 'nope',
      misconceptions: ['m'],
      feedbackMessage: 'nice',
      followUpQuestion: 'why?',
    });
    expect(e.masteryScore).toBe(100);
    expect(e.correct).toEqual(['a', 'b']);
    expect(e.missing).toEqual([]);
    expect(e.misconceptions).toEqual(['m']);
    expect(e.feedbackMessage).toBe('nice');
    expect(e.followUpQuestion).toBe('why?');
  });

  it('falls back to safe defaults on garbage', () => {
    const e = normalizeEvaluation(null);
    expect(e.masteryScore).toBe(0);
    expect(e.correct).toEqual([]);
    expect(e.feedbackMessage.length).toBeGreaterThan(0);
  });
});
