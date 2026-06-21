// Agent avatar — two pulsing neuron dots with a signal flowing between them.
// Shown next to every Feynman chat message. viewBox stays 0 0 40 40; the `size`
// prop scales the rendered output.
export function AgentAvatar({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
      <style>{`
        @keyframes av-pulse  { 0%,100%{r:4}   50%{r:5.5} }
        @keyframes av-pulse2 { 0%,100%{r:4}   50%{r:5.5} }
        @keyframes av-flow   { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
        @keyframes av-flow2  { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
        .av-dot  { animation: av-pulse  2s ease-in-out infinite; }
        .av-dot2 { animation: av-pulse2 2s ease-in-out infinite 0.7s; }
        .av-sig  { stroke-dasharray:5 4; animation: av-flow  1.6s linear infinite; }
        .av-sig2 { stroke-dasharray:5 4; animation: av-flow2 1.6s linear infinite 0.8s; }
      `}</style>

      <circle cx="20" cy="20" r="20" fill="#7C3AED" />

      <circle cx="13" cy="20" r="5.5" fill="white" fillOpacity="0.25" />
      <circle className="av-dot" cx="13" cy="20" r="4" fill="white" />

      <circle cx="27" cy="20" r="5.5" fill="#22C55E" fillOpacity="0.2" />
      <circle className="av-dot2" cx="27" cy="20" r="4" fill="#22C55E" />

      <path
        className="av-sig"
        d="M18 18 Q20 15 22 18"
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        className="av-sig2"
        d="M22 22 Q20 25 18 22"
        fill="none"
        stroke="#A7F3D0"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
