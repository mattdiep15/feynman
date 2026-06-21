// Client-side mapping from brain icon keys to lucide components. Splits the
// lucide import away from lib/brainIcons.ts so the keys stay server-safe.
import {
  Brain,
  Wallet,
  Ruler,
  Dna,
  Atom,
  Library,
  Palette,
  Landmark,
  Music,
  Cog,
  Globe,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';
import { BRAIN_ICON_KEYS, normalizeIconKey, type BrainIconKey } from '@/lib/brainIcons';

const ICON_BY_KEY: Record<BrainIconKey, LucideIcon> = {
  brain: Brain,
  wallet: Wallet,
  ruler: Ruler,
  dna: Dna,
  atom: Atom,
  library: Library,
  palette: Palette,
  landmark: Landmark,
  music: Music,
  cog: Cog,
  globe: Globe,
  lightbulb: Lightbulb,
};

// Ordered list for the picker grid.
export const BRAIN_ICONS = BRAIN_ICON_KEYS.map((key) => ({ key, Icon: ICON_BY_KEY[key] }));

// Resolve a stored icon value (key or legacy emoji) to its lucide component.
export function resolveBrainIcon(icon: string | undefined): LucideIcon {
  return ICON_BY_KEY[normalizeIconKey(icon)];
}
