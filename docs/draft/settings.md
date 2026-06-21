# Feynman — settings tab prompt

Add a Settings tab to the existing four-tab UI. Settings are persisted to `localStorage` and applied globally via CSS custom properties on the `<html>` element.

---

## Settings tab location

Add to the sidebar nav and tab bar as the fifth item:

```
Converse
Neuron map
Progress
How it works
Settings          ← add here, at the bottom of the nav
```

Tab icon: `ti-settings` (Tabler outline)

---

## Existing color palette

The app already has a color palette defined in `constants.ts` (or equivalent). Do not redefine these colors — reference them. The existing tokens are:

```
Background:        #FAFAF9
Surface / Cards:   #F5F5F4
Border:            #E5E7EB
Text Primary:      #111827
Text Secondary:    #6B7280
Text Muted:        #9CA3AF
Purple:            #7C3AED
Purple Soft:       #A78BFA
Purple Background: #F3F0FF
Purple Border:     #C4B5FD
Success Dark:      #16523A
Success:           #22C55E
Success Background:#ECFDF5
Amber:             #F59E0B
Amber Dark:        #D97706
Amber Background:  #FFFBEB
Amber Border:      #FDE68A
Red:               #EF4444
Red Background:    #FEF2F2
Red Border:        #FCA5A5
Unlearned Fill:    #F3F4F6
Unlearned Border:  #D1D5DB
```

These are the light mode values. For dark mode, map each token to a dark equivalent (see below) using `[data-theme="dark"]` in CSS — do not change any existing color references in the codebase.

---

## Settings to implement

### 1. Dark mode

Toggle between light and dark theme.

```ts
type Theme = 'light' | 'dark'
```

Apply via:

```ts
document.documentElement.setAttribute('data-theme', theme)
```

Add a `[data-theme="dark"]` block to `globals.css` that remaps the existing palette tokens. The existing color variable names stay the same — only their values change:

```css
/* Suggested dark mode values — map each existing light token to a dark equivalent */
[data-theme="dark"] {
  /* Backgrounds */
  --color-bg:              #0F0F0F;   /* was #FAFAF9 */
  --color-surface:         #1A1A1A;   /* was #F5F5F4 */
  --color-border:          #2A2A2A;   /* was #E5E7EB */

  /* Text */
  --color-text-primary:    #F9FAFB;   /* was #111827 */
  --color-text-secondary:  #9CA3AF;   /* was #6B7280 */
  --color-text-muted:      #6B7280;   /* was #9CA3AF */

  /* Purple — keep the same, it reads well on dark */
  --color-purple:          #7C3AED;
  --color-purple-soft:     #A78BFA;
  --color-purple-bg:       #1E1033;   /* was #F3F0FF — darkened */
  --color-purple-border:   #4C2A8A;   /* was #C4B5FD — darkened */

  /* Success */
  --color-success-dark:    #22C55E;   /* was #16523A — brighten for dark bg */
  --color-success:         #22C55E;
  --color-success-bg:      #052E16;   /* was #ECFDF5 — darkened */

  /* Amber */
  --color-amber:           #F59E0B;
  --color-amber-dark:      #FCD34D;   /* brighten for dark bg */
  --color-amber-bg:        #1C1202;   /* was #FFFBEB — darkened */
  --color-amber-border:    #78350F;   /* was #FDE68A — darkened */

  /* Red */
  --color-red:             #EF4444;
  --color-red-bg:          #1C0202;   /* was #FEF2F2 — darkened */
  --color-red-border:      #7F1D1D;   /* was #FCA5A5 — darkened */

  /* Unlearned nodes */
  --color-unlearned-fill:  #1A1A1A;   /* was #F3F4F6 — matches dark surface */
  --color-unlearned-border:#3A3A3A;   /* was #D1D5DB */
}
```

The node canvas rendering in `nodeCanvasObject` must read from these CSS variables, not hardcoded hex strings, so nodes re-color correctly in dark mode. Use `getComputedStyle(document.documentElement).getPropertyValue('--color-red-bg')` to read current values at render time.

UI: toggle switch. Label: "Dark mode". Show state ("On" / "Off") next to the toggle.

---

### 2. Font

Five font choices. Each changes the entire app's typeface via a CSS variable.

