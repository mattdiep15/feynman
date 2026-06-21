'use client';

import { useState } from 'react';
import Modal from './Modal';
import IconPicker from './IconPicker';
import { normalizeIconKey } from '@/lib/brainIcons';

// Change the icon of an existing brain. Saves immediately on pick.
export default function IconEditModal({
  brainName,
  current,
  onClose,
  onSave,
}: {
  brainName: string;
  current: string;
  onClose: () => void;
  onSave: (icon: string) => Promise<void> | void;
}) {
  const [icon, setIcon] = useState<string>(normalizeIconKey(current));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await onSave(icon);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Icon for ${brainName}`} onClose={onClose}>
      <IconPicker value={icon} onChange={setIcon} disabled={busy} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save icon'}
        </button>
      </div>
    </Modal>
  );
}
