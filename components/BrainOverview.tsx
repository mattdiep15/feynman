'use client';

// R1 — Unified multi-brain field. Every concept of every brain is a node;
// react-force-graph lays them out and a custom cluster force pulls each brain's
// nodes toward its own anchor, so each brain settles into a dotted lobe under a
// faint brain silhouette. Unfocused → slow rotation + the whole field framed.
// Selecting a brain (left menu or clicking its lobe) focuses it: rotation stops,
// the view zooms to that lobe, and the others dim. Click the background (or the
// logo) to return to the framed home view.
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BrainPoint, BrainLink, OverviewNode, OverviewConceptLink } from '@/lib/overview';
import { brainAnchors } from '@/lib/overview';
import { masteryToStatus, nodeDotColor, nodeBorder, nodeTextColor } from '@/lib/nodeState';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading overview…</div>,
});

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
  onOpenBrain,
}: {
  active: boolean;
  focusedBrainId: string | null;
  onFocusBrain: (id: string | null) => void;
  onOpenBrain: (id: string) => void;
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

  // Register the cluster force + loosen charge once data is in.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || data.nodes.length === 0) return;
    const radius = Math.max(140, data.brains.length * 60);
    const anchors = brainAnchors(
      data.brains.map((b) => b.id),
      radius,
    );
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

  // Slow rotation when idle; ease back to upright while hovering or focused so
  // clicks land accurately (the canvas doesn't know about the CSS rotation).
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
              ? `Focused on ${focusedName} · click its center to open`
              : `${data.brains.length} brains · click a lobe to focus`}
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
              enableNodeDrag={false}
              enableZoomInteraction={false}
              enablePanInteraction={false}
              linkColor={() => cssVar('--border', '#E5E7EB')}
              linkWidth={0.5}
              onRenderFramePre={(ctx: CanvasRenderingContext2D, globalScale: number) => {
                const focusedNow = focusedRef.current;
                const lobeColor = cssVar('--purple-border', '#C4B5FD');
                const labelColor = cssVar('--text', '#111827');

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

                // Per-brain dotted lobe + faint silhouette + name.
                for (const brain of data.brains) {
                  const c = centroid(brain.id);
                  if (!c) continue;
                  const dim = focusedNow && brain.id !== focusedNow;
                  const pad = 26;
                  ctx.save();
                  ctx.setLineDash([3, 4]);
                  ctx.lineWidth = 1.2 / globalScale;
                  ctx.strokeStyle = lobeColor;
                  ctx.fillStyle = cssVar('--purple-bg', '#F3F0FF');
                  ctx.globalAlpha = dim ? 0.04 : 0.18;
                  ctx.beginPath();
                  ctx.arc(c.x, c.y, c.r + pad, 0, 2 * Math.PI);
                  ctx.fill();
                  ctx.globalAlpha = dim ? 0.1 : 0.55;
                  ctx.beginPath();
                  ctx.arc(c.x, c.y, c.r + pad, 0, 2 * Math.PI);
                  ctx.stroke();
                  ctx.restore();

                  // Brain name + icon above the lobe.
                  ctx.save();
                  ctx.globalAlpha = dim ? 0.25 : 1;
                  ctx.setLineDash([]);
                  const fontSize = 12 / globalScale;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.font = `${(c.r + pad) * 0.5}px system-ui`;
                  ctx.fillText(brain.icon || '🧠', c.x, c.y - c.r - pad - fontSize * 2.5);
                  ctx.font = `600 ${fontSize}px system-ui`;
                  ctx.fillStyle = labelColor;
                  ctx.fillText(brain.name, c.x, c.y - c.r - pad - fontSize);
                  ctx.restore();
                }
              }}
              nodeCanvasObjectMode={() => 'replace'}
              nodeCanvasObject={(node: any, ctx, globalScale) => {
                const focusedNow = focusedRef.current;
                const dim = focusedNow && node.brainId !== focusedNow;
                ctx.globalAlpha = dim ? 0.12 : 1;
                const status = masteryToStatus(node.masteryScore);
                const r = 4;
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
                if (focusedNow && node.brainId === focusedNow) {
                  const fontSize = 10 / globalScale;
                  ctx.font = `500 ${fontSize}px system-ui`;
                  ctx.fillStyle = nodeTextColor(status);
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(node.name, node.x, node.y - r - fontSize * 0.6);
                }
                ctx.globalAlpha = 1;
              }}
              nodePointerAreaPaint={(node: any, color, ctx) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
                ctx.fill();
              }}
              onNodeClick={(n: any) => {
                if (focusedRef.current === n.brainId) onOpenBrain(n.brainId);
                else onFocusBrain(n.brainId);
              }}
              onBackgroundClick={() => onFocusBrain(null)}
            />
          </div>
        )}
      </div>
    </>
  );
}
