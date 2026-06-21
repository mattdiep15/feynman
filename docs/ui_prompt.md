# Feynman — UI implementation prompt

Build the frontend for Feynman, a voice-first learning agent. This document specifies the full design system, component structure, layout, and all visual rules. Follow it exactly — do not invent colors, spacing, or component patterns not listed here.

---

## Design system

### Color tokens

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#FAFAF9` | Main app background |
| Surface | `#F5F5F4` | Sidebar, panels, cards, graph container |
| Border | `#E5E7EB` | Card borders, dividers, input borders |
| Text Primary | `#111827` | Headings, labels, primary text |
| Text Secondary | `#6B7280` | Descriptions, metadata, subtitles |
| Text Muted | `#9CA3AF` | Inactive icons, placeholders, disabled |
| Purple | `#7C3AED` | Primary buttons, active nav, primary actions |
| Purple Soft | `#A78BFA` | Hover states, secondary accents |
| Purple Background | `#F3F0FF` | Selected sidebar item, highlighted cards |
| Purple Border | `#C4B5FD` | Improving node border, purple card borders |
| Success Dark | `#16523A` | Mastered text, success button text |
| Success | `#22C55E` | Mastered node border, check icons, progress |
| Success Background | `#ECFDF5` | Mastered node fill, success cards |
| Amber | `#F59E0B` | Learning state nodes |
| Amber Dark | `#D97706` | Learning text |
| Amber Background | `#FFFBEB` | Learning node fill |
| Amber Border | `#FDE68A` | Learning node border |
| Red | `#EF4444` | Weak/confused state, errors |
| Red Background | `#FEF2F2` | Weak node fill |
| Red Border | `#FCA5A5` | Weak node border |
| Unlearned Fill | `#FAFAF9` | **Hollow/transparent** — untouched nodes use app background color as fill, making them appear hollow against the graph background |
| Unlearned Border | `#D1D5DB` | Border for untouched/new nodes |
| Unlearned Text | `#9CA3AF` | Label text on untouched nodes |

### Gradients

```css
/* Primary purple button */
background: linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%);

/* Success/mastered button */
background: linear-gradient(135deg, #22C55E 0%, #16523A 100%);

/* Subtle surface */
background: linear-gradient(135deg, #FFFFFF 0%, #F5F5F4 100%);
```

### Typography
- Font: `system-ui, -apple-system, sans-serif`
- Weights: 400 (regular), 500 (medium) only — never 600 or 700
- Base size: 14px body, 13px UI text, 11px captions

### Spacing & borders
- Border radius: 6px (small elements), 8px (inputs, pills), 10–12px (cards)
- Borders: `0.5px solid #E5E7EB` everywhere — never 1px on card/panel borders
- Internal padding: 16px standard, 20px for main panels

---

## Neuron node states

This is the most important visual rule in the app. Every concept node on the neuron map has exactly one of five states based on `masteryScore` (0–100).

### State definitions

| State | Score | Fill | Border | Text color | Shape |
|-------|-------|------|--------|------------|-------|
| **Untouched** | 0 (never attempted) | `#FAFAF9` (hollow — same as bg) | `#D1D5DB` | `#9CA3AF` | Circle, no fill visible |
| **Weak** | 1–39 | `#FEF2F2` | `#FCA5A5` | `#EF4444` | Circle with red tint |
| **Learning** | 40–69 | `#FFFBEB` | `#FDE68A` | `#D97706` | Circle with amber tint |
| **Improving** | 70–84 | `#F3F0FF` | `#C4B5FD` | `#7C3AED` | Circle with purple tint |
| **Mastered** | 85–100 | `#ECFDF5` | `#22C55E` | `#16523A` | Circle with green tint |

### Untouched nodes — hollow treatment

**Untouched nodes (score = 0, never attempted) must appear hollow — not filled, not grey.**

In `react-force-graph-2d`, implement using the canvas `nodeCanvasObject` prop:

```ts
nodeCanvasObject={(node, ctx, globalScale) => {
  const label = node.name
  const fontSize = 12 / globalScale
  const r = Math.max(8, (node.masteryScore / 100) * 20 + 10)

  if (node.status === 'untouched') {
    // Hollow: draw border only, no fill
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.strokeStyle = '#D1D5DB'
    ctx.lineWidth = 1.5 / globalScale
    ctx.stroke()
    // No ctx.fill() call
  } else {
    // All other states: filled circle
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = nodeFill(node.status)
    ctx.fill()
    ctx.strokeStyle = nodeBorder(node.status)
    ctx.lineWidth = 1.5 / globalScale
    ctx.stroke()
  }

  // Label
  ctx.font = `${node.status === 'untouched' ? '400' : '500'} ${fontSize}px system-ui`
  ctx.fillStyle = nodeTextColor(node.status)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, node.x, node.y)
}}
nodeCanvasObjectMode={() => 'replace'}
```

