// Client-side 5-state node model (spec: untouched/weak/learning/improving/mastered),
// derived purely from masteryScore. The backend stores a coarser status; the UI
// recomputes the visual state from score per the design (score-only, no
// everAttempted flag — score 0 renders as the hollow "untouched" state).
export type NodeStatus = 'untouched' | 'weak' | 'learning' | 'improving' | 'mastered';

export function masteryToStatus(score: number): NodeStatus {
  if (score <= 0) return 'untouched';
  if (score < 40) return 'weak';
  if (score < 70) return 'learning';
  if (score < 85) return 'improving';
  return 'mastered';
}

export function nodeFill(status: NodeStatus): string {
  switch (status) {
    case 'weak':
      return '#FEF2F2';
    case 'learning':
      return '#FFFBEB';
    case 'improving':
      return '#F3F0FF';
    case 'mastered':
      return '#ECFDF5';
    default:
      return '#FAFAF9'; // untouched — same as app background (hollow)
  }
}

export function nodeBorder(status: NodeStatus): string {
  switch (status) {
    case 'weak':
      return '#FCA5A5';
    case 'learning':
      return '#FDE68A';
    case 'improving':
      return '#C4B5FD';
    case 'mastered':
      return '#22C55E';
    default:
      return '#D1D5DB'; // untouched
  }
}

export function nodeTextColor(status: NodeStatus): string {
  switch (status) {
    case 'weak':
      return '#EF4444';
    case 'learning':
      return '#D97706';
    case 'improving':
      return '#7C3AED';
    case 'mastered':
      return '#16523A';
    default:
      return '#9CA3AF'; // untouched
  }
}

// Untouched nodes are smallest; size grows with mastery.
export function nodeRadius(status: NodeStatus, score: number): number {
  return status === 'untouched' ? 10 : Math.max(12, (score / 100) * 28 + 10);
}

// ---- Hover expand model (R2) -------------------------------------------
// Nodes render as small solid dots and bloom toward `expanded` as the cursor
// nears them. These are pure so the easing curve stays testable; the canvas
// drawing in NeuronMap composes them.

// Base dot size by the settings "node size" preference. Smaller than the old
// mastery-driven radius — the map is now a field of dots that expand on hover.
export const HOVER_BASE: Record<'small' | 'medium' | 'large', number> = {
  small: 3,
  medium: 4.5,
  large: 6,
};
// Fully-expanded radius (cursor on the node) for the same three presets.
export const HOVER_EXPANDED: Record<'small' | 'medium' | 'large', number> = {
  small: 16,
  medium: 20,
  large: 26,
};

// Smoothstep eases the 0→1 expansion so growth feels organic, not linear.
export function smoothstep(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

// Cursor proximity → expansion factor in [0,1]. 1 when the cursor is on the
// node, 0 once it's `influencePx` screen-pixels away.
export function hoverScale(distPx: number, influencePx: number): number {
  return smoothstep(1 - distPx / influencePx);
}

// Interpolate the rendered radius from base dot to expanded by factor t.
export function expandedRadius(t: number, base: number, expanded: number): number {
  return base + t * (expanded - base);
}

// Solid dot color per status (untouched stays hollow, drawn as an outline).
export function nodeDotColor(status: NodeStatus): string {
  return nodeTextColor(status);
}

// Progress-tab status pills (background + text + label per state).
export const STATUS_PILL: Record<NodeStatus, { bg: string; color: string; label: string }> = {
  mastered: { bg: '#ECFDF5', color: '#16523A', label: 'Mastered' },
  improving: { bg: '#F3F0FF', color: '#7C3AED', label: 'Improving' },
  learning: { bg: '#FFFBEB', color: '#D97706', label: 'Learning' },
  weak: { bg: '#FEF2F2', color: '#EF4444', label: 'Weak' },
  untouched: { bg: '#F3F4F6', color: '#9CA3AF', label: 'Untouched' },
};

// Sort order for the Progress list: mastered → improving → learning → weak → untouched.
export const STATUS_ORDER: Record<NodeStatus, number> = {
  mastered: 0,
  improving: 1,
  learning: 2,
  weak: 3,
  untouched: 4,
};
