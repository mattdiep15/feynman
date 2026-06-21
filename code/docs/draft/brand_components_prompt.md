# Feynman — brand components prompt

Create the following brand components exactly as specified. Do not invent colors, animations, or layouts not listed here.

---

## 1. Logo (top left of sidebar)

File: `components/Logo.tsx`

The wordmark — two animated neuron dots with "feynman" in bold text. Goes in the sidebar header replacing any existing logo or text.

```tsx
// components/Logo.tsx
export function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <svg width="130" height="32" viewBox="0 0 130 32">
        <style>{`
          @keyframes logo-flow  { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
          @keyframes logo-flow2 { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
          .logo-sig  { stroke-dasharray:5 4; animation: logo-flow  1.6s linear infinite; }
          .logo-sig2 { stroke-dasharray:5 4; animation: logo-flow2 1.6s linear infinite 0.8s; }
        `}</style>

        <circle cx="10" cy="16" r="7" fill="#7C3AED" fillOpacity="0.2"/>
        <circle cx="10" cy="16" r="4" fill="#7C3AED"/>

        <circle cx="24" cy="16" r="7" fill="#22C55E" fillOpacity="0.15"/>
        <circle cx="24" cy="16" r="4" fill="#22C55E"/>

        <path className="logo-sig"
          d="M14 14 Q17 10 20 14"
          fill="none" stroke="#7C3AED" strokeWidth="1.8" strokeLinecap="round"/>
        <path className="logo-sig2"
          d="M20 18 Q17 22 14 18"
          fill="none" stroke="#A78BFA" strokeWidth="1.4" strokeLinecap="round"/>

        <text
          x="38" y="21"
          fontFamily="Arial, sans-serif"
          fontWeight="700"
          fontSize="16"
          fill="#111827">
          feynman
        </text>
      </svg>
    </div>
  )
}
```

Place `<Logo />` inside the sidebar's top section, replacing whatever is currently there. No extra wrapper needed — the SVG is already sized correctly.

---

## 2. Agent avatar (used in Converse tab chat messages)

File: `components/AgentAvatar.tsx`

A 28px circular avatar shown next to every Feynman message in the chat thread. Two neuron dots pulse and a signal animates between them.

```tsx
// components/AgentAvatar.tsx
export function AgentAvatar({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      style={{ flexShrink: 0 }}
    >
      <style>{`
        @keyframes av-pulse  { 0%,100%{r:4}   50%{r:5.5} }
        @keyframes av-pulse2 { 0%,100%{r:4}   50%{r:5.5} }
        @keyframes av-flow   { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
        @keyframes av-flow2  { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
        .av-dot  { animation: av-pulse  2s ease-in-out infinite; }
        .av-dot2 { animation: av-pulse2 2s ease-in-out infinite 0.7s; }
        .av-sig  { stroke-dasharray:5 4; animation: av-flow  1.6s linear infinite; }
        .av-sig2 { stroke-dasharray:5 4; animation: av-flow2 1.6s linear infinite 0.8s; }
      `}</style>

      <circle cx="20" cy="20" r="20" fill="#7C3AED"/>

      <circle cx="13" cy="20" r="5.5" fill="white" fillOpacity="0.25"/>
      <circle className="av-dot"  cx="13" cy="20" r="4" fill="white"/>

      <circle cx="27" cy="20" r="5.5" fill="#22C55E" fillOpacity="0.2"/>
      <circle className="av-dot2" cx="27" cy="20" r="4" fill="#22C55E"/>

      <path className="av-sig"
        d="M18 18 Q20 15 22 18"
        fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <path className="av-sig2"
        d="M22 22 Q20 25 18 22"
        fill="none" stroke="#A7F3D0" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}
```

### How to use in the Converse tab

Replace the existing Feynman avatar (currently an "F" in a purple circle) with `<AgentAvatar />`:

```tsx
<div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
  <AgentAvatar size={28} />
  <div>
    <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
      Feynman
    </div>
    <div className="bubble feynman">
      {message.content}
    </div>
  </div>
</div>
```

The `size` prop is optional — defaults to 28px for chat, pass `size={20}` for compact contexts.

---

## 3. Favicon

File: `app/favicon.svg` (or `public/favicon.svg`)

Same icon as the avatar, without the animation — favicons don't need it and some browsers ignore SVG animations in tabs.

```svg
<svg width="32" height="32" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
  <circle cx="20" cy="20" r="20" fill="#7C3AED"/>
  <circle cx="13" cy="20" r="5.5" fill="white" fill-opacity="0.25"/>
  <circle cx="13" cy="20" r="4" fill="white"/>
  <circle cx="27" cy="20" r="5.5" fill="#22C55E" fill-opacity="0.2"/>
  <circle cx="27" cy="20" r="4" fill="#22C55E"/>
  <path d="M18 18 Q20 15 22 18" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M22 22 Q20 25 18 22" fill="none" stroke="#A7F3D0" stroke-width="1.2" stroke-linecap="round"/>
</svg>
```

In `app/layout.tsx`:
```tsx
export const metadata = {
  icons: {
    icon: '/favicon.svg',
  },
}
```

---

## Color reference

All colors used in these components match the existing app palette:

| Value | Role |
|-------|------|
| `#7C3AED` | Purple — primary neuron, logo text shadow |
| `#A78BFA` | Soft purple — signal return path |
| `#22C55E` | Green — second neuron (mastered state) |
| `#A7F3D0` | Light green — green signal highlight |
| `#111827` | Text primary — wordmark text |
| `#F3F0FF` | Purple background — logo dot halo |

---

## Critical rules

1. **Inline `<style>` tags in SVG are fine** — Next.js handles them correctly inside JSX. No need to move keyframes to globals.css for these components.
2. **Namespace every animation name** — prefix with `logo-`, `av-` etc. as shown. Without namespacing, multiple instances on the same page will conflict.
3. **The `size` prop on `AgentAvatar` scales the rendered output via `width`/`height` — the `viewBox` stays fixed at `0 0 40 40`.** Do not change the viewBox.
4. **Do not replace the user's avatar** — only the Feynman/agent side of the chat gets `<AgentAvatar />`. The user bubble keeps its existing treatment.
5. **Logo goes in the sidebar only** — do not render it in the tab bar or page header.
