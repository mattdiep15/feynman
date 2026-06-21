'use client';

import { BRAIN_ICONS } from './brainIcons';

// Shared lucide-icon grid used by the new-brain modal and the change-icon modal.
export default function IconPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="icon-grid">
      {BRAIN_ICONS.map(({ key, Icon }) => (
        <button
          key={key}
          type="button"
          className={`icon-option${key === value ? ' selected' : ''}`}
          onClick={() => onChange(key)}
          disabled={disabled}
          aria-label={key}
          title={key}
        >
          <Icon width={18} height={18} strokeWidth={1.6} />
        </button>
      ))}
    </div>
  );
}
