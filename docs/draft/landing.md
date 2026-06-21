# Feynman — landing page prompt

Build a landing page that appears before the main app. When the user clicks the CTA button, the landing page fades out and the main app UI appears.

---

## Overview

Two states, one page:

1. **Landing state** — full-viewport, animated neuron map in the background, centered headline and CTA button
2. **App state** — the existing four-tab UI (Converse, Neuron map, Progress, How it works)

Transition: clicking the CTA fades the landing out and fades the app in. No routing, no page load — just a CSS opacity transition on a single page.

---

## Landing page layout

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│           [neuron map — slowly rotating]            │
│                                                     │
│                    Feynman                          │
│         Learn by teaching. Remember by             │
│                  explaining.                        │
│                                                     │
│              [ Start learning → ]                   │
│                                                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Full viewport. Background: `#FAFAF9`. The neuron map fills the entire background — nodes and edges visible behind the centered text.

---

## Animated neuron map background

Use `react-force-graph-2d` dynamically imported with `ssr: false`.

### Setup

```ts
// components/LandingGraph.tsx
import dynamic from 'next/dynamic'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => null,
})
```

### Demo graph data

Hardcode a realistic Finance brain with ~12 nodes. Do not fetch from Redis for the landing page — this is purely decorative.

```ts
const DEMO_NODES = [
  { id: 'compound_interest', name: 'Compound Interest', status: 'mastered',   masteryScore: 91 },
  { id: 'principal',         name: 'Principal',         status: 'learning',   masteryScore: 55 },
  { id: 'interest_rate',     name: 'Interest Rate',     status: 'weak',       masteryScore: 22 },
  { id: 'time_value',        name: 'Time Value',        status: 'improving',  masteryScore: 74 },
  { id: 'inflation',         name: 'Inflation',         status: 'mastered',   masteryScore: 88 },
  { id: 'diversification',   name: 'Diversification',   status: 'weak',       masteryScore: 18 },
  { id: 'risk_return',       name: 'Risk & Return',     status: 'untouched',  masteryScore: 0  },
  { id: 'budgeting',         name: 'Budgeting',         status: 'learning',   masteryScore: 48 },
  { id: 'net_worth',         name: 'Net Worth',         status: 'improving',  masteryScore: 71 },
  { id: 'cash_flow',         name: 'Cash Flow',         status: 'untouched',  masteryScore: 0  },
  { id: 'asset_allocation',  name: 'Asset Allocation',  status: 'weak',       masteryScore: 31 },
  { id: 'emergency_fund',    name: 'Emergency Fund',    status: 'mastered',   masteryScore: 95 },
]

const DEMO_LINKS = [
  { source: 'compound_interest', target: 'principal' },
  { source: 'compound_interest', target: 'interest_rate' },
  { source: 'compound_interest', target: 'time_value' },
  { source: 'compound_interest', target: 'inflation' },
  { source: 'principal',         target: 'net_worth' },
  { source: 'principal',         target: 'budgeting' },
  { source: 'time_value',        target: 'asset_allocation' },
  { source: 'inflation',         target: 'risk_return' },
  { source: 'risk_return',       target: 'diversification' },
  { source: 'budgeting',         target: 'cash_flow' },
  { source: 'net_worth',         target: 'emergency_fund' },
  { source: 'asset_allocation',  target: 'diversification' },
]
```

### Slow rotation

Rotate the entire graph by updating a rotation angle on every animation frame. Use `graphRef` to access the graph's camera:

```ts
const graphRef = useRef<any>(null)
const angleRef = useRef(0)

useEffect(() => {
  let animFrame: number

  const rotate = () => {
    angleRef.current += 0.001   // very slow — adjust if too fast/slow
    const graph = graphRef.current
    if (graph) {
      // rotate camera around center
      const distance = 300
      graph.cameraPosition({
        x: distance * Math.sin(angleRef.current),
        y: 0,
        z: distance * Math.cos(angleRef.current),
      })
    }
    animFrame = requestAnimationFrame(rotate)
  }

  animFrame = requestAnimationFrame(rotate)
  return () => cancelAnimationFrame(animFrame)
}, [])
```

