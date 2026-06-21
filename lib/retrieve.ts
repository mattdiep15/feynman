// KNN retrieval helpers (Rule 2). Query builders + result mapper are pure;
// the ft.search call lives in the routes.
import { USER_ID, BRAIN_ID } from './constants';

export interface RelatedNode {
  id: string;
  name: string;
  summary: string;
  masteryScore: number;
  score: number; // COSINE distance: smaller = closer
  brainId?: string;
}

// Within the current brain — used to ground evaluation.
export function withinBrainKnnQuery(k: number): string {
  return `(@userId:{${USER_ID}} @brainId:{${BRAIN_ID}})=>[KNN ${k} @embedding $vec AS score]`;
}

// Other brains only — used for cross-brain analogical bridges (Feature 4).
export function crossBrainKnnQuery(k: number): string {
  return `(@userId:{${USER_ID}} -@brainId:{${BRAIN_ID}})=>[KNN ${k} @embedding $vec AS score]`;
}

// FT.SEARCH returns { total, documents: [{ id, value: {...RETURN fields} }] }.
// The id is the full 3-part key; strip to the conceptId.
export function parseSearchResults(res: unknown): RelatedNode[] {
  const docs = (res as any)?.documents ?? [];
  return docs.map((d: any) => {
    const id = String(d.id).split(':').pop() as string;
    const v = d.value ?? {};
    return {
      id,
      name: v.name ?? id,
      summary: v.summary ?? '',
      masteryScore: Number(v.masteryScore ?? 0) || 0,
      score: Number(v.score ?? 0) || 0,
      ...(v.brainId ? { brainId: String(v.brainId) } : {}),
    };
  });
}
