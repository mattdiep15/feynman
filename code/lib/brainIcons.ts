// Canonical brain icon keys. Stored on each brain (`brain.icon`) and rendered as
// lucide icons on the client. Kept free of any React/lucide import so API routes
// and registry helpers can validate/normalize against it on the server.
export const BRAIN_ICON_KEYS = [
  'brain',
  'wallet',
  'ruler',
  'dna',
  'atom',
  'library',
  'palette',
  'landmark',
  'music',
  'cog',
  'globe',
  'lightbulb',
] as const;
export type BrainIconKey = (typeof BRAIN_ICON_KEYS)[number];

export const DEFAULT_BRAIN_ICON: BrainIconKey = 'brain';

// Back-compat: brains created before the lucide switch stored an emoji. Map the
// old palette onto its lucide-key equivalent so existing brains keep an icon.
const EMOJI_TO_ICON_KEY: Record<string, BrainIconKey> = {
  '🧠': 'brain',
  '💰': 'wallet',
  '📐': 'ruler',
  '🧬': 'dna',
  '⚛️': 'atom',
  '📚': 'library',
  '🎨': 'palette',
  '🏛️': 'landmark',
  '🎵': 'music',
  '⚙️': 'cog',
  '🌍': 'globe',
  '💡': 'lightbulb',
};

export function isBrainIconKey(s: unknown): s is BrainIconKey {
  return typeof s === 'string' && (BRAIN_ICON_KEYS as readonly string[]).includes(s);
}

// Normalize any stored icon value (a key, a legacy emoji, or missing) to a key.
export function normalizeIconKey(icon: string | undefined): BrainIconKey {
  if (!icon) return DEFAULT_BRAIN_ICON;
  if (isBrainIconKey(icon)) return icon;
  return EMOJI_TO_ICON_KEY[icon] ?? DEFAULT_BRAIN_ICON;
}
