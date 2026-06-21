import type { ReactNode } from 'react';
import './globals.css';
import { SettingsProvider } from '@/context/SettingsContext';

export const metadata = {
  title: 'Feynman',
  description: 'A voice-first learning agent that builds a living knowledge graph.',
  icons: { icon: '/favicon.svg' },
};

// Apply persisted theme + font before paint to avoid a flash of default settings.
const THEME_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem('feynman-settings')||'{}');document.documentElement.setAttribute('data-theme',s.theme||'light');var f={system:"system-ui, -apple-system, sans-serif",inter:"'Inter', sans-serif",jetbrains:"'JetBrains Mono', monospace",playfair:"'Playfair Display', serif","dm-sans":"'DM Sans', sans-serif"}[s.font||'system'];if(f)document.documentElement.style.setProperty('--font-app',f);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Inter:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&family=Playfair+Display:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
