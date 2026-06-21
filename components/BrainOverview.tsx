'use client';

// R3 — Multibrain overview. A single pannable/zoomable field of every brain's
// concept nodes, each brain settling into a globular dotted lobe (no emoji, no
// per-node text) under a small name label that follows the lobe's curve. A subtle
// pseudo-3D tilt (elliptical layout + depth-scaled dots) gives the "globe under a
// magnifying glass" feel; the field rotates slowly only while idle. Focusing a
// brain is driven from the left sidebar (which then hands off to its neuron map);
// the canvas itself is pan/zoom only. Click the background to clear focus.
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BrainPoint, BrainLink, OverviewNode, OverviewConceptLink } from '@/lib/overview';
import { brainAnchors, blobPoints, hashSeed } from '@/lib/overview';
import { masteryToStatus, nodeDotColor, nodeBorder } from '@/lib/nodeState';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading overview…</div>,
});

// Vertical squash applied to the layout + lobes for a tilted-plane look. (R3)
const TILT = 0.62;

// Read a CSS custom property (so dark mode themes the canvas), with a light-mode
// fallback for SSR / before styles resolve.
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Custom d3 force: pull each node toward its brain's anchor. Written without a
// d3-force import (react-force-graph drives it via initialize/force(alpha)).
function clusterForce(anchors: Record<string, { x: number; y: number }>, strength: number) {
  let nodes: any[] = [];
  const force = (alpha: number) => {
    for (const n of nodes) {
      const a = anchors[n.brainId];
      if (!a) continue;
      n.vx += (a.x - n.x) * strength * alpha;
      n.vy += (a.y - n.y) * strength * alpha;
    }
  };
  force.initialize = (n: any[]) => {
    nodes = n;
  };
  return force;
}

