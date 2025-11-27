import { useState, useEffect } from 'react';
import { elizaClient } from '../lib/elizaClient';

interface SolanaToken {
  mint: string;
  symbol: string;
  balance: number;
  decimals: number;
  usdValue?: number;
}

interface SolanaWalletData {
  publicKey: string | null;
  solBalance: number;
  tokens: SolanaToken[];
  totalUSD: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch agent-managed Solana wallet information
 *
 * This hook fetches the Solana wallet balance and tokens from the agent backend.
 * The data is cached and can be manually refreshed using the refetch function.
 */
export function useSolanaWallet(userId?: string, enabled: boolean = true): SolanaWalletData {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [solBalance, setSolBalance] = useState<number>(0);
  const [tokens, setTokens] = useState<SolanaToken[]>([]);
  const [totalUSD, setTotalUSD] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState<number>(0);

  const refetch = () => {
    setRefetchTrigger(prev => prev + 1);
  };

  useEffect(() => {
    if (!enabled) return;

    const fetchWalletData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (!userId) {
          throw new Error('User ID required');
        }

        const data = await elizaClient.solana.getWallet(userId);

        setPublicKey(data.publicKey);
        setSolBalance(data.solBalance);
        setTokens(data.tokens);
        setTotalUSD(data.totalUSD);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch Solana wallet:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch'));
        // Set safe defaults on error
        setPublicKey(null);
        setSolBalance(0);
        setTokens([]);
        setTotalUSD(0);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWalletData();

    // Optional: Set up polling for real-time updates
    // const interval = setInterval(fetchWalletData, 30000); // Refresh every 30s
    // return () => clearInterval(interval);
  }, [userId, enabled, refetchTrigger]);

  return {
    publicKey,
    solBalance,
    tokens,
    totalUSD,
    isLoading,
    error,
    refetch
  };
}
