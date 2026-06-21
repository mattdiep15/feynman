import { describe, it, expect } from 'vitest';
import { parseJson } from '../lib/json';

describe('parseJson (Rule 6)', () => {
  it('parses plain JSON', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips ```json fences', () => {
    const text = '```json\n{"concepts":[],"edges":[]}\n```';
    expect(parseJson(text)).toEqual({ concepts: [], edges: [] });
  });

  it('strips bare ``` fences and whitespace', () => {
    expect(parseJson('```\n{"x":true}\n```')).toEqual({ x: true });
  });

  it('throws on invalid JSON so callers can retry', () => {
    expect(() => parseJson('not json')).toThrow();
  });
});
