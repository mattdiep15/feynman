// Rule 1 — Embeddings: Voyage, correct SDK shape.
// This file is the single source of truth for the embedding model AND its dimension.
import { VoyageAIClient } from 'voyageai'; // ✅ named export (NOT default)

const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });

export const EMBEDDING_MODEL = 'voyage-3.5-lite';
export const EMBEDDING_DIM = 512; // ← the ONLY place DIM is defined; imported everywhere

export async function embed(
  text: string,
  inputType: 'query' | 'document' = 'document', // 'document' to store, 'query' to search
): Promise<number[]> {
  const res = await voyage.embed({
    input: [text],
    model: EMBEDDING_MODEL,
    outputDimension: EMBEDDING_DIM, // ✅ explicit → DIM guaranteed
    inputType,
  });
  const vec = res.data?.[0]?.embedding; // ✅ response shape is res.data[0].embedding
  if (!vec) throw new Error('Voyage returned no embedding');
  return vec;
}

// Rule 2 — vectors are always encoded as a Float32 Buffer, never a raw array.
export function toFloat32Buffer(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

// Decode a stored Float32 embedding buffer back into a number[] (the inverse of
// toFloat32Buffer). Used by the overview dashboard to mean concept vectors.
export function fromFloat32Buffer(buf: Buffer): number[] {
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4)));
}
