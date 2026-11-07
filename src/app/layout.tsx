import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProviders } from '@/lib/providers';

export const metadata: Metadata = {
  title: { default: 'Carevanta Provider Portal', template: '%s · Carevanta Provider Portal' },
  description: 'Manage your hospital, clinic, laboratory, pharmacy, ambulance service or practice on Carevanta',
  robots: { index: false, follow: false },
  applicationName: 'Carevanta Provider Portal',
  appleWebApp: { capable: true, statusBarStyle: 'black', title: 'Carevanta' },
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0a0a0a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
