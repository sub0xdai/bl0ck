import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppKit, useAppKitAccount, useDisconnect, useAppKitProvider } from '@reown/appkit/react';
import { useSignMessage } from 'wagmi';
import { SiweMessage } from 'siwe';
import type { Provider } from '@reown/appkit-adapter-solana';
import { elizaClient } from '../lib/elizaClient';
import bs58 from 'bs58';

// Key used by wagmi storage for wallet persistence
const WALLET_STORAGE_KEY = 'lina-wallet';

/** Auth lifecycle state - distinguishes cold start from expired session */
export type AuthStatus = 'loading' | 'none' | 'expired' | 'authenticated';

export interface WalletAuthState {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  walletAddress: string | null;
  chain: 'evm' | 'solana' | null;

  // Auth state
  authStatus: AuthStatus;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  userId: string | null;
  token: string | null;

  // Error state
  error: string | null;

  // Actions
  connect: () => void;
  disconnect: () => Promise<void>;
  signIn: () => Promise<void>;
}

/**
 * useWalletAuth - Hook for Web3 wallet authentication
 *
 * Handles:
 * 1. Wallet connection via AppKit (MetaMask, WalletConnect, etc.)
 * 2. SIWE (Sign-In with Ethereum) authentication flow
 * 3. JWT token management
 * 4. Auto-reconnect on page load if token exists
 */
