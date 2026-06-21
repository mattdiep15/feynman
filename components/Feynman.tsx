'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BrainMeta } from '@/lib/brains';
import type { GraphData, GraphNode } from '@/lib/graph';
import { masteryToStatus } from '@/lib/nodeState';
import Sidebar from './Sidebar';
import NeuronMap from './NeuronMap';
import Converse from './Converse';
import ProgressTab from './ProgressTab';
import HowItWorks from './HowItWorks';
import NotesPanel from './NotesPanel';
import { TAB_DEFS, type TabId } from './tabDefs';

export default function Feynman() {
  const [brains, setBrains] = useState<BrainMeta[]>([]);
  const [activeBrainId, setActiveBrainId] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], links: [] });
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [tab, setTab] = useState<TabId>('chat');
  const [building, setBuilding] = useState(false);

  const loadBrains = useCallback(async () => {
    const res = await fetch('/api/brains');
    const { brains } = await res.json();
    setBrains(brains);
    setActiveBrainId((cur) => cur ?? (brains[0]?.id ?? null));
    return brains as BrainMeta[];
  }, []);

  const loadGraph = useCallback(async (brainId: string) => {
    const res = await fetch(`/api/graph?brainId=${encodeURIComponent(brainId)}`);
    const data: GraphData = await res.json();
    setGraph(data);
  }, []);

  useEffect(() => {
    loadBrains();
  }, [loadBrains]);

  useEffect(() => {
    if (activeBrainId) {
      setSelected(null);
      loadGraph(activeBrainId);
    }
  }, [activeBrainId, loadGraph]);

  // Optimistic recolor: mutate the node in place so react-force-graph keeps its
  // position (no re-layout) while React re-renders on a fresh array.
  const recolorNode = useCallback(
    (id: string, masteryScore: number) => {
      setGraph((g) => {
        const node = g.nodes.find((n) => n.id === id);
        if (node) {
          node.masteryScore = masteryScore;
          node.status = masteryToStatus(masteryScore);
        }
        return { nodes: [...g.nodes], links: g.links };
      });
      setSelected((s) => (s && s.id === id ? { ...s, masteryScore } : s));
      // Refresh sidebar avg in the background.
      loadBrains();
    },
    [loadBrains],
  );

  const selectConcept = (node: GraphNode) => {
    setSelected(node);
    setTab('chat');
  };

  const switchBrain = (id: string) => {
    if (id !== activeBrainId) setActiveBrainId(id);
  };

  const newBrain = async () => {
    const name = window.prompt('Name your new brain (e.g. Math, Biology)');
    if (!name?.trim()) return;
    const res = await fetch('/api/brains', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) return;
    const { brain } = await res.json();
    await loadBrains();
    setActiveBrainId(brain.id);
    setTab('graph');
  };

  const buildMap = async (notes: string) => {
    if (!activeBrainId || !notes.trim()) return;
    setBuilding(true);
    try {
      await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes, brainId: activeBrainId }),
      });
      await loadGraph(activeBrainId);
      await loadBrains();
    } finally {
      setBuilding(false);
    }
  };

  const clearBrain = async () => {
    if (!activeBrainId) return;
    if (!window.confirm('Clear this brain? Deletes all concepts, edges, mastery, and memory.')) return;
    await fetch('/api/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brainId: activeBrainId }),
    });
    setSelected(null);
    await loadGraph(activeBrainId);
    await loadBrains();
  };

  const activeBrain = brains.find((b) => b.id === activeBrainId) ?? null;
  const hasConcepts = graph.nodes.length > 0;
  const h = (t: TabId) => (t === tab ? '' : ' hidden');

  return (
    <div className="app">
      <Sidebar
        brains={brains}
        activeBrainId={activeBrainId}
        onSwitchBrain={switchBrain}
        onNewBrain={newBrain}
        tab={tab}
        onTab={setTab}
      />
      <div className="main">
        <div className="tabs">
          {TAB_DEFS.map((t) => (
            <button
              key={t.id}
              className={`tab${t.id === tab ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="content">
          {!activeBrain ? (
            <div className="panel">
              <div className="empty-state">
                <div className="empty-title">No brain yet</div>
                <div className="empty-body">Create a brain to start building your neuron map.</div>
                <button className="btn-primary" onClick={newBrain}>
                  + New brain
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Converse */}
              {hasConcepts ? (
                <div className={`panel chat-area${h('chat')}`}>
                  <Converse
                    key={activeBrain.id}
                    brainId={activeBrain.id}
                    concept={selected}
                    onScored={(id, score) => recolorNode(id, score)}
                  />
                </div>
              ) : (
                <div className={`panel${h('chat')}`}>
                  <NotesPanel onBuild={buildMap} busy={building} />
                </div>
              )}

              {/* Neuron map */}
              {hasConcepts ? (
                <div className={`panel graph-panel${h('graph')}`}>
                  <NeuronMap
                    brainName={activeBrain.name}
                    nodes={graph.nodes}
                    links={graph.links}
                    selectedId={selected?.id ?? null}
                    onSelect={selectConcept}
                    onClear={clearBrain}
                  />
                </div>
              ) : (
                <div className={`panel${h('graph')}`}>
                  <NotesPanel onBuild={buildMap} busy={building} />
                </div>
              )}

              {/* Progress */}
              <div className={`panel${h('progress')}`}>
                <ProgressTab nodes={graph.nodes} />
              </div>

              {/* How it works */}
              <div className={`panel${h('how')}`}>
                <HowItWorks />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
