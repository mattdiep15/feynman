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

// Hand-rolled collision force (no d3-force dependency — same authoring style as
// BrainOverview's cluster force). Nudges overlapping nodes apart so the resting
// layout never stacks neurons on top of each other. (R6)
function collideForce(radius: number, strength = 0.9) {
  let nodes: any[] = [];
  const min = radius * 2;
  const force = (alpha: number) => {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist === 0) {
          dx = (j - i) * 0.5;
          dy = 0.5;
          dist = Math.hypot(dx, dy);
        }
        if (dist < min) {
          const push = ((min - dist) / dist) * strength * alpha;
          const ox = dx * push;
          const oy = dy * push;
          a.vx -= ox;
          a.vy -= oy;
          b.vx += ox;
          b.vy += oy;
        }
      }
    }
  };
  force.initialize = (n: any[]) => {
    nodes = n;
  };
  return force;
}

// Label with a rounded background-colored halo so it stays readable over the
// graph in both themes (halo reads --bg, not a hardcoded hex). (R6)
function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  globalScale: number,
  fill: string,
  halo: string,
) {
  ctx.font = `600 ${fontSize}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4 / globalScale;
  ctx.strokeStyle = halo;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
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
  // Collision radius: keep a constant padding between node *borders* even at full
  // hover expansion, so expanded nodes (and their labels) don't overlap. (3)
  const COLLIDE_R = EXPANDED_R + 4;

  // Theme-aware colors read once per theme change (not per node per frame). One
  // neutral label color for every node — consistent, readable on the background,
  // and a single color in dark mode. (3)
  const haloColor = useMemo(() => cssVar('--bg', '#FAFAF9'), [settings.theme]);
  const labelColor = useMemo(() => cssVar('--text-secondary', '#6b7280'), [settings.theme]);

  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  // Cursor position in graph coordinates; drives which labels expand. A ref (not
  // state) so per-frame label drawing reads it without re-rendering on mousemove.
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Frame all nodes once per mount/show; not after manual drags. (R6)
  const didFitRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When the panel becomes visible again (tab show: 0 → real size remounts the
  // inner graph), allow one fresh zoom-to-fit.
  const visible = size.w > 0 && size.h > 0;
  useEffect(() => {
    if (visible) didFitRef.current = false;
  }, [visible]);

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

  // Register the collision force when the node set changes (not on recolor), and
  // reheat so it resolves any overlap. (R6)
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || graphData.nodes.length === 0) return;
    fg.d3Force('collide', collideForce(COLLIDE_R));
    fg.d3ReheatSimulation?.();
  }, [graphData.nodes.length, COLLIDE_R]);

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
            // Frame all nodes once the layout settles (zoom to fit on load), but
            // not after a manual drag — so dragging a node never blanks the view. (R6)
            onEngineStop={() => {
              if (!didFitRef.current) {
                fgRef.current?.zoomToFit(400, 60);
                didFitRef.current = true;
              }
            }}
            // Pin a node where it's dropped so the layout doesn't fly apart after
            // a drag (a cause of the "everything disappears" report). (R6)
            onNodeDragEnd={(n: any) => {
              n.fx = n.x;
              n.fy = n.y;
            }}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              // Skip any node without finite coords (e.g. mid-drag), so a single
              // bad node can't break the frame. (R6)
              if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
              const fontSize = 13 / globalScale;

              // Expansion factor: 1 for the selected node, otherwise grows as the
              // cursor approaches (screen distance = graph distance × globalScale).
              // Shared by real and suggestion nodes so they read as the same size.
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

              // Suggestion neuron: same base size as a real node, dotted purple
              // outline + a "+" affordance to invite adding it to the brain.
              if (node.__suggestion) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                ctx.setLineDash([2, 2]);
                ctx.strokeStyle = '#C4B5FD';
                ctx.lineWidth = 1.5 / globalScale;
                ctx.stroke();
                ctx.setLineDash([]);
                if (t > 0.25) {
                  ctx.globalAlpha = (t - 0.25) / 0.75;
                  drawLabel(ctx, `+ ${node.name}`, node.x, node.y, fontSize, globalScale, '#7C3AED', haloColor);
                  ctx.globalAlpha = 1;
                }
                return;
              }

              const status = masteryToStatus(node.masteryScore);
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
              // t. White on a solid status dot; theme text on hollow untouched.
              if (t > 0.25) {
                ctx.globalAlpha = (t - 0.25) / 0.75;
                drawLabel(ctx, node.name, node.x, node.y, fontSize, globalScale, labelColor, haloColor);
                ctx.globalAlpha = 1;
              }
            }}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              // Generous, fixed hit area so the small dots stay easy to click.
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, 12, 0, 2 * Math.PI);
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
