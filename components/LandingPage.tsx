'use client';

// Full-viewport landing: decorative rotating neuron map behind a centered hero
// with a radial fade for readability. Clicking the CTA hands off to the app.
import LandingGraph from './LandingGraph';

export default function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing-root">
      <LandingGraph />
      <div className="landing-overlay">
        <div className="landing-eyebrow">Feynman</div>
        <h1 className="landing-title">
          Learn by teaching.
          <br />
          Remember by explaining.
        </h1>
        <p className="landing-sub">Your neuron map grows every time you explain something.</p>
        <button className="cta-button" onClick={onStart}>
          Start learning →
        </button>
      </div>
    </div>
  );
}
