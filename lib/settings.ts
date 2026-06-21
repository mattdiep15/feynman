// User-tunable settings, persisted to localStorage and applied globally via CSS
// custom properties on <html> (theme + font) and via props/context elsewhere
// (node size, graph speed, voice speed, feedback detail, auto-advance).

export type Theme = 'light' | 'dark';
export type FontChoice = 'system' | 'inter' | 'jetbrains' | 'playfair' | 'dm-sans';
export type SizeChoice = 'small' | 'medium' | 'large';
export type SpeedChoice = 'slow' | 'normal' | 'fast';
export type FeedbackDetail = 'brief' | 'standard' | 'detailed';

export interface Settings {
  theme: Theme;
  font: FontChoice;
  nodeSize: SizeChoice;
  labelSize: SizeChoice;
  graphSpeed: SpeedChoice;
  feedbackDetail: FeedbackDetail;
  voiceSpeed: SpeedChoice;
  autoAdvance: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  font: 'system',
  nodeSize: 'medium',
  labelSize: 'medium',
  graphSpeed: 'normal',
  feedbackDetail: 'standard',
  voiceSpeed: 'normal',
  autoAdvance: false,
};

export const STORAGE_KEY = 'feynman-settings';

// Font stacks applied via the --font-app CSS variable. The non-system families
// are loaded from Google Fonts in app/layout.tsx.
export const FONT_STACKS: Record<FontChoice, string> = {
  system: 'system-ui, -apple-system, sans-serif',
  inter: "'Inter', sans-serif",
  jetbrains: "'JetBrains Mono', monospace",
  playfair: "'Playfair Display', serif",
  'dm-sans': "'DM Sans', sans-serif",
};

export const FONT_LABELS: Record<FontChoice, string> = {
  system: 'System',
  inter: 'Inter',
  jetbrains: 'JetBrains Mono',
  playfair: 'Playfair Display',
  'dm-sans': 'DM Sans',
};

// Multiplier applied to graph label font sizes; medium leaves them unchanged.
// Spread wide enough that small vs large is unmistakable at a glance.
export const LABEL_SCALE: Record<SizeChoice, number> = { small: 0.7, medium: 1, large: 1.7 };
// Lower alphaDecay = the force graph settles more slowly.
export const GRAPH_ALPHA_DECAY: Record<SpeedChoice, number> = { slow: 0.01, normal: 0.02, fast: 0.05 };
// TTS playback rate.
export const VOICE_RATE: Record<SpeedChoice, number> = { slow: 0.8, normal: 1.0, fast: 1.25 };

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}
