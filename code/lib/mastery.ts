// Mastery state machine + colors. Pure functions, shared by routes and UI.
// untested 0 → weak 1–39 → shaky 40–69 → learned 70–100
export type MasteryStatus = 'untested' | 'weak' | 'shaky' | 'learned';

export function statusFromScore(score: number): MasteryStatus {
  if (score <= 0) return 'untested';
  if (score < 40) return 'weak';
  if (score < 70) return 'shaky';
  return 'learned';
}

// gray/untested · red/weak · amber/shaky · green/learned
export function masteryColor(s: number): string {
  return s === 0 ? '#6b7280' : s < 40 ? '#ef4444' : s < 70 ? '#f59e0b' : '#22c55e';
}

// Clamp an arbitrary score into the valid 0–100 range.
export function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}
