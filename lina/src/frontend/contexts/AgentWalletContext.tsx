import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo, useRef } from 'react';
import { elizaClient } from '../lib/elizaClient';
import { SUPPORTED_CHAINS, isSolanaChain, isEVMChain } from '../constants/chains';

// Types - exported for reuse in components
export interface Token {
  symbol: string;
  name: string;
  balance: string;
  balanceFormatted: string;
  usdValue: number | null;
  usdPrice: number | null;
  contractAddress: string | null;
  chain: string;
  decimals: number;
  icon?: string;
}

export interface NFT {
  chain: string;
  contractAddress: string;
  tokenId: string;
  name: string;
  description: string;
  image: string;
  contractName: string;
  tokenType: string;
  balance?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

export interface Transaction {
  chain: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  asset: string;
  category: string;
  timestamp: number;
  blockNum: string;
  explorerUrl: string;
  direction: 'sent' | 'received';
  icon?: string | null;
  contractAddress?: string | null;
}

export type WalletView = 'evm' | 'solana';

interface AgentWalletState {
  // Wallet addresses
  evmAddress: string | null;
  solanaAddress: string | null;
  isLoadingAddresses: boolean;
  addressError: string | null;

  // Active wallet view
  walletView: WalletView;

  // Tokens state
  tokens: Token[];
  totalUsdValue: number;
  isLoadingTokens: boolean;
  tokensError: string | null;

  // NFTs state
  nfts: NFT[];
  isLoadingNfts: boolean;
  nftsError: string | null;

  // Transaction history state
  transactions: Transaction[];
  isLoadingHistory: boolean;
  historyError: string | null;

  // General refresh state
  isRefreshing: boolean;
}

interface AgentWalletContextType extends AgentWalletState {
  // Derived state
  currentAddress: string | null;
  filteredTokens: Token[];
  filteredChains: typeof SUPPORTED_CHAINS;

