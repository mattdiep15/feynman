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
