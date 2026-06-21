import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared fake redis client whose isOpen reflects connect().
const state = { open: false };
const connect = vi.fn(async () => {
  state.open = true;
});
const ftCreate = vi.fn();
const client = {
  get isOpen() {
    return state.open;
  },
  on: vi.fn(),
  connect,
  ft: { create: ftCreate },
};

vi.mock('redis', () => ({
  createClient: () => client,
  SchemaFieldTypes: { TAG: 0, NUMERIC: 0, TEXT: 0, VECTOR: 0 },
  VectorAlgorithms: { FLAT: 0 },
}));

beforeEach(() => {
  vi.resetModules(); // fresh module-level connect/indexed state per test
  state.open = false;
  connect.mockClear();
  ftCreate.mockClear();
});

describe('getRedis', () => {
  it('connects only once and re-attempts indexing when Search is unavailable (no double-open)', async () => {
    ftCreate.mockRejectedValue(new Error("ERR unknown command 'FT.CREATE'"));
    const { getRedis } = await import('@/lib/redis');

    await expect(getRedis()).rejects.toThrow('FT.CREATE');
    await expect(getRedis()).rejects.toThrow('FT.CREATE');

    expect(connect).toHaveBeenCalledTimes(1); // socket opened once, never re-opened
    expect(ftCreate).toHaveBeenCalledTimes(2); // index creation retried
  });

  it('connects and indexes once on the happy path', async () => {
    ftCreate.mockResolvedValue('OK');
    const { getRedis } = await import('@/lib/redis');

    await getRedis();
    await getRedis();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(ftCreate).toHaveBeenCalledTimes(1); // not re-created once indexed
  });

  it('swallows "Index already exists" and marks indexed', async () => {
    ftCreate.mockRejectedValue(new Error('Index already exists'));
    const { getRedis } = await import('@/lib/redis');

    await expect(getRedis()).resolves.toBe(client);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