  // Actions
  setWalletView: (view: WalletView) => void;
  fetchTokens: () => Promise<void>;
  syncTokens: () => Promise<void>;
  fetchNfts: () => Promise<void>;
  syncNfts: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshActive: () => Promise<void>;
}

const AgentWalletContext = createContext<AgentWalletContextType | undefined>(undefined);

// Helper: Get chain sort order
const getChainSortOrder = (chain: string): number => {
  const index = SUPPORTED_CHAINS.indexOf(chain as (typeof SUPPORTED_CHAINS)[number]);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

// Helper: Sort tokens by USD value (highest first), fallback to chain order then symbol
const sortTokensByUsdValueDesc = (tokensToSort: Token[]): Token[] => {
  return [...tokensToSort].sort((a, b) => {
    const valueA = a.usdValue ?? 0;
    const valueB = b.usdValue ?? 0;

    if (valueB !== valueA) {
      return valueB - valueA;
    }

    const chainOrderA = getChainSortOrder(a.chain);
    const chainOrderB = getChainSortOrder(b.chain);
    if (chainOrderA !== chainOrderB) {
      return chainOrderA - chainOrderB;
    }

    return a.symbol.localeCompare(b.symbol);
  });
};

// Helper: Sort NFTs by chain order
const sortNftsByChainOrder = (nftsToSort: NFT[]): NFT[] => {
  return [...nftsToSort].sort((a, b) => {
    const aOrder = getChainSortOrder(a.chain);
    const bOrder = getChainSortOrder(b.chain);
    return aOrder - bOrder;
  });
};

// Generic helper to fetch data for all chains and collect results
// Fixes race condition by collecting all results before returning
async function fetchForAllChains<T>(
  fetcher: (chain: string) => Promise<T | null>,
  extractor: (data: T) => any[]
): Promise<any[]> {
  const results = await Promise.all(
    SUPPORTED_CHAINS.map(async (chain) => {
      try {
        const data = await fetcher(chain);
        if (data) {
          return extractor(data);
        }
        return [];
      } catch (err) {
        console.error(`[AgentWalletContext] Error fetching for ${chain}:`, err);
        return [];
      }
    })
  );
  // Flatten all chain results into single array
  return results.flat();
}

interface AgentWalletProviderProps {
  children: ReactNode;
  userId: string;
}

export function AgentWalletProvider({ children, userId }: AgentWalletProviderProps) {
  // Wallet addresses
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [addressError, setAddressError] = useState<string | null>(null);

  // Active wallet view
  const [walletView, setWalletView] = useState<WalletView>('evm');

  // Tokens state
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  const [tokensError, setTokensError] = useState<string | null>(null);

  // NFTs state
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [isLoadingNfts, setIsLoadingNfts] = useState(false);
  const [nftsError, setNftsError] = useState<string | null>(null);

  // Transaction history state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // General refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Track mounted state to prevent stale updates
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Computed values
  const totalUsdValue = useMemo(() => {
    return tokens.reduce((sum, token) => sum + (token.usdValue || 0), 0);
  }, [tokens]);

  const currentAddress = useMemo(() => {
    return walletView === 'evm' ? evmAddress : solanaAddress;
  }, [walletView, evmAddress, solanaAddress]);

  const filteredTokens = useMemo(() => {
    return tokens.filter(token => {
      if (walletView === 'solana') {
        return isSolanaChain(token.chain);
      }
      return isEVMChain(token.chain);
    });
  }, [tokens, walletView]);

  const filteredChains = useMemo(() => {
    return SUPPORTED_CHAINS.filter(chain => {
      if (walletView === 'solana') {
        return isSolanaChain(chain);
      }
      return isEVMChain(chain);
    });
  }, [walletView]);

  // Fetch wallet addresses on mount
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const fetchWalletAddresses = async () => {
      setIsLoadingAddresses(true);
      setAddressError(null);

      const errors: string[] = [];

      // Fetch EVM address
      try {
        const { address } = await elizaClient.wallet.getAddress('base');
        if (!cancelled && isMountedRef.current) {
          setEvmAddress(address);
        }
      } catch (err) {
        console.error('[AgentWalletContext] Error fetching EVM address:', err);
        errors.push('EVM');
      }

      // Fetch Solana address
      try {
        const { address } = await elizaClient.wallet.getAddress('solana');
        if (!cancelled && isMountedRef.current) {
          setSolanaAddress(address);
        }
      } catch (err) {
        console.error('[AgentWalletContext] Error fetching Solana address:', err);
        errors.push('Solana');
      }

      if (!cancelled && isMountedRef.current) {
        setIsLoadingAddresses(false);
        if (errors.length > 0) {
          setAddressError(`Failed to load ${errors.join(' and ')} wallet address`);
        }
      }
    };

    fetchWalletAddresses();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Sync tokens (force refresh) - collects all results then sets state once
  const syncTokens = useCallback(async () => {
    if (!userId) return;

    setIsLoadingTokens(true);
    setTokensError(null);

    try {
      const allTokens = await fetchForAllChains(
        (chain) => elizaClient.wallet.syncTokens(chain),
        (data) => data?.tokens || []
      );

      if (isMountedRef.current) {
        setTokens(sortTokensByUsdValueDesc(allTokens));
      }
    } catch (error) {
      console.error('[AgentWalletContext] Error syncing tokens:', error);
      if (isMountedRef.current) {
        setTokensError('Failed to sync tokens');
        setTokens([]);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingTokens(false);
      }
    }
  }, [userId]);

  // Fetch tokens (cache-first) - collects all results then sets state once
  const fetchTokens = useCallback(async () => {
    if (!userId) return;

    setIsLoadingTokens(true);
    setTokensError(null);

    try {
      const allTokens = await fetchForAllChains(
        (chain) => elizaClient.wallet.getTokens(chain),
        (data) => data?.tokens || []
      );

      if (isMountedRef.current) {
        setTokens(sortTokensByUsdValueDesc(allTokens));
      }
    } catch (error) {
      console.error('[AgentWalletContext] Error fetching tokens:', error);
      if (isMountedRef.current) {
        setTokensError('Failed to fetch tokens');
        setTokens([]);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingTokens(false);
      }
    }
  }, [userId]);

  // Sync NFTs (force refresh) - collects all results then sets state once
  const syncNfts = useCallback(async () => {
    if (!userId) return;

    setIsLoadingNfts(true);
    setNftsError(null);

    try {
      const allNfts = await fetchForAllChains(
        (chain) => elizaClient.cdp.syncNFTs(chain),
        (data) => data?.nfts || []
      );

      if (isMountedRef.current) {
        setNfts(sortNftsByChainOrder(allNfts));
      }
    } catch (error) {
      console.error('[AgentWalletContext] Error syncing NFTs:', error);
      if (isMountedRef.current) {
        setNftsError('Failed to sync NFTs');
        setNfts([]);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingNfts(false);
      }
    }
  }, [userId]);

  // Fetch NFTs (cache-first) - collects all results then sets state once
  const fetchNfts = useCallback(async () => {
    if (!userId) return;

    setIsLoadingNfts(true);
    setNftsError(null);

    try {
      const allNfts = await fetchForAllChains(
        (chain) => elizaClient.cdp.getNFTs(chain),
        (data) => data?.nfts || []
      );

      if (isMountedRef.current) {
        setNfts(sortNftsByChainOrder(allNfts));
      }
    } catch (error) {
      console.error('[AgentWalletContext] Error fetching NFTs:', error);
      if (isMountedRef.current) {
        setNftsError('Failed to fetch NFTs');
        setNfts([]);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingNfts(false);
      }
    }
  }, [userId]);

  // Fetch transaction history
  const fetchHistory = useCallback(async () => {
    if (!userId) return;

    setIsLoadingHistory(true);
    setHistoryError(null);

    try {
      const data = await elizaClient.cdp.getHistory();
      if (isMountedRef.current) {
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error('[AgentWalletContext] Error fetching history:', error);
      if (isMountedRef.current) {
        setHistoryError('Failed to fetch transaction history');
        setTransactions([]);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingHistory(false);
      }
    }
  }, [userId]);

  // Refresh all data (tokens + NFTs)
  const refreshAll = useCallback(async () => {
    if (!userId) return;

    setIsRefreshing(true);
    try {
      console.log('[AgentWalletContext] Refreshing all wallet data...');
      await Promise.all([syncTokens(), syncNfts()]);
      console.log('[AgentWalletContext] Wallet data refreshed');
    } catch (error) {
      console.error('[AgentWalletContext] Error refreshing wallet data:', error);
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [userId, syncTokens, syncNfts]);

  // Refresh data based on active tab (used by manual refresh button)
  const refreshActive = useCallback(async () => {
    if (!userId) return;

    setIsRefreshing(true);
    try {
      // This refreshes tokens by default (most common use case)
      await syncTokens();
    } catch (error) {
      console.error('[AgentWalletContext] Error refreshing active data:', error);
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [userId, syncTokens]);

  // Initial token load
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const loadInitialTokens = async () => {
      if (!cancelled) {
        await fetchTokens();
      }
    };

    loadInitialTokens();

    return () => {
      cancelled = true;
    };
  }, [userId, fetchTokens]);

  const value = useMemo<AgentWalletContextType>(() => ({
    // State
    evmAddress,
    solanaAddress,
    isLoadingAddresses,
    addressError,
    walletView,
    tokens,
    totalUsdValue,
    isLoadingTokens,
    tokensError,
    nfts,
    isLoadingNfts,
    nftsError,
    transactions,
    isLoadingHistory,
    historyError,
    isRefreshing,

    // Derived state
    currentAddress,
    filteredTokens,
    filteredChains,

    // Actions
    setWalletView,
    fetchTokens,
    syncTokens,
    fetchNfts,
    syncNfts,
    fetchHistory,
    refreshAll,
    refreshActive,
  }), [
    evmAddress,
    solanaAddress,
    isLoadingAddresses,
    addressError,
    walletView,
    tokens,
    totalUsdValue,
    isLoadingTokens,
    tokensError,
    nfts,
    isLoadingNfts,
    nftsError,
    transactions,
    isLoadingHistory,
    historyError,
    isRefreshing,
    currentAddress,
    filteredTokens,
    filteredChains,
    fetchTokens,
    syncTokens,
    fetchNfts,
    syncNfts,
    fetchHistory,
    refreshAll,
    refreshActive,
  ]);

  return (
    <AgentWalletContext.Provider value={value}>
      {children}
    </AgentWalletContext.Provider>
  );
}

// Custom hook to consume the context
export function useAgentWallet() {
  const context = useContext(AgentWalletContext);
  if (context === undefined) {
    throw new Error('useAgentWallet must be used within an AgentWalletProvider');
  }
  return context;
}