### Helper functions

```ts
export function nodeFill(status: string): string {
  switch (status) {
    case 'weak':      return '#FEF2F2'
    case 'learning':  return '#FFFBEB'
    case 'improving': return '#F3F0FF'
    case 'mastered':  return '#ECFDF5'
    default:          return 'transparent'  // untouched — hollow
  }
}

export function nodeBorder(status: string): string {
  switch (status) {
    case 'weak':      return '#FCA5A5'
    case 'learning':  return '#FDE68A'
    case 'improving': return '#C4B5FD'
    case 'mastered':  return '#22C55E'
    default:          return '#D1D5DB'  // untouched
  }
}

export function nodeTextColor(status: string): string {
  switch (status) {
    case 'weak':      return '#EF4444'
    case 'learning':  return '#D97706'
    case 'improving': return '#7C3AED'
    case 'mastered':  return '#16523A'
    default:          return '#9CA3AF'  // untouched
  }
}

export function masteryToStatus(score: number, everAttempted: boolean): string {
  if (!everAttempted || score === 0) return 'untouched'
  if (score < 40)  return 'weak'
  if (score < 70)  return 'learning'
  if (score < 85)  return 'improving'
  return 'mastered'
}
```

**Critical:** `untouched` and `score=0-after-attempt` (weak) must be tracked separately. A node that has been attempted and scored 0 is `weak` (red), not `untouched` (hollow). Store `everAttempted: boolean` on each concept node in Redis.

### Legend (shown in neuron map toolbar)

```
○  Untouched   (hollow circle, #D1D5DB border)
●  Weak        (#FEF2F2 fill, #FCA5A5 border)
●  Learning    (#FFFBEB fill, #FDE68A border)
●  Improving   (#F3F0FF fill, #C4B5FD border)
●  Mastered    (#ECFDF5 fill, #22C55E border)
```

The untouched legend dot must also be hollow — a circle with only a border, no fill.

---

## Layout

Full-viewport two-column layout:

```
┌─────────────────────────────────────────────────────┐
│  sidebar (220px)  │  main (flex: 1)                 │
│                   │  ┌─ tabs ──────────────────────┐│
│  logo             │  │ Converse · Neuron map · ... ││
│  ─────────────── │  └─────────────────────────────┘│
│  my brains        │  ┌─ content panel ─────────────┐│
│  > Personal Fin.  │  │                             ││
│  > Math           │  │  (active tab content)       ││
│  + new brain      │  │                             ││
│                   │  │                             ││
│  ─────────────── │  └─────────────────────────────┘│
│  nav              │                                 │
│  Converse         │                                 │
│  Neuron map       │                                 │
│  Progress         │                                 │
│  How it works     │                                 │
└─────────────────────────────────────────────────────┘
```

---

## Tabs

Four tabs in the main area. Tabs and sidebar nav stay in sync — clicking either switches the active view.

| Tab | Sidebar label | Icon (Tabler) |
|-----|--------------|---------------|
| Converse | Converse | `ti-message` |
| Neuron map | Neuron map | `ti-network` |
| Progress | Progress | `ti-chart-bar` |
| How it works | How it works | `ti-info-circle` |

Active tab: `color: #7C3AED`, `border-bottom: 2px solid #7C3AED`, `font-weight: 500`
Inactive tab: `color: #6B7280`, `border-bottom: 2px solid transparent`

---

## Tab: Converse

The main teachback interface. Three zones stacked vertically:

### Message thread
- Feynman messages: `background: #F3F0FF`, left-aligned, `border-bottom-left-radius: 3px`
- User messages: `background: #7C3AED`, `color: white`, right-aligned, `border-bottom-right-radius: 3px`
- Max width: 340px per bubble
- Feynman avatar: 28px circle, `background: #7C3AED`, white "F"
- User avatar: 28px circle, `background: #E5E7EB`

### Score badges (inside Feynman bubbles after evaluation)
```
↑ 34 → 58%     background: #ECFDF5  color: #16523A   (score increase)
Missing: X      background: #FEF2F2  color: #EF4444   (gap identified)
```

### Voice bar (bottom, always visible)
Left to right:
1. **Concept chip** — shows active concept: `background: #F3F0FF`, `border: 0.5px solid #C4B5FD`, `color: #7C3AED`, pill shape
2. **Record button** — 40px circle, `background: linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)`, mic icon white. When recording: pulse animation, red dot indicator
3. **Text input** — `flex: 1`, fallback for typing instead of speaking, placeholder: "Or type your explanation…"
4. **Send button** — 32px, purple, arrow icon

