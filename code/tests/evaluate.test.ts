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

  it('asks for a scorability decision so neutral input can be bypassed', () => {
    const p = buildEvalPrompt({ name: 'X', summary: 'y' }, 't', [], []);
    expect(p).toContain('scorable');
    expect(p).toContain('do not penalize');
  });

  it('includes prior session turns so scoring is cumulative, not k=1', () => {
    const p = buildEvalPrompt({ name: 'Income', summary: 'money earned' }, 'take-home pay is after tax', [], [], [], 'income is money you earn from working');
    expect(p).toContain('EARLIER IN THIS SESSION');
    expect(p).toContain('income is money you earn from working');
    expect(p).toContain('take-home pay is after tax');
  });

  it('injects the feedback-verbosity instruction from the detail setting', () => {
    const brief = buildEvalPrompt({ name: 'X', summary: 'y' }, 't', [], [], [], '', 'brief');
    const detailed = buildEvalPrompt({ name: 'X', summary: 'y' }, 't', [], [], [], '', 'detailed');
    expect(brief).toContain('ONE sentence');
    expect(detailed).toContain('fuller breakdown');
  });
});

describe('normalizeEvaluation', () => {
  it('computes mastery from the rubric sub-scores and coerces arrays', () => {
    const e = normalizeEvaluation({
      coreAccuracy: 25,
      keyRelationships: 20,
      absenceOfMisconceptions: 15,
      connectsToRelated: 10,
      correct: ['a', 2, 'b'],
      missing: 'nope',
      misconceptions: ['m'],
      feedbackMessage: 'nice',
      followUpQuestion: 'why?',
    });
    expect(e.masteryScore).toBe(70); // 25+20+15+10, computed not free-typed
    expect(e.rubric).toEqual({
      coreAccuracy: 25,
      keyRelationships: 20,
      absenceOfMisconceptions: 15,
      connectsToRelated: 10,
    });
    expect(e.correct).toEqual(['a', 'b']);
    expect(e.missing).toEqual([]);
    expect(e.misconceptions).toEqual(['m']);
    expect(e.feedbackMessage).toBe('nice');
    expect(e.followUpQuestion).toBe('why?');
  });

  it('clamps out-of-range rubric components before summing', () => {
    const e = normalizeEvaluation({
      coreAccuracy: 999,
      keyRelationships: 30,
      absenceOfMisconceptions: 20,
      connectsToRelated: 20,
    });
    expect(e.masteryScore).toBe(100); // 30(clamped)+30+20+20
  });

  it('falls back to safe defaults on garbage', () => {
    const e = normalizeEvaluation(null);
    expect(e.masteryScore).toBe(0);
    expect(e.correct).toEqual([]);
    expect(e.feedbackMessage.length).toBeGreaterThan(0);
  });

  it('passes through scorable=false and defaults to true when omitted', () => {
    expect(normalizeEvaluation({ scorable: false }).scorable).toBe(false);
    expect(normalizeEvaluation({}).scorable).toBe(true); // a real attempt is never silently dropped
  });
});