| Option | Font | Notes |
|--------|------|-------|
| **System** (default) | `system-ui, -apple-system, sans-serif` | No import needed |
| **JetBrains Mono** | `'JetBrains Mono', monospace` | Monospace — gives a technical, code-editor feel |
| **Inter** | `'Inter', sans-serif` | Clean, modern, highly readable |
| **Playfair Display** | `'Playfair Display', serif` | Serif — editorial, adds personality |
| **DM Sans** | `'DM Sans', sans-serif` | Rounded, friendly, modern |

Load all four from Google Fonts in `app/layout.tsx`:

```ts
import { Inter, JetBrains_Mono, Playfair_Display, DM_Sans } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
```

Apply selected font:

```ts
document.documentElement.style.setProperty('--font-app', selectedFont)
```

```css
:root {
  --font-app: system-ui, -apple-system, sans-serif;
}

body {
  font-family: var(--font-app);
}
```

UI: font option cards in a 2–3 column grid. Each card shows:
- Font name label
- Preview text rendered in that typeface: `"The quick brown fox"`
- Selected: `border: 2px solid #7C3AED`, `background: #F3F0FF`
- Unselected: `border: 0.5px solid #E5E7EB`, `background: #F5F5F4`

---

### 3. Graph node size

Control the base size of all nodes in the neuron map.

```ts
type NodeSize = 'small' | 'medium' | 'large'
```

Affects the `nodeRadius` formula:

```ts
const BASE_RADIUS = { small: 8, medium: 12, large: 16 }[nodeSize]

const nodeRadius = (node: ConceptNode) =>
  node.status === 'untouched'
    ? BASE_RADIUS
    : Math.max(BASE_RADIUS, (node.masteryScore / 100) * (BASE_RADIUS * 2.5) + BASE_RADIUS)
```

UI: segmented control. Label: "Node size". Options: Small · Medium · Large.

---

### 4. Feedback verbosity

Controls how detailed Claude's spoken feedback is after a teachback.

```ts
type FeedbackVerbosity = 'brief' | 'standard' | 'detailed'
```

- **Brief** — one sentence: what you got right and one thing to fix
- **Standard** — 2–3 sentences: correct points, missing gaps, one follow-up question
- **Detailed** — full breakdown: scoring rationale, all misconceptions, next concept to study

Injected into the Claude evaluation prompt in `/api/evaluate`:

```ts
const verbosityInstruction = {
  brief:    'Respond in one sentence only. Name one thing correct and one thing missing.',
  standard: 'Respond in 2-3 sentences. Cover what was correct, what was missing, and ask one follow-up question.',
  detailed: 'Give a full breakdown: score rationale, all correct points, all missing concepts, any misconceptions, and suggest the next concept to study.',
}[verbosity]
```

UI: segmented control. Label: "Feedback detail". Options: Brief · Standard · Detailed.

---

### 5. Graph animation speed

Controls how fast the force-directed graph settles.

```ts
type GraphSpeed = 'slow' | 'normal' | 'fast'
```

```ts
const alphaDecay = { slow: 0.01, normal: 0.02, fast: 0.05 }[graphSpeed]

<ForceGraph2D d3AlphaDecay={alphaDecay} d3VelocityDecay={0.3} ... />
```

UI: segmented control. Label: "Graph physics". Options: Slow · Normal · Fast.

---

### 6. Playback speed (TTS)

Controls how fast Deepgram TTS speaks back feedback.

```ts
type PlaybackSpeed = 'slow' | 'normal' | 'fast'
```

```ts
const audio = new Audio(url)
audio.playbackRate = { slow: 0.8, normal: 1.0, fast: 1.25 }[playbackSpeed]
```

UI: segmented control. Label: "Voice speed". Options: Slow · Normal · Fast.

---

### 7. Auto-advance

After a teachback scores above 70%, automatically suggest the next weakest concept.

```ts
type AutoAdvance = boolean
```

UI: toggle switch. Label: "Auto-suggest next concept". Sublabel: "After scoring above 70%, Feynman suggests your next weakest concept automatically."

---

## Settings layout

