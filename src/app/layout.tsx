import type { Metadata, Viewport } from 'next';
import { Cinzel, Cormorant_Garamond } from 'next/font/google';
import type { ReactNode } from 'react';
import { Backdrop } from '@/components/Backdrop';
import './globals.css';

/*
 * Only the weights the design uses. next/font downloads at build time and
 * self-hosts the files, so there is no runtime request to Google, no layout
 * shift, and no CSP exception to write.
 *
 * The iOS build imported each weight from its own subpath to stop Metro
 * bundling all 16 TTFs; that trick was Metro-specific and is gone. The
 * principle it protected is not: list weights explicitly, never pull a whole
 * family.
 */
const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-display',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'JMTarot',
  description: 'Bacaan tarot Major Arcana bersama tiga pembaca.',
};

export const viewport: Viewport = {
  themeColor: '#0a0812',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={`${cinzel.variable} ${cormorant.variable}`}>
      <body>
        <Backdrop />
        {children}
      </body>
    </html>
  );
}