If `react-force-graph-2d` does not expose camera controls (it's a 2D library), use this alternative: rotate the graph container div using a CSS transform instead.

```ts
// Alternative: rotate the container
const [rotation, setRotation] = useState(0)

useEffect(() => {
  const interval = setInterval(() => {
    setRotation(r => r + 0.05)   // degrees per tick
  }, 16)
  return () => clearInterval(interval)
}, [])

// On the graph wrapper div:
style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.016s linear' }}
```

Use whichever works with `react-force-graph-2d`'s API. The 2D container rotation approach is simpler and always works.

### Node rendering on landing

Same `nodeCanvasObject` as the main app. Untouched nodes are hollow (stroke only, no fill). All other nodes use the standard fill/border colors.

Nodes on the landing are slightly larger and more spread out than in the main app — increase `d3Force` charge strength to spread them:

```ts
onEngineStop={() => {
  graphRef.current?.d3Force('charge')?.strength(-300)
}}
```

### Graph visual style on landing

- Node labels: always visible (unlike the main app where they show on hover) — this is decorative, labels add to the effect
- Edge color: `#E5E7EB`, width 0.5px — very subtle
- Background: transparent — the `#FAFAF9` page background shows through
- Interaction: disabled — `enableNodeDrag={false}`, `enableZoomInteraction={false}`, `enablePanInteraction={false}`
- The graph should fill the full viewport: `width={window.innerWidth}`, `height={window.innerHeight}`

### Overlay fade

The neuron map sits at full opacity in the background. The centered text and button sit on top. Apply a subtle radial fade in the center so the text is readable:

```css
/* Center overlay — makes text readable over the graph */
.landing-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 60% 50% at 50% 50%,
    rgba(250,250,249,0.92) 0%,
    rgba(250,250,249,0.6) 50%,
    rgba(250,250,249,0) 100%
  );
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
```

---

## Centered content

```
Feynman                          ← 13px, #7C3AED, letter-spacing: 0.12em, uppercase, font-weight 500
Learn by teaching.               ← 48px, #111827, font-weight 500, line-height 1.15
Remember by explaining.          ← 48px, #111827, font-weight 500
                                 ← 16px gap
Your neuron map grows every      ← 16px, #6B7280
time you explain something.      

                                 ← 32px gap
[ Start learning → ]             ← CTA button
```

### CTA button

```css
.cta-button {
  padding: 14px 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%);
  color: white;
  font-size: 15px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  letter-spacing: 0.01em;
}

.cta-button:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  transition: all 0.15s ease;
}
```

Button text: `Start learning →`

---

## Transition to app

When the CTA button is clicked:

```ts
const [appVisible, setAppVisible] = useState(false)

const handleStart = () => {
  setAppVisible(true)
}
```

```css
.landing {
  position: fixed;
  inset: 0;
  z-index: 10;
  transition: opacity 0.6s ease, visibility 0.6s ease;
}

.landing.hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.app-wrapper {
  opacity: 0;
  transition: opacity 0.6s ease 0.3s;  /* slight delay — starts fading in as landing fades out */
}

.app-wrapper.visible {
  opacity: 1;
}
```

The landing fades out over 0.6s. The app fades in starting at 0.3s — they overlap slightly so there's no black gap.

Once the transition completes, unmount the landing graph entirely to free up resources:

```ts
const [landingMounted, setLandingMounted] = useState(true)

// after transition completes
setTimeout(() => setLandingMounted(false), 700)
```

---

## File structure

```
components/
  LandingGraph.tsx     ← animated neuron map (dynamic import, ssr:false)
  LandingPage.tsx      ← full landing layout + CTA + overlay
app/
  page.tsx             ← controls landing/app state, renders both
```

`page.tsx` logic:

```ts
export default function Page() {
  const [started, setStarted] = useState(false)
  const [landingMounted, setLandingMounted] = useState(true)

  const handleStart = () => {
    setStarted(true)
    setTimeout(() => setLandingMounted(false), 700)
  }

  return (
    <>
      {landingMounted && (
        <div className={`landing ${started ? 'hidden' : ''}`}>
          <LandingPage onStart={handleStart} />
        </div>
      )}
      <div className={`app-wrapper ${started ? 'visible' : ''}`}>
        <MainApp />
      </div>
    </>
  )
}
```

---

## Critical rules

1. `LandingGraph` must be dynamically imported with `ssr: false` — same rule as the main neuron map
2. Untouched nodes on the landing are hollow (stroke only) — same `nodeCanvasObject` implementation as the main app
3. The landing graph is purely decorative — no click handlers, no drag, no zoom
4. Unmount the landing graph after transition completes — keeping it mounted wastes GPU resources once the app is visible
5. The rotation must use `requestAnimationFrame` or `setInterval` — never a CSS animation on the graph itself, as the graph re-renders on its own tick