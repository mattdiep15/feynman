// Toggle switch — themed via CSS vars.
export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      style={{
        width: '40px',
        height: '22px',
        borderRadius: '11px',
        background: value ? 'var(--purple)' : 'var(--border)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s ease',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '3px',
          left: value ? '21px' : '3px',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: 'white',
          transition: 'left 0.2s ease',
        }}
      />
    </div>
  );
}
