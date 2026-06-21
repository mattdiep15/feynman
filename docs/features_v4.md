# Feynman v4 — Execution Plan

Turns the raw v4 review notes (`docs/draft/proposal_v4.md`) into an agent-executable
plan. Seven work items (R1–R7), each independently shippable. Same format as
`docs/features_v3.md`: every item has **Goal · Files · Steps · Verify**, and
reversible calls are marked **Decision baked in**.

This builds on the shipped v3 app: a unified rotating multi-brain overview
(`BrainOverview.tsx`), hover-expand neuron map (`NeuronMap.tsx`), session scoring
(`Converse.tsx`), a Settings tab, and a pre-app landing page.

## Assumptions (flagged for review — correct any before building)

- **A1 — Overview interaction (R3).** The notes say overview interaction should
  "really just be panning around… zooming/expanding what's at the center," and that
  selecting a brain happens **"only from the left sidebar,"** which then transitions
  into that brain's neuron map. This **replaces** the v3 two-stage lobe interaction
  (click lobe → focus, click center → open). After R3: the overview canvas is
  pan/zoom-only (no node click-to-focus); the **left sidebar** is the sole way to
  focus/open a brain. If you'd rather keep click-to-focus on lobes too, say so.
- **A2 — Real-time STT (R5).** "Words show up in real time as they speak" requires
  Deepgram **live streaming** (WebSocket), a different API from today's prerecorded
  `transcribeFile`. This is the largest single lift in v4. Plan keeps the existing
  prerecorded path as a fallback and layers streaming on top.
- **A3 — "3D orientation" (R3)** means *pseudo-3D* (perspective tilt + depth cues on a
  2D canvas), not a real 3D engine. We stay on `react-force-graph-2d` (Hard Rule 4 —
  never `react-force-graph` / 3D). No new graph library.
- **A4 — Icon set (R1).** Use `lucide-react`. Brain "icons" in data are currently
  emoji (`brain.icon`, e.g. `💰`); R1 covers **UI** icons (tabs, buttons). Emoji brain
  glyphs are left as-is except where R3 removes them from the overview canvas.

## Cross-cutting rules (honor in every item)

- Canvas colors read CSS variables (`cssVar(...)`), never hardcoded hex — already the
  pattern in `BrainOverview.tsx`/`NeuronMap.tsx`. New drawing code follows suit so dark
  mode keeps working.
- Node base sizes come from the settings `nodeSize` preset (`HOVER_BASE` /
  `HOVER_EXPANDED` in `lib/nodeState.ts`), never a private constant.
- `react-force-graph-2d` stays a dynamic `ssr:false` import (Hard Rule 4).

---

## R1 — Replace UI icons with lucide

**Goal:** Swap the hand-rolled inline `<svg>` icons for `lucide-react` so the icon set
is consistent and maintainable. Scope is **UI chrome** (tab/nav icons, the add-brain
"+", the record/send/stop glyphs), not the emoji brain glyphs in data.

**Files**
- `package.json` — add `lucide-react`.
- `components/tabDefs.tsx` — the six tab icons.
- `components/Sidebar.tsx` — the add-brain "+" icon (`:45`).
- `components/Converse.tsx` — record / stop / send glyphs (`:349`, `:353`, `:369`).

**Steps**
1. `npm install lucide-react`.
2. In `tabDefs.tsx`, replace each inline `<svg>` with a lucide component, mapping by
   meaning: overview→`Network` (or `Workflow`), chat→`MessagesSquare`,
   graph→`BrainCircuit` (or `Share2`), progress→`BarChart3`, how→`HelpCircle`,
   settings→`Settings`. Keep the `icon: ReactNode` shape; pass `size`/`strokeWidth`
   so they match the current 16px / 1.5 stroke weight.
3. Replace the add-brain "+" with `<Plus size={14} />`; the record mic with `<Mic />`,
   the speaking-stop with `<Square />`, and send with `<Send />` (or `SendHorizontal`).
   Preserve existing `className`s and the `fill="white"` look via `color`/CSS.
