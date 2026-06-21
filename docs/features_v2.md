# Proposal v2 — Refined Feature Breakdown

Each feature below is scoped to a single feature branch that an agent can implement, verify, and merge independently. Branches are ordered so that shared dependencies land first. Every feature lists: **problem**, **scope (in/out)**, **key files**, **acceptance criteria**, and **dependencies**.

Stack reference: Next.js 15 / React 19, Redis (vector-indexed), Voyage embeddings, Claude (forced tool use), `react-force-graph-2d`. User is hardcoded to `demo` (`lib/constants.ts`). Test runner: `npm test` (vitest). Dev: `npm run dev`.

---

## F1 — Custom "New Brain" modal (replace native prompt)

**Branch:** `feat/new-brain-modal`
**Proposal source:** bullet 2

**Problem.** New-brain creation uses `window.prompt()` (`components/Feynman.tsx:76-89`), which breaks the light-theme look and offers no icon choice or validation.

**Scope — in:**
- New `components/NewBrainModal.tsx`: themed modal with name input, optional emoji/icon picker (a small fixed palette is fine, default `🧠`), Create / Cancel actions.
- Inline validation: non-empty name, trim, max length matching the slug cap (40 chars), disable Create while the POST is in flight.
- Wire into `Feynman.tsx`, replacing the `window.prompt` path. Surface API errors in the modal instead of an alert.
- Reuse existing CSS variables / modal styling conventions from `app/globals.css`.

**Scope — out:** No backend changes (`POST /api/brains` already accepts `{ name, icon }`). No rename/delete UI.

**Key files:** `components/Feynman.tsx`, new `components/NewBrainModal.tsx`, `app/globals.css`.

**Acceptance criteria:**
- Clicking "New brain" opens the themed modal, not the browser prompt.
- Creating a brain with a chosen icon persists that icon (visible in sidebar after reload).
- Empty/whitespace name cannot be submitted; API failure shows an in-modal error and keeps the modal open.
- Esc / Cancel / backdrop click closes without creating.

---

## F2 — Continue adding notes to an existing brain

**Branch:** `feat/append-notes`
**Proposal source:** bullet 4

**Problem.** `NotesPanel` only appears when a brain has zero concepts. After the first build there is no way to add more notes/nodes to an existing brain.

**Scope — in:**
- Make `NotesPanel` reachable for non-empty brains (e.g. an "Add notes" affordance on the Neuron Map tab, or always-available panel toggle).
- Confirm `/api/extract` is **additive**: extracting from new notes must merge concepts/edges into the existing brain, not wipe it. Audit `app/api/extract/route.ts` and `lib/extract.ts`; if it overwrites, change to upsert (skip/merge concepts whose id already exists, preserving their `masteryScore`/`status`).
- After a successful add, reload the graph so new nodes appear at score 0.

**Scope — out:** No editing/deleting of individual existing nodes (separate future feature). No re-embedding of unchanged concepts.

**Key files:** `components/Feynman.tsx`, `components/NotesPanel.tsx`, `app/api/extract/route.ts`, `lib/extract.ts`.

**Acceptance criteria:**
- A test in `tests/` proves extracting twice into one brain yields the **union** of concepts and preserves mastery scores of pre-existing concepts.
- UI: with a populated brain, the user can open the notes panel, submit new notes, and see new neurons added without losing existing ones or their colors.

---

## F3 — Deterministic scoring tool (continuous score, computed not free-typed)

**Branch:** `feat/scoring-tool`
**Proposal source:** bullet 3

**Problem.** Today Claude returns `masteryScore` (0-100) directly as a single number it picks (`lib/evaluate.ts`). The proposal wants the LLM to emit **rubric components** and a **tool** to compute a continuous score deterministically, rather than the model doing end-to-end arithmetic.

**Scope — in:**
- Change the evaluation tool schema so Claude returns the **rubric sub-scores** it already reasons about — core accuracy (0-30), key relationships (0-30), absence of misconceptions (0-20), connects-to-related (0-20) — plus the qualitative fields (`correct`, `missing`, `misconceptions`, `feedbackMessage`, `followUpQuestion`).
- Add `lib/score.ts` with a pure function `computeMastery(components) -> number` that sums/normalizes to a continuous 0-100 (float, not bucketed). This is the "tool for Claude to compute" — deterministic, unit-testable.
- `app/api/evaluate/route.ts` calls `computeMastery` instead of trusting a model-emitted total. Persist the continuous score.
- Keep `masteryScore` in the return payload for UI compatibility.

