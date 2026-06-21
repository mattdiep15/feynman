# Multi-brain implementation plan

> **Status: backend COMPLETE & verified (2026-06-21).** Steps 1–5 done on branch
> `feat/ui`. 60/60 unit tests pass, `npm run build` clean, and a live smoke
> against the real Redis passed (see *Implementation status* below). The UI phase
> is the only remaining work. This section is the source of truth for what
> shipped; the original step plan below is kept for reference.

Goal: turn the single hardcoded brain (`demo` / `finance`) into real per-user
multiple brains, **backend first**, then wire the new UI to it. This doc covers
the backend; the UI build follows once this lands and is verified.

## Implementation status — what shipped & what changed

All 5 steps landed. Deviations from the plan as originally written:

1. **`BRAIN_ID` alias was *not* kept.** It was removed from `lib/constants.ts`
   outright; every call site moved to `DEFAULT_BRAIN_ID` / `resolveBrainId` in
   one pass. No dangling alias — cleaner end state, all tests/build green.
2. **Added `resolveBrainId(raw)` to `lib/brains.ts`** (not in the original plan).
   Validates input against the slug regex and falls back to `DEFAULT_BRAIN_ID`.
   Every route uses it to read `brainId` from query/body safely — unsafe values
   can't reach a RediSearch TAG query.
3. **Dropped the planned `registerBrainIfMissing` safety net in `extract`.**
   `ensureDefaultBrain` (called by `listBrains`) plus explicit `createBrain`
   already cover registration, so the extra write was dead weight + test churn.
   Trade-off: a brain built into a *non-default* id that was never created via
   `POST /api/brains` won't appear until created — not reachable from the UI flow.
4. **`reset` was generalized into `deleteBrain(redis, userId, brainId)`** in
   `lib/brains.ts` (deletes concept/edge/mastery/memory/brain keys + `SREM`s the
   brain from `brains:{userId}`), per the "generalize reset" decision. The old
   per-user `memory:longterm:{userId}` key is no longer written or deleted; memory
   is now per-brain. A stale `memory:longterm:demo` may linger from before — it's
   unreferenced and harmless.
5. **`listBrains` returns `{ id, name, icon, conceptCount, avgMastery }` only** —
   no "mastered count". The Progress tab's "mastered X / N" will be derived
   client-side from the graph nodes instead of stored server-side.
6. **`createBrain` is positional** `(redis, userId, name, icon)`, not the
   `({ name, icon })` object form sketched in the plan.

**Live smoke results (real Redis, via the dev server):**
- `GET /api/brains` bootstrapped the pre-existing brain: `finance` → "Personal
  Finance", 27 concepts, avgMastery 17. `brains:demo` was empty before; now `{finance}`.
- `GET /api/graph?brainId=finance` → 27 nodes, 51 links.
- `POST /api/brains {name:"Math"}` → id `math`, isolated (`graph?brainId=math` → 0 nodes).
- `POST /api/reset {brainId:"math"}` → deleted + unregistered; `finance` left intact (still 27).

**Files:** new `lib/brains.ts`, `app/api/brains/route.ts`, `tests/brains.test.ts`,
`tests/api-brains.test.ts`; changed `lib/{constants,retrieve,memory}.ts` and
`app/api/{graph,refresher,reset,extract,evaluate}/route.ts` + 6 tests.

## Current data model (what exists today)

| Key | Type | Holds |
|-----|------|-------|
| `concept:{userId}:{brainId}:{conceptId}` | HASH | name, summary, masteryScore, status, userId, brainId, embedding |
| `mastery:{userId}:{brainId}` | ZSET | conceptId → score (drives graph order + refresher) |
| `edges:{userId}:{brainId}:{from}` | SET | members `"{to}:{type}"` |
| `memory:longterm:{userId}` | HASH | field `misconceptions` (JSON array) — **per-user today** |
| `brain:{userId}:{brainId}` | HASH | referenced in reset's delete list but **never written** (vestigial) |
| `idx:concepts` | FT index | ON HASH PREFIX `concept:`, TAG `userId`+`brainId`, VECTOR `embedding` |

The vector index **already** filters by `brainId` TAG, so within-brain and
cross-brain KNN need no schema change — only the query strings are currently
hardcoded to the constant `BRAIN_ID`.

