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

  // Live STT (R5): WebSocket to Deepgram, the mic stream, a WebAudio level meter,
  // and the running transcript. `modeRef` records whether this take is streaming
  // ('live') or the prerecorded fallback so stop() knows how to finalize.
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const orbRef = useRef<HTMLSpanElement | null>(null);
  const liveFinalRef = useRef(''); // committed (is_final) segments so far
  const finalizedRef = useRef(false); // guard: onerror + manual stop both finalize
  const modeRef = useRef<'live' | 'prerecorded'>('prerecorded');
  const [liveText, setLiveText] = useState(''); // interim transcript shown while recording

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
      releaseStream();
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

  // WebAudio level meter: drive the recording orb's scale via a CSS var so the
  // amplitude animation never triggers React re-renders.
  const startLevelMeter = (stream: MediaStream) => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const level = Math.min(1, sum / data.length / 96);
        orbRef.current?.style.setProperty('--level', level.toFixed(3));
        levelRafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      /* level meter is decorative — ignore if WebAudio is unavailable */
    }
  };

  const stopLevelMeter = () => {
    if (levelRafRef.current) cancelAnimationFrame(levelRafRef.current);
    levelRafRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  // Release the mic + close any open socket. Safe to call multiple times.
  const releaseStream = () => {
    stopLevelMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* already closing */
      }
      wsRef.current = null;
    }
  };

  const startRecording = async () => {
    if (!concept) return;
    setError('');
    cancelledRef.current = false;
    finalizedRef.current = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone access denied or unavailable.');
      setPhase('idle');
      return;
    }
    streamRef.current = stream;
    startLevelMeter(stream);

    // Prefer live streaming; fall back to prerecorded if the token or socket fails
    // so the core teachback loop never breaks. (R5)
    let token = '';
    try {
      const r = await fetch('/api/deepgram-token', { method: 'POST' });
      if (r.ok) token = (await r.json())?.key ?? '';
    } catch {
      /* fall through to prerecorded */
    }

    if (token && 'WebSocket' in window) {
      try {
        startLiveStreaming(stream, token);
        return;
      } catch {
        /* fall through to prerecorded */
      }
    }
    startPrerecorded(stream);
  };

  // Live path: stream mic chunks to Deepgram over a WebSocket and show interim
  // words as they arrive. Auth uses the subprotocol token so no SDK ships to the
  // client and the master key never leaves the server.
  const startLiveStreaming = (stream: MediaStream, token: string) => {
    modeRef.current = 'live';
    liveFinalRef.current = '';
    setLiveText('');
    const ws = new WebSocket(
      'wss://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&interim_results=true',
      ['token', token],
    );
    wsRef.current = ws;

    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size && ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };

    let opened = false;
    ws.onopen = () => {
      opened = true;
      recorder.start(250); // 250ms chunks → near-real-time
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const text: string = msg?.channel?.alternatives?.[0]?.transcript ?? '';
      if (!text) return;
      if (msg.is_final) {
        liveFinalRef.current = `${liveFinalRef.current} ${text}`.trim();
        setLiveText(liveFinalRef.current);
      } else {
        setLiveText(`${liveFinalRef.current} ${text}`.trim());
      }
    };
    ws.onerror = () => {
      if (!opened && !finalizedRef.current) {
        // Socket never connected — fall back to prerecorded on the same mic so the
        // take isn't lost.
        wsRef.current = null;
        startPrerecorded(stream);
      } else {
        // Mid-stream failure: finalize with whatever was transcribed so far.
        finalizeLive();
      }
    };

    setPhase('recording');
  };

  // Prerecorded fallback: record to a blob and POST it to /api/transcribe.
  const startPrerecorded = (stream: MediaStream) => {
    modeRef.current = 'prerecorded';
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    recorder.onstop = () => {
      releaseStream();
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
  };

  // Finalize a live take: stop interim display, release the mic, and evaluate the
  // accumulated final transcript through the same path as a typed/prerecorded turn.
  const finalizeLive = () => {
    if (finalizedRef.current) return; // guard: onerror + manual stop can both fire
    finalizedRef.current = true;
    const text = liveFinalRef.current.trim();
    releaseStream();
    setLiveText('');
    if (cancelledRef.current) {
      setPhase('idle');
      return;
    }
    if (!text) {
      setError("Didn't catch that — try again.");
      setPhase('idle');
      return;
    }
    void evaluateText(text);
  };

  const stopRecording = () => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* recorder may already be inactive */
    }
    if (modeRef.current === 'live') {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Ask Deepgram to flush + return the last finals, then finalize.
        try {
          ws.send(JSON.stringify({ type: 'CloseStream' }));
        } catch {
          /* ignore */
        }
        setTimeout(finalizeLive, 700);
      } else {
        finalizeLive();
      }
    }
  };

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
        {phase === 'recording' ? (
          // Reactive voice element replaces the text bar while listening: a pulse
          // that scales with mic level, plus the live transcript as it streams. (R5)
          <div className="voice-live">
            <span className="voice-pulse" ref={orbRef} />
            <span className="voice-live-text">{liveText || 'Listening…'}</span>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </>
  );
}
