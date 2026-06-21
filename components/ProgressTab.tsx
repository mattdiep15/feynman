'use client';

import type { GraphNode } from '@/lib/graph';
import { masteryToStatus, nodeBorder, STATUS_PILL, STATUS_ORDER } from '@/lib/nodeState';

export default function ProgressTab({ nodes }: { nodes: GraphNode[] }) {
  const total = nodes.length;
  const avg = total ? Math.round(nodes.reduce((s, n) => s + n.masteryScore, 0) / total) : 0;
  const mastered = nodes.filter((n) => masteryToStatus(n.masteryScore) === 'mastered').length;

  const sorted = [...nodes].sort((a, b) => {
    const sa = STATUS_ORDER[masteryToStatus(a.masteryScore)];
    const sb = STATUS_ORDER[masteryToStatus(b.masteryScore)];
    return sa - sb || b.masteryScore - a.masteryScore;
  });

  return (
    <>
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-label">avg mastery</div>
          <div className="summary-value">{avg}%</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">concepts</div>
          <div className="summary-value">{total}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">mastered</div>
          <div className="summary-value" style={{ color: '#22C55E' }}>
            {mastered} / {total}
          </div>
        </div>
      </div>

      <div className="section-header">All concepts</div>
      {sorted.map((n) => {
        const status = masteryToStatus(n.masteryScore);
        const pill = STATUS_PILL[status];
        return (
          <div className="concept-row" key={n.id}>
            <span className="concept-name">{n.name}</span>
            <div className="progress-bar-wrap">
              <div
                className="progress-bar-fill"
                style={{ width: `${n.masteryScore}%`, background: nodeBorder(status) }}
              />
            </div>
            <span className="pct-label">{n.masteryScore}%</span>
            <span className="status-pill" style={{ background: pill.bg, color: pill.color }}>
              {pill.label}
            </span>
          </div>
        );
      })}
      {total === 0 && <div className="muted" style={{ fontSize: 13 }}>No concepts yet — build a neuron map first.</div>}
    </>
  );
}
