'use client';

import type { BrainMeta } from '@/lib/brains';
import { META_TABS, type TabId } from './tabDefs';
import { Logo } from './Logo';
import { Plus } from 'lucide-react';

export default function Sidebar({
  brains,
  activeBrainId,
  onSwitchBrain,
  onNewBrain,
  onHome,
  tab,
  onTab,
}: {
  brains: BrainMeta[];
  activeBrainId: string | null;
  onSwitchBrain: (id: string) => void;
  onNewBrain: () => void;
  onHome: () => void;
  tab: TabId;
  onTab: (t: TabId) => void;
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <button className="logo-button" onClick={onHome} title="Back to overview">
          <Logo />
        </button>
      </div>

      <div className="brain-label">My brains</div>
      {brains.map((b) => (
        <button
          key={b.id}
          className={`brain-item${b.id === activeBrainId ? ' active' : ''}`}
          onClick={() => onSwitchBrain(b.id)}
        >
          <span className="brain-icon">{b.icon}</span>
          <span className="brain-name">{b.name}</span>
          <span className="brain-score">{b.avgMastery}%</span>
        </button>
      ))}
      <button className="add-brain" onClick={onNewBrain}>
        <Plus width={14} height={14} strokeWidth={1.5} />
        New brain
      </button>

      <div className="nav-section">
        {META_TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-item${t.id === tab ? ' active' : ''}`}
            onClick={() => onTab(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
