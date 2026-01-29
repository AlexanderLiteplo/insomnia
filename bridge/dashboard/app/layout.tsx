import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Amphetamine',
  description: 'Autonomous AI agents that never sleep',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
