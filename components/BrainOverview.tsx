'use client';

// Multi-brain dashboard: brains placed in shared semantic space, dotted links
// between related subjects. react-force-graph (same as the neuron map) handles
// the layout — a force graph naturally settles into an organic, brain-like blob.
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { BrainPoint, BrainLink } from '@/lib/overview';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: '#9CA3AF' }}>Loading overview…</div>,
});

export default function BrainOverview({
  active,
  onOpenBrain,
}: {
  active: boolean;
  onOpenBrain: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [data, setData] = useState<{ brains: BrainPoint[]; links: BrainLink[] }>({
    brains: [],
    links: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Refetch each time the tab is opened so it reflects newly added brains/notes.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    fetch('/api/overview')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData({ brains: d.brains ?? [], links: d.links ?? [] });
      })
      .catch(() => {
        if (!cancelled) setData({ brains: [], links: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const nodes = data.brains.map((b) => ({ ...b, val: b.conceptCount + 1 }));

  return (
    <>
      <div className="graph-toolbar">
        <span className="graph-toolbar-label">Your brains — semantic overview</span>
        <span className="muted" style={{ fontSize: 11 }}>
          {loading ? 'Mapping…' : `${data.brains.length} brains · dotted links = related subjects`}
        </span>
      </div>
      <div className="graph-area" ref={containerRef}>
        {data.brains.length === 0 && !loading && (
          <div className="muted" style={{ padding: 24, fontSize: 13 }}>
            No brains to map yet. Create a brain and build its neuron map first.
          </div>
        )}
        {size.w > 0 && data.brains.length > 0 && (
          <ForceGraph2D
            width={size.w}
            height={size.h}
            graphData={{ nodes, links: data.links }}
            backgroundColor="#FAFAF9"
            linkColor={() => '#C4B5FD'}
            linkLineDash={() => [3, 3]}
            linkWidth={1}
            cooldownTicks={120}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const r = Math.max(14, Math.min(34, node.conceptCount * 2 + 14));
              const fontSize = 12 / globalScale;
              const iconSize = r * 0.9;

              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = '#F3F0FF';
              ctx.fill();
              ctx.strokeStyle = '#7C3AED';
              ctx.lineWidth = 1.5 / globalScale;
              ctx.stroke();

              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.font = `${iconSize}px system-ui`;
              ctx.fillText(node.icon || '🧠', node.x, node.y);

              ctx.font = `600 ${fontSize}px system-ui`;
              ctx.fillStyle = '#111827';
              ctx.fillText(node.name, node.x, node.y + r + fontSize);
              ctx.font = `400 ${fontSize * 0.85}px system-ui`;
              ctx.fillStyle = '#7C3AED';
              ctx.fillText(`${node.conceptCount} neurons · ${node.avgMastery}%`, node.x, node.y + r + fontSize * 2.1);
            }}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              const r = Math.max(14, Math.min(34, node.conceptCount * 2 + 14));
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fill();
            }}
            onNodeClick={(n: any) => onOpenBrain(n.id)}
          />
        )}
      </div>
    </>
  );
}
