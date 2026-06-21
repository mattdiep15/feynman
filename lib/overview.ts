// Multi-brain overview (Feature 7). Pure vector math for placing brains in a
// shared semantic space and connecting related ones. Redis/embedding reads live
// in the route; this stays testable.

export interface BrainPoint {
  id: string;
  name: string;
  icon: string;
  conceptCount: number;
  avgMastery: number;
}

export interface BrainLink {
  source: string;
  target: string;
  score: number; // cosine similarity in [-1, 1]
}

// A concept node in the unified overview field. The id is namespaced by brain
// (`${brainId}::${conceptId}`) so concepts that share an id across brains stay
// distinct in one force graph.
export interface OverviewNode {
  id: string;
  conceptId: string;
  brainId: string;
  name: string;
  masteryScore: number;
  status: string;
}

// An intra-brain edge in the overview, endpoints namespaced like OverviewNode.
export interface OverviewConceptLink {
  source: string;
  target: string;
  brainId: string;
}

// Evenly space brains around a circle so each cluster settles into its own lobe
// region. A single brain sits at the origin. Pure so the layout is testable.
export function brainAnchors(
  ids: string[],
  radius: number,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  const n = ids.length;
  ids.forEach((id, i) => {
    if (n === 1) {
      out[id] = { x: 0, y: 0 };
      return;
    }
    const angle = (2 * Math.PI * i) / n;
    out[id] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
  return out;
}

// A dotted connector is drawn between two brains whose similarity exceeds this.
// Tunable — text embeddings have a high similarity floor, so this sits well
// above 0.
export const SIMILARITY_THRESHOLD = 0.5;

// Mean of equal-length vectors → the brain's centroid in embedding space.
// Returns null for a brain with no concepts (nothing to average).
export function meanVector(vectors: number[][]): number[] | null {
  if (!vectors.length) return null;
  const dim = vectors[0].length;
  const sum = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) sum[i] += v[i] ?? 0;
  }
  return sum.map((x) => x / vectors.length);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Every brain pair whose centroid similarity clears the threshold, as graph
// links. Brains without a vector (no concepts) produce no links.
export function pairwiseLinks(
  brains: { id: string; vector: number[] | null }[],
  threshold: number = SIMILARITY_THRESHOLD,
): BrainLink[] {
  const links: BrainLink[] = [];
  for (let i = 0; i < brains.length; i++) {
    for (let j = i + 1; j < brains.length; j++) {
      const a = brains[i];
      const b = brains[j];
      if (!a.vector || !b.vector) continue;
      const score = cosineSimilarity(a.vector, b.vector);
      if (score >= threshold) links.push({ source: a.id, target: b.id, score });
    }
  }
  return links;
}