**Scope — out:** No change to status thresholds/colors (`lib/nodeState.ts`) beyond accepting a float. Decay is **F4**, not here.

**Key files:** `lib/evaluate.ts`, new `lib/score.ts`, `app/api/evaluate/route.ts`, `tests/score.test.ts` (new).

**Acceptance criteria:**
- Unit tests for `computeMastery` cover min (0), max (100), and mid cases, and confirm it is continuous (e.g. distinct inputs → distinct outputs, no rounding to buckets).
- Evaluation flow still returns a valid `EvaluationResult`; existing evaluate tests pass (update them for the new schema).
- The final stored score equals `computeMastery(...)` of the model's components, not a free-typed total.

**Dependency:** none, but **F4 builds on this.** Land F3 first.

---

## F4 — Decaying mastery (history-aware score)

**Branch:** `feat/score-decay`
**Proposal source:** bullet 1

**Problem.** Each evaluation overwrites the node's score. A strong explanation 10 turns ago is forgotten, and one weak current turn can tank the score. We want a decaying/blended score so past mastery still counts and a single bad turn doesn't crater it.

**Scope — in:**
- Blend the new per-turn score with the prior stored score using a decay/EWMA rule: `new = α·current + (1-α)·prior`, with `α` tuned so a single turn moves the score partially (propose `α ≈ 0.4`, documented and centralized as a constant). Optionally weight by recency if multiple attempts.
- Implement as a pure function in `lib/score.ts` (e.g. `blendMastery(prior, current, attempts)`), unit-tested.
- `app/api/evaluate/route.ts` reads the prior score from Redis (`concept:${userId}:${brainId}:${conceptId}` / `mastery:` sorted set) and writes the blended result.
- Track attempt count per concept (new field on the concept hash) so early attempts can ramp faster if desired.

**Scope — out:** No UI surfacing of history/sparklines (future). No cross-concept decay.

**Key files:** `lib/score.ts`, `app/api/evaluate/route.ts`, `lib/brains.ts` (if adding an `attempts` field/key helper), `tests/score.test.ts`.

**Acceptance criteria:**
- Unit tests: a single low current score after a high prior yields a score **between** the two (not the low value); repeated high scores converge upward; repeated low scores decay downward gradually.
- Manual: explain a concept well, then poorly — the node color degrades partially, not all the way to "weak".

**Dependency:** **F3** (continuous `computeMastery`).

---

## F5 — Proximity-based label decluttering on the neuron map

**Branch:** `feat/map-proximity-labels`
**Proposal source:** bullet 7 (the "neuron map cluttered" bullet)

**Problem.** All node labels render at once, cluttering the graph. We want only nodes within a threshold radius of the cursor to show their text; everything else collapses to a colored dot.

**Scope — in:**
- In `components/NeuronMap.tsx`, track the cursor position in graph coordinates (the lib exposes pointer/hover and coordinate transforms). In the node-canvas paint callback, draw the label only when the node is within a threshold pixel/graph radius of the cursor; otherwise draw just the colored circle.
- Threshold as a named constant; selected/hovered node always shows its label regardless of distance.
- Keep existing color/size logic from `lib/nodeState.ts` untouched.

**Scope — out:** No change to physics/layout, legend, or stats badge.

**Key files:** `components/NeuronMap.tsx`.

**Acceptance criteria:**
- With the cursor in one region, only nearby labels are visible; moving the cursor reveals/hides labels smoothly.
- The selected node keeps its label even when the cursor is far.
- No regression in click-to-select or recoloring-on-evaluation behavior.

---

## F6 — Coverage-suggestion nodes (dotted perimeter neurons)

**Branch:** `feat/coverage-suggestions`
**Proposal source:** bullet 5

**Problem.** Once a user demonstrates mastery on a concept, there's nothing nudging them to extend it. We want **dotted "suggestion" nodes** on the brain's perimeter that grow coverage off of high-mastery nodes (≈60-70%+), encouraging the user to learn adjacent concepts.

