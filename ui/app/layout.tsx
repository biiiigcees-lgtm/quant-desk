import './globals.css';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata = {
  title: 'Quant Desk — Intelligence Terminal',
  description: 'Institutional probabilistic intelligence operating system for Kalshi prediction markets',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-base text-primary overflow-hidden h-screen">{children}</body>
    </html>
  );
}
