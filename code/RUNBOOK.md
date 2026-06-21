# Runbook

Operational guide for running, verifying, and troubleshooting Feynman. For the
project overview and architecture, see [README.md](./README.md).

---

## 0. Pre-flight (one-time)

| Check | How | Expected |
|---|---|---|
| Node version | `node -v` | v18+ (built on v22) |
| Deps installed | `npm install` | exits 0, `node_modules/` present |
| Secrets present | `cat .env.local` (don't share output) | 4 vars filled, no placeholders |
| Redis has Search | Redis Cloud console → your DB → **Capabilities** | **Search & Query** = enabled |

`.env.local` (copy from `.env.local.example`):
```bash
ANTHROPIC_API_KEY=sk-ant-...
DEEPGRAM_API_KEY=...
VOYAGE_API_KEY=pa-...
REDIS_URL=rediss://default:<password>@<host>:<port>   # password is inside the URL; no separate key
```

> ⚠️ If **Search & Query** is not enabled on the Redis database, `FT.*` commands
> fail and vector search silently returns nothing. This is the #1 setup gotcha.
> Vanilla Redis and Upstash do not support it — use Redis Cloud.

---

## 1. Run the test suite (no keys needed)

External SDKs (Claude, Deepgram, Voyage, Redis) are mocked, so this works
offline and without credentials. Run it first to confirm the code is intact.

```bash
npm test
```
**Expected:** `Test Files 15 passed`, `Tests 49 passed`.

Watch mode while developing: `npm run test:watch`.

---

## 2. Type-check / production build (no keys needed)

```bash
npm run build
```
**Expected:** `✓ Compiled successfully`, a route table listing all six
`/api/*` routes, exit 0. Clients are lazily initialized, so the build does not
need live keys.

---

## 3. Start the dev server (needs all 4 secrets)

```bash
npm run dev          # http://localhost:3000
```
On the **first request**, the app connects to Redis and creates the
`idx:concepts` vector index (idempotent — safe on every cold start).

### Verify the stack layer by layer

**3a. Redis connection + index.** Trigger any route (just load the page, which
calls `GET /api/graph`). Then check the index exists:
```bash
redis-cli -u "$REDIS_URL" FT.INFO idx:concepts        # should print index schema
```
On an empty brain the page loads with an empty graph — that's correct.

**3b. Extract (Notes → Graph).** In the UI: **Load sample notes → Build graph**.
Gray (untested) nodes should appear within a few seconds. Verify storage:
```bash
redis-cli -u "$REDIS_URL" KEYS 'concept:demo:finance:*'      # one key per concept
redis-cli -u "$REDIS_URL" ZRANGE mastery:demo:finance 0 -1   # concept ids
redis-cli -u "$REDIS_URL" HGET concept:demo:finance:compound_interest name
# do NOT HGETALL — the embedding field is a binary Buffer and will look like garbage
```
Or via curl:
```bash
curl -s localhost:3000/api/graph | head -c 400
```

**3c. Voice loop (the core).** Click a node (e.g. **Compound Interest**) →
**Record explanation** → speak → **Stop & submit**. Expected sequence in the
panel: `Transcribing… → Evaluating… → Speaking…`, then a score, written
feedback, and the node recolors (gray→amber/green). You should hear the feedback
spoken aloud.

**3d. Refresher.** Click **↻ Refresher: weakest concepts** → a list of the
lowest-mastery concepts appears; clicking one selects that node.

---

## 4. Manual API smoke tests (server running)

```bash
# extract
curl -s -X POST localhost:3000/api/extract \
  -H 'content-type: application/json' \
  -d '{"notes":"Compound interest grows on principal plus accumulated interest over time."}'

# graph
curl -s localhost:3000/api/graph

# evaluate (use a conceptId that exists from extract)
curl -s -X POST localhost:3000/api/evaluate \
  -H 'content-type: application/json' \
  -d '{"conceptId":"compound_interest","transcript":"It is interest on the principal."}'

# speak → save audio
curl -s -X POST localhost:3000/api/speak \
  -H 'content-type: application/json' \
  -d '{"text":"Nice work."}' --output feedback.mp3

# transcribe (send a real webm/wav file as the raw body)
curl -s -X POST localhost:3000/api/transcribe \
  --data-binary @sample.webm
```

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Graph builds but KNN/evaluate finds nothing related | Search & Query not enabled, or index missing | Enable the capability on the Redis DB; restart so `ensureIndexes()` reruns |
| `FT.SEARCH` / `FT.CREATE` errors in server logs | RediSearch unavailable | Same as above — must be Redis Cloud with Search & Query |
| White screen / WebGL or `window is not defined` | graph imported without `ssr:false` | `BrainGraph` already uses dynamic import; don't import `react-force-graph-2d` at top level |
| `A deepgram API key is required` at build | a key read at import time | Clients are lazy by design; confirm you didn't move construction to module scope |
| Voice: nothing records | mic permission denied, or not on localhost/HTTPS | `getUserMedia` requires a secure context; allow the mic prompt |
| "Didn't catch that" after recording | empty transcript from STT | Speak longer/louder; check `DEEPGRAM_API_KEY` and that `nova-3` is valid for your SDK |
| No audio plays back | autoplay blocked, or TTS failed | Click in the page first (user gesture); check `/api/speak` returns `audio/mpeg` |
| Evaluate returns but score never persists | Redis write failing | Check server logs for the `concept:demo:finance:*` HSET/ZADD |
| Claude eval errors | bad/blocked key or model name | Verify `ANTHROPIC_API_KEY` and that `claude-sonnet-4-6` is available to your account |
| Embedding dim mismatch on search | index dim ≠ vector dim | `EMBEDDING_DIM` (512) is the single source of truth; if you changed it, delete and recreate the index |

### Reset the brain (wipe demo data)
```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'concept:demo:finance:*' | xargs -r redis-cli -u "$REDIS_URL" DEL
redis-cli -u "$REDIS_URL" --scan --pattern 'edges:demo:finance:*'   | xargs -r redis-cli -u "$REDIS_URL" DEL
redis-cli -u "$REDIS_URL" DEL mastery:demo:finance memory:longterm:demo
# index can stay; it re-applies to new concept:* hashes automatically
```

---

## 6. Deploy (Vercel)

```bash
npm run build        # confirm green locally first
```
Push to a Vercel-connected repo (or `vercel`). Set the four env vars in
**Project → Settings → Environment Variables**. The build needs no live keys;
runtime does. After deploy, repeat the §3 layer-by-layer verification against the
deployed URL.