**Scope — in:**
- New endpoint `app/api/suggest/route.ts`: select concepts above a mastery threshold (configurable, default 65), ask Claude (forced tool use, consistent with `lib/extract.ts`/`lib/evaluate.ts` patterns) to propose 1-3 adjacent concepts per high-mastery node that would extend coverage. Return them as **ephemeral suggestion nodes** linked to their source node — do **not** persist them as real concepts.
- In `components/NeuronMap.tsx`, render suggestion nodes with a dotted/outlined style (visually distinct from real nodes) positioned around the perimeter / attached to their source.
- Clicking a suggestion node promotes it into the brain (reuse the extract/upsert path from **F2** to add it as a real concept at score 0), then refreshes the graph.

**Scope — out:** No auto-acceptance; suggestions are opt-in. No suggestions from low-mastery nodes.

**Key files:** new `app/api/suggest/route.ts`, new `lib/suggest.ts`, `components/NeuronMap.tsx`, `components/Feynman.tsx`, `tests/suggest.test.ts` (new).

**Acceptance criteria:**
- API returns suggestions only for nodes ≥ threshold; unit test mocks Claude and asserts the threshold filter and the source-link shape.
- Suggestion nodes render with a clearly dotted style and are not counted in real stats (neuron count / avg mastery).
- Clicking a suggestion adds a real node (verified after reload) and the suggestion disappears.

**Dependency:** **F2** (additive upsert path) for promotion; relies on real mastery scores existing.

---

## F7 — Multi-brain overview dashboard (brains in vector space)

**Branch:** `feat/brain-overview`
**Proposal source:** bullet 6 (last bullet)

**Problem.** With multi-brain support there's no birds-eye view. We want a landing/overview tab showing **all brains positioned in vector space**, with **dotted connectors** between related brains (e.g. Math ↔ Personal Finance), laid out to evoke a brain shape for a striking front page.

**Scope — in:**
- New tab `'overview'` in `components/tabDefs.tsx` + `components/Feynman.tsx`, new `components/BrainOverview.tsx` using `react-force-graph-2d` (consistent with `NeuronMap`).
- New endpoint `app/api/overview/route.ts`: for each brain, compute a **brain-level embedding** (e.g. mean of its concept embeddings already in Redis), reduce to 2D for layout (force layout seeded by pairwise cosine similarity is acceptable — no heavy dim-reduction dep required), and return brains + pairwise similarity scores.
- Draw a dotted edge between brains whose similarity exceeds a threshold; node size ∝ concept count or avg mastery. Clicking a brain opens it (sets active brain + switches to graph tab).
- Empty/single-brain states handled gracefully.

**Scope — out:** No new embedding model; reuse stored concept embeddings. The "brain silhouette" shaping is a best-effort layout/legend touch, not a hard requirement — prioritize the similarity graph working.

**Key files:** new `components/BrainOverview.tsx`, new `app/api/overview/route.ts`, new `lib/overview.ts`, `components/tabDefs.tsx`, `components/Feynman.tsx`, `tests/overview.test.ts` (new).

**Acceptance criteria:**
- Unit test: brain-level embedding = mean of concept vectors; pairwise similarity is symmetric and in [-1, 1]; edges appear only above threshold.
- UI: with ≥2 brains, the overview renders one node per brain with dotted connectors between similar brains; clicking a brain navigates into it.
- Brains with zero concepts don't crash the layout.

**Dependency:** none (multi-brain backend + embeddings already exist).

---

## Suggested merge order

1. **F1** new-brain modal — isolated UI, no deps.
2. **F2** append-notes — unlocks the upsert path F6 reuses.
3. **F3** scoring-tool — foundation for F4.
4. **F4** score-decay — builds on F3.
5. **F5** proximity-labels — isolated map rendering.
6. **F6** coverage-suggestions — needs F2.
7. **F7** brain-overview — independent; can run in parallel any time.

F1, F5, and F7 are mutually independent and can be parallelized. F3→F4 and F2→F6 are the two ordered chains.

## Open questions for the user

- **F4 decay factor:** is `α ≈ 0.4` (a single turn moves ~40% toward the new score) the right feel, or do you want faster/slower convergence?
- **F6 promotion:** should clicking a suggestion immediately add it, or open a confirm step? Spec assumes immediate-add.
- **F7 brain shape:** how literal should the "brain silhouette" be? Spec treats it as a best-effort aesthetic layer over a working similarity graph.
