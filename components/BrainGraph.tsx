'use client';

// Rule 4 — react-force-graph-2d must be a dynamic import with ssr:false.
// A top-level import touches window/WebGL and white-screens the app.
import dynamic from 'next/dynamic';
import { masteryColor } from '@/lib/mastery';
import type { GraphNode, GraphLink } from '@/lib/graph';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div style={{ padding: 16 }}>Loading graph…</div>,
});

export default function BrainGraph({
  nodes,
  links,
  onNodeClick,
  selectedId,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick?: (node: GraphNode) => void;
  selectedId?: string | null;
}) {
  return (
    <ForceGraph2D
      graphData={{ nodes, links }}
      nodeColor={(n: any) => masteryColor(n.masteryScore)} // live fn — recolor without reload
      nodeLabel="name"
      nodeRelSize={5}
      linkDirectionalArrowLength={4}
      linkDirectionalArrowRelPos={1}
      linkColor={() => '#374151'}
      onNodeClick={(n: any) => onNodeClick?.(n)}
      nodeCanvasObjectMode={() => 'after'}
      nodeCanvasObject={(node: any, ctx, globalScale) => {
        // draw a selection ring + label
        if (node.id === selectedId) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        const label = node.name as string;
        const fontSize = 12 / globalScale;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = '#e5e7eb';
        ctx.fillText(label, node.x + 8, node.y + 3);
      }}
    />
  );
}
