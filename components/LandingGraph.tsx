'use client';

// Decorative neuron map behind the landing hero. Purely cosmetic — hardcoded
// demo data, no Redis, no interaction. Slowly rotates via a CSS transform on the
// wrapper (the 2D graph has no camera). Honors the user's node-size + graph-speed
// settings (shared rule with the main neuron map).
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { masteryToStatus, nodeDotColor, nodeBorder, nodeTextColor } from '@/lib/nodeState';
import { useSettings } from '@/context/SettingsContext';
import { GRAPH_ALPHA_DECAY } from '@/lib/settings';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false, loading: () => null });

const BASE_BY_SIZE = { small: 5, medium: 7, large: 9 } as const;

const DEMO_NODES = [
  { id: 'compound_interest', name: 'Compound Interest', masteryScore: 91 },
  { id: 'principal', name: 'Principal', masteryScore: 55 },
  { id: 'interest_rate', name: 'Interest Rate', masteryScore: 22 },
  { id: 'time_value', name: 'Time Value', masteryScore: 74 },
  { id: 'inflation', name: 'Inflation', masteryScore: 88 },
  { id: 'diversification', name: 'Diversification', masteryScore: 18 },
  { id: 'risk_return', name: 'Risk & Return', masteryScore: 0 },
  { id: 'budgeting', name: 'Budgeting', masteryScore: 48 },
  { id: 'net_worth', name: 'Net Worth', masteryScore: 71 },
  { id: 'cash_flow', name: 'Cash Flow', masteryScore: 0 },
  { id: 'asset_allocation', name: 'Asset Allocation', masteryScore: 31 },
  { id: 'emergency_fund', name: 'Emergency Fund', masteryScore: 95 },
  { id: 'debt', name: 'Debt', masteryScore: 40 },
  { id: 'credit_score', name: 'Credit Score', masteryScore: 63 },
  { id: 'mortgage', name: 'Mortgage', masteryScore: 27 },
  { id: 'retirement', name: 'Retirement', masteryScore: 80 },
  { id: 'index_fund', name: 'Index Fund', masteryScore: 58 },
  { id: 'stocks', name: 'Stocks', masteryScore: 44 },
  { id: 'bonds', name: 'Bonds', masteryScore: 35 },
  { id: 'dividends', name: 'Dividends', masteryScore: 67 },
  { id: 'capital_gains', name: 'Capital Gains', masteryScore: 52 },
  { id: 'taxes', name: 'Taxes', masteryScore: 29 },
  { id: 'roth_ira', name: 'Roth IRA', masteryScore: 76 },
  { id: 'liquidity', name: 'Liquidity', masteryScore: 12 },
  { id: 'opportunity_cost', name: 'Opportunity Cost', masteryScore: 84 },
  { id: 'savings_rate', name: 'Savings Rate', masteryScore: 60 },
];

