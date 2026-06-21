// Shared tab definitions — the top tab bar and the sidebar nav render from this
// same list. Tabs are split into two groups: "primary" (brain-specific tabs) live
// on the top bar; "meta" (How it works, Settings) live at the bottom-left sidebar.
import type { ReactNode } from 'react';
import {
  Network,
  MessagesSquare,
  BrainCircuit,
  BarChart3,
  HelpCircle,
  Settings,
} from 'lucide-react';

export type TabId = 'overview' | 'chat' | 'graph' | 'progress' | 'how' | 'settings';
export type TabGroup = 'primary' | 'meta';

export const TAB_DEFS: { id: TabId; label: string; icon: ReactNode; group: TabGroup }[] = [
  { id: 'overview', label: 'Overview', icon: <Network strokeWidth={1.5} />, group: 'primary' },
  { id: 'chat', label: 'Converse', icon: <MessagesSquare strokeWidth={1.5} />, group: 'primary' },
  { id: 'graph', label: 'Neuron map', icon: <BrainCircuit strokeWidth={1.5} />, group: 'primary' },
  { id: 'progress', label: 'Progress', icon: <BarChart3 strokeWidth={1.5} />, group: 'primary' },
  { id: 'how', label: 'How it works', icon: <HelpCircle strokeWidth={1.5} />, group: 'meta' },
  { id: 'settings', label: 'Settings', icon: <Settings strokeWidth={1.5} />, group: 'meta' },
];

// Top tab bar (brain-specific) vs bottom-left sidebar nav (meta).
export const PRIMARY_TABS = TAB_DEFS.filter((t) => t.group === 'primary');
export const META_TABS = TAB_DEFS.filter((t) => t.group === 'meta');