---

## Tab: Neuron map

### Toolbar
- Left: brain name + "neuron map" label, `color: #6B7280`, `font-size: 12px`
- Right: legend with hollow/filled dots for each state

### Graph area
- Background: `#FAFAF9`
- Library: `react-force-graph-2d` — **always dynamic import with `ssr: false`**

```ts
// components/NeuronMap.tsx
import dynamic from 'next/dynamic'
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div>Loading neuron map…</div>,
})
```

- Node rendering: use `nodeCanvasObject` (see Neuron node states above) — never use `nodeColor` prop alone, it can't render hollow nodes
- Node size: scale with mastery — untouched nodes are smallest, mastered are largest
- Edge color: `#E5E7EB`, width 1px
- Click on node → sets active concept in Converse tab, switches to Converse tab

### Node size formula
```ts
const nodeRadius = (node: ConceptNode) =>
  node.status === 'untouched'
    ? 10                                          // small, hollow
    : Math.max(12, (node.masteryScore / 100) * 28 + 10)  // scales with mastery
```

---

## Tab: Progress

### Summary cards (3-column grid)
```
avg mastery    sessions    mastered
   55%            12        2 / 7
```
Cards: `background: #F5F5F4`, `border-radius: 8px`, `padding: 12px`
Label: `font-size: 11px`, `color: #9CA3AF`
Value: `font-size: 22px`, `font-weight: 500`
Mastered count: `color: #22C55E`

### Concept list
Each row: concept name · progress bar (100px wide, 6px tall) · percentage · status pill

Progress bar fill colors match node state colors.

Status pills:
```
Mastered    background: #ECFDF5  color: #16523A
Improving   background: #F3F0FF  color: #7C3AED
Learning    background: #FFFBEB  color: #D97706
Weak        background: #FEF2F2  color: #EF4444
Untouched   background: #F3F4F6  color: #9CA3AF
```

Sort order: mastered first → improving → learning → weak → untouched

---

## Tab: How it works

Six numbered steps explaining the product. Each step:
- Purple circle number (28px, `background: #7C3AED`, white text)
- Bold title, `font-size: 13px`, `color: #111827`
- Body text, `font-size: 12px`, `color: #6B7280`
- Tech tag pill at bottom of each step

Steps:
1. Paste your notes → `Claude extracts` (purple tag)
2. See your neuron map → `react-force-graph-2d` (purple tag)
3. Pick a concept and record → `you speak` (green tag)
4. Feynman retrieves what you know → `Redis vector search` (purple tag)
5. Get spoken feedback → `Deepgram TTS` (green tag)
6. Your map updates → `persisted in Redis` (green tag)

---

## Sidebar

### Brain switcher
- Active brain: `background: #EDE9FE`, `border-radius: 6px`, name `color: #7C3AED`, `font-weight: 500`
- Inactive brain: normal weight, `color: #374151`, `opacity: 0.6`
- Score shown right-aligned, `color: #9CA3AF`, `font-size: 11px`
- "+ New brain" in muted text at bottom of list

### Bottom nav
Active item: `background: #EDE9FE`, `color: #7C3AED`
Inactive: `color: #6B7280`
Hover: same as active

---

## Notes → graph input

On the Converse tab or as a modal, provide a textarea for pasting notes:
- Placeholder: "Paste your notes on any topic…"
- Submit button: "Build neuron map", `background: linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)`, white text
- While extracting: show "Building your neuron map…" with a subtle pulse on the button

---

## Critical implementation rules

1. **`react-force-graph-2d` must always be dynamically imported with `ssr: false`** — top-level import white-screens the app in Next.js
2. **Untouched nodes are hollow** — use `nodeCanvasObject` with `ctx.stroke()` only (no `ctx.fill()`). Never use a grey fill for untouched nodes.
3. **`everAttempted` flag** — store this on every concept in Redis. `score=0` is only `untouched` if `everAttempted=false`. If attempted and scored 0, status is `weak`.
4. **Node recolor without re-layout** — use `nodeColor` or `nodeCanvasObject` as a live function over node data. Never force a full graph data reload to recolor.
5. **Optimistic recolor** — update node status in local state the moment `/api/evaluate` returns, before TTS finishes playing.
6. **Voice bar always visible** on the Converse tab — it does not scroll away with the message thread.

---

## Reference mockup

The HTML file `feynman_ui_mockup_v2.html` is the visual reference for this implementation. Match its layout, spacing, and component structure exactly. The primary difference from the mockup: untouched nodes in the mockup use a grey fill (`#F3F4F6`) — in the real implementation they must be **hollow** (border only, no fill, using `nodeCanvasObject`).
