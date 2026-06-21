// Rule 6 — parse Claude output defensively. Prompts ask for JSON only, but
// never trust it blindly. Strips markdown fences before parsing.
export function parseJson<T = unknown>(text: string): T {
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean) as T;
}
