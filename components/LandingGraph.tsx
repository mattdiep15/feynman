'use client';

// Decorative neuron map behind the landing hero. Purely cosmetic — hardcoded
// demo data, no Redis, no interaction. Slowly rotates via a CSS transform on the
// wrapper (the 2D graph has no camera). Honors the user's node-size + graph-speed
// settings (shared rule with the main neuron map).
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
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
];

const DEMO_LINKS = [
  { source: 'compound_interest', target: 'principal' },
  { source: 'compound_interest', target: 'interest_rate' },
  { source: 'compound_interest', target: 'time_value' },
  { source: 'compound_interest', target: 'inflation' },
  { source: 'principal', target: 'net_worth' },
  { source: 'principal', target: 'budgeting' },
  { source: 'time_value', target: 'asset_allocation' },
  { source: 'inflation', target: 'risk_return' },
  { source: 'risk_return', target: 'diversification' },
  { source: 'budgeting', target: 'cash_flow' },
  { source: 'net_worth', target: 'emergency_fund' },
  { source: 'asset_allocation', target: 'diversification' },
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
      rotationRef.current += 0.02;
      if (wrapperRef.current) wrapperRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const base = BASE_BY_SIZE[settings.nodeSize];

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
        graphData={{ nodes: DEMO_NODES.map((n) => ({ ...n })), links: DEMO_LINKS.map((l) => ({ ...l })) }}
        backgroundColor="rgba(0,0,0,0)"
        d3AlphaDecay={GRAPH_ALPHA_DECAY[settings.graphSpeed]}
        d3VelocityDecay={0.3}
        enableNodeDrag={false}
        enableZoomInteraction={false}
        enablePanInteraction={false}
        linkColor={() => cssVar('--border', '#E5E7EB')}
        linkWidth={0.5}
        onEngineStop={() => fgRef.current?.d3Force('charge')?.strength(-300)}
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
          // Labels always visible on the landing — decorative.
          const fontSize = 11 / globalScale;
          ctx.font = `500 ${fontSize}px system-ui`;
          ctx.fillStyle = nodeTextColor(status);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(node.name, node.x, node.y - r - fontSize * 0.6);
        }}
      />
    </div>
  );
}
