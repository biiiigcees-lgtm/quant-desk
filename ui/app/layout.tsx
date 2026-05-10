import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quant Desk — Intelligence Terminal',
  description: 'Institutional probabilistic intelligence operating system for Kalshi prediction markets',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-base text-primary overflow-hidden h-screen">{children}</body>
    </html>
  );
}
