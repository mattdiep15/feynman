// Claude client + defensive JSON helper (Rule 6). Used by extract + evaluate.
import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from './constants';
import { parseJson } from './json';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    const res = await anthropic.messages.create({
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