const DEMO_LINKS = [
  { source: 'compound_interest', target: 'principal' },
  { source: 'compound_interest', target: 'interest_rate' },
  { source: 'compound_interest', target: 'time_value' },
  { source: 'compound_interest', target: 'inflation' },
  { source: 'principal', target: 'net_worth' },
  { source: 'principal', target: 'budgeting' },
  { source: 'time_value', target: 'asset_allocation' },
  { source: 'time_value', target: 'opportunity_cost' },
  { source: 'inflation', target: 'risk_return' },
  { source: 'inflation', target: 'bonds' },
  { source: 'risk_return', target: 'diversification' },
  { source: 'risk_return', target: 'stocks' },
  { source: 'budgeting', target: 'cash_flow' },
  { source: 'budgeting', target: 'savings_rate' },
  { source: 'net_worth', target: 'emergency_fund' },
  { source: 'net_worth', target: 'debt' },
  { source: 'asset_allocation', target: 'diversification' },
  { source: 'asset_allocation', target: 'index_fund' },
  { source: 'debt', target: 'credit_score' },
  { source: 'credit_score', target: 'mortgage' },
  { source: 'mortgage', target: 'debt' },
  { source: 'retirement', target: 'roth_ira' },
  { source: 'retirement', target: 'index_fund' },
  { source: 'index_fund', target: 'stocks' },
  { source: 'index_fund', target: 'bonds' },
  { source: 'stocks', target: 'dividends' },
  { source: 'stocks', target: 'capital_gains' },
  { source: 'dividends', target: 'taxes' },
  { source: 'capital_gains', target: 'taxes' },
  { source: 'savings_rate', target: 'emergency_fund' },
  { source: 'opportunity_cost', target: 'risk_return' },
  { source: 'liquidity', target: 'cash_flow' },
];

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export default function LandingGraph() {
  const { settings } = useSettings();
  const fgRef = useRef<any>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);
  const tunedRef = useRef(false);
  const fittedRef = useRef(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Slow rotation via CSS transform on the wrapper (never on the graph itself —
  // it repaints on its own tick).
  useEffect(() => {
    let raf: number;
    const tick = () => {
      rotationRef.current += 0.05;
      if (wrapperRef.current) wrapperRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const base = BASE_BY_SIZE[settings.nodeSize];

  // Stable graph objects so the sim keeps positions — and so the label pass can
  // read each node's settled x/y.
  const graphData = useMemo(
    () => ({ nodes: DEMO_NODES.map((n) => ({ ...n })), links: DEMO_LINKS.map((l) => ({ ...l })) }),
    [],
  );

  if (size.w === 0) return null;

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'absolute', inset: 0, transformOrigin: 'center center' }}
    >
      <ForceGraph2D
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        d3AlphaDecay={GRAPH_ALPHA_DECAY[settings.graphSpeed]}
        d3VelocityDecay={0.3}
        enableNodeDrag={false}
        enableZoomInteraction={false}
        enablePanInteraction={false}
        linkColor={() => cssVar('--border', '#E5E7EB')}
        linkWidth={0.5}
        onEngineTick={() => {
          // Shape the spacing on the FIRST tick (alpha is still high) so the field
          // settles ONCE into a spread layout — no settle-then-reheat "explosion".
          // Moderate charge: spaced, but not flung apart. (R4)
          const fg = fgRef.current;
          if (!fg || tunedRef.current) return;
          tunedRef.current = true;
          fg.d3Force('charge')?.strength(-240);
          fg.d3Force('link')?.distance(42);
        }}
        onEngineStop={() => {
          // Frame the settled field centered in the viewport (slight overfill so
          // the slow rotation reads as spinning about the center, with no empty
          // corners). Runs once.
          const fg = fgRef.current;
          if (!fg || fittedRef.current) return;
          fittedRef.current = true;
          fg.zoomToFit(900, -Math.round(Math.min(size.w, size.h) * 0.12));
        }}
        nodeCanvasObjectMode={() => 'replace'}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const status = masteryToStatus(node.masteryScore);
          const r = status === 'untouched' ? base : base + (node.masteryScore / 100) * base * 1.2;
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
          // Stash the drawn radius so the label pass can sit just above the node.
          node.__r = r;
        }}
        // Draw labels in a post pass (after every node) so they stay ON TOP of the
        // nodes, and keep them UPRIGHT and directly above each node in SCREEN space
        // even as the field rotates: offset along screen-up and counter-rotate the
        // glyphs against the CSS wrapper rotation.
        onRenderFramePost={(ctx: CanvasRenderingContext2D, globalScale: number) => {
          const theta = (rotationRef.current * Math.PI) / 180;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (const node of graphData.nodes as any[]) {
            if (node.x == null) continue;
            const status = masteryToStatus(node.masteryScore);
            const fontSize = 11 / globalScale;
            const L = (node.__r ?? base) + fontSize * 1.1;
            ctx.save();
            ctx.translate(node.x - L * Math.sin(theta), node.y - L * Math.cos(theta));
            ctx.rotate(-theta);
            ctx.font = `500 ${fontSize}px system-ui`;
            ctx.fillStyle = nodeTextColor(status);
            ctx.fillText(node.name, 0, 0);
            ctx.restore();
          }
        }}
      />
    </div>
  );
}
