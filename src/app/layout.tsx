import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Necrolink: resurrect dead links',
  description:
    'Find dead and zombie links in your documents and bring them back from the Internet Archive.',
};

export const viewport: Viewport = {
  themeColor: '#0b0e13',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
