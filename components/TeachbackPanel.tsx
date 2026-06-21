'use client';

import { useRef, useState } from 'react';
import type { GraphNode } from '@/lib/graph';
import type { EvaluationResult } from '@/lib/evaluate';
import type { RelatedNode } from '@/lib/retrieve';

type Evaluation = EvaluationResult & { status: string; related: RelatedNode[]; crossBrain: RelatedNode[] };
type Phase = 'idle' | 'recording' | 'transcribing' | 'evaluating' | 'speaking' | 'done';

export default function TeachbackPanel({
  concept,
  onScored,
}: {
  concept: GraphNode;
  onScored: (conceptId: string, masteryScore: number, status: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);

  const startRecording = async () => {
    setError('');
    setEvaluation(null);
    setTranscript('');
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelledRef.current) {
          // cancelled: discard audio, don't score
          chunksRef.current = [];
          setPhase('idle');
          return;
        }
        void handleBlob(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setPhase('recording');
    } catch {
      setError('Microphone access denied or unavailable.');
      setPhase('idle');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    recorderRef.current?.stop(); // fires onstop, which discards without scoring
  };

  const handleBlob = async (blob: Blob) => {
    try {
      // 3b. transcribe
      setPhase('transcribing');
      const tRes = await fetch('/api/transcribe', { method: 'POST', body: blob });
      const { transcript: text } = await tRes.json();
      setTranscript(text);
      if (!text) {
        setError("Didn't catch that — try again.");
        setPhase('idle');
        return;
      }

      // 3d. evaluate (embed → KNN → Claude → persist)
      setPhase('evaluating');
      const eRes = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conceptId: concept.id, transcript: text }),
      });
      const evaluation: Evaluation = await eRes.json();
      setEvaluation(evaluation);
      // optimistic re-color the moment evaluate returns (before TTS)
      onScored(concept.id, evaluation.masteryScore, evaluation.status);

      // 3e. speak feedback
      setPhase('speaking');
      await speak(evaluation.feedbackMessage);
      setPhase('done');
    } catch {
      setError('Something went wrong during teachback.');
      setPhase('idle');
    }
  };

  const speak = async (text: string) => {
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const buf = await res.blob();
      const audio = new Audio(URL.createObjectURL(buf));
      await audio.play().catch(() => undefined);
    } catch {
      /* audio is best-effort */
    }
  };

  const busy = phase === 'transcribing' || phase === 'evaluating' || phase === 'speaking';
  const label =
    phase === 'recording'
      ? '■ Stop & submit'
      : busy
        ? phaseLabel(phase)
        : '● Record explanation';

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #1f2937' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={phase === 'recording' ? stopRecording : startRecording}
          disabled={busy}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 8,
            border: 'none',
            background: phase === 'recording' ? '#dc2626' : '#16a34a',
            color: 'white',
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {label}
        </button>
        {phase === 'recording' && (
          <button
            onClick={cancelRecording}
            title="Discard this recording without scoring"
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #374151', background: 'transparent', color: '#e5e7eb', cursor: 'pointer' }}
          >
            Cancel
          </button>
        )}
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}

      {transcript && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', color: '#9ca3af', fontSize: 13 }}>Your explanation</summary>
          <p style={{ fontSize: 14, fontStyle: 'italic' }}>{transcript}</p>
        </details>
      )}

      {evaluation && <Feedback evaluation={evaluation} onReplay={() => speak(evaluation.feedbackMessage)} />}
    </div>
  );
}

function phaseLabel(p: Phase): string {
  if (p === 'transcribing') return 'Transcribing…';
  if (p === 'evaluating') return 'Evaluating…';
  if (p === 'speaking') return 'Speaking…';
  return '…';
}

function Feedback({ evaluation, onReplay }: { evaluation: Evaluation; onReplay: () => void }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Score: {evaluation.masteryScore}/100 · {evaluation.status}</strong>
        <button onClick={onReplay} style={{ background: 'none', border: '1px solid #374151', color: '#e5e7eb', borderRadius: 6, cursor: 'pointer', padding: '2px 8px' }}>
          ▶ Replay
        </button>
      </div>
      <p style={{ fontSize: 14 }}>{evaluation.feedbackMessage}</p>
      <FbList title="Got right" items={evaluation.correct} color="#22c55e" />
      <FbList title="Missing" items={evaluation.missing} color="#f59e0b" />
      <FbList title="Misconceptions" items={evaluation.misconceptions} color="#ef4444" />
      {evaluation.followUpQuestion && (
        <p style={{ fontSize: 14, color: '#93c5fd' }}>↪ {evaluation.followUpQuestion}</p>
      )}
      {evaluation.related?.length > 0 && (
        <p style={{ fontSize: 12, color: '#6b7280' }}>
          Retrieved from memory: {evaluation.related.map((r) => r.name).join(', ')}
        </p>
      )}
      {evaluation.crossBrain?.length > 0 && (
        <p style={{ fontSize: 12, color: '#a78bfa' }}>
          Bridges from other brains:{' '}
          {evaluation.crossBrain.map((r) => `${r.name}${r.brainId ? ` (${r.brainId})` : ''}`).join(', ')}
        </p>
      )}
    </div>
  );
}

function FbList({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 12, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
      <ul style={{ margin: '2px 0', paddingLeft: 18, fontSize: 14 }}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