4. Grep for any remaining inline `<svg>` used as a UI control and convert it; leave
   data/emoji and the decorative graph canvas drawing untouched.

**Verify**
- App renders with no missing icons; tab bar, sidebar, and voice bar look equivalent.
- `grep -rn "<svg" components/` returns only canvas-illustration code, not chrome.
- No console warnings about icon sizing; dark mode icons inherit `currentColor`.

---

## R2 — Tab placement: brain tabs on top, meta tabs bottom-left

**Goal:** Keep **How it works** and **Settings** pinned to the bottom-left sidebar;
put **Overview, Converse, Neuron map, Progress** on the top tab bar. Today both the
top bar (`Feynman.tsx:195`) and the sidebar nav (`Sidebar.tsx:52`) render the *entire*
`TAB_DEFS`, so every tab shows in both places.

**Files**
- `components/tabDefs.tsx` — split the list into two groups.
- `components/Feynman.tsx` — top bar renders the "primary" group only.
- `components/Sidebar.tsx` — nav-section renders the "meta" group only.

**Steps**
1. In `tabDefs.tsx` add a `group: 'primary' | 'meta'` field (or export two arrays:
   `PRIMARY_TABS = [overview, chat, graph, progress]`, `META_TABS = [how, settings]`).
   Keep a combined `TAB_DEFS` if anything else imports it.
2. `Feynman.tsx` top `.tabs` bar maps `PRIMARY_TABS`.
3. `Sidebar.tsx` `.nav-section` maps `META_TABS`, rendered at the **bottom** of the
   sidebar (use `margin-top:auto` / flex spacer so it sits at the bottom-left).
4. Selection state (`tab` / `setTab`) is unchanged — both groups drive the same
   `TabId`. Confirm `how`/`settings` still hide/show the right panel in `Feynman.tsx`
   (the `h(t)` panel gating already keys off `tab`).

**Verify**
- Top bar shows exactly Overview · Converse · Neuron map · Progress.
- Bottom-left sidebar shows exactly How it works · Settings, pinned to the bottom.
- Clicking either still switches panels; the active highlight tracks correctly.

---

## R4 — Landing page: logo, denser & faster field, more spacing

**Goal:** Add the logo to the landing hero; make the background neuron field denser,
rotate a bit faster, and spread nodes farther apart.

**Files**
- `components/LandingPage.tsx` — place the `Logo` in the hero.
- `components/LandingGraph.tsx` — node count, rotation speed, spacing.

**Steps**
1. **Logo.** Render `<Logo />` (`components/Logo.tsx`) above the headline in
   `LandingPage.tsx`, sized for the hero. Keep it inside the readable radial-fade
   overlay so it sits above the field.
2. **More nodes.** Expand `DEMO_NODES`/`DEMO_LINKS` in `LandingGraph.tsx` from ~12 to
   ~24–30 finance-flavored concepts with plausible links. Purely decorative — no Redis.
3. **Faster rotation.** Bump the per-frame angle increment (`rotationRef.current += 0.02`,
   `:72`) to ~`0.05`. Keep it a `requestAnimationFrame` transform on the wrapper, never a
   CSS animation on the graph (it repaints on its own tick).
4. **Larger spacing.** Strengthen the charge so nodes spread: raise the
   `onEngineStop` charge from `-300` toward `-500..-700` (`:102`), and/or set a link
   `distance`. Tune so labels don't overlap at the denser count. The notes call out
   spacing "specifically in the landing page," so do **not** change the main map's
   spacing here.

**Verify**
- Logo is visible and crisp in the hero, above the field.
- Field is visibly denser (~2× nodes) yet readable; nodes are more spread out than
  before; rotation is noticeably faster but still smooth.
- Main neuron-map spacing is unchanged.

---

## R5 — Deepgram real-time: live transcription + reactive voice element

**Goal:** When the user speaks, show their words appearing live, and replace the text
input bar with a reactive voice element (a listening/level-reactive control) during a
session. (See assumption **A2** — this is the biggest item.)

