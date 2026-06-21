'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  DEFAULT_SETTINGS,
  FONT_STACKS,
  UI_FONT_SCALE,
  loadSettings,
  STORAGE_KEY,
  type Settings,
} from '@/lib/settings';

type SettingsCtx = { settings: Settings; update: (patch: Partial<Settings>) => void };

const SettingsContext = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Start from defaults for a stable SSR/first render; hydrate from localStorage
  // on mount. The inline script in layout.tsx applies theme + font pre-paint, so
  // there's no visible flash for the most noticeable settings.
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const update = (patch: Partial<Settings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage may be unavailable; settings still apply for the session */
      }
      return next;
    });

  // Apply theme + font + UI text scale globally whenever settings change.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.style.setProperty('--font-app', FONT_STACKS[settings.font]);
    document.documentElement.style.fontSize = `${UI_FONT_SCALE[settings.textSize] * 100}%`;
  }, [settings]);

  return <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsCtx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
