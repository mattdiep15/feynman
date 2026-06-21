# Proposal v3 — Execution Plan

Refines the raw v3 notes into an agent-executable plan. Three work items (R1–R3),
plus two already-specified prompts that ship as-is.

## Locked decisions (from review)

- **Multibrain layout:** unified brain field — all concept nodes from every brain
  share one slowly-rotating space; each brain is a dotted lobe-cluster; selecting a
  brain focuses its lobe and dims the rest.
- **Brain overlay:** canvas-drawn (dotted lobe outlines + faint silhouette). No
  external image asset, so it themes for dark mode for free.
- **Score commit trigger:** auto on leave only (unmount / switch node / switch
  brain / page unload). No button, no idle timer.
- **In-session score UX:** keep the per-turn `↑↓ 62→20%` deltas, but they reflect a
  *cumulative session* score held in memory and are **not** written to Redis until
  the session ends.

## Already-spec'd, build as written (do not re-design here)

- `docs/draft/settings.md` — Settings tab (dark mode, font, node size, graph speed,
  feedback verbosity, voice speed, auto-advance).
- `docs/draft/landing.md` — landing page with rotating decorative neuron map.

Cross-cutting interactions to honor while building R1–R3:
- All canvas colors must read CSS variables (per settings.md dark-mode rule), not
  hardcoded hex — applies to the new lobe/silhouette drawing (R1) and the recolored
  hover nodes (R2).
- The R2 hover base radius must scale off the settings `nodeSize` base
  (`small/medium/large`), not a private constant.

---

## R1 — Multibrain overview: unified rotating brain field

**Goal:** Replace the one-node-per-brain graph with a single rotating field of
*concept* nodes, grouped into per-brain dotted lobe-clusters under a faint brain
silhouette. Unfocused → slow rotation. Select a brain (left menu or click) → stop
rotation, zoom to that lobe, dim the others and their cross-links.

**Files**
- `app/api/overview/route.ts` — extend payload.
- `lib/overview.ts` — add per-brain anchor layout + lobe-hull helpers.
- `components/BrainOverview.tsx` — full re-render path; accept `selectedBrainId`.
- `components/Feynman.tsx` — pass the left-menu `selectedBrainId` into `BrainOverview`.

**Steps**
1. **Data.** `/api/overview` returns, per brain: `{ id, name, icon, concepts:
   [{id, name, masteryScore, brainId}], conceptLinks }` plus the existing
   inter-brain dotted similarity links. Reuse the per-brain graph builder already in
   `lib/graph`; reuse `pairwiseLinks` (`lib/overview.ts:51`) for brain↔brain links.
2. **Clustering.** Arrange one anchor per brain on a circle. Add a custom d3 force
   (via `onEngineTick` or a registered force) pulling each concept node toward its
   brain anchor so each brain settles into a lobe. Keep intra-brain `conceptLinks`
   so lobes hang together.
3. **Lobe + silhouette drawing.** In `onRenderFramePre`, for each brain compute the
   convex hull (or padded blob) of its concept nodes and stroke a dotted outline in
   `--color-purple-border`; draw a faint shared brain silhouette behind everything.
   Canvas-only, colors from CSS vars.
4. **Rotation (unfocused).** react-force-graph-2d has no camera — rotate via the
   approach landing.md already settled on (rotate the container / rotate node coords
   on a `requestAnimationFrame` tick, never a CSS animation on the graph itself).
   Stop the tick when a brain is selected.
5. **Focus (selected).** When `selectedBrainId` is set: stop rotation, `zoomToFit`
   on that brain's nodes only, render other lobes + their cross-links at reduced
   opacity. Selecting from the left brain menu and clicking a lobe must drive the
   same `selectedBrainId`.
6. **Node rendering.** Concept nodes use the same status fill/border as the neuron
   map; labels appear only for the focused brain (declutter when unfocused).

**Verify**
- With ≥2 brains, overview shows concept-level nodes grouped into distinct dotted
  lobes under a faint silhouette; it rotates slowly when nothing is selected.
- Selecting a brain (both via left menu and via clicking its lobe) stops rotation,
  zooms to that lobe, dims the others.
- Empty state (no brains) unchanged.

---

## R2 — Hover: fix the freeze + dynamic expand

**Goal:** Kill the ~3s hover freeze. Default nodes are small solid dots; as the
cursor approaches, nodes smoothly expand (and the graph with them) and fill with
their label text.

**Root cause of the freeze:** react-force-graph pauses its redraw loop after the sim
cools (`cooldownTicks=120`, `NeuronMap.tsx:147`). `onPointerMove` updates `cursorRef`
(`:124`) but nothing repaints, so labels stop tracking the cursor — looks frozen.

**Files**
- `components/NeuronMap.tsx` — render loop + `nodeCanvasObject`.
- `lib/nodeState.ts` — base-radius source (tie to settings `nodeSize`).

**Steps**
1. **Stop the freeze.** Add `autoPauseRedraw={false}` to the `ForceGraph2D` in
   `NeuronMap` so the redraw loop keeps running and hover tracks the cursor. (If CPU
   is a concern, the alternative is to force a redraw on pointer move; prefer
   `autoPauseRedraw={false}` for simplicity.)
