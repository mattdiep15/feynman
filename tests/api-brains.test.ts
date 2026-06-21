import { describe, it, expect, vi } from 'vitest';

const sMembers = vi.fn(async () => ['finance']);
const hGetAll = vi.fn(async () => ({ name: 'Personal Finance', icon: '💰', createdAt: '0' }));
const zRangeWithScores = vi.fn(async () => [
  { value: 'compound_interest', score: 80 },
  { value: 'principal', score: 0 },
]);
const exists = vi.fn(async () => 1);
const sIsMember = vi.fn(async () => false);
const sAdd = vi.fn(async () => 1);
const hSet = vi.fn(async () => 1);

vi.mock('@/lib/redis', () => ({
  getRedis: async () => ({ sMembers, hGetAll, zRangeWithScores, exists, sIsMember, sAdd, hSet }),
}));

import { GET, POST } from '@/app/api/brains/route';

describe('GET /api/brains', () => {
  it('lists brains with live conceptCount + avgMastery', async () => {
    const res = await GET();
    const { brains } = await res.json();
    expect(brains).toEqual([
      { id: 'finance', name: 'Personal Finance', icon: '💰', conceptCount: 2, avgMastery: 40 },
    ]);
  });
});

describe('POST /api/brains', () => {
  it('creates a brain from a name and returns a slug id', async () => {
    const req = new Request('http://t/api/brains', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Math 101', icon: '🧮' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const { brain } = await res.json();
    expect(brain).toMatchObject({ id: 'math-101', name: 'Math 101', icon: '🧮' });
    expect(sAdd).toHaveBeenCalledWith('brains:demo', 'math-101');
  });

  it('400s without a name', async () => {
    const req = new Request('http://t/api/brains', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
