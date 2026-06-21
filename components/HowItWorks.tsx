'use client';

const STEPS: { n: string; title: string; body: string; tag: string; green?: boolean }[] = [
  {
    n: '1',
    title: 'Paste your notes',
    body: 'Drop in raw text on any topic. Claude extracts the key concepts and how they relate, then builds your neuron map automatically.',
    tag: 'Claude extracts',
  },
  {
    n: '2',
    title: 'See your neuron map',
    body: 'Every concept becomes a node, colored by how well you know it. Hollow = new, red = weak, amber = learning, purple = improving, green = mastered.',
    tag: 'react-force-graph-2d',
  },
  {
    n: '3',
    title: 'Pick a concept and record',
    body: 'Click any neuron, hit the mic button, and explain it out loud in your own words. No reading from notes.',
    tag: 'you speak',
    green: true,
  },
  {
    n: '4',
    title: 'Feynman retrieves what you know',
    body: "Your explanation is embedded and searched against your neuron map in Redis. The evaluation is grounded in concepts you've actually studied.",
    tag: 'Redis vector search',
  },
  {
    n: '5',
    title: 'Get spoken feedback',
    body: 'Claude evaluates your explanation and scores it. Deepgram voices the feedback back to you — what you got right, what you missed, what to fix.',
    tag: 'Deepgram TTS',
    green: true,
  },
  {
    n: '6',
    title: 'Your map updates',
    body: 'The neuron re-colors instantly based on your new score. Your misconceptions and progress are saved across sessions.',
    tag: 'persisted in Redis',
    green: true,
  },
];

export default function HowItWorks() {
  return (
    <div className="panel">
      {STEPS.map((s) => (
        <div className="how-step" key={s.n}>
          <div className="step-num">{s.n}</div>
          <div>
            <div className="step-title">{s.title}</div>
            <div className="step-body">{s.body}</div>
            <span className={`step-tag${s.green ? ' green' : ''}`}>{s.tag}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