**Files**
- `lib/deepgram.ts` — add a live-streaming helper / token issuance.
- `app/api/deepgram-token/route.ts` — **new**: mint a short-lived Deepgram key for the
  browser WebSocket (don't ship the master key to the client).
- `components/Converse.tsx` — live transcription UI + reactive voice bar.
- (Keep `app/api/transcribe/route.ts` as the prerecorded fallback.)

**Steps**
1. **Streaming transport.** Use Deepgram live STT (`nova-3`, `smart_format`,
   `interim_results: true`). Browser opens a WebSocket to Deepgram and streams mic audio
   from `MediaRecorder`/`AudioWorklet`. **Verify the exact live API against the installed
   `@deepgram/sdk` (^3.9)** — Deepgram has changed `listen.live` across versions.
2. **Token route.** `POST /api/deepgram-token` returns a short-TTL scoped key (Deepgram
   projects → temporary keys) so the WebSocket auths without exposing
   `DEEPGRAM_API_KEY`. Secrets stay server-side (Hard Rule on secrets).
3. **Live transcript UI.** As interim results arrive, render the growing transcript in
   the message stream (a live "user" bubble that updates in place). On the final result,
   freeze it and feed it into the existing `evaluateText(transcript)` path — scoring,
   feedback, TTS, and session accumulation are unchanged.
4. **Reactive voice element.** While recording, replace the `.chat-input` text field
   (`Converse.tsx:358-367`) with a reactive control — e.g. an animated mic orb whose
   level follows the input amplitude (read from a `WebAudio AnalyserNode`). When idle,
   the text input returns (typing must still work). The record button drives
   start/stop; the orb is the visual "I'm listening" state.
5. **Graceful fallback.** If the WebSocket fails (token error / unsupported browser),
   fall back to the current record→stop→`/api/transcribe` prerecorded flow so the core
   loop never breaks.

**Verify**
- Speaking shows words appearing live (interim) and settling on a final transcript that
  then gets scored exactly as today.
- During recording the text bar is replaced by the reactive voice element that visibly
  responds to voice level; idle restores typing.
- Killing the network mid-record falls back to prerecorded transcription, not a crash.
- No Deepgram master key appears in client network traffic.

**Decision baked in (reversible):** evaluation still runs on the *final* transcript
once (not per interim chunk) — interims are display-only, keeping Claude/embeddings
cost unchanged.

---

## R6 — Neuron map node fixes

**Goal:** Five concrete neuron-map fixes from the notes: more-visible labels, fix the
"drag an empty node and everything vanishes" bug, zoom-to-fit on load, suggestion nodes
sized like real nodes, and no node overlap.

**Files**
- `components/NeuronMap.tsx` — render loop, drag, zoom-to-fit, collision force.
- `lib/nodeState.ts` — label color/size source if needed.

**Steps**
1. **More visible text.** In `nodeCanvasObject` the label fades in with `t` and uses a
   thin `--bg` halo + white fill for non-untouched (`:224-235`). Increase contrast:
   raise the label font weight/size a touch, thicken the halo stroke, and for untouched
   nodes use a darker text token than `#9CA3AF`. Ensure the halo reads from `--bg`
   (dark-mode safe), not the literal `#FAFAF9` currently hardcoded at `:230`.
2. **Fix the drag-vanish bug.** Repro: drag an "empty" (untouched/suggestion) node —
   the graph sometimes blanks. `enableNodeDrag` is on by default and suggestion nodes
   are ephemeral (`__suggestion`, regenerated via `useMemo` on `suggestions`); dragging
   one, or a drag that perturbs the sim, can null out `node.x/x0` and the frame divides
   by a stale `globalScale`/cursor. Fixes to apply and confirm: (a) guard
   `nodeCanvasObject` against `node.x == null` (skip the frame for that node); (b) make
   suggestion nodes **non-draggable** (or convert the same way real nodes persist
   identity); (c) ensure `cursorRef`/`screen2GraphCoords` never runs before
   `fgRef.current` is ready. Write a manual repro in **Verify** and confirm it's gone.
3. **Zoom-to-fit on load.** `NeuronMap` never calls `zoomToFit`. Add an
   `onEngineStop`/post-mount `fgRef.current.zoomToFit(400, 60)` (and re-fit when the
   graph tab becomes visible, mirroring `BrainOverview`'s `fitView`). Coordinate with
   R3 so the overview→map handoff opens already framed.
4. **Suggestion node size parity.** Suggestion neurons draw at a fixed `sr=9`
   (`:180-181`) while real nodes are `HOVER_BASE` dots that expand on hover. Make
   suggestions render at the **same base radius** as real nodes (`BASE_R`) and, ideally,
   participate in the same hover-expand so they read as peers, keeping only the dotted
   purple outline + "+" affordance to mark them as suggestions.
5. **No overlap.** Add a d3 collision force so nodes can't sit on top of each other:
   `fgRef.current.d3Force('collide', d3.forceCollide(r))` with `r` = the max rendered
   radius (expanded) plus a small pad. Register it once data is in (same pattern as
   `BrainOverview`'s cluster force) and reheat. Tune so layout still settles.

**Verify**
- Labels are clearly readable in both light and dark mode, including untouched nodes.
- Repro (drag an untouched node and a suggestion node around for several seconds): the
  graph never blanks; other nodes stay put.
- Opening a brain frames all nodes to fit the viewport (no manual zoom needed).
- Suggestion nodes are the same size as real nodes on screen.
- Nodes visibly repel to non-overlapping positions; no two dots overlap at rest.

---

## R7 — Delete specific brains

**Goal:** Let the user delete a brain (not just clear its concepts). The backend helper
`deleteBrain()` already exists (`lib/brains.ts:101`) — wire a DELETE route and a sidebar
control.

**Files**
- `app/api/brains/route.ts` — add a `DELETE` handler.
- `components/Sidebar.tsx` — per-brain delete affordance.
- `components/Feynman.tsx` — `onDeleteBrain` handler + state cleanup.

**Steps**
1. **Route.** Add `export async function DELETE(req)` to `app/api/brains/route.ts`:
   read `brainId` from the query/body, `resolveBrainId`, call `deleteBrain(redis,
   USER_ID, brainId)`, return `{ deleted }`. (Mirror the existing GET/POST style; this
   reuses the same helper `/api/reset` uses, but also drops the registry entry.)
2. **Sidebar UI.** In each `.brain-item` (`Sidebar.tsx:33-43`) add a small delete
   control (lucide `Trash2`, R1) revealed on hover, with `onClick` stopping propagation
   so it doesn't also switch brains. Pass an `onDeleteBrain(id)` prop down.
3. **Handler + cleanup.** In `Feynman.tsx`, `onDeleteBrain(id)`: `window.confirm`,
   `fetch('/api/brains?brainId='+id, { method:'DELETE' })`, then `loadBrains()`. If the
   deleted brain was `activeBrainId`, reset `activeBrainId` to the first remaining brain
   (or `null`), clear `selected`/`graph`, and send the user to the overview
   (`setTab('overview')`, `setOverviewFocusId(null)`).
4. Distinguish from **Clear**: "Clear" (existing `clearBrain` → `/api/reset`) empties a
   brain's concepts but keeps it; "Delete" removes the brain entirely. Keep both.

**Verify**
- Deleting a brain removes it from the sidebar and the overview; its Redis keys are
  gone (`concept:`/`edges:`/`mastery:`/`memory:`/`brain:` for that id) and it's dropped
  from `brains:${USER_ID}`.
- Deleting the active brain leaves the app in a coherent state (another brain selected
  or a clean empty/overview state), no crash.
- "Clear" still only empties concepts; "Delete" still removes the brain.

---

## R3 — Multibrain overview redesign (pseudo-3D, globular lobes, pan/zoom, sidebar-driven focus)

**Goal:** Rework the overview into a single pannable/zoomable rotating field — "a globe
under a magnifying glass." Remove emoji brain icons and all per-node text from the
overview. Brains are globular (not circular) dotted lobes with a small label that
follows the lobe's curve, holding only identical small node-dots inside. Focusing a
brain is driven **from the left sidebar** and smoothly flattens/zooms into that brain.
(See assumption **A1**.)

**Files**
- `components/BrainOverview.tsx` — the whole render/interaction path.
- `lib/overview.ts` — lobe-hull / blob helper; keep `brainAnchors`.
- `components/Feynman.tsx` — `switchBrain` already sets `overviewFocusId`; wire the
  smooth overview→neuron-map handoff.

**Steps**
1. **Enable pan/zoom.** Set `enableZoomInteraction` and `enablePanInteraction` to
   `true` (currently `false`, `:240-242`). Because the wrapper is CSS-rotated, the
   canvas hit-test is offset — so **gate rotation off whenever the user is interacting
   or a brain is focused** (the existing `hoveringRef`/`focusedRef` easing already
   zeroes rotation; extend it to also stop while panning/zooming). Keep `enableNodeDrag`
   off.
2. **Remove brain emoji icons.** Delete the emoji draw (`brain.icon`, `:297`). The lobe
   shows only its dotted glob + a small curved name label.
3. **Globular lobes.** Replace the plain `arc` hull (`:281-285`) with a blobby outline:
   compute the per-brain node hull (reuse `centroid` + node positions) and stroke a
   smooth closed curve (Catmull-Rom / quadratic-bezier through hull points, or a
   summed-radii metaball). Keep the dotted stroke in `--purple-border` and the faint
   `--purple-bg` fill. Add a small per-brain wobble seeded by brain id so lobes look
   organic, not circular. **Decision baked in (reversible):** a convex-hull-with-noise
   blob is enough; skip true metaballs unless they're cheap.
4. **Curved brain label.** Draw the brain name as text along the top arc of its bounding
   glob (rotate the canvas per-glyph along the curve), in `--text`, small. No emoji.
5. **No node text in overview.** Remove the focused-brain node-name labels (`:321-327`).
   Nodes are uniform small dots (`r=4`) colored by status; that's all that's inside a
   lobe. Text reappears only in the neuron map (R6).
6. **Pseudo-3D orientation (A3).** Add depth cues: tilt the field with a slight vertical
   perspective squash (scale y by ~0.6 around center), and size/alpha node-dots by a
   per-node depth derived from their position (front dots larger/opaque, back dots
   smaller/faded). Keep it subtle — readability over spectacle.
7. **Sidebar-driven focus + transition (A1).** Remove the canvas `onNodeClick`
   focus/open behavior; keep `onBackgroundClick` to clear focus. Selecting a brain in
   the **left sidebar** (`switchBrain` → sets `overviewFocusId`) should: stop rotation,
   `zoomToFit` onto that lobe, dim others, then hand off to the neuron map. Implement
   the handoff as: on sidebar-select while on the overview tab, run the focus zoom, then
   after the zoom settles switch `tab` to `graph` (the brain's neuron map). Make the
   zoom duration and the tab switch feel continuous (the map opens already framed via
   R6's zoom-to-fit). **Decision baked in (reversible):** auto-advance to the neuron map
   on sidebar-select; if the user wants to stay on a focused overview, gate the
   handoff behind a second click.

**Verify**
- Overview pans and zooms with mouse/trackpad; it rotates slowly only when idle and
  un-focused, and clicks/drags don't land on the wrong lobe.
- No emoji icons and no per-node text anywhere in the overview; lobes look globular,
  each with a small name label hugging its curve.
- Selecting a brain in the left sidebar zooms into its lobe and transitions into that
  brain's neuron map smoothly (no jarring jump / reload flash).
- Dark mode: lobes, labels, and dots all theme correctly (CSS vars).

---

## Suggested build order

1. **R1** (lucide) and **R2** (tab placement) — small, low-risk, unblock the visual
   refresh.
2. **R7** (delete brains) — tiny, backend helper already exists.
3. **R6** (neuron-map fixes) — fixes user-visible bugs; pairs with R3's framing.
4. **R4** (landing polish) — independent, can land anytime.
5. **R5** (Deepgram real-time) — biggest lift.
6. **R3** (overview redesign) — largest UI change; do last. Depends on R6's
   zoom-to-fit for the overview→map handoff.

R1, R2, R4, R7 are independent and can be parallelized. R3 is last and should follow R6.
