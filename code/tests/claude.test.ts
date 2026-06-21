import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();

// Anthropic SDK is a default-exported class with messages.create.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
  },
}));

import { claudeJson, claudeTool } from '@/lib/claude';

beforeEach(() => create.mockReset());

describe('claudeJson (Rule 6 retry-once)', () => {
  it('parses JSON from the text block', async () => {
    create.mockResolvedValueOnce({ content: [{ type: 'text', text: '```json\n{"ok":true}\n```' }] });
    expect(await claudeJson('p')).toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('retries once on bad JSON then succeeds', async () => {
    create
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{"ok":1}' }] });
    expect(await claudeJson('p')).toEqual({ ok: 1 });
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('claudeTool (forced structured output)', () => {
  const TOOL = { name: 'record', description: 'd', input_schema: { type: 'object' as const, properties: {} } };

  it('forces the tool and returns its input', async () => {
    create.mockResolvedValueOnce({
      content: [{ type: 'tool_use', name: 'record', input: { masteryScore: 70 } }],
    });
    expect(await claudeTool('p', TOOL)).toEqual({ masteryScore: 70 });
    const call = create.mock.calls[0][0];
    expect(call.tool_choice).toEqual({ type: 'tool', name: 'record' });
  });

  it('throws when Claude returns no tool call', async () => {
    create.mockResolvedValueOnce({ content: [{ type: 'text', text: 'hi' }] });
    await expect(claudeTool('p', TOOL)).rejects.toThrow();
  });
});
