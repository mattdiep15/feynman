'use client';

import type { BrainMeta } from '@/lib/brains';
import { TAB_DEFS, type TabId } from './tabDefs';

export default function Sidebar({
  brains,
  activeBrainId,
  onSwitchBrain,
  onNewBrain,
  tab,
  onTab,
}: {
  brains: BrainMeta[];
  activeBrainId: string | null;
  onSwitchBrain: (id: string) => void;
  onNewBrain: () => void;
  tab: TabId;
  onTab: (t: TabId) => void;
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <div className="logo">
          <span className="logo-dot">
            <svg viewBox="0 0 12 12">
              <circle cx="6" cy="6" r="4" strokeWidth="1.5" />
              <circle cx="6" cy="6" r="1.5" fill="white" stroke="none" />
            </svg>
          </span>
          Feynman
        </div>
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
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <line x1="7" y1="2" x2="7" y2="12" />
          <line x1="2" y1="7" x2="12" y2="7" />
        </svg>
        New brain
      </button>

      <div className="nav-section">
        {TAB_DEFS.map((t) => (
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
