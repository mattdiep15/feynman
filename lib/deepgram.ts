// Deepgram STT + TTS wrapper. Verified against @deepgram/sdk v3.13:
//   STT: deepgram.listen.prerecorded.transcribeFile(buffer, opts) → { result, error }
//   TTS: deepgram.speak.request({ text }, opts) → response.getStream()
import { createClient, type DeepgramClient } from '@deepgram/sdk';

// Lazy init — createClient throws without a key, which would break the
// Next.js build's page-data collection (no .env.local at build time).
let client: DeepgramClient | null = null;
function deepgram(): DeepgramClient {
  if (!client) client = createClient(process.env.DEEPGRAM_API_KEY ?? '');
  return client;
}

// Pure extractor so the response-shape handling stays testable.
export function transcriptFromResult(result: unknown): string {
  const r = result as any;
  return r?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
}

export async function transcribe(audio: Buffer): Promise<string> {
  const { result, error } = await deepgram().listen.prerecorded.transcribeFile(audio, {
    model: 'nova-3',
    smart_format: true,
  });
  if (error) throw error;
  return transcriptFromResult(result);
}

// Mint a short-lived, narrowly-scoped key the browser can use to open a live STT
// WebSocket directly to Deepgram — so the master DEEPGRAM_API_KEY never leaves the
// server. (R5) Verified against @deepgram/sdk v3.13: manage.getProjects() →
// { result: { projects } }, manage.createProjectKey(projectId, { comment, scopes,
// time_to_live_in_seconds }) → { result: { key } }.
export async function createScopedKey(
  ttlSeconds = 60,
): Promise<{ key: string; expiresIn: number }> {
  const dg = deepgram();
  const { result: projects, error: pErr } = await dg.manage.getProjects();
  if (pErr) throw pErr;
  const projectId = projects?.projects?.[0]?.project_id;
  if (!projectId) throw new Error('No Deepgram project available');
  const { result: key, error: kErr } = await dg.manage.createProjectKey(projectId, {
    comment: 'feynman-browser-live-stt',
    scopes: ['usage:write'],
    time_to_live_in_seconds: ttlSeconds,
  });
  if (kErr) throw kErr;
  if (!key?.key) throw new Error('Deepgram returned no key');
  return { key: key.key, expiresIn: ttlSeconds };
}

export async function synthesize(text: string): Promise<ReadableStream<Uint8Array>> {
  const response = await deepgram().speak.request({ text }, { model: 'aura-asteria-en' });
  const stream = await response.getStream();
  if (!stream) throw new Error('Deepgram returned no audio stream');
  return stream;
}