2. **Dynamic expand.** Replace the binary `LABEL_RADIUS_PX` label gate
   (`:185-198`). Compute per-node screen distance to the cursor; derive an expansion
   factor `t = smoothstep(1 - dist/INFLUENCE)` clamped to `[0,1]`. Radius =
   `base + t*(expanded-base)`, where `base` is the small uniform dot size derived
   from the settings `nodeSize`. The selected node is pinned at `t=1`.
3. **Fill with text.** Once `t` passes a threshold, draw the node name centered
   inside the (now-enlarged) node; fade it in with `t`.
4. **Color.** Non-untouched nodes render as solid status-colored dots. Keep
   untouched nodes visually distinct (hollow/light) for legend parity.

**Decision baked in (reversible):** base node size is now uniform, so mastery is
encoded by *color* rather than size on the map. If we later want size-by-mastery
back, reintroduce it as a small multiplier on `base`.

**Verify**
- Hover continuously for >5s: labels keep tracking the cursor, no freeze.
- Moving the cursor across the map grows/shrinks nodes smoothly; far nodes stay
  small dots, near nodes expand and show text.
- Behavior respects the settings `nodeSize` (small/medium/large shift the base).

---

## R3 — Session-based scoring (cumulative, neutral-bypass, lower gamma)

**Goal:** Stop judging each turn in isolation (the k=1 problem). Score the *whole
session* cumulatively so coverage from earlier turns isn't forgotten, skip scoring
on neutral/meta/filler input, soften recency, and only commit to mastery when the
user leaves the node.

**Why:** In `docs/draft/example_conversation.md`, turn 3 is dinged for "didn't
define income" even though turn 1 defined it — because `/api/evaluate` only ever
sees the latest turn (`Converse.tsx:116` sends `transcript: text`). And one weak
turn swings the committed score hard because `DECAY_ALPHA=0.4` blends and persists
*every* turn (`evaluate/route.ts:75-87`).

**Files**
- `lib/score.ts` — lower gamma.
- `lib/evaluate.ts` — add a `scorable` classification to the eval tool/prompt.
- `app/api/evaluate/route.ts` — cumulative scoring, **no persistence**.
- `app/api/commit/route.ts` — **new**: blend + persist once per session.
- `components/Converse.tsx` — session accumulation, commit-on-leave, neutral handling.

**Steps**
1. **Session = one Converse mount.** Converse already remounts per concept
   (`key={concept.id}`), so a session is naturally one mount. Accumulate substantive
   user turns in a ref (`sessionTurns`) and keep the latest cumulative score in
   state.
2. **Cumulative per-turn scoring.** On each substantive turn, POST the *joined
   session transcript* (all `sessionTurns`) to `/api/evaluate`. It returns the
   cumulative session score + feedback. Show the `↑↓` delta vs. the previous
   cumulative score. **Remove the HSET/ZADD/attempts writes from this route** — it no
   longer persists.
3. **Neutral bypass.** Add `scorable: boolean` to `EVALUATION_TOOL` /
   `buildEvalPrompt` (`lib/evaluate.ts`). The model marks meta-requests ("can you
   test me on income"), filler ("yeah for sure!"), and accidental/empty submits as
   `scorable:false`. When false: don't append to `sessionTurns`, don't change the
   score, don't render a score badge — just show the conversational reply. Add a
   trivial client guard for empty/very-short accidental submits.
4. **Commit on leave only.** In Converse's cleanup effect (unmount / concept switch)
   and on `beforeunload`, call `/api/commit` with `{conceptId, brainId,
   sessionScore}` via `navigator.sendBeacon` / `fetch(keepalive:true)` so it fires
   during teardown. `/api/commit` does `blendMastery(prior, sessionScore,
   priorAttempts)`, persists (HSET + ZADD), bumps `attempts` by **1 per session**,
   and merges the session's accumulated misconceptions once.
   - *Caveat (accepted per decision):* a session abandoned without leaving the node
     and without unload (e.g. tab killed) won't commit. Acceptable for now.
5. **Lower gamma.** `DECAY_ALPHA: 0.4 → 0.25` (`lib/score.ts:41`). The blend now runs
   **once per session at commit** (cross-session inertia), not per turn — so a single
   weak turn can't tank mastery, and history sticks harder.

**Decision baked in (reversible):** `/api/commit` trusts the client's final
cumulative `sessionScore` rather than re-evaluating the full transcript server-side
— one fewer expensive model call, fine for a single-user app. Swap to a server-side
re-eval at commit if we ever need to harden it.

**Verify**
- Neutral inputs ("test me on income", "yeah for sure!", empty submit) produce a
  reply with **no** score badge and leave the score unchanged.
- Replaying `example_conversation.md`: after income is defined in turn 1, later turns
  no longer list "didn't define income" as missing (eval sees the cumulative
  transcript).
- The map recolors / Redis updates only after leaving the node — not mid-session.
- A single weak turn inside an otherwise-strong session does not tank the committed
  mastery (cumulative score + α=0.25).

---

## Suggested build order

R2 (smallest, unblocks a visible bug) → R3 (core scoring rework) → R1 (largest,
most isolated). Settings + landing prompts can land independently at any point.