// Draw a closed blob outline through pre-sampled points.
function tracePolygon(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

// Draw `text` curved along the top arc of a circle of `radius` around (cx,cy). (R3)
function drawArcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  fontSize: number,
  color: string,
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `600 ${fontSize}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  // Center the word over the top of the lobe; angles increase clockwise.
  let angle = -Math.PI / 2 - total / (2 * radius);
  for (let i = 0; i < chars.length; i++) {
    angle += widths[i] / (2 * radius);
    ctx.save();
    ctx.translate(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    angle += widths[i] / (2 * radius);
  }
  ctx.restore();
}

type OverviewData = {
  brains: BrainPoint[];
  nodes: OverviewNode[];
  conceptLinks: OverviewConceptLink[];
  links: BrainLink[];
};

export default function BrainOverview({
  active,
  focusedBrainId,
  onFocusBrain,
}: {
  active: boolean;
  focusedBrainId: string | null;
  onFocusBrain: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [data, setData] = useState<OverviewData>({ brains: [], nodes: [], conceptLinks: [], links: [] });
  const [loading, setLoading] = useState(false);

  // Refs the per-frame canvas/rotation code reads without re-rendering.
  const focusedRef = useRef<string | null>(focusedBrainId);
  focusedRef.current = focusedBrainId;
  const hoveringRef = useRef(false);
  const rotationRef = useRef(0);
  // Field vertical bounds, refreshed each frame, for pseudo-3D depth cues.
  const depthRef = useRef({ cy: 0, half: 1 });

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
        if (!cancelled)
          setData({
            brains: d.brains ?? [],
            nodes: d.nodes ?? [],
            conceptLinks: d.conceptLinks ?? [],
            links: d.links ?? [],
          });
      })
      .catch(() => {
        if (!cancelled) setData({ brains: [], nodes: [], conceptLinks: [], links: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  // Stable graph data (object identity preserved so the sim keeps positions).
  const graphData = useMemo(
    () => ({ nodes: data.nodes.map((n) => ({ ...n })), links: data.conceptLinks.map((l) => ({ ...l })) }),
    [data],
  );

  // Register the cluster force + loosen charge once data is in. Anchors are
  // vertically squashed (TILT) so the whole field reads as a tilted plane.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || data.nodes.length === 0) return;
    const radius = Math.max(140, data.brains.length * 60);
    const anchors = brainAnchors(
      data.brains.map((b) => b.id),
      radius,
    );
    for (const k in anchors) anchors[k].y *= TILT;
    fg.d3Force('cluster', clusterForce(anchors, 0.35));
    fg.d3Force('charge')?.strength(-40);
    fg.d3ReheatSimulation?.();
  }, [data]);

  // Frame the view: the focused lobe, or the whole field by default.
  const fitView = (ms: number) => {
    const fg = fgRef.current;
    if (!fg || data.nodes.length === 0) return;
    if (focusedRef.current) fg.zoomToFit(ms, 80, (n: any) => n.brainId === focusedRef.current);
    else fg.zoomToFit(ms, 50);
  };

  // Re-fit whenever focus or data changes.
  useEffect(() => {
    const t = setTimeout(() => fitView(600), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedBrainId, data]);

  // Re-fit when the tab becomes active (the graph may have been hidden at mount).
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => fitView(0), 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, size.w, size.h]);

  // Slow rotation when idle; ease back to upright while hovering (incl. panning /
  // zooming) or focused so the canvas pointer mapping stays accurate.
  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (focusedRef.current || hoveringRef.current) {
        rotationRef.current *= 0.9;
        if (Math.abs(rotationRef.current) < 0.01) rotationRef.current = 0;
      } else {
        rotationRef.current += 0.03;
      }
      if (wrapperRef.current) wrapperRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Centroid + spread of a brain's currently-laid-out nodes (lobe + links).
  const centroid = (brainId: string) => {
    const ns = (graphData.nodes as any[]).filter((n) => n.brainId === brainId && n.x != null);
    if (!ns.length) return null;
    let x = 0;
    let y = 0;
    let maxR = 0;
    for (const n of ns) {
      x += n.x;
      y += n.y;
    }
    x /= ns.length;
    y /= ns.length;
    for (const n of ns) maxR = Math.max(maxR, Math.hypot(n.x - x, n.y - y));
    return { x, y, r: maxR };
  };

  const focusedName = data.brains.find((b) => b.id === focusedBrainId)?.name ?? focusedBrainId;

  return (
    <>
      <div className="graph-toolbar">
        <span className="graph-toolbar-label">Your brains — semantic overview</span>
        <span className="muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 10 }}>
          {loading
            ? 'Mapping…'
            : focusedBrainId
              ? `Focused on ${focusedName}`
              : `${data.brains.length} brains · drag to pan, scroll to zoom · pick a brain at left`}
          {focusedBrainId && (
            <button className="btn-ghost" onClick={() => onFocusBrain(null)} title="Back to all brains">
              ← All brains
            </button>
          )}
        </span>
      </div>
      <div
        className="graph-area"
        ref={containerRef}
        style={{ overflow: 'hidden' }}
        onPointerEnter={() => {
          hoveringRef.current = true;
        }}
        onPointerLeave={() => {
          hoveringRef.current = false;
        }}
      >
        {data.brains.length === 0 && !loading && (
          <div className="muted" style={{ padding: 24, fontSize: 13 }}>
            No brains to map yet. Create a brain and build its neuron map first.
          </div>
        )}
        {size.w > 0 && data.nodes.length > 0 && (
          <div ref={wrapperRef} style={{ width: '100%', height: '100%', transformOrigin: 'center center' }}>
            <ForceGraph2D
              ref={fgRef}
              width={size.w}
              height={size.h}
              graphData={graphData}
              backgroundColor={cssVar('--bg', '#FAFAF9')}
              cooldownTicks={200}
              onEngineStop={() => {
                if (!focusedRef.current) fitView(400);
              }}
              // Pan/zoom is the overview interaction ("globe under a magnifying
              // glass"); dragging individual nodes is not. (R3)
              enableNodeDrag={false}
              enableZoomInteraction={true}
              enablePanInteraction={true}
              linkColor={() => cssVar('--border', '#E5E7EB')}
              linkWidth={0.5}
              onRenderFramePre={(ctx: CanvasRenderingContext2D, globalScale: number) => {
                const focusedNow = focusedRef.current;
                const lobeColor = cssVar('--purple-border', '#C4B5FD');
                const labelColor = cssVar('--text', '#111827');

                // Refresh the field's vertical bounds for depth shading.
                let minY = Infinity;
                let maxY = -Infinity;
                for (const n of graphData.nodes as any[]) {
                  if (n.y == null) continue;
                  if (n.y < minY) minY = n.y;
                  if (n.y > maxY) maxY = n.y;
                }
                if (minY < maxY) {
                  depthRef.current = { cy: (minY + maxY) / 2, half: (maxY - minY) / 2 || 1 };
                }

                // Inter-brain dotted links between cluster centroids.
                ctx.save();
                ctx.setLineDash([4, 4]);
                ctx.lineWidth = 1 / globalScale;
                for (const l of data.links) {
                  const a = centroid(l.source);
                  const b = centroid(l.target);
                  if (!a || !b) continue;
                  const dim = focusedNow && l.source !== focusedNow && l.target !== focusedNow;
                  ctx.globalAlpha = dim ? 0.08 : 0.5;
                  ctx.strokeStyle = lobeColor;
                  ctx.beginPath();
                  ctx.moveTo(a.x, a.y);
                  ctx.lineTo(b.x, b.y);
                  ctx.stroke();
                }
                ctx.restore();

                // Per-brain globular dotted lobe + faint fill + curved name. No
                // emoji, no per-node text. (R3)
                for (const brain of data.brains) {
                  const c = centroid(brain.id);
                  if (!c) continue;
                  const dim = focusedNow && brain.id !== focusedNow;
                  const pad = 26;
                  const pts = blobPoints(c.x, c.y, c.r + pad, hashSeed(brain.id));

                  ctx.save();
                  ctx.setLineDash([3, 4]);
                  ctx.lineWidth = 1.2 / globalScale;
                  ctx.strokeStyle = lobeColor;
                  ctx.fillStyle = cssVar('--purple-bg', '#F3F0FF');
                  ctx.globalAlpha = dim ? 0.04 : 0.18;
                  tracePolygon(ctx, pts);
                  ctx.fill();
                  ctx.globalAlpha = dim ? 0.1 : 0.55;
                  tracePolygon(ctx, pts);
                  ctx.stroke();
                  ctx.restore();

                  // Curved name label hugging the top of the lobe.
                  ctx.save();
                  ctx.globalAlpha = dim ? 0.25 : 1;
                  const fontSize = 12 / globalScale;
                  drawArcText(ctx, brain.name, c.x, c.y, c.r + pad + fontSize * 1.4, fontSize, labelColor);
                  ctx.restore();
                }
              }}
              nodeCanvasObjectMode={() => 'replace'}
              nodeCanvasObject={(node: any, ctx, globalScale) => {
                const focusedNow = focusedRef.current;
                const dim = focusedNow && node.brainId !== focusedNow;
                // Pseudo-3D depth: nodes lower in the field (front) read a touch
                // larger and more opaque than those at the back. (R3)
                const { cy, half } = depthRef.current;
                const depth = Math.max(-1, Math.min(1, (node.y - cy) / half));
                const r = 4 * (1 + depth * 0.4);
                ctx.globalAlpha = dim ? 0.12 : 0.6 + ((depth + 1) / 2) * 0.4;
                const status = masteryToStatus(node.masteryScore);
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                if (status !== 'untouched') {
                  ctx.fillStyle = nodeDotColor(status);
                  ctx.fill();
                } else {
                  ctx.strokeStyle = nodeBorder(status);
                  ctx.lineWidth = 1 / globalScale;
                  ctx.stroke();
                }
                ctx.globalAlpha = 1;
              }}
              nodePointerAreaPaint={(node: any, color, ctx) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
                ctx.fill();
              }}
              onBackgroundClick={() => onFocusBrain(null)}
            />
          </div>
        )}
      </div>
    </>
  );
}
