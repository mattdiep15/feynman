// Claude client + defensive JSON helper (Rule 6). Used by extract + evaluate.
import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from './constants';
import { parseJson } from './json';

// Lazy init — keeps client construction out of module load (no key needed at
// import/build time; keys are present at runtime).
let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function textOf(res: Anthropic.Message): string {
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

// Calls Claude, expects JSON in the reply, parses defensively, retries once on
// parse/transport failure (Rule 6).
export async function claudeJson<T = unknown>(
  prompt: string,
  opts: { maxTokens?: number; system?: string } = {},
): Promise<T> {
  const call = async () => {
    const res = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 2048,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: 'user', content: prompt }],
    });
    return parseJson<T>(textOf(res));
  };
  try {
    return await call();
  } catch {
    return await call(); // retry once
  }
}

// Rule 6 upgrade — forced tool use guarantees structured output (no prompt-only
// JSON parsing). Claude must call `tool`; we return its validated input.
export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
}

export async function claudeTool<T = unknown>(
  prompt: string,
  tool: ClaudeTool,
  opts: { maxTokens?: number } = {},
): Promise<T> {
  const res = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: prompt }],
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new Error('Claude did not call the expected tool');
  }
  return block.input as T;
}
