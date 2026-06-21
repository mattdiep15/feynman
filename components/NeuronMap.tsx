'use client';

// Rule: react-force-graph-2d must be a dynamic import with ssr:false — a
// top-level import touches window/canvas and white-screens the app in Next.js.
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { GraphNode, GraphLink } from '@/lib/graph';
import {
  masteryToStatus,
  nodeFill,
  nodeBorder,
  nodeTextColor,
  nodeRadius,
  type NodeStatus,
} from '@/lib/nodeState';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: '#9CA3AF' }}>Loading neuron map…</div>,
});

// Only nodes within this many screen pixels of the cursor expand to show their
// label; the rest collapse to a colored dot. Keeps a dense map readable.
const LABEL_RADIUS_PX = 90;

const LEGEND: { status: NodeStatus; label: string }[] = [
  { status: 'untouched', label: 'Untouched' },
  { status: 'weak', label: 'Weak' },
  { status: 'learning', label: 'Learning' },
  { status: 'improving', label: 'Improving' },
  { status: 'mastered', label: 'Mastered' },
];

export default function NeuronMap({
  brainName,
  nodes,
  links,
  selectedId,
  onSelect,
  onClear,
  onAddNotes,
}: {
  brainName: string;
  nodes: GraphNode[];
  links: GraphLink[];
  selectedId: string | null;
  onSelect: (node: GraphNode) => void;
  onClear: () => void;
  onAddNotes: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  // Cursor position in graph coordinates; drives which labels expand. A ref (not
  // state) so per-frame label drawing reads it without re-rendering on mousemove.
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const avg = nodes.length
    ? Math.round(nodes.reduce((s, n) => s + n.masteryScore, 0) / nodes.length)
    : 0;

  return (
    <>
      <div className="graph-toolbar">
        <span className="graph-toolbar-label">{brainName} — neuron map</span>
        <div className="legend-row">
          {LEGEND.map(({ status, label }) => (
            <span className="legend-item" key={status}>
              <span
                className="legend-dot"
                style={{
                  background: status === 'untouched' ? 'transparent' : nodeFill(status),
                  border: `1px solid ${nodeBorder(status)}`,
                }}
              />
              {label}
            </span>
          ))}
          <button className="btn-ghost" onClick={onAddNotes} title="Add more notes to this brain">
            + Add notes
          </button>
          <button className="btn-ghost" onClick={onClear} title="Clear this brain">
            Clear
          </button>
        </div>
      </div>
      <div
        className="graph-area"
        ref={containerRef}
        onPointerMove={(e) => {
          const el = containerRef.current;
          if (!el || !fgRef.current) return;
          const rect = el.getBoundingClientRect();
          cursorRef.current = fgRef.current.screen2GraphCoords(
            e.clientX - rect.left,
            e.clientY - rect.top,
          );
        }}
        onPointerLeave={() => {
          cursorRef.current = null;
        }}
      >
        {size.w > 0 && (
          <ForceGraph2D
            ref={fgRef}
            width={size.w}
            height={size.h}
            graphData={{ nodes, links }}
            backgroundColor="#FAFAF9"
            linkColor={() => '#E5E7EB'}
            linkWidth={1}
            cooldownTicks={120}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const status = masteryToStatus(node.masteryScore);
              const r = nodeRadius(status, node.masteryScore);
              const fontSize = 12 / globalScale;

              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              if (status !== 'untouched') {
                ctx.fillStyle = nodeFill(status);
                ctx.fill();
              }
              ctx.strokeStyle = node.id === selectedId ? '#7C3AED' : nodeBorder(status);
              ctx.lineWidth = (node.id === selectedId ? 2.5 : 1.5) / globalScale;
              ctx.stroke();

              // Declutter: only expand the label for the selected node or nodes
              // within LABEL_RADIUS_PX of the cursor (distance in graph units ×
              // globalScale = screen pixels). Others stay collapsed dots.
              const cursor = cursorRef.current;
              const nearCursor =
                cursor &&
                Math.hypot(node.x - cursor.x, node.y - cursor.y) * globalScale <= LABEL_RADIUS_PX;
              if (node.id !== selectedId && !nearCursor) return;

              ctx.font = `${status === 'untouched' ? 400 : 500} ${fontSize}px system-ui`;
              ctx.fillStyle = nodeTextColor(status);
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(node.name, node.x, node.y);
            }}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              const status = masteryToStatus(node.masteryScore);
              const r = nodeRadius(status, node.masteryScore);
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fill();
            }}
            onNodeClick={(n: any) => onSelect(n)}
          />
        )}
        {nodes.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              background: '#F5F5F4',
              border: '0.5px solid #E5E7EB',
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 9,
              lineHeight: 1.4,
              pointerEvents: 'none',
            }}
          >
            <div className="muted">Click a neuron to converse about it</div>
            <div style={{ color: '#7C3AED' }}>
              {nodes.length} neurons · avg {avg}%
            </div>
          </div>
        )}
      </div>
    </>
  );
}
