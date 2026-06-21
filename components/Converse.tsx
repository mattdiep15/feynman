'use client';

import { useEffect, useRef, useState } from 'react';
import type { GraphNode } from '@/lib/graph';
import type { EvaluationResult } from '@/lib/evaluate';
import { blendMastery } from '@/lib/score';
import { statusFromScore } from '@/lib/mastery';
import { useSettings } from '@/context/SettingsContext';
import { VOICE_RATE } from '@/lib/settings';
import { AgentAvatar } from './AgentAvatar';
import { Mic, Square, Send } from 'lucide-react';

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
  onAutoAdvance,
}: {
  brainId: string;
  concept: GraphNode | null;
  onScored: (conceptId: string, masteryScore: number, status: string) => void;
  onAutoAdvance: (currentConceptId: string) => void;
}) {
  const { settings } = useSettings();
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

  // Session state (R3): a session is one mount on one concept. Scorable turns
  // accumulate here; the running score is committed to mastery only on leave.
  const sessionTurnsRef = useRef<string[]>([]); // accepted (scorable) turns
  const sessionScoreRef = useRef<number | null>(null); // latest cumulative score
  const misconRef = useRef<string[]>([]); // misconceptions surfaced this session
  const prevScoreRef = useRef<number>(0); // last displayed score, for the delta
  const committedRef = useRef(false); // guard against double-commit
  const advancedRef = useRef(false); // guard so auto-advance fires once per session
  const conceptRef = useRef<GraphNode | null>(concept);
  conceptRef.current = concept;

  const busy = phase === 'transcribing' || phase === 'evaluating';

  // Auto-scroll to the latest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Commit the running session score to mastery. Fired once when the student
  // leaves the concept (node switch / brain switch / page unload). No-op if no
  // scorable turn happened. Optimistically recolors the map with the same blend
  // the server applies, then persists best-effort (keepalive survives unmount).
  const commitSession = (c: GraphNode | null) => {
    if (!c || committedRef.current) return;
    const score = sessionScoreRef.current;
    if (score == null) return; // nothing worth committing
    committedRef.current = true;
    // priorAttempts proxy: a concept scored before is no longer "untested".
    const hadHistory = c.status !== 'untested' && c.status !== 'untouched';
    const blended = blendMastery(c.masteryScore, score, hadHistory ? 1 : 0);
    onScored(c.id, blended, statusFromScore(blended));
    try {
      void fetch('/api/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          conceptId: c.id,
          brainId,
          sessionScore: score,
          misconceptions: misconRef.current,
        }),
      });
    } catch {
      /* best-effort; the next session will re-derive from prior mastery */
    }
  };

  // Reset the session on concept change, stop voiceover/recording, and commit
  // the OUTGOING concept's session on leave (the cleanup closure captures it).
  useEffect(() => {
    committedRef.current = false;
    advancedRef.current = false;
    sessionTurnsRef.current = [];
    sessionScoreRef.current = null;
    misconRef.current = [];
    prevScoreRef.current = concept?.masteryScore ?? 0;
    const leaving = concept;
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      try {
        recorderRef.current?.stop();
      } catch {
        /* recorder may already be inactive */
      }
      commitSession(leaving);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept?.id]);

  // Commit on page unload too (tab close / refresh), via the live concept ref.
  useEffect(() => {
    const handler = () => commitSession(conceptRef.current);
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const prevScore = prevScoreRef.current;
    try {
      setPhase('evaluating');
      const eRes = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Send the accepted turns so far so the score reflects cumulative
        // understanding, not just this turn (fixes the k=1 lookback).
        body: JSON.stringify({
          conceptId: concept.id,
          transcript: text,
          brainId,
          priorTurns: sessionTurnsRef.current,
          feedbackDetail: settings.feedbackDetail,
        }),
      });
      const evaluation: EvaluationResult & { sessionScore: number } = await eRes.json();

      if (evaluation.scorable) {
        // Accept the turn into the session and update the running score. The map
        // is NOT recolored yet — that happens once, on commit (leave).
        sessionTurnsRef.current = [...sessionTurnsRef.current, text];
        sessionScoreRef.current = evaluation.sessionScore;
        prevScoreRef.current = evaluation.sessionScore;
        if (evaluation.misconceptions?.length) {
          misconRef.current = Array.from(new Set([...misconRef.current, ...evaluation.misconceptions]));
        }

        const up = evaluation.sessionScore >= prevScore;
        const badges: Badge[] = [
          { label: `${up ? '↑' : '↓'} ${prevScore} → ${evaluation.sessionScore}%`, weak: !up },
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
      } else {
        // Neutral / filler / accidental input — reply, but leave the score alone.
        push({
          role: 'feynman',
          text: evaluation.feedbackMessage,
          hint: evaluation.followUpQuestion || undefined,
        });
      }

      await speak(evaluation.feedbackMessage);

      // Auto-advance (Settings): once the running score crosses 70%, hand off to
      // the next weakest concept. Fires at most once per session.
      if (
        settings.autoAdvance &&
        evaluation.scorable &&
        evaluation.sessionScore > 70 &&
        !advancedRef.current
      ) {
        advancedRef.current = true;
        onAutoAdvance(concept.id);
      }
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
      audio.playbackRate = VOICE_RATE[settings.voiceSpeed];
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
    <>
      <div className="messages">
        {messages.map((m) => (
          <div className={`msg${m.role === 'user' ? ' user' : ''}`} key={m.id}>
            {m.role === 'feynman' ? (
              <AgentAvatar size={28} />
            ) : (
              <div className={`avatar ${m.role}`}>{'You'.charAt(0)}</div>
            )}
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
            <Square fill="white" strokeWidth={1.5} />
          ) : (
            <Mic strokeWidth={1.5} />
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
          <Send strokeWidth={1.5} />
        </button>
      </div>
    </>
  );
}
