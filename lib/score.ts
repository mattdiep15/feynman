// Deterministic mastery scoring. Claude emits the rubric sub-scores it already
// reasons about; the TOTAL is computed here, not free-typed by the model. This
// makes the score a continuous function of the rubric (finer-grained than the
// round numbers an LLM tends to pick) and keeps it reproducible/testable.

export interface RubricScores {
  coreAccuracy: number; // 0–30: core definition accuracy
  keyRelationships: number; // 0–30: key relationships
  absenceOfMisconceptions: number; // 0–20: absence of misconceptions
  connectsToRelated: number; // 0–20: connects to related concepts
}

// Each rubric dimension and its maximum. Sum of maxima = 100.
export const RUBRIC_MAX: Record<keyof RubricScores, number> = {
  coreAccuracy: 30,
  keyRelationships: 30,
  absenceOfMisconceptions: 20,
  connectsToRelated: 20,
};

// Clamp a single component into [0, max]; NaN/garbage → 0.
export function clampComponent(value: number, max: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(max, value));
}

// Sum the clamped rubric components into a continuous 0–100 score. Rounded to
// one decimal so the distribution stays fine-grained without float noise.
export function computeMastery(r: RubricScores): number {
  const sum =
    clampComponent(r.coreAccuracy, RUBRIC_MAX.coreAccuracy) +
    clampComponent(r.keyRelationships, RUBRIC_MAX.keyRelationships) +
    clampComponent(r.absenceOfMisconceptions, RUBRIC_MAX.absenceOfMisconceptions) +
    clampComponent(r.connectsToRelated, RUBRIC_MAX.connectsToRelated);
  return Math.round(sum * 10) / 10;
}

// Per-turn weight when blending a new score into the running mastery. Lower =
// more inertia (past mastery sticks); higher = more reactive to the latest
// turn. Tunable — we're still dialing in the feel.
export const DECAY_ALPHA = 0.4;

// Blend this turn's score into the prior mastery with exponential decay, so a
// strong explanation keeps counting over later turns and a single weak turn
// only partially drags the score down. The first attempt has no history to
// blend against, so it counts in full.
export function blendMastery(
  prior: number,
  current: number,
  priorAttempts: number,
  alpha: number = DECAY_ALPHA,
): number {
  if (priorAttempts <= 0) return current;
  return Math.round((alpha * current + (1 - alpha) * prior) * 10) / 10;
}
