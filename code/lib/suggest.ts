// Coverage suggestions (Feature 6). From concepts the student has mastered,
// Claude proposes adjacent concepts that would extend their knowledge. These are
// ephemeral (never persisted) until the student accepts one. Pure helpers only —
// the route owns Redis/Claude side effects.
import type { ClaudeTool } from './claude';

export interface MasteredConcept {
  id: string;
  name: string;
  summary: string;
}

export interface Suggestion {
  id: string; // snake_case id, used as the concept id if accepted
  name: string;
  summary: string;
  sourceId: string; // the mastered concept this builds on
}

// Only concepts at/above this mastery seed suggestions — we build off what the
// student has actually demonstrated. Tunable.
export const SUGGEST_THRESHOLD = 65;
const MAX_SUGGESTIONS = 8; // cap how many dotted nodes we add to the map

// snake_case id to match the concept ids produced by extraction.
export function suggestionId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export const SUGGESTION_TOOL: ClaudeTool = {
  name: 'propose_suggestions',
  description:
    'Propose adjacent concepts that extend coverage from the concepts the student has mastered.',
  input_schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sourceId: { type: 'string', description: 'id of the mastered concept this builds on' },
            name: { type: 'string', description: 'short (2–4 word) name of the adjacent concept' },
            summary: { type: 'string', description: 'one sentence describing the concept' },
          },
          required: ['sourceId', 'name', 'summary'],
        },
      },
    },
    required: ['suggestions'],
  },
};

export function buildSuggestPrompt(mastered: MasteredConcept[]): string {
  const list = mastered.map((c) => `- [${c.id}] ${c.name}: ${c.summary}`).join('\n');
  return `A student has demonstrated mastery of the concepts below. For each, propose 1–2 ADJACENT concepts they don't yet have that would naturally extend their understanding — genuine next steps that build directly on what they already know.

MASTERED CONCEPTS:
${list}

Rules:
- Each suggestion's sourceId MUST be one of the ids listed above.
- Suggest genuinely NEW concepts — not ones already listed.
- Names are short (2–4 words); summaries are one sentence.
- At most 2 suggestions per concept; favor high-quality, natural extensions.`;
}

// Sanitize Claude's output: keep suggestions whose sourceId is a known mastered
// concept, drop any whose generated id collides with an existing concept or a
// duplicate, and cap the total.
export function normalizeSuggestions(
  raw: unknown,
  validSourceIds: Set<string>,
  existingIds: Set<string>,
): Suggestion[] {
  const r = (raw ?? {}) as { suggestions?: unknown };
  if (!Array.isArray(r.suggestions)) return [];

  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of r.suggestions) {
    if (!s || typeof s !== 'object') continue;
    const { sourceId, name, summary } = s as Record<string, unknown>;
    if (typeof sourceId !== 'string' || !validSourceIds.has(sourceId)) continue;
    if (typeof name !== 'string' || !name.trim()) continue;
    const id = suggestionId(name);
    if (!id || existingIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: name.trim(), summary: typeof summary === 'string' ? summary : '', sourceId });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}
