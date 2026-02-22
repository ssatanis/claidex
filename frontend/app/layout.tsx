import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Claidex',
  description: 'Healthcare provider and entity data',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
