import { describe, it, expect } from 'vitest';
import { buildExtractPrompt, normalizeExtraction } from '../lib/extract';

describe('buildExtractPrompt', () => {
  it('asks for JSON only and embeds the notes', () => {
    const p = buildExtractPrompt('compound interest grows over time');
    expect(p).toContain('Return ONLY valid JSON');
    expect(p).toContain('compound interest grows over time');
  });
});

describe('normalizeExtraction', () => {
  it('keeps well-formed concepts and edges', () => {
    const out = normalizeExtraction({
      concepts: [
        { id: 'compound_interest', name: 'Compound Interest', summary: 'grows' },
        { id: 'principal', name: 'Principal', summary: 'base' },
      ],
      edges: [{ from: 'compound_interest', to: 'principal', type: 'depends_on' }],
    });
    expect(out.concepts).toHaveLength(2);
    expect(out.edges).toEqual([{ from: 'compound_interest', to: 'principal', type: 'depends_on' }]);
  });

  it('drops concepts missing id/name', () => {
    const out = normalizeExtraction({
      concepts: [{ id: 'x' }, { name: 'no id' }, { id: 'ok', name: 'Ok' }],
      edges: [],
    });
    expect(out.concepts.map((c) => c.id)).toEqual(['ok']);
  });

  it('drops edges referencing unknown concepts', () => {
    const out = normalizeExtraction({
      concepts: [{ id: 'a', name: 'A', summary: '' }],
      edges: [{ from: 'a', to: 'ghost', type: 'relates_to' }],
    });
    expect(out.edges).toEqual([]);
  });

  it('defaults unrecognized edge types to relates_to', () => {
    const out = normalizeExtraction({
      concepts: [
        { id: 'a', name: 'A', summary: '' },
        { id: 'b', name: 'B', summary: '' },
      ],
      edges: [{ from: 'a', to: 'b', type: 'invented_type' }],
    });
    expect(out.edges[0].type).toBe('relates_to');
  });

  it('tolerates missing/garbage input', () => {
    expect(normalizeExtraction(null)).toEqual({ concepts: [], edges: [] });
    expect(normalizeExtraction({ concepts: 'nope' })).toEqual({ concepts: [], edges: [] });
  });
});
