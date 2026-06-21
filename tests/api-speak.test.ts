import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/deepgram', () => ({
  synthesize: vi.fn(
    async () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([1, 2, 3]));
          c.close();
        },
      }),
  ),
}));

import { POST } from '@/app/api/speak/route';

function post(body: unknown) {
  return new Request('http://x/api/speak', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/speak', () => {
  it('rejects missing text', async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
  });

  it('streams audio/mpeg', async () => {
    const res = await POST(post({ text: 'nice work' }));
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(Array.from(buf)).toEqual([1, 2, 3]);
  });
});
