import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/deepgram', () => ({
  transcribe: vi.fn(async (buf: Buffer) => (buf.length ? 'compound interest grows over time' : '')),
}));

import { POST } from '@/app/api/transcribe/route';

describe('POST /api/transcribe', () => {
  it('returns 400 on empty audio', async () => {
    const res = await POST(new Request('http://x/api/transcribe', { method: 'POST', body: new Uint8Array() }));
    expect(res.status).toBe(400);
  });

  it('returns the transcript for audio bytes', async () => {
    const res = await POST(
      new Request('http://x/api/transcribe', { method: 'POST', body: new Uint8Array([1, 2, 3]) }),
    );
    expect(await res.json()).toEqual({ transcript: 'compound interest grows over time' });
  });
});
