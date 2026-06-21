// Segmented control — themed via CSS vars so it works in light + dark.
type Option = { label: string; value: string };

export function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'var(--surface)',
        border: '0.5px solid var(--border)',
        borderRadius: '8px',
        padding: '3px',
        gap: '2px',
      }}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '5px 14px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: selected ? 500 : 400,
              background: selected ? 'var(--bg)' : 'transparent',
              color: selected ? 'var(--purple)' : 'var(--text-secondary)',
              cursor: 'pointer',
              boxShadow: selected ? '0 0 0 0.5px var(--border)' : 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
