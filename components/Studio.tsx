'use client';

import { useCallback, useEffect, useState } from 'react';
import BrainGraph from './BrainGraph';
import TeachbackPanel from './TeachbackPanel';
import { statusFromScore } from '@/lib/mastery';
import type { GraphData, GraphNode } from '@/lib/graph';

export default function Studio() {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], links: [] });
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresher, setRefresher] = useState<{ id: string; name: string; masteryScore: number; status: string }[]>([]);

  const loadGraph = useCallback(async () => {
    const res = await fetch('/api/graph');
    const data: GraphData = await res.json();
    setGraph(data);
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Optimistic recolor: mutate the node object in place so react-force-graph
  // keeps its position (no re-layout) while React re-renders on a new array.
  const recolorNode = useCallback((id: string, masteryScore: number, status: string) => {
    setGraph((g) => {
      const node = g.nodes.find((n) => n.id === id);
      if (node) {
        node.masteryScore = masteryScore;
        node.status = status || statusFromScore(masteryScore);
        node.val = masteryScore / 20 + 1;
      }
      return { nodes: [...g.nodes], links: g.links };
    });
    setSelected((s) =>
      s && s.id === id ? { ...s, masteryScore, status: status || statusFromScore(masteryScore) } : s,
    );
  }, []);

  const loadRefresher = async () => {
    const res = await fetch('/api/refresher');
    const { concepts } = await res.json();
    setRefresher(concepts);
  };

  const selectById = (id: string) => {
    const node = graph.nodes.find((n) => n.id === id);
    if (node) setSelected(node);
  };

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

        <div style={{ marginTop: 16 }}>
          <button
            onClick={loadRefresher}
            style={{ width: '100%', padding: '8px 14px', borderRadius: 8, border: '1px solid #374151', background: 'transparent', color: '#e5e7eb', cursor: 'pointer' }}
          >
            ↻ Refresher: weakest concepts
          </button>
          {refresher.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
              {refresher.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => selectById(c.id)}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#e5e7eb', cursor: 'pointer', padding: '4px 0', fontSize: 14 }}
                  >
                    {c.name} <span style={{ color: '#9ca3af' }}>· {c.status} {c.masteryScore}/100</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #1f2937' }}>
            <h3 style={{ margin: '0 0 4px' }}>{selected.name}</h3>
            <div style={{ color: '#9ca3af', fontSize: 13 }}>
              {selected.status} · {selected.masteryScore}/100
            </div>
            <p style={{ fontSize: 14 }}>{selected.summary}</p>
            <TeachbackPanel concept={selected} onScored={recolorNode} />
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
