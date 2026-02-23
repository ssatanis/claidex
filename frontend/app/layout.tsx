import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { ClaideXAssistant } from '@/components/ClaideXAssistant';

export const metadata: Metadata = {
  title: 'ClaideX Provider Case Investigation',
  description: 'Premium B2B healthcare analytics platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex h-screen w-full overflow-hidden bg-background font-sans text-foreground antialiased">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8">
            {children}
          </main>
          <ClaideXAssistant />
        </div>
      </body>
    </html>
  );
}
