// Pure helpers for Feature 3d (evaluate). Prompt builder + result sanitizer.
import { clampScore } from './mastery';
import type { RelatedNode } from './retrieve';

export interface EvaluationResult {
  masteryScore: number;
  correct: string[];
  missing: string[];
  misconceptions: string[];
  feedbackMessage: string;
  followUpQuestion: string;
}

export function buildEvalPrompt(
  target: { name: string; summary: string },
  transcript: string,
  related: RelatedNode[],
  knownMisconceptions: string[],
  crossBrain: RelatedNode[] = [],
): string {
  const relatedList = related.length
    ? related.map((r) => `- ${r.name}: ${r.summary}`).join('\n')
    : '(none retrieved)';
  const misconList = knownMisconceptions.length
    ? knownMisconceptions.map((m) => `- ${m}`).join('\n')
    : '(none recorded yet)';
  const crossList = crossBrain.length
    ? '\n\nANALOGICAL BRIDGES from the student\'s other subjects (use these to make the feedback click):\n' +
      crossBrain.map((r) => `- ${r.name} (${r.brainId}): ${r.summary}`).join('\n')
    : '';

  return `You are a tutor using the Feynman technique. The student spoke an explanation of a concept out loud. Judge how well they understand it.

CONCEPT: ${target.name}
REFERENCE SUMMARY: ${target.summary}

RELATED CONCEPTS the student should connect to:
${relatedList}

KNOWN MISCONCEPTIONS to watch for:
${misconList}${crossList}

STUDENT'S SPOKEN EXPLANATION (transcript):
"""
${transcript}
"""

Grade with this rubric, summing to a 0–100 mastery score:
1. Core definition accuracy (0–30)
2. Key relationships (0–30)
3. Absence of misconceptions (0–20)
4. Connects to related concepts (0–20)

Return ONLY valid JSON in this exact shape:
{
  "masteryScore": <integer 0-100>,
  "correct": ["what they got right"],
  "missing": ["important things they left out"],
  "misconceptions": ["any wrong beliefs they revealed"],
  "feedbackMessage": "2-3 warm, spoken sentences of feedback the tutor will say out loud",
  "followUpQuestion": "one question that probes the biggest gap"
}`;
}

// Forced-tool schema (Rule 6 upgrade) — guarantees the evaluation comes back
// structured instead of relying on prompt-only JSON.
export const EVALUATION_TOOL = {
  name: 'record_evaluation',
  description: "Record the structured evaluation of the student's spoken explanation.",
  input_schema: {
    type: 'object' as const,
    properties: {
      masteryScore: { type: 'integer', minimum: 0, maximum: 100, description: 'Total 0–100 from the rubric.' },
      correct: { type: 'array', items: { type: 'string' }, description: 'Things the student got right.' },
      missing: { type: 'array', items: { type: 'string' }, description: 'Important things left out.' },
      misconceptions: { type: 'array', items: { type: 'string' }, description: 'Wrong beliefs revealed.' },
      feedbackMessage: { type: 'string', description: '2-3 warm spoken sentences of feedback.' },
      followUpQuestion: { type: 'string', description: 'One question probing the biggest gap.' },
    },
    required: ['masteryScore', 'correct', 'missing', 'misconceptions', 'feedbackMessage', 'followUpQuestion'],
  },
};

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

export function normalizeEvaluation(raw: unknown): EvaluationResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    masteryScore: clampScore(Number(r.masteryScore)),
    correct: strArray(r.correct),
    missing: strArray(r.missing),
    misconceptions: strArray(r.misconceptions),
    feedbackMessage:
      typeof r.feedbackMessage === 'string' && r.feedbackMessage.trim()
        ? r.feedbackMessage
        : "Thanks — I've recorded your explanation.",
    followUpQuestion: typeof r.followUpQuestion === 'string' ? r.followUpQuestion : '',
  };
}
