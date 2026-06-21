import { describe, it, expect } from 'vitest';
import { nodeFromHash, memberToLink } from '../lib/graph';

describe('nodeFromHash', () => {
  it('builds a node and derives val from score', () => {
    const n = nodeFromHash('compound_interest', ['Compound Interest', 'grows', '80', 'learned']);
    expect(n).toEqual({
      id: 'compound_interest',
      name: 'Compound Interest',
      summary: 'grows',
      masteryScore: 80,
      status: 'learned',
      val: 5,
    });
  });

  it('falls back gracefully on null fields', () => {
    const n = nodeFromHash('x', [null, null, null, null]);
    expect(n.name).toBe('x');
    expect(n.masteryScore).toBe(0);
    expect(n.status).toBe('untested');
    expect(n.val).toBe(1);
  });
});

describe('memberToLink', () => {
  it('splits "${to}:${type}" into a link', () => {
    expect(memberToLink('a', 'b:depends_on')).toEqual({ source: 'a', target: 'b', type: 'depends_on' });
  });

  it('defaults type when member has no colon', () => {
    expect(memberToLink('a', 'b')).toEqual({ source: 'a', target: 'b', type: 'relates_to' });
  });
});
