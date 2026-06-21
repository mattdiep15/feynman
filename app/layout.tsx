import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Feynman',
  description: 'A voice-first learning agent that builds a living knowledge graph.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
