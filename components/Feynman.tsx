'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BrainMeta } from '@/lib/brains';
import type { GraphData, GraphNode } from '@/lib/graph';
import type { Suggestion } from '@/lib/suggest';
import { masteryToStatus } from '@/lib/nodeState';
import Sidebar from './Sidebar';
import NeuronMap from './NeuronMap';
import Converse from './Converse';
import ProgressTab from './ProgressTab';
import HowItWorks from './HowItWorks';
import NotesPanel from './NotesPanel';
import Modal from './Modal';
import NewBrainModal from './NewBrainModal';
import BrainOverview from './BrainOverview';
import SettingsTab from './SettingsTab';
import { PRIMARY_TABS, type TabId } from './tabDefs';

export default function Feynman() {
  const [brains, setBrains] = useState<BrainMeta[]>([]);
  const [activeBrainId, setActiveBrainId] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], links: [] });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  // Which brain the overview is focused on (null = framed home view).
  const [overviewFocusId, setOverviewFocusId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [addingNotes, setAddingNotes] = useState(false);
  const [creatingBrain, setCreatingBrain] = useState(false);

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

  // Coverage suggestions are seeded from mastered nodes; load them alongside the
  // graph (and after the brain changes). Failures are non-fatal — just no dots.
  const loadSuggestions = useCallback(async (brainId: string) => {
    try {
      const res = await fetch(`/api/suggest?brainId=${encodeURIComponent(brainId)}`);
      const { suggestions } = await res.json();
      setSuggestions(Array.isArray(suggestions) ? suggestions : []);
    } catch {
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    loadBrains();
  }, [loadBrains]);

  useEffect(() => {
    if (activeBrainId) {
      setSelected(null);
      setSuggestions([]);
      loadGraph(activeBrainId);
      loadSuggestions(activeBrainId);
    }
  }, [activeBrainId, loadGraph, loadSuggestions]);

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

  // Auto-advance (Settings): after a teachback crosses 70%, jump to the weakest
  // remaining concept in this brain (lowest mastery, excluding the current one).
  const autoAdvance = (currentId: string) => {
    const candidates = graph.nodes.filter((n) => n.id !== currentId);
    if (!candidates.length) return;
    const weakest = candidates.reduce((a, b) => (b.masteryScore < a.masteryScore ? b : a));
    selectConcept(weakest);
  };

  const switchBrain = (id: string) => {
    setActiveBrainId(id);
    setOverviewFocusId(id);
    // Picking a brain at the left focuses its lobe and hands off to its neuron
    // map. From the overview, let the focus zoom play first; otherwise jump. (R3)
    if (tab === 'overview') {
      window.setTimeout(() => setTab('graph'), 650);
    } else {
      setTab('graph');
    }
  };

  // Logo / home: return to the framed, unfocused overview.
  const goHome = () => {
    setTab('overview');
    setOverviewFocusId(null);
  };

  const handleBrainCreated = async (brain: BrainMeta) => {
    setCreatingBrain(false);
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

  const addNotes = async (notes: string) => {
    await buildMap(notes);
    setAddingNotes(false);
  };

  // Accept a coverage suggestion: promote it to a real concept, then jump
  // straight into conversing about it to solidify the new node.
  const acceptSuggestion = async (s: Suggestion) => {
    if (!activeBrainId) return;
    setSuggestions((cur) => cur.filter((x) => x.id !== s.id));
    await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brainId: activeBrainId, sourceId: s.sourceId, id: s.id, name: s.name, summary: s.summary }),
    });
    await loadGraph(activeBrainId);
    await loadBrains();
    selectConcept({ id: s.id, name: s.name, summary: s.summary, masteryScore: 0, status: 'untested', val: 1 });
  };

  // Delete a brain entirely (vs. clearBrain, which only empties its concepts).
  // Resets app state if the deleted brain was the active or focused one.
  const deleteBrainById = async (id: string) => {
    const brain = brains.find((b) => b.id === id);
    if (
      !window.confirm(
        `Delete ${brain?.name ?? 'this brain'}? This permanently removes all its concepts, edges, mastery, and memory.`,
      )
    )
      return;
    await fetch(`/api/brains?brainId=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const remaining = await loadBrains();
    if (id === activeBrainId) {
      setSelected(null);
      setGraph({ nodes: [], links: [] });
      setActiveBrainId(remaining[0]?.id ?? null);
      setOverviewFocusId(null);
      setTab('overview');
    } else if (id === overviewFocusId) {
      setOverviewFocusId(null);
    }
  };

  // Rename a brain (display name only; id/slug is unchanged).
  const renameBrainById = async (id: string) => {
    const brain = brains.find((b) => b.id === id);
    const name = window.prompt('Rename brain', brain?.name ?? '')?.trim();
    if (!name || name === brain?.name) return;
    await fetch('/api/brains', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brainId: id, name }),
    });
    await loadBrains();
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
        activeBrainId={tab === 'overview' ? null : activeBrainId}
        onSwitchBrain={switchBrain}
        onNewBrain={() => setCreatingBrain(true)}
        onDeleteBrain={deleteBrainById}
        onRenameBrain={renameBrainById}
        onHome={goHome}
        tab={tab}
        onTab={setTab}
      />
      <div className="main">
        <div className="tabs">
          {PRIMARY_TABS.map((t) => (
            <button
              key={t.id}
              className={`tab${t.id === tab ? ' active' : ''}`}
              // The Overview tab is the home view — same as the logo: clear any
              // brain focus so it never opens a brain-specific overview.
              onClick={() => (t.id === 'overview' ? goHome() : setTab(t.id))}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="content">
          {/* Overview dashboard — available even before a brain is selected. */}
          <div className={`panel graph-panel${h('overview')}`}>
            <BrainOverview
              active={tab === 'overview'}
              focusedBrainId={overviewFocusId}
              onFocusBrain={setOverviewFocusId}
              onOpenBrain={switchBrain}
            />
          </div>

          {/* Settings — always available, no brain required. */}
          <div className={`panel${h('settings')}`}>
            <SettingsTab />
          </div>

          {!activeBrain ? (
            tab !== 'overview' && tab !== 'settings' && (
              <div className="panel">
                <div className="empty-state">
                  <div className="empty-title">No brain yet</div>
                  <div className="empty-body">Create a brain to start building your neuron map.</div>
                  <button className="btn-primary" onClick={() => setCreatingBrain(true)}>
                    + New brain
                  </button>
                </div>
              </div>
            )
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
                    onAutoAdvance={autoAdvance}
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
                    key={activeBrain.id}
                    brainName={activeBrain.name}
                    nodes={graph.nodes}
                    links={graph.links}
                    selectedId={selected?.id ?? null}
                    onSelect={selectConcept}
                    onClear={clearBrain}
                    onAddNotes={() => setAddingNotes(true)}
                    suggestions={suggestions}
                    onAcceptSuggestion={acceptSuggestion}
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

      {addingNotes && (
        <Modal title="Add notes to this brain" onClose={() => setAddingNotes(false)}>
          <div className="empty-body" style={{ marginBottom: 12 }}>
            New concepts are added to your existing neuron map. Concepts you&apos;ve already
            practiced keep their mastery.
          </div>
          <NotesPanel onBuild={addNotes} busy={building} compact />
        </Modal>
      )}

      {creatingBrain && (
        <NewBrainModal onClose={() => setCreatingBrain(false)} onCreated={handleBrainCreated} />
      )}
    </div>
  );
}
