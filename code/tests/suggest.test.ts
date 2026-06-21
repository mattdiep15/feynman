import { describe, it, expect } from 'vitest';
import { buildSuggestPrompt, normalizeSuggestions, suggestionId } from '../lib/suggest';

describe('suggestionId', () => {
  it('produces a snake_case id', () => {
    expect(suggestionId('Net Present Value')).toBe('net_present_value');
    expect(suggestionId('  Risk/Return!! ')).toBe('risk_return');
  });
});

describe('buildSuggestPrompt', () => {
  it('lists the mastered concepts with their ids', () => {
    const p = buildSuggestPrompt([
      { id: 'compound_interest', name: 'Compound Interest', summary: 'grows over time' },
    ]);
    expect(p).toContain('[compound_interest] Compound Interest: grows over time');
    expect(p).toContain('sourceId MUST be one of the ids listed');
  });
});

describe('normalizeSuggestions', () => {
  const valid = new Set(['compound_interest']);
  const existing = new Set(['compound_interest', 'principal']);

  it('keeps valid suggestions and generates ids', () => {
    const out = normalizeSuggestions(
      { suggestions: [{ sourceId: 'compound_interest', name: 'Net Present Value', summary: 'discounting' }] },
      valid,
      existing,
    );
    expect(out).toEqual([
      { id: 'net_present_value', name: 'Net Present Value', summary: 'discounting', sourceId: 'compound_interest' },
    ]);
  });

  it('drops suggestions whose sourceId is not a mastered concept', () => {
    const out = normalizeSuggestions(
      { suggestions: [{ sourceId: 'principal', name: 'Annuities', summary: 'x' }] },
      valid,
      existing,
    );
    expect(out).toEqual([]);
  });

  it('drops suggestions that already exist or duplicate each other', () => {
    const out = normalizeSuggestions(
      {
        suggestions: [
          { sourceId: 'compound_interest', name: 'Principal', summary: 'exists already' },
          { sourceId: 'compound_interest', name: 'Annuities', summary: 'first' },
          { sourceId: 'compound_interest', name: 'Annuities', summary: 'dupe' },
        ],
      },
      valid,
      existing,
    );
    expect(out.map((s) => s.id)).toEqual(['annuities']);
  });

  it('returns [] on garbage', () => {
    expect(normalizeSuggestions(null, valid, existing)).toEqual([]);
    expect(normalizeSuggestions({ suggestions: 'nope' }, valid, existing)).toEqual([]);
  });
});
