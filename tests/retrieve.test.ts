import { describe, it, expect } from 'vitest';
import { withinBrainKnnQuery, crossBrainKnnQuery, parseSearchResults } from '../lib/retrieve';

describe('KNN query builders (Rule 2)', () => {
  it('within-brain filters userId + brainId', () => {
    expect(withinBrainKnnQuery(5, 'demo', 'finance')).toBe(
      '(@userId:{demo} @brainId:{finance})=>[KNN 5 @embedding $vec AS score]',
    );
  });

  it('cross-brain excludes the current brain', () => {
    expect(crossBrainKnnQuery(3, 'demo', 'finance')).toBe(
      '(@userId:{demo} -@brainId:{finance})=>[KNN 3 @embedding $vec AS score]',
    );
  });
});

describe('parseSearchResults', () => {
  it('strips the 3-part key to a conceptId and coerces fields', () => {
    const res = {
      total: 1,
      documents: [
        {
          id: 'concept:demo:finance:compound_interest',
          value: { name: 'Compound Interest', summary: 'grows', masteryScore: '80', score: '0.1' },
        },
      ],
    };
    expect(parseSearchResults(res)).toEqual([
      { id: 'compound_interest', name: 'Compound Interest', summary: 'grows', masteryScore: 80, score: 0.1 },
    ]);
  });

  it('includes brainId only when present (cross-brain)', () => {
    const res = {
      documents: [
        { id: 'concept:demo:math:exp_growth', value: { name: 'Exp Growth', summary: 's', brainId: 'math' } },
      ],
    };
    expect(parseSearchResults(res)[0]).toMatchObject({ id: 'exp_growth', brainId: 'math' });
  });

  it('tolerates empty results', () => {
    expect(parseSearchResults(undefined)).toEqual([]);
    expect(parseSearchResults({ documents: [] })).toEqual([]);
  });
});
