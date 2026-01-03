import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoadingPanelProvider } from './contexts/LoadingPanelContext';
import { ModalProvider } from './contexts/ModalContext';
import App from './App';
import './index.css';

// Initialize i18n (must be before App renders)
import './lib/i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
});

// App.tsx already has conditional CDPReactProvider wrapper
// No need to duplicate it here
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LoadingPanelProvider>
        <ModalProvider>
          <App />
        </ModalProvider>
      </LoadingPanelProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

