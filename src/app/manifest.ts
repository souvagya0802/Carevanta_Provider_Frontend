import type { MetadataRoute } from 'next';

/**
 * Web app manifest: lets staff install the portal from the browser on Android,
 * iOS (Add to Home Screen) and desktop, where it runs full-screen with its own
 * icon and receives push notifications. One code base, no app store.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // The name under the icon on the phone. Kept distinct from the patient app ("Carevanta") and the admin app ("Carevanta Admin").
    name: 'Carevanta Provider',
    short_name: 'Carevanta Provider',
    description: 'Run your hospital, clinic, laboratory, pharmacy, ambulance service or practice on Carevanta.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f5f6f8',
    theme_color: '#0a0a0a',
    lang: 'en-IN',
    categories: ['medical', 'business', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Appointments', url: '/appointments', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Dispatch', url: '/dispatch', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Orders', url: '/pharmacy-orders', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