```
┌─────────────────────────────────────────┐
│  Settings                               │
├─────────────────────────────────────────┤
│  APPEARANCE                             │
│                                         │
│  Dark mode                    [ ○ ]     │
│                                         │
│  Font                                   │
│  ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │  System  │ │JetBrains │ │ Inter  │  │
│  │ The quick│ │The quick │ │The quic│  │
│  └──────────┘ └──────────┘ └────────┘  │
│  ┌──────────┐ ┌──────────┐             │
│  │Playfair  │ │ DM Sans  │             │
│  │The quick │ │The quick │             │
│  └──────────┘ └──────────┘             │
│                                         │
├─────────────────────────────────────────┤
│  NEURON MAP                             │
│                                         │
│  Node size     [ Small · Med · Large ]  │
│  Graph physics [ Slow · Normal · Fast ] │
│                                         │
├─────────────────────────────────────────┤
│  LEARNING                               │
│                                         │
│  Feedback detail                        │
│              [ Brief · Std · Detailed ] │
│                                         │
│  Voice speed  [ Slow · Normal · Fast ]  │
│                                         │
│  Auto-suggest next concept    [ ○ ]     │
│  After scoring above 70%,               │
│  Feynman suggests what to study next.   │
│                                         │
└─────────────────────────────────────────┘
```

Section headers: `font-size: 10px`, `color: #9CA3AF`, `text-transform: uppercase`, `letter-spacing: 0.1em`

---

## Segmented control component

```tsx
// components/SegmentedControl.tsx
type Option = { label: string; value: string }

export function SegmentedControl({ options, value, onChange }: {
  options: Option[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{
      display: 'inline-flex',
      background: '#F5F5F4',
      border: '0.5px solid #E5E7EB',
      borderRadius: '8px',
      padding: '3px',
      gap: '2px',
    }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '5px 14px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '12px',
            fontWeight: value === opt.value ? '500' : '400',
            background: value === opt.value ? '#FFFFFF' : 'transparent',
            color: value === opt.value ? '#7C3AED' : '#6B7280',
            cursor: 'pointer',
            boxShadow: value === opt.value ? '0 0 0 0.5px #E5E7EB' : 'none',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
```

---

## Toggle switch component

```tsx
// components/Toggle.tsx
export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: '40px', height: '22px', borderRadius: '11px',
        background: value ? '#7C3AED' : '#E5E7EB',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s ease', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: '3px',
        left: value ? '21px' : '3px',
        width: '16px', height: '16px',
        borderRadius: '50%', background: 'white',
        transition: 'left 0.2s ease',
      }} />
    </div>
  )
}
```

---

## State management

```ts
// lib/settings.ts
export type Settings = {
  theme:           'light' | 'dark'
  font:            'system' | 'inter' | 'jetbrains' | 'playfair' | 'dm-sans'
  nodeSize:        'small' | 'medium' | 'large'
  graphSpeed:      'slow' | 'normal' | 'fast'
  feedbackDetail:  'brief' | 'standard' | 'detailed'
  voiceSpeed:      'slow' | 'normal' | 'fast'
  autoAdvance:     boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme:          'light',
  font:           'system',
  nodeSize:       'medium',
  graphSpeed:     'normal',
  feedbackDetail: 'standard',
  voiceSpeed:     'normal',
  autoAdvance:    false,
}
```

```ts
// context/SettingsContext.tsx
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS
    const saved = localStorage.getItem('feynman-settings')
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS
  })

  const update = (patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      localStorage.setItem('feynman-settings', JSON.stringify(next))
      return next
    })
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme)
    const fontMap = {
      system:    'system-ui, -apple-system, sans-serif',
      inter:     'var(--font-inter)',
      jetbrains: 'var(--font-jetbrains)',
      playfair:  'var(--font-playfair)',
      'dm-sans': 'var(--font-dm-sans)',
    }
    document.documentElement.style.setProperty('--font-app', fontMap[settings.font])
  }, [settings])

  return (
    <SettingsContext.Provider value={{ settings, update }}>
      {children}
    </SettingsContext.Provider>
  )
}
```

Wrap `app/layout.tsx` in `<SettingsProvider>`.

---

## Critical rules

1. **Do not redefine the existing color palette** — it already exists. Only add a `[data-theme="dark"]` block that remaps the same variable names to dark values.
2. **Node canvas colors must read from CSS variables at render time** — use `getComputedStyle(document.documentElement).getPropertyValue('--color-red-bg')` so nodes respond to dark mode. Hardcoded hex strings in `nodeCanvasObject` will not update.
3. Font changes apply via `--font-app` on the root element — no per-component font overrides.
4. Settings persist to `localStorage` under `feynman-settings`.
5. Read from `localStorage` before first render to avoid a flash of default settings.
6. `SettingsProvider` must wrap the entire app in `layout.tsx`.
7. `nodeSize` and `graphSpeed` must be passed to both the landing graph and the main neuron map.