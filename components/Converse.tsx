'use client';

import { useEffect, useRef, useState } from 'react';
import type { GraphNode } from '@/lib/graph';
import type { EvaluationResult } from '@/lib/evaluate';

type Phase = 'idle' | 'recording' | 'transcribing' | 'evaluating' | 'speaking';

type Badge = { label: string; weak?: boolean };
type Msg = {
  id: number;
  role: 'feynman' | 'user';
  text: string;
  hint?: string;
  badges?: Badge[];
};

const GREETING: Msg = {
  id: 0,
  role: 'feynman',
  text: "Choose a concept from your neuron map and explain it out loud. I'll listen, score your understanding, and tell you what you missed.",
};

export default function Converse({
  brainId,
  concept,
  onScored,
}: {
  brainId: string;
  concept: GraphNode | null;
  onScored: (conceptId: string, masteryScore: number, status: string) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  const busy = phase === 'transcribing' || phase === 'evaluating';

  // Auto-scroll to the latest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Stop voiceover + any recording when the concept changes or on unmount
  // (matches the "stop TTS on node switch" behavior).
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      try {
        recorderRef.current?.stop();
      } catch {
        /* recorder may already be inactive */
      }
    };
  }, [concept?.id]);

  const push = (m: Omit<Msg, 'id'>) => setMessages((ms) => [...ms, { ...m, id: nextId.current++ }]);

  const startRecording = async () => {
    if (!concept) return;
    setError('');
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelledRef.current) {
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

  const stopRecording = () => recorderRef.current?.stop();

  const handleBlob = async (blob: Blob) => {
    try {
      setPhase('transcribing');
      const tRes = await fetch('/api/transcribe', { method: 'POST', body: blob });
      const { transcript } = await tRes.json();
      if (!transcript) {
        setError("Didn't catch that — try again.");
        setPhase('idle');
        return;
      }
      await evaluateText(transcript);
    } catch {
      setError('Something went wrong while transcribing.');
      setPhase('idle');
    }
  };

  const evaluateText = async (text: string) => {
    if (!concept) return;
    push({ role: 'user', text });
    const prevScore = concept.masteryScore;
    try {
      setPhase('evaluating');
      const eRes = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conceptId: concept.id, transcript: text, brainId }),
      });
      const evaluation: EvaluationResult & { status: string } = await eRes.json();
      onScored(concept.id, evaluation.masteryScore, evaluation.status);

      const up = evaluation.masteryScore >= prevScore;
      const badges: Badge[] = [
        { label: `${up ? '↑' : '↓'} ${prevScore} → ${evaluation.masteryScore}%`, weak: !up },
      ];
      if (evaluation.missing?.length) {
        badges.push({ label: `Missing: ${evaluation.missing[0]}`, weak: true });
      }
      push({
        role: 'feynman',
        text: evaluation.feedbackMessage,
        hint: evaluation.followUpQuestion || undefined,
        badges,
      });

      await speak(evaluation.feedbackMessage);
    } catch {
      setError('Something went wrong during evaluation.');
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
      if (!res.ok) {
        setPhase('idle');
        return;
      }
      const buf = await res.blob();
      audioRef.current?.pause();
      const audio = new Audio(URL.createObjectURL(buf));
      audioRef.current = audio;
      audio.onended = () => {
        audioRef.current = null;
        setPhase('idle');
      };
      setPhase('speaking');
      await audio.play().catch(() => setPhase('idle'));
    } catch {
      setPhase('idle');
    }
  };

  const stopSpeaking = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPhase((p) => (p === 'speaking' ? 'idle' : p));
  };

  const sendDraft = () => {
    const text = draft.trim();
    if (!text || !concept || busy) return;
    setDraft('');
    void evaluateText(text);
  };

  const onRecordClick = () => {
    if (phase === 'recording') stopRecording();
    else if (phase === 'speaking') stopSpeaking();
    else startRecording();
  };

  return (
    <div className="panel chat-area">
      <div className="messages">
        {messages.map((m) => (
          <div className={`msg${m.role === 'user' ? ' user' : ''}`} key={m.id}>
            <div className={`avatar ${m.role}`}>{m.role === 'feynman' ? 'F' : 'You'.charAt(0)}</div>
            <div>
              <div className={`bubble ${m.role}`}>
                {m.text}
                {m.hint && <div className="bubble-hint">Try: {m.hint}</div>}
                {m.badges && (
                  <div className="badge-row">
                    {m.badges.map((b, i) => (
                      <span key={i} className={`score-badge${b.weak ? ' weak-badge' : ''}`}>
                        {b.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {phase === 'transcribing' && <div className="muted" style={{ fontSize: 12 }}>Transcribing…</div>}
        {phase === 'evaluating' && <div className="muted" style={{ fontSize: 12 }}>Evaluating…</div>}
        {error && <div className="error-text">{error}</div>}
        <div ref={endRef} />
      </div>

      <div className="voice-bar">
        <span className={`concept-chip${concept ? '' : ' empty'}`}>
          {concept ? concept.name : 'Pick a concept'}
        </span>
        <button
          className={`record-btn${phase === 'recording' ? ' recording' : ''}`}
          onClick={onRecordClick}
          disabled={!concept || busy}
          title={
            phase === 'recording'
              ? 'Stop & submit'
              : phase === 'speaking'
                ? 'Stop voiceover'
                : 'Record explanation'
          }
        >
          {phase === 'recording' && <span className="rec-dot" />}
          {phase === 'speaking' ? (
            <svg viewBox="0 0 16 16" fill="white">
              <rect x="4" y="4" width="8" height="8" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={1.4}>
              <path d="M8 2a3 3 0 013 3v4a3 3 0 01-6 0V5a3 3 0 013-3zM4 9a4 4 0 008 0M8 13v2M6 15h4" />
            </svg>
          )}
        </button>
        <div className="chat-input-wrap">
          <input
            className="chat-input"
            placeholder={concept ? 'Or type your explanation…' : 'Pick a concept from the neuron map first'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendDraft()}
            disabled={!concept || busy}
          />
        </div>
        <button className="send-btn" onClick={sendDraft} disabled={!concept || busy || !draft.trim()} title="Send">
          <svg viewBox="0 0 14 14" fill="white">
            <path d="M2 2l10 5-10 5V9l7-2-7-2V2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
