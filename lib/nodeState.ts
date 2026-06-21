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
