// Pure helpers for Feature 1 (Notes → Graph). The route owns the side effects;
// these stay testable without Claude/Redis/Voyage.

export interface Concept {
  id: string;
  name: string;
  summary: string;
}
export interface Edge {
  from: string;
  to: string;
  type: EdgeType;
}
export type EdgeType = 'relates_to' | 'depends_on' | 'is_example_of';
export interface Extraction {
  concepts: Concept[];
  edges: Edge[];
}

const EDGE_TYPES = new Set<EdgeType>(['relates_to', 'depends_on', 'is_example_of']);

export function buildExtractPrompt(notes: string): string {
  return `Given these notes, extract concepts and how they relate. Return ONLY valid JSON:
{ "concepts": [ { "id": "compound_interest", "name": "Compound Interest", "summary": "..." } ],
  "edges":    [ { "from": "compound_interest", "to": "principal", "type": "depends_on" } ] }

Rules:
- ids are snake_case and unique.
- summary is one or two sentences capturing the concept.
- edge "type" is one of: relates_to, depends_on, is_example_of.
- every edge "from"/"to" must reference a concept id you listed.

NOTES:
${notes}`;
}

// Validate/sanitize Claude's JSON: keep well-formed concepts, drop edges that
// reference unknown concepts, default unrecognized edge types to relates_to.
export function normalizeExtraction(raw: unknown): Extraction {
  const r = (raw ?? {}) as { concepts?: unknown; edges?: unknown };

  const concepts: Concept[] = Array.isArray(r.concepts)
    ? r.concepts
        .filter(
          (c): c is { id: string; name: string; summary?: unknown } =>
            !!c && typeof (c as any).id === 'string' && typeof (c as any).name === 'string',
        )
        .map((c) => ({ id: c.id, name: c.name, summary: String((c as any).summary ?? '') }))
    : [];

  const ids = new Set(concepts.map((c) => c.id));

  const edges: Edge[] = Array.isArray(r.edges)
    ? r.edges
        .filter(
          (e): e is { from: string; to: string; type?: unknown } =>
            !!e && ids.has((e as any).from) && ids.has((e as any).to),
        )
        .map((e) => ({
          from: e.from,
          to: e.to,
          type: EDGE_TYPES.has((e as any).type) ? ((e as any).type as EdgeType) : 'relates_to',
        }))
    : [];

  return { concepts, edges };
}
