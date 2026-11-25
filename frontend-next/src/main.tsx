import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { ApiError } from './api/client';
import { router } from './routes';
import { SessionProvider } from './session/SessionProvider';
import { ToastProvider, useToast } from './ui/Toast';
import { TooltipProvider } from './ui/Tooltip';
import './styles/base.css';
import './styles/tokens.css';
import './styles/utilities.css';

interface QueryProviderProps {
  children: React.ReactNode;
}

// Failed requests are reported as the current frontend reports them (a red notification), except the statuses a
// page handles itself (an encounter that does not exist) and the failures of actions, which report their own
function QueryProvider({ children }: QueryProviderProps) {
  const notify = useToast();
  const client = React.useMemo(() => new QueryClient({
    queryCache: new QueryCache({
      onError: error => {
        if (error instanceof ApiError && error.expected) return;
        notify(error.message || 'Error communicating to server', 'danger');
      },
    }),
    mutationCache: new MutationCache(),
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: 1 },
    },
  }), [notify]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <QueryProvider>
        <TooltipProvider>
          <SessionProvider>
            <RouterProvider router={router} />
          </SessionProvider>
        </TooltipProvider>
      </QueryProvider>
    </ToastProvider>
  </React.StrictMode>,
);
