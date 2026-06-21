# Feynman

A **voice-first learning agent**. You talk to it, it builds a living knowledge
graph of what you're studying, makes you **teach concepts back out loud**,
listens, judges your understanding, speaks feedback back, and updates a
persistent memory of your mastery. The map of your knowledge gets smarter every
session.

Built with Next.js (App Router) + TypeScript. Claude for extraction/evaluation,
Deepgram for speech in/out, Voyage for embeddings, Redis Cloud (Search & Query)
for semantic memory.

---

## Quick start

### 1. Prerequisites
- Node 18+ (built on 22).
- A **Redis Cloud** database with the **Search & Query (RediSearch)** capability
  **enabled**. Vanilla Redis / Upstash do **not** support `FT.*` — vector search
  silently fails without it. Connection uses TLS (`rediss://`).
- API keys for Anthropic, Deepgram, and Voyage AI.

### 2. Configure secrets
Copy the example env file and fill it in. **Never commit `.env.local`.**
```bash
cp .env.local.example .env.local
# then edit .env.local:
#   ANTHROPIC_API_KEY=...
#   DEEPGRAM_API_KEY=...
#   VOYAGE_API_KEY=...
#   REDIS_URL=rediss://default:<password>@<host>:<port>
```

### 3. Install & run
```bash
npm install
npm run dev      # http://localhost:3000
```
On first request the app connects to Redis and creates the `idx:concepts`
vector index (idempotent — safe on every cold start).

### 4. Test
```bash
npm test         # unit + route tests (external SDKs mocked — no keys needed)
```

### 5. Build / deploy
```bash
npm run build
```
Deploy to Vercel; set the four env vars in the Vercel project settings. The
build does not need live keys (clients are lazily initialized).

---

## Pinned models
| Purpose | Value |
|---|---|
| Claude | `claude-sonnet-4-6` |
| Embeddings | `voyage-3.5-lite`, dim **512** |
| Deepgram STT | `nova-3` |
| Deepgram TTS | `aura-asteria-en` |

SDK signatures verified against `@deepgram/sdk` v3.13
(`listen.prerecorded.transcribeFile`, `speak.request().getStream()`) and
`voyageai` 0.0.4 (`VoyageAIClient.embed`).

---

## Core loop
```
Notes in → Claude extracts concepts + edges (JSON) → embed → Redis (HASH + vector index)
         → react-force-graph-2d renders nodes colored by mastery

Pick a node → Record → speak explanation
  → Deepgram STT → transcript
  → embed transcript ('query') → Redis KNN search → related concept nodes
  → Claude evaluates, grounded in retrieved nodes → { masteryScore, correct, missing, ... }
  → Deepgram TTS speaks feedbackMessage
  → Redis updates mastery (HSET + ZADD) → node re-colors instantly
```

## API routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/extract` | POST | Notes → Claude → embed → Redis write |
| `/api/graph` | GET | Read nodes + edges (no embedding) → graph data |
| `/api/transcribe` | POST | Audio blob → Deepgram STT → transcript |
| `/api/evaluate` | POST | Transcript → embed → KNN → Claude eval → Redis update |
| `/api/speak` | POST | Feedback text → Deepgram TTS → audio |
| `/api/refresher` | GET | Weakest concepts (ZRANGE) to review next |

## Project layout
```
app/
  page.tsx                 renders <Studio/>
  api/*/route.ts           the six routes above
components/
  Studio.tsx               notes input · graph · refresher · selection
  BrainGraph.tsx           react-force-graph-2d (dynamic import, ssr:false)
  TeachbackPanel.tsx       record → transcribe → evaluate → speak + feedback
lib/
  constants.ts             USER_ID / BRAIN_ID / CLAUDE_MODEL
  embed.ts                 Voyage embed + Float32 buffer (single source of DIM)
  redis.ts                 client + idempotent ensureIndexes()
  claude.ts                claudeJson (retry-once) + claudeTool (forced output)
  extract / evaluate / retrieve / memory / graph / mastery / json
tests/                     vitest unit + mocked-route tests
```

## Demo script
1. Open the app. Click **Load sample notes** (compound interest, principal,
   rates), then **Build graph**. Gray (untested) nodes appear.
2. Click **Compound Interest**, hit record, and *speak* — deliberately omit how
   time drives compounding.
3. Feynman transcribes, **embeds + vector-searches Redis** for related nodes,
   and Claude evaluates in that context.
4. Feynman **speaks back**: "You nailed principal and rate — but you skipped how
   time makes compounding powerful." The node dims gray→amber.
5. Re-explain with the fix. Score jumps, the node turns green, and the misconception
   is remembered for next session.

> Audio breaks on stage — rehearse the live voice flow twice before demoing.