`brainId` is the constant `BRAIN_ID = 'finance'` in `lib/constants.ts`, imported
by every route and by `lib/retrieve.ts`.

## Design decisions (the judgment calls — flagging for review)

1. **`brainId` becomes a per-request parameter**, not global state: query param
   for GET routes (`?brainId=`), body field for POST routes. Each defaults to
   `DEFAULT_BRAIN_ID` (`'finance'`) so existing data + tests stay valid. No
   mutable module-level brain.
2. **Brain registry** = `brains:{userId}` (SET of brainIds) + `brain:{userId}:{brainId}`
   HASH `{ name, icon, createdAt }`. Reuses the `brain:` key reset already anticipates.
3. **Centralize key construction** in `lib/brains.ts` key-builders. The ~6 key
   patterns are currently inline template strings in 6 files; parameterizing them
   by hand is error-prone, so a single set of builders is the surgical way to do it.
4. **Long-term memory goes per-brain**: `memory:longterm:{userId}:{brainId}`.
   *Behavior change* — today misconceptions are shared across all subjects; that
   bleeds finance misconceptions into a math brain. Cross-brain analogies are
   unaffected (they ride the vector index, not this key).
5. **Brain stats computed on the fly** from the mastery ZSET (avg mastery,
   concept count, mastered count). No new aggregate keys to keep in sync.
6. **`brainId` is a validated slug** (`^[a-z0-9_-]{1,40}$`), derived from the
   brain name on create. Keeps it safe inside RediSearch TAG queries without escaping.

## Steps (each with a verification gate)

### Step 1 — Key builders + constants
- New `lib/brains.ts`: `conceptKey`, `masteryKey`, `edgesKey`, `brainKey`,
  `brainsSetKey`, `memoryKey`, plus `slugify(name)` and `isValidBrainId(id)`.
- `lib/constants.ts`: keep `USER_ID`; export `DEFAULT_BRAIN_ID = 'finance'`
  (keep `BRAIN_ID` as an alias so nothing breaks mid-refactor).
- **Verify:** new `tests/brains.test.ts` for builders/slugify; `npm test` green.

### Step 2 — Parameterize `retrieve.ts` + `memory.ts`
- `withinBrainKnnQuery(k, userId, brainId)`, `crossBrainKnnQuery(k, userId, brainId)`.
- `memory.ts`: `readMisconceptions(redis, userId, brainId)`,
  `mergeMisconceptions(redis, known, fresh, userId, brainId)` using `memoryKey`.
- Update `tests/retrieve.test.ts`, `tests/memory.test.ts`.
- **Verify:** those unit tests pass.

### Step 3 — Brain registry lib + API
- `listBrains(redis, userId)` → `[{ id, name, icon, conceptCount, avgMastery }]`.
  Bootstrap: if `brains:{userId}` is empty but `mastery:{userId}:finance` exists,
  register the default brain so today's data shows up.
- `createBrain(redis, userId, { name, icon })` → `{ id }` (slug + collision suffix,
  writes `brain:` hash + adds to `brains:` set).
- `app/api/brains/route.ts`: `GET` (list) + `POST` (create).
- **Verify:** new `tests/api-brains.test.ts`.

### Step 4 — Thread `brainId` through existing routes
- `graph` (`GET ?brainId`), `extract` (`POST body.brainId`),
  `evaluate` (`body.brainId`), `refresher` (`GET ?brainId`),
  `reset` (`POST body.brainId` — already brain-scoped, just parameterized).
- All default to `DEFAULT_BRAIN_ID`.
- Update each `tests/api-*.test.ts` to pass `brainId` and assert keys. Default
  path keeps asserting `:finance`, so back-compat is the test's safety net.
- **Verify:** full `npm test` green; `npm run build` clean.

### Step 5 — Bootstrap / live check
- Confirm existing `finance` data surfaces via `GET /api/brains` against live Redis.
- **Verify:** manual smoke per RUNBOOK; create a second brain, confirm isolation.

## Then: UI phase (separate, after backend is green)
Light-theme rebuild per `docs/ui_prompt.md` — sidebar brain switcher (now wired to
the real `/api/brains`), 4 tabs (Converse / Neuron map / Progress / How it works),
hollow untouched nodes via `nodeCanvasObject`, 5 states derived **client-side from
score** (per your call), persistent voice bar. Detailed once the backend is in.
