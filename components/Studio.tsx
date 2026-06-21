'use client';

import { useCallback, useEffect, useState } from 'react';
import BrainGraph from './BrainGraph';
import type { GraphData, GraphNode } from '@/lib/graph';

export default function Studio() {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], links: [] });
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [busy, setBusy] = useState(false);

  const loadGraph = useCallback(async () => {
    const res = await fetch('/api/graph');
    const data: GraphData = await res.json();
    setGraph(data);
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const buildGraph = async () => {
    if (!notes.trim()) return;
    setBusy(true);
    try {
      await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      await loadGraph();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', height: '100vh' }}>
      <aside style={{ padding: 20, borderRight: '1px solid #1f2937', overflowY: 'auto' }}>
        <h1 style={{ marginTop: 0 }}>Feynman</h1>
        <p style={{ color: '#9ca3af', fontSize: 14 }}>Personal Finance brain</p>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Paste notes on compound interest, principal, rates…"
          rows={8}
          style={{ width: '100%', background: '#0b0f17', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 8, padding: 10 }}
        />
        <button
          onClick={buildGraph}
          disabled={busy}
          style={{ marginTop: 10, width: '100%', padding: '10px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer' }}
        >
          {busy ? 'Building…' : 'Build graph'}
        </button>

        {selected && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #1f2937' }}>
            <h3 style={{ margin: '0 0 4px' }}>{selected.name}</h3>
            <div style={{ color: '#9ca3af', fontSize: 13 }}>
              {selected.status} · {selected.masteryScore}/100
            </div>
            <p style={{ fontSize: 14 }}>{selected.summary}</p>
          </div>
        )}
      </aside>

      <section style={{ position: 'relative' }}>
        <BrainGraph
          nodes={graph.nodes}
          links={graph.links}
          selectedId={selected?.id ?? null}
          onNodeClick={(n) => setSelected(n)}
        />
      </section>
    </div>
  );
}
