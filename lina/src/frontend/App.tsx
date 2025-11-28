import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWalletAuth } from './hooks/useWalletAuth';
import { Web3Provider } from './providers/Web3Provider';
import { SplashScreen } from './screens/SplashScreen';
import { LoginScreen } from './screens/LoginScreen';
import { MainApp } from './screens/MainApp';

// Create a single QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

/**
 * AuthGate - Routes to appropriate screen based on auth state
 *
 * This is a strict wallet-first gate:
 * - loading: Show splash while checking token validity
 * - none: Cold start, show login (no previous session)
 * - expired: Had session, now invalid - show login with message
 * - authenticated: Show main app
 *
 * The main app is NEVER visible until authenticated.
 *
 * IMPORTANT: useWalletAuth is called ONLY here, and auth state is passed down.
 * This ensures a single source of truth for auth state.
 */
function AuthGate() {
  const auth = useWalletAuth();
  const { authStatus, userId, walletAddress, disconnect } = auth;

  switch (authStatus) {
    case 'loading':
      return <SplashScreen />;

    case 'none':
      return <LoginScreen auth={auth} />;

    case 'expired':
      return <LoginScreen message="Session expired. Please sign in again." auth={auth} />;

    case 'authenticated':
      if (!userId) {
        // Edge case: authenticated but no userId (shouldn't happen)
        console.error('[AuthGate] Authenticated but no userId');
        return <SplashScreen />;
      }
      return (
        <MainApp
          userId={userId}
          walletAddress={walletAddress}
          onSignOut={disconnect}
        />
      );

    default:
      // Type safety exhaustive check
      const _exhaustive: never = authStatus;
      return <SplashScreen />;
  }
}

/**
 * App - Root component with providers
 *
 * Provider hierarchy:
 * 1. QueryClientProvider - React Query for data fetching
 * 2. Web3Provider - Wagmi + AppKit for wallet connectivity
 * 3. AuthGate - Routes based on auth state
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Web3Provider>
        <AuthGate />
      </Web3Provider>
    </QueryClientProvider>
  );
}