export function useWalletAuth(): WalletAuthState {
  const { open } = useAppKit();
  const { address, isConnected, caipAddress } = useAppKitAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  // Solana provider for signing
  const { walletProvider: solanaProvider } = useAppKitProvider<Provider>('solana');

  // Auth lifecycle state
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derived state for convenience
  const isAuthenticated = authStatus === 'authenticated';

  // Determine chain from CAIP address (eip155:1:0x... or solana:...)
  const chain: 'evm' | 'solana' | null = caipAddress
    ? caipAddress.startsWith('solana')
      ? 'solana'
      : 'evm'
    : null;

  // Track if we've completed initial session check
  const hasCheckedSession = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to check if wallet storage has persisted connection
  const hasPersistedWallet = useCallback(() => {
    try {
      const stored = localStorage.getItem(WALLET_STORAGE_KEY);
      return stored !== null && stored !== '{}';
    } catch {
      return false;
    }
  }, []);

  // Check for existing token on mount - determines initial auth state
  // Handles race condition: wallet may still be reconnecting on page load
  useEffect(() => {
    const existingToken = localStorage.getItem('auth-token');

    if (!existingToken) {
      // No token = cold start (never logged in or manually logged out)
      setAuthStatus('none');
      hasCheckedSession.current = true;
      console.log('[WalletAuth] No existing token - cold start');
      return;
    }

    // Token exists AND wallet connected - validate immediately
    if (isConnected) {
      elizaClient.setAuthToken(existingToken);
      elizaClient.auth
        .me()
        .then((user) => {
          setAuthStatus('authenticated');
          setUserId(user.userId);
          setToken(existingToken);
          hasCheckedSession.current = true;
          console.log('[WalletAuth] Restored session for:', user.userId?.substring(0, 8));
        })
        .catch(() => {
          // Token invalid/expired - show expired state
          localStorage.removeItem('auth-token');
          elizaClient.clearAuthToken();
          setAuthStatus('expired');
          setUserId(null);
          setToken(null);
          hasCheckedSession.current = true;
          console.log('[WalletAuth] Token expired, showing re-auth prompt');
        });
      return;
    }

    // Token exists but wallet not yet connected
    // Check if we have persisted wallet data (wallet should auto-reconnect)
    if (hasPersistedWallet() && !hasCheckedSession.current) {
      console.log('[WalletAuth] Token exists, waiting for wallet to reconnect...');
      // Stay in loading state - wallet storage exists, should reconnect soon
      // Set a timeout to fall back to 'none' if wallet doesn't reconnect
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (!hasCheckedSession.current) {
          console.log('[WalletAuth] Wallet reconnect timeout - requiring fresh auth');
          localStorage.removeItem('auth-token');
          elizaClient.clearAuthToken();
          setAuthStatus('none');
          hasCheckedSession.current = true;
        }
      }, 3000); // Give wallet 3 seconds to reconnect
      return;
    }

    // No persisted wallet and not connected - clear token and require fresh auth
    if (!hasPersistedWallet()) {
      console.log('[WalletAuth] No persisted wallet - requiring fresh auth');
      localStorage.removeItem('auth-token');
      elizaClient.clearAuthToken();
      setAuthStatus('none');
      hasCheckedSession.current = true;
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [isConnected, hasPersistedWallet]);

  // Open AppKit modal
  const connect = useCallback(() => {
    setError(null);
    open();
  }, [open]);

  // Sign out and disconnect wallet
  const disconnect = useCallback(async () => {
    try {
      // Clear auth state
      localStorage.removeItem('auth-token');
      elizaClient.clearAuthToken();
      setAuthStatus('none');
      setUserId(null);
      setToken(null);
      setError(null);

      // Clear wallet persistence so user isn't auto-reconnected
      localStorage.removeItem(WALLET_STORAGE_KEY);

      // Reset session check flag for next login
      hasCheckedSession.current = false;

      // Disconnect wallet
      await wagmiDisconnect();

      console.log('[WalletAuth] Disconnected and cleared persisted wallet');
    } catch (err: any) {
      console.error('[WalletAuth] Disconnect error:', err);
      setError(err.message || 'Failed to disconnect');
    }
  }, [wagmiDisconnect]);

  // Sign-in flow for both EVM (SIWE) and Solana (SIWS)
  const signIn = useCallback(async () => {
    if (!address || !isConnected) {
      setError('Please connect wallet first');
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      // Step 1: Get nonce from backend
      console.log('[WalletAuth] Requesting nonce...');
      const nonceRes = await fetch('/api/auth/nonce');
      if (!nonceRes.ok) {
        throw new Error('Failed to get nonce');
      }
      const { data: nonceData } = await nonceRes.json();
      const nonce = nonceData?.nonce;

      if (!nonce) {
        throw new Error('No nonce returned from server');
      }

      let messageToSign: string;
      let signature: string;

      if (chain === 'evm') {
        // EVM: Use SIWE (Sign-In with Ethereum)
        const message = new SiweMessage({
          domain: window.location.host,
          address,
          statement: 'Sign in to Lina',
          uri: window.location.origin,
          version: '1',
          chainId: 1, // Ethereum mainnet
          nonce,
        });

        messageToSign = message.prepareMessage();
        console.log('[WalletAuth] Requesting EVM signature...');

        signature = await signMessageAsync({
          message: messageToSign,
        });
      } else if (chain === 'solana') {
        // Solana: Use SIWS (Sign-In with Solana)
        console.log('[WalletAuth] Solana provider:', solanaProvider);

        if (!solanaProvider) {
          throw new Error('Solana wallet provider not available. Please reconnect your wallet.');
        }

        if (typeof solanaProvider.signMessage !== 'function') {
          console.error('[WalletAuth] Provider missing signMessage:', Object.keys(solanaProvider));
          throw new Error('Wallet does not support message signing');
        }

        // Create a simple message for Solana signing
        messageToSign = `Sign in to Lina\n\nWallet: ${address}\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
        console.log('[WalletAuth] Requesting Solana signature for message:', messageToSign);

        // Encode message to Uint8Array
        const encodedMessage = new TextEncoder().encode(messageToSign);

        // Sign with Solana wallet
        const signatureBytes = await solanaProvider.signMessage(encodedMessage);
        console.log('[WalletAuth] Got signature bytes:', signatureBytes);

        // Convert to base58 for transmission
        signature = bs58.encode(signatureBytes);
        console.log('[WalletAuth] Signature (base58):', signature);
      } else {
        throw new Error('Unsupported wallet type');
      }

      console.log('[WalletAuth] Verifying signature...');

      // Step 4: Verify with backend
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageToSign,
          signature,
          chain: chain,
        }),
      });

      if (!verifyRes.ok) {
        const errorData = await verifyRes.json();
        throw new Error(errorData.error?.message || 'Verification failed');
      }

      const { data: authData } = await verifyRes.json();
      const { token: newToken, userId: newUserId } = authData;

      // Step 5: Store token and update state
      localStorage.setItem('auth-token', newToken);
      elizaClient.setAuthToken(newToken);
      setToken(newToken);
      setUserId(newUserId);
      setAuthStatus('authenticated');

      console.log('[WalletAuth] Signed in successfully:', newUserId?.substring(0, 8));
    } catch (err: any) {
      console.error('[WalletAuth] Sign-in error:', err);
      setError(err.message || 'Sign-in failed');
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, isConnected, chain, signMessageAsync, solanaProvider]);

  return {
    // Connection
    isConnected,
    isConnecting: false, // AppKit handles this internally
    walletAddress: address || null,
    chain,

    // Auth
    authStatus,
    isAuthenticated,
    isAuthenticating,
    userId,
    token,

    // Error
    error,

    // Actions
    connect,
    disconnect,
    signIn,
  };
}

export default useWalletAuth;
