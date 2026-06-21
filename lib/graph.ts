// Pure mappers for Feature 2 (Graph). Shape Redis reads into react-force-graph
// data without touching Redis itself — keeps the transform testable.
import { statusFromScore } from './mastery';

export interface GraphNode {
  id: string;
  name: string;
  summary: string;
  masteryScore: number;
  status: string;
  val: number; // node size: bigger = more mastered
}
export interface GraphLink {
  source: string;
  target: string;
  type: string;
}
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// hmGet returns [name, summary, masteryScore, status] (any may be null).
export function nodeFromHash(id: string, fields: (string | null)[]): GraphNode {
  const [name, summary, masteryScore, status] = fields;
  const score = Number(masteryScore ?? 0) || 0;
  return {
    id,
    name: name ?? id,
    summary: summary ?? '',
    masteryScore: score,
    status: status ?? statusFromScore(score),
    val: score / 20 + 1,
  };
}

// A set member "${to}:${type}" → a react-force-graph link from `source`.
export function memberToLink(source: string, member: string): GraphLink {
  const idx = member.lastIndexOf(':');
  const target = idx === -1 ? member : member.slice(0, idx);
  const type = idx === -1 ? 'relates_to' : member.slice(idx + 1);
  return { source, target, type };
}
