// Pure helpers for Feature 3d (evaluate). Prompt builder + result sanitizer.
import { computeMastery, clampComponent, RUBRIC_MAX, type RubricScores } from './score';
import type { RelatedNode } from './retrieve';

export interface EvaluationResult {
  // Continuous 0–100, computed from the rubric (see lib/score.ts) rather than
  // free-typed by the model.
  masteryScore: number;
  rubric: RubricScores;
  correct: string[];
  missing: string[];
  misconceptions: string[];
  feedbackMessage: string;
  followUpQuestion: string;
  // False when the latest input isn't a genuine explanation attempt (a request,
  // filler, or an accidental fragment) — the caller then leaves the score
  // untouched rather than penalizing it (R3).
  scorable: boolean;
}

export function buildEvalPrompt(
  target: { name: string; summary: string },
  transcript: string,
  related: RelatedNode[],
  knownMisconceptions: string[],
  crossBrain: RelatedNode[] = [],
  priorTranscript = '',
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
  // Everything the student already covered earlier in this same session. Their
  // cumulative understanding is judged against ALL of it, so answering a
  // follow-up never "forgets" the basics they stated earlier (R3).
  const sessionBlock = priorTranscript.trim()
    ? `EARLIER IN THIS SESSION the student already explained:
"""
${priorTranscript}
"""

`
    : '';

  return `You are a tutor using the Feynman technique. The student is explaining a concept out loud across a conversation. Judge their CUMULATIVE understanding.

CONCEPT: ${target.name}
REFERENCE SUMMARY: ${target.summary}

RELATED CONCEPTS the student should connect to:
${relatedList}

KNOWN MISCONCEPTIONS to watch for:
${misconList}${crossList}

${sessionBlock}STUDENT'S LATEST INPUT (transcript):
"""
${transcript}
"""

FIRST decide "scorable": is the latest input a genuine attempt to explain the
concept? Set scorable=false (and do not penalize) when it is instead:
- a request or meta-question ("can you test me on income", "what should I cover?")
- filler or acknowledgement ("yeah for sure!", "ok", "got it")
- an accidental or truncated fragment (a stray word, an unfinished thought)
When scorable=false, still reply warmly in feedbackMessage; the scores are ignored.

WHEN scorable=true, score the student's cumulative understanding using BOTH what
they explained earlier this session and their latest input. Do NOT mark something
as missing if they already covered it earlier in the session. Score each rubric
dimension independently — do NOT sum them yourself; the total is computed from
your sub-scores:
1. Core definition accuracy (0–30)
2. Key relationships (0–30)
3. Absence of misconceptions (0–20)
4. Connects to related concepts (0–20)

Return ONLY valid JSON in this exact shape:
{
  "scorable": <true|false>,
  "coreAccuracy": <number 0-30>,
  "keyRelationships": <number 0-30>,
  "absenceOfMisconceptions": <number 0-20>,
  "connectsToRelated": <number 0-20>,
  "correct": ["what they got right"],
  "missing": ["important things still left out across the whole session"],
  "misconceptions": ["any wrong beliefs they revealed"],
  "feedbackMessage": "2-3 warm, spoken sentences of feedback the tutor will say out loud",
  "followUpQuestion": "one question that probes the biggest gap"
}`;
}

// Forced-tool schema (Rule 6 upgrade) — guarantees the evaluation comes back
// structured instead of relying on prompt-only JSON.
export const EVALUATION_TOOL = {
  name: 'record_evaluation',
  description:
    "Record the structured evaluation of the student's spoken explanation. Score each " +
    'rubric dimension independently; the total mastery is computed from the sub-scores.',
  input_schema: {
    type: 'object' as const,
    properties: {
      scorable: {
        type: 'boolean',
        description:
          'False if the latest input is not a genuine explanation attempt (a request, filler, or accidental fragment); the score is then left untouched.',
      },
      coreAccuracy: { type: 'number', minimum: 0, maximum: 30, description: 'Core definition accuracy (0–30).' },
      keyRelationships: { type: 'number', minimum: 0, maximum: 30, description: 'Key relationships (0–30).' },
      absenceOfMisconceptions: { type: 'number', minimum: 0, maximum: 20, description: 'Absence of misconceptions (0–20).' },
      connectsToRelated: { type: 'number', minimum: 0, maximum: 20, description: 'Connects to related concepts (0–20).' },
      correct: { type: 'array', items: { type: 'string' }, description: 'Things the student got right.' },
      missing: { type: 'array', items: { type: 'string' }, description: 'Important things left out.' },
      misconceptions: { type: 'array', items: { type: 'string' }, description: 'Wrong beliefs revealed.' },
      feedbackMessage: { type: 'string', description: '2-3 warm spoken sentences of feedback.' },
      followUpQuestion: { type: 'string', description: 'One question probing the biggest gap.' },
    },
    required: [
      'scorable',
      'coreAccuracy',
      'keyRelationships',
      'absenceOfMisconceptions',
      'connectsToRelated',
      'correct',
      'missing',
      'misconceptions',
      'feedbackMessage',
      'followUpQuestion',
    ],
  },
};

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

export function normalizeEvaluation(raw: unknown): EvaluationResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rubric: RubricScores = {
    coreAccuracy: Number(r.coreAccuracy),
    keyRelationships: Number(r.keyRelationships),
    absenceOfMisconceptions: Number(r.absenceOfMisconceptions),
    connectsToRelated: Number(r.connectsToRelated),
  };
  return {
    // Deterministic total from the rubric (clamps components internally).
    masteryScore: computeMastery(rubric),
    rubric: {
      coreAccuracy: clampComponent(rubric.coreAccuracy, RUBRIC_MAX.coreAccuracy),
      keyRelationships: clampComponent(rubric.keyRelationships, RUBRIC_MAX.keyRelationships),
      absenceOfMisconceptions: clampComponent(rubric.absenceOfMisconceptions, RUBRIC_MAX.absenceOfMisconceptions),
      connectsToRelated: clampComponent(rubric.connectsToRelated, RUBRIC_MAX.connectsToRelated),
    },
    correct: strArray(r.correct),
    missing: strArray(r.missing),
    misconceptions: strArray(r.misconceptions),
    feedbackMessage:
      typeof r.feedbackMessage === 'string' && r.feedbackMessage.trim()
        ? r.feedbackMessage
        : "Thanks — I've recorded your explanation.",
    followUpQuestion: typeof r.followUpQuestion === 'string' ? r.followUpQuestion : '',
    // Default to scorable when the model omits the flag, so a genuine
    // explanation is never silently dropped from scoring.
    scorable: typeof r.scorable === 'boolean' ? r.scorable : true,
  };
}
