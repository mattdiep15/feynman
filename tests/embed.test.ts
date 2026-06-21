import { describe, it, expect } from 'vitest';
import { toFloat32Buffer, EMBEDDING_DIM, EMBEDDING_MODEL } from '../lib/embed';

describe('embed constants (Rule 1)', () => {
  it('pins the model and dimension', () => {
    expect(EMBEDDING_MODEL).toBe('voyage-3.5-lite');
    expect(EMBEDDING_DIM).toBe(512);
  });
});

describe('toFloat32Buffer (Rule 2)', () => {
  it('encodes a number array as a Float32 buffer (4 bytes per element)', () => {
    const buf = toFloat32Buffer([1, 2, 3]);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBe(12);
  });

  it('round-trips values through Float32 precision', () => {
    const buf = toFloat32Buffer([0.5, -0.25, 1]);
    const view = new Float32Array(buf.buffer, buf.byteOffset, 3);
    expect(Array.from(view)).toEqual([0.5, -0.25, 1]);
  });
});
