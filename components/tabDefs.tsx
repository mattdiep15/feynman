// Shared tab definitions — the sidebar nav and the top tab bar stay in sync by
// rendering from the same list.
import type { ReactNode } from 'react';

export type TabId = 'overview' | 'chat' | 'graph' | 'progress' | 'how' | 'settings';

export const TAB_DEFS: { id: TabId; label: string; icon: ReactNode }[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="5" cy="6" r="2.5" />
        <circle cx="11" cy="10" r="2.5" />
        <line x1="7" y1="7.5" x2="9" y2="8.5" strokeDasharray="1.5 1.5" />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Converse',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M2 3h12v8H9l-3 2v-2H2z" />
      </svg>
    ),
  },
  {
    id: 'graph',
    label: 'Neuron map',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="8" cy="8" r="2" />
        <circle cx="3" cy="4" r="1.5" />
        <circle cx="13" cy="4" r="1.5" />
        <circle cx="3" cy="12" r="1.5" />
        <circle cx="13" cy="12" r="1.5" />
        <line x1="6" y1="7" x2="4.5" y2="5.5" />
        <line x1="10" y1="7" x2="11.5" y2="5.5" />
        <line x1="6" y1="9" x2="4.5" y2="10.5" />
        <line x1="10" y1="9" x2="11.5" y2="10.5" />
      </svg>
    ),
  },
  {
    id: 'progress',
    label: 'Progress',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="2" y="10" width="3" height="4" rx="1" />
        <rect x="6.5" y="6" width="3" height="8" rx="1" />
        <rect x="11" y="2" width="3" height="12" rx="1" />
      </svg>
    ),
  },
  {
    id: 'how',
    label: 'How it works',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="8" cy="8" r="6" />
        <path d="M8 7v5M8 5v1" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="8" cy="8" r="2.5" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" />
      </svg>
    ),
  },
];
