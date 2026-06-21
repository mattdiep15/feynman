'use client';

import { useState } from 'react';
import Modal from './Modal';
import type { BrainMeta } from '@/lib/brains';

// A small fixed palette keeps the picker on-theme without a full emoji keyboard.
const ICONS = ['🧠', '💰', '📐', '🧬', '⚛️', '📚', '🎨', '🏛️', '🎵', '⚙️', '🌍', '💡'];
const MAX_NAME = 40; // matches the slug cap in lib/brains.slugify

export default function NewBrainModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (brain: BrainMeta) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();

  const create = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/brains', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed, icon }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || 'Could not create brain. Please try again.');
        return;
      }
      const { brain } = await res.json();
      onCreated(brain);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New brain" onClose={onClose}>
      <label className="field-label">Name</label>
      <input
        className="text-input"
        autoFocus
        maxLength={MAX_NAME}
        placeholder="e.g. Math, Biology, Personal Finance"
        value={name}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') create();
        }}
      />

      <label className="field-label" style={{ marginTop: 14 }}>
        Icon
      </label>
      <div className="icon-grid">
        {ICONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`icon-option${emoji === icon ? ' selected' : ''}`}
            onClick={() => setIcon(emoji)}
            disabled={busy}
          >
            {emoji}
          </button>
        ))}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn-primary" onClick={create} disabled={busy || !trimmed}>
          {busy ? 'Creating…' : 'Create brain'}
        </button>
      </div>
    </Modal>
  );
}
