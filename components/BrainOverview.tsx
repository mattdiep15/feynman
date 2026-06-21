'use client';

// R3 — Multibrain overview. A single pannable/zoomable, flat field of every
// brain's concept nodes, each brain settling into a circular lobe (solid border,
// soft saturated fill, no emoji, no per-node text) with an upright name label
// above it that stays on top while the field slowly rotates when idle. Opening a
// brain — from the left sidebar OR by clicking its lobe/label — fades the
// surrounding scaffolding and hands off to its neuron map. Click empty to clear.
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BrainPoint, BrainLink, OverviewNode, OverviewConceptLink } from '@/lib/overview';
import { brainAnchors } from '@/lib/overview';
import { masteryToStatus, nodeDotColor, nodeBorder } from '@/lib/nodeState';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading overview…</div>,
});

const LOBE_PAD = 26; // gap between the node spread and the lobe outline

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
  // Scaffolding (lobes/labels/links/other nodes) fade — eases to 0 while focused
  // so the overview→neuron-map handoff isn't an abrupt cut. (2)
  const fadeRef = useRef(1);

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

  // Stable graph data. Seed each node's initial position inside its brain's
  // anchor lobe (deterministic golden-angle spiral) so clusters start visually
  // separated instead of piling at the origin and slowly exploding apart — which
  // is what made the first boot from the landing page look like overlaid circles,
  // and made the layout differ every visit. (2)
  const graphData = useMemo(() => {
    const radius = Math.max(140, data.brains.length * 60);
    const anchors = brainAnchors(
      data.brains.map((b) => b.id),
      radius,
    );
    const seen: Record<string, number> = {};
    const nodes = data.nodes.map((n) => {
      const a = anchors[n.brainId] ?? { x: 0, y: 0 };
      const k = (seen[n.brainId] = (seen[n.brainId] ?? 0) + 1);
      const ang = k * 2.399963; // golden angle — even fill, no clumping
      const r = 6 * Math.sqrt(k);
      return { ...n, x: a.x + r * Math.cos(ang), y: a.y + r * Math.sin(ang) };
    });
    return { nodes, links: data.conceptLinks.map((l) => ({ ...l })) };
  }, [data]);

  // Register the cluster force + loosen charge once data is in. Anchors sit on a
  // plain circle (flat field — no perspective tilt).
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

  // Slow idle rotation; ease to upright while hovering (incl. pan/zoom) or focused
  // so the canvas pointer mapping stays accurate. Also drive the scaffolding fade.
  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (focusedRef.current || hoveringRef.current) {
        rotationRef.current *= 0.9;
        if (Math.abs(rotationRef.current) < 0.01) rotationRef.current = 0;
      } else {
        rotationRef.current += 0.03;
      }
      // Fade scaffolding out while focused (transitioning), back in otherwise.
      fadeRef.current = focusedRef.current
        ? Math.max(0, fadeRef.current - 0.05)
        : Math.min(1, fadeRef.current + 0.1);
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

  // Click a lobe or its label → open that brain's neuron map. Picks the nearest
  // lobe whose region (outline + label band) contains the click. (1.1)
  const pickBrainAt = (gx: number, gy: number): string | null => {
    let best: { id: string; d: number } | null = null;
    for (const brain of data.brains) {
      const c = centroid(brain.id);
      if (!c) continue;
      const d = Math.hypot(gx - c.x, gy - c.y);
      const reach = (c.r + LOBE_PAD) * 1.6; // include the label sitting above the lobe
      if (d <= reach && (!best || d < best.d)) best = { id: brain.id, d };
    }
    return best?.id ?? null;
  };

  const focusedName = data.brains.find((b) => b.id === focusedBrainId)?.name ?? focusedBrainId;

  return (
    <>
      <div className="graph-toolbar">
        <span className="graph-toolbar-label">Your brains — semantic overview</span>
        <span className="muted" style={{ fontSize: '0.6875rem', display: 'flex', alignItems: 'center', gap: 10 }}>
          {loading
            ? 'Mapping…'
            : focusedBrainId
              ? `Opening ${focusedName}…`
              : `${data.brains.length} brains · drag to pan, scroll to zoom · click a brain to open`}
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
          <div className="muted" style={{ padding: 24, fontSize: '0.8125rem' }}>
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
              // Keep repainting so the scaffolding fade animates during handoff.
              autoPauseRedraw={false}
              onEngineStop={() => {
                if (!focusedRef.current) fitView(400);
              }}
              // Pan/zoom is the overview interaction; dragging single nodes is not.
              enableNodeDrag={false}
              enableZoomInteraction={true}
              enablePanInteraction={true}
              linkColor={() => cssVar('--border', '#E5E7EB')}
              linkWidth={0.5}
              onRenderFramePre={(ctx: CanvasRenderingContext2D, globalScale: number) => {
                const focusedNow = focusedRef.current;
                const fade = fadeRef.current;
                const lobeStroke = cssVar('--purple-border', '#C4B5FD');
                const lobeFill = cssVar('--purple-soft', '#A78BFA');
                const labelColor = cssVar('--text', '#111827');

                // Inter-brain dotted links between cluster centroids.
                ctx.save();
                ctx.setLineDash([4, 4]);
                ctx.lineWidth = 1 / globalScale;
                for (const l of data.links) {
                  const a = centroid(l.source);
                  const b = centroid(l.target);
                  if (!a || !b) continue;
                  ctx.globalAlpha = 0.5 * fade;
                  ctx.strokeStyle = lobeStroke;
                  ctx.beginPath();
                  ctx.moveTo(a.x, a.y);
                  ctx.lineTo(b.x, b.y);
                  ctx.stroke();
                }
                ctx.restore();

                // Per-brain circular lobe: solid border, soft saturated fill, with
                // a name label above it. No emoji, no per-node text.
                const theta = (rotationRef.current * Math.PI) / 180;
                for (const brain of data.brains) {
                  const c = centroid(brain.id);
                  if (!c) continue;
                  const R = c.r + LOBE_PAD;

                  ctx.save();
                  ctx.lineWidth = 1.4 / globalScale;
                  ctx.strokeStyle = lobeStroke;
                  ctx.fillStyle = lobeFill;
                  ctx.globalAlpha = 0.16 * fade;
                  ctx.beginPath();
                  ctx.arc(c.x, c.y, R, 0, 2 * Math.PI);
                  ctx.fill();
                  ctx.globalAlpha = 0.7 * fade;
                  ctx.beginPath();
                  ctx.arc(c.x, c.y, R, 0, 2 * Math.PI);
                  ctx.stroke();
                  ctx.restore();

                  // Keep the label upright and directly above the lobe in SCREEN
                  // space even while the field rotates: offset along screen-up and
                  // counter-rotate the glyphs against the CSS wrapper rotation.
                  const fontSize = 12 / globalScale;
                  const L = R + fontSize * 1.6;
                  ctx.save();
                  ctx.globalAlpha = fade;
                  ctx.translate(c.x - L * Math.sin(theta), c.y - L * Math.cos(theta));
                  ctx.rotate(-theta);
                  ctx.font = `600 ${fontSize}px system-ui`;
                  ctx.fillStyle = labelColor;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(brain.name, 0, 0);
                  ctx.restore();
                }
              }}
              nodeCanvasObjectMode={() => 'replace'}
              nodeCanvasObject={(node: any, ctx, globalScale) => {
                const focusedNow = focusedRef.current;
                const fade = fadeRef.current;
                // Focused brain's nodes persist (they become the neuron map);
                // everything else fades out during the handoff.
                ctx.globalAlpha = !focusedNow
                  ? 1
                  : node.brainId === focusedNow
                    ? 1
                    : 0.12 * fade;
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
                ctx.globalAlpha = 1;
              }}
              nodePointerAreaPaint={(node: any, color, ctx) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
                ctx.fill();
              }}
              onNodeClick={(n: any) => onOpenBrain(n.brainId)}
              onBackgroundClick={(e: MouseEvent) => {
                const fg = fgRef.current;
                if (!fg) return onFocusBrain(null);
                const { x, y } = fg.screen2GraphCoords(
                  (e as any).offsetX ?? 0,
                  (e as any).offsetY ?? 0,
                );
                const id = pickBrainAt(x, y);
                if (id) onOpenBrain(id);
                else onFocusBrain(null);
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}
