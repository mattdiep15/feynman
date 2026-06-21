// Brand wordmark — two neuron dots with an animated signal and "feynman" text.
// Lives in the sidebar header only. The wordmark uses currentColor so it follows
// the theme's text color in dark mode.
export function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text)' }}>
      <svg width="130" height="32" viewBox="0 0 130 32">
        <style>{`
          @keyframes logo-flow  { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
          @keyframes logo-flow2 { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
          .logo-sig  { stroke-dasharray:5 4; animation: logo-flow  1.6s linear infinite; }
          .logo-sig2 { stroke-dasharray:5 4; animation: logo-flow2 1.6s linear infinite 0.8s; }
        `}</style>

        <circle cx="10" cy="16" r="7" fill="#7C3AED" fillOpacity="0.2" />
        <circle cx="10" cy="16" r="4" fill="#7C3AED" />

        <circle cx="24" cy="16" r="7" fill="#22C55E" fillOpacity="0.15" />
        <circle cx="24" cy="16" r="4" fill="#22C55E" />

        <path
          className="logo-sig"
          d="M14 14 Q17 10 20 14"
          fill="none"
          stroke="#7C3AED"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          className="logo-sig2"
          d="M20 18 Q17 22 14 18"
          fill="none"
          stroke="#A78BFA"
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        <text x="38" y="21" fontFamily="inherit" fontWeight="700" fontSize="16" fill="currentColor">
          feynman
        </text>
      </svg>
    </div>
  );
}
