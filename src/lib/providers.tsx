'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AuthProvider } from './auth';
import { ToastProvider } from '@/components/ui/toast';
import { ApiError } from './api';
import { registerServiceWorker } from './push';

export function AppProviders({ children }: { children: ReactNode }) {
  // The service worker gives the installed app an offline page and receives push messages.
  useEffect(() => { void registerServiceWorker(); }, []);
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
