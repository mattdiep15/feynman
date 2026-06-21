'use client';

import { useState } from 'react';
import { SAMPLE_NOTES } from '@/lib/sampleNotes';

export default function NotesPanel({
  onBuild,
  busy,
  compact,
}: {
  onBuild: (notes: string) => void;
  busy: boolean;
  compact?: boolean;
}) {
  const [notes, setNotes] = useState('');

  return (
    <div style={compact ? undefined : { maxWidth: 520, margin: '6% auto 0' }}>
      {!compact && (
        <>
          <div className="empty-title">Build a neuron map</div>
          <div className="empty-body">
            Paste notes on any topic. Claude extracts the concepts and how they relate.
          </div>
        </>
      )}
      <textarea
        className="textarea"
        rows={8}
        placeholder="Paste your notes on any topic…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={busy}
      />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
        <button
          className="btn-primary"
          disabled={busy || !notes.trim()}
          onClick={() => onBuild(notes)}
        >
          {busy ? 'Building your neuron map…' : 'Build neuron map'}
        </button>
        <button
          className="btn-ghost"
          disabled={busy}
          onClick={() => setNotes(SAMPLE_NOTES)}
        >
          Load sample notes
        </button>
      </div>
    </div>
  );
}
