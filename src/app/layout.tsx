import type { Metadata, Viewport } from 'next';
import { Creepster, IM_Fell_English } from 'next/font/google';
import { Atmosphere } from '@/components/Atmosphere';
import './globals.css';

// Self-hosted at build time by next/font: no requests to Google from visitors
const creepster = Creepster({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-creepster' });
const fell = IM_Fell_English({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fell',
});

export const metadata: Metadata = {
  title: 'Necrolink: resurrect dead links',
  description:
    'Find dead and zombie links in your documents and bring them back from the Internet Archive.',
};

export const viewport: Viewport = {
  themeColor: '#0b0e13',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${creepster.variable} ${fell.variable}`}>
      <body className="relative isolate font-sans antialiased">
        <Atmosphere />
        {children}
      </body>
    </html>
  );
}
