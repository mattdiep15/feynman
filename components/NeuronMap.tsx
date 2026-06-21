'use client';

// Rule: react-force-graph-2d must be a dynamic import with ssr:false — a
// top-level import touches window/canvas and white-screens the app in Next.js.
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GraphNode, GraphLink } from '@/lib/graph';
import type { Suggestion } from '@/lib/suggest';
import {
  masteryToStatus,
  nodeFill,
  nodeBorder,
  nodeTextColor,
  nodeDotColor,
  hoverScale,
  expandedRadius,
  HOVER_BASE,
  HOVER_EXPANDED,
  type NodeStatus,
} from '@/lib/nodeState';
import { useSettings } from '@/context/SettingsContext';
import { GRAPH_ALPHA_DECAY } from '@/lib/settings';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: '#9CA3AF' }}>Loading neuron map…</div>,
});

// Cursor influence radius (screen px): nodes within this distance expand from a
// dot toward their full size, growing most as the cursor lands on them.
const INFLUENCE_PX = 150;

// Read a CSS custom property (so the canvas background follows the theme).
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

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
  suggestions,
  onAcceptSuggestion,
}: {
  brainName: string;
  nodes: GraphNode[];
  links: GraphLink[];
  selectedId: string | null;
  onSelect: (node: GraphNode) => void;
  onClear: () => void;
  onAddNotes: () => void;
  suggestions: Suggestion[];
  onAcceptSuggestion: (s: Suggestion) => void;
}) {
  const { settings } = useSettings();
  // Base/expanded dot sizes from the user's node-size preference.
  const BASE_R = HOVER_BASE[settings.nodeSize];
  const EXPANDED_R = HOVER_EXPANDED[settings.nodeSize];

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

  // Suggestion nodes/links are layered onto the real graph as ephemeral, dotted
  // neurons attached to the mastered concept they extend. Memoized so their
  // object identity (and thus force-graph position) survives recolors of the
  // real nodes. They are excluded from the stats badge below.
  const suggestionNodes = useMemo(
    () => suggestions.map((s) => ({ ...s, masteryScore: 0, val: 1, __suggestion: true })),
    [suggestions],
  );
  const graphData = useMemo(
    () => ({
      nodes: [...nodes, ...suggestionNodes],
      links: [
        ...links,
        ...suggestions.map((s) => ({ source: s.sourceId, target: s.id, __suggestion: true })),
      ],
    }),
    [nodes, links, suggestions, suggestionNodes],
  );

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
            graphData={graphData}
            backgroundColor={cssVar('--bg', '#FAFAF9')}
            linkColor={(l: any) => (l.__suggestion ? '#C4B5FD' : '#E5E7EB')}
            linkWidth={1}
            linkLineDash={(l: any) => (l.__suggestion ? [3, 3] : null)}
            cooldownTicks={120}
            d3AlphaDecay={GRAPH_ALPHA_DECAY[settings.graphSpeed]}
            d3VelocityDecay={0.3}
            // Keep the render loop alive after the sim cools so hover tracking
            // (driven by cursorRef, not React state) keeps repainting. Without
            // this the labels freeze once the graph settles (~3s). (R2)
            autoPauseRedraw={false}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const fontSize = 12 / globalScale;

              // Suggestion neuron: dotted purple outline, always labelled with a
              // "+" to invite the student to add it to their brain.
              if (node.__suggestion) {
                const sr = 9;
                ctx.beginPath();
                ctx.arc(node.x, node.y, sr, 0, 2 * Math.PI);
                ctx.setLineDash([2, 2]);
                ctx.strokeStyle = '#C4B5FD';
                ctx.lineWidth = 1.5 / globalScale;
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.font = `500 ${fontSize}px system-ui`;
                ctx.fillStyle = '#7C3AED';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`+ ${node.name}`, node.x, node.y - sr - fontSize);
                return;
              }

              const status = masteryToStatus(node.masteryScore);

              // Expansion factor: 1 for the selected node, otherwise grows as the
              // cursor approaches (screen distance = graph distance × globalScale).
              const cursor = cursorRef.current;
              const t =
                node.id === selectedId
                  ? 1
                  : cursor
                    ? hoverScale(
                        Math.hypot(node.x - cursor.x, node.y - cursor.y) * globalScale,
                        INFLUENCE_PX,
                      )
                    : 0;
              const r = expandedRadius(t, BASE_R, EXPANDED_R);

              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              if (status !== 'untouched') {
                ctx.fillStyle = nodeDotColor(status);
                ctx.fill();
              }
              ctx.strokeStyle = node.id === selectedId ? '#7C3AED' : nodeBorder(status);
              ctx.lineWidth = (node.id === selectedId ? 2.5 : 1) / globalScale;
              ctx.stroke();

              // Once expanded enough, fill the node with its label, fading in with
              // t. Drawn with a background-colored halo so it stays readable.
              if (t > 0.25) {
                ctx.globalAlpha = (t - 0.25) / 0.75;
                ctx.font = `500 ${fontSize}px system-ui`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.lineWidth = 3 / globalScale;
                ctx.strokeStyle = '#FAFAF9';
                ctx.strokeText(node.name, node.x, node.y);
                ctx.fillStyle = status === 'untouched' ? nodeTextColor(status) : '#FFFFFF';
                ctx.fillText(node.name, node.x, node.y);
                ctx.globalAlpha = 1;
              }
            }}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              // Generous, fixed hit area so the small dots stay easy to click.
              const r = node.__suggestion ? 9 : 12;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fill();
            }}
            onNodeClick={(n: any) => (n.__suggestion ? onAcceptSuggestion(n) : onSelect(n))}
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
