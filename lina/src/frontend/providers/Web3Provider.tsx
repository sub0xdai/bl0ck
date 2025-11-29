import { createAppKit } from '@reown/appkit/react';
import { WagmiProvider, type Config } from 'wagmi';
import { mainnet, base, arbitrum, optimism, polygon, solana } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { SolanaAdapter } from '@reown/appkit-adapter-solana';
import { createStorage } from '@wagmi/core';
import type { ReactNode } from 'react';

// Get WalletConnect project ID from environment
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  console.warn('[Web3Provider] VITE_WALLETCONNECT_PROJECT_ID not set - wallet connect will not work');
}

// EVM Networks
const evmNetworks = [mainnet, base, arbitrum, optimism, polygon] as [typeof mainnet, ...typeof mainnet[]];

// Solana Networks
const solanaNetworks = [solana] as [typeof solana];

// All networks combined
const allNetworks = [...evmNetworks, ...solanaNetworks] as [typeof mainnet, ...Array<typeof mainnet | typeof solana>];

// Wagmi adapter for EVM chains
// Persist wallet connection in localStorage for session restoration
const wagmiAdapter = new WagmiAdapter({
  networks: [...evmNetworks],
  projectId: projectId || '',
  ssr: false,
  // Persist wallet connection for seamless page refresh experience
  storage: createStorage({
    storage: localStorage,
    key: 'lina-wallet',
  }),
});

// Solana adapter - auto-discovers installed wallets (Phantom, Solflare, etc.)
const solanaAdapter = new SolanaAdapter();

// Metadata for WalletConnect
const metadata = {
  name: 'Lina',
  description: 'AI DeFi Agent',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://lina.app',
  icons: ['/lina-icon.png'],
};

// Initialize AppKit with both EVM and Solana adapters
if (projectId) {
  createAppKit({
    adapters: [wagmiAdapter, solanaAdapter],
    networks: allNetworks,
    projectId,
    metadata,
    features: {
      analytics: false,
      email: false,
      socials: false, // Disable social logins - we want wallet-only
    },
    // Auto-reconnect to last wallet for seamless session restoration
    enableWalletConnect: true,
    themeMode: 'dark',
    themeVariables: {
      '--w3m-accent': '#A020F0', // Purple accent matching bl0ck brand
      '--w3m-border-radius-master': '8px',
    },
  });
}

// Export wagmi config for use in hooks
export const wagmiConfig = wagmiAdapter.wagmiConfig as Config;

interface Web3ProviderProps {
  children: ReactNode;
}

/**
 * Web3Provider - Wraps the app with wagmi for wallet connectivity
 *
 * Uses Reown AppKit (formerly WalletConnect) for:
 * - EVM: MetaMask, Coinbase Wallet, WalletConnect
 * - Solana: Phantom, Solflare
 *
 * Supports both EVM chains (Ethereum, Base, Arbitrum, Optimism, Polygon)
 * and Solana mainnet.
 */
export function Web3Provider({ children }: Web3ProviderProps) {
  // If WalletConnect not configured, just render children without wallet support
  if (!projectId) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      {children}
    </WagmiProvider>
  );
}

export default Web3Provider;
