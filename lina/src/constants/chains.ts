import { base, mainnet, polygon, baseSepolia, sepolia, arbitrum, optimism, scroll } from 'viem/chains';
import type { Chain } from 'viem/chains';

/**
 * Chain Configuration System - Multi-Chain Support (EVM + Solana)
 *
 * Uses discriminated union (`chainType: 'evm' | 'solana'`) for type safety.
 *
 * ## Type Guards
 * Use type guards to access chain-specific properties:
 * ```typescript
 * const config = getChainConfig('solana');
 * if (isSolanaChainConfig(config)) {
 *   console.log(config.cluster); // TypeScript knows this exists
 * }
 * ```
 *
 * ## Helper Functions
 * - `getEvmConfig()` / `getSolanaConfig()` - Typed config getters
 * - `isEvmNetwork()` / `isSolanaNetwork()` - Network type guards
 * - `getSolanaRpcUrl()` / `getRpcUrl()` - RPC endpoint getters
 *
 * @module constants/chains
 */

/**
 * Solana-specific network identifiers
 */
export type SolanaNetwork = 'solana' | 'solana-devnet';

/**
 * EVM-specific network identifiers
 */
export type EvmNetwork = 'base' | 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'scroll' | 'base-sepolia' | 'ethereum-sepolia';

/**
 * All supported blockchain networks (EVM + Solana)
 */
export type SupportedNetwork = EvmNetwork | SolanaNetwork;

/**
 * Base configuration shared by all chain types
 */
interface BaseChainConfig {
  name: string;
  explorerUrl: string;
  nativeToken: {
    symbol: string;
    name: string;
    coingeckoId: string;
    decimals: number;
  };
  coingeckoPlatform: string;
}

/**
 * EVM chain configuration (uses viem)
 */
export interface EvmChainConfig extends BaseChainConfig {
  chainType: 'evm';
  chain: Chain; // viem chain object
  rpcUrl: (alchemyKey: string) => string;
  swap: {
    cdpSupported: boolean; // Does CDP SDK support swaps on this network?
  };
}

/**
 * Solana chain configuration
 */
export interface SolanaChainConfig extends BaseChainConfig {
  chainType: 'solana';
  cluster: 'mainnet-beta' | 'devnet' | 'testnet';
  rpcUrl: (heliusKey?: string) => string;
  swap: {
    jupiterSupported: boolean; // Jupiter aggregator support
  };
}

/**
 * Discriminated union of all chain configurations
 */
export type ChainConfig = EvmChainConfig | SolanaChainConfig;

/**
 * Centralized chain configurations
 * Add new chains here to support them across the entire application
 */
export const CHAIN_CONFIGS: Record<SupportedNetwork, ChainConfig> = {
  'base': {
    chainType: 'evm',
    name: 'Base',
    chain: base,
    rpcUrl: (alchemyKey: string) => `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://basescan.org',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'base',
    swap: {
      cdpSupported: true, // CDP SDK supports Base swaps
    },
  },
  'ethereum': {
    chainType: 'evm',
    name: 'Ethereum',
    chain: mainnet,
    rpcUrl: (alchemyKey: string) => `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://etherscan.io',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'ethereum',
    swap: {
      cdpSupported: true, // CDP SDK supports Ethereum swaps
    },
  },
  'polygon': {
    chainType: 'evm',
    name: 'Polygon',
    chain: polygon,
    rpcUrl: (alchemyKey: string) => `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://polygonscan.com',
    nativeToken: {
      symbol: 'POL',
      name: 'Polygon',
      coingeckoId: 'polygon-ecosystem-token',
      decimals: 18,
    },
    coingeckoPlatform: 'polygon-pos',
    swap: {
      cdpSupported: false, // CDP SDK does NOT support Polygon swaps
    },
  },
  'arbitrum': {
    chainType: 'evm',
    name: 'Arbitrum',
    chain: arbitrum,
    rpcUrl: (alchemyKey: string) => `https://arb-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://arbiscan.io',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'arbitrum-one',
    swap: {
      cdpSupported: false, // CDP SDK does NOT support Arbitrum swaps
    },
  },
  'optimism': {
    chainType: 'evm',
    name: 'Optimism',
    chain: optimism,
    rpcUrl: (alchemyKey: string) => `https://opt-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'optimistic-ethereum',
    swap: {
      cdpSupported: false, // CDP SDK does NOT support Optimism swaps
    },
  },
  'scroll': {
    chainType: 'evm',
    name: 'Scroll',
    chain: scroll,
    rpcUrl: (alchemyKey: string) => `https://scroll-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://scrollscan.com',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'scroll',
    swap: {
      cdpSupported: false, // CDP SDK does NOT support Scroll swaps
    },
  },
  'base-sepolia': {
    chainType: 'evm',
    name: 'Base Sepolia',
    chain: baseSepolia,
    rpcUrl: (alchemyKey: string) => `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://sepolia.basescan.org',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'base',
    swap: {
      cdpSupported: false, // Testnet - no CDP swap support
    },
  },
  'ethereum-sepolia': {
    chainType: 'evm',
    name: 'Ethereum Sepolia',
    chain: sepolia,
    rpcUrl: (alchemyKey: string) => `https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`,
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeToken: {
      symbol: 'ETH',
      name: 'Ethereum',
      coingeckoId: 'ethereum',
      decimals: 18,
    },
    coingeckoPlatform: 'ethereum',
    swap: {
      cdpSupported: false, // Testnet - no CDP swap support
    },
  },
  'solana': {
    chainType: 'solana',
    name: 'Solana',
    cluster: 'mainnet-beta',
    rpcUrl: (heliusKey?: string) =>
      heliusKey
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
        : 'https://api.mainnet-beta.solana.com',
    explorerUrl: 'https://solscan.io',
    nativeToken: {
      symbol: 'SOL',
      name: 'Solana',
      coingeckoId: 'solana',
      decimals: 9,
    },
    coingeckoPlatform: 'solana',
    swap: {
      jupiterSupported: true,
    },
  },
  'solana-devnet': {
    chainType: 'solana',
    name: 'Solana Devnet',
    cluster: 'devnet',
    rpcUrl: (heliusKey?: string) =>
      heliusKey
        ? `https://devnet.helius-rpc.com/?api-key=${heliusKey}`
        : 'https://api.devnet.solana.com',
    explorerUrl: 'https://solscan.io',
    nativeToken: {
      symbol: 'SOL',
      name: 'Solana',
      coingeckoId: 'solana',
      decimals: 9,
    },
    coingeckoPlatform: 'solana',
    swap: {
      jupiterSupported: false,
    },
  },
};

/**
 * Get mainnet networks only (excludes testnets)
 */
export const MAINNET_NETWORKS: SupportedNetwork[] = [
  'base', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'scroll',
  'solana',
];

/**
 * Get testnet networks only
 */
export const TESTNET_NETWORKS: SupportedNetwork[] = [
  'base-sepolia', 'ethereum-sepolia',
  'solana-devnet',
];

/**
 * Get all supported networks
 */
export const ALL_NETWORKS: SupportedNetwork[] = Object.keys(CHAIN_CONFIGS) as SupportedNetwork[];

/**
 * Type guard: Check if a network is Solana
 */
export function isSolanaNetwork(network: string): network is SolanaNetwork {
  return network === 'solana' || network === 'solana-devnet';
}

/**
 * Type guard: Check if a network is EVM
 */
export function isEvmNetwork(network: string): network is EvmNetwork {
  const evmNetworks: EvmNetwork[] = [
    'base', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'scroll',
    'base-sepolia', 'ethereum-sepolia'
  ];
  return evmNetworks.includes(network as EvmNetwork);
}

/**
 * Type guard: Check if config is EVM chain
 */
export function isEvmChainConfig(config: ChainConfig): config is EvmChainConfig {
  return config.chainType === 'evm';
}

/**
 * Type guard: Check if config is Solana chain
 */
export function isSolanaChainConfig(config: ChainConfig): config is SolanaChainConfig {
  return config.chainType === 'solana';
}

/**
 * Helper: Get chain config by network name
 */
export function getChainConfig(network: string): ChainConfig | null {
  return CHAIN_CONFIGS[network as SupportedNetwork] || null;
}

/**
 * Helper: Get viem chain object by network name (EVM only)
 * Returns null for Solana networks
 */
export function getViemChain(network: string): Chain | null {
  const config = getChainConfig(network);
  return config && isEvmChainConfig(config) ? config.chain : null;
}

/**
 * Helper: Get RPC URL for a network
 * @param network - Network identifier
 * @param alchemyKey - Alchemy API key (EVM chains only)
 * @param heliusKey - Helius API key (Solana chains only)
 */
export function getRpcUrl(
  network: string,
  alchemyKey?: string,
  heliusKey?: string
): string | null {
  const config = getChainConfig(network);
  if (!config) return null;

  if (isEvmChainConfig(config)) {
    return alchemyKey ? config.rpcUrl(alchemyKey) : null;
  } else if (isSolanaChainConfig(config)) {
    return config.rpcUrl(heliusKey);
  }

  return null;
}

/**
 * Helper: Get explorer URL for a network
 */
export function getExplorerUrl(network: string): string | null {
  const config = getChainConfig(network);
  return config?.explorerUrl || null;
}

/**
 * Helper: Get transaction explorer URL
 * Handles both EVM tx hashes and Solana signatures
 * For Solana, use getSolanaTxExplorerUrl() for cluster control
 */
export function getTxExplorerUrl(network: string, txHash: string): string | null {
  const config = getChainConfig(network);
  if (!config) return null;

  if (isSolanaChainConfig(config)) {
    const clusterParam = config.cluster === 'mainnet-beta' ? '' : `?cluster=${config.cluster}`;
    return `${config.explorerUrl}/tx/${txHash}${clusterParam}`;
  } else {
    return `${config.explorerUrl}/tx/${txHash}`;
  }
}

/**
 * Helper: Get address explorer URL
 * Handles both EVM addresses and Solana public keys
 * For Solana, use getSolanaAddressExplorerUrl() for cluster control
 */
export function getAddressExplorerUrl(network: string, address: string): string | null {
  const config = getChainConfig(network);
  if (!config) return null;

  if (isSolanaChainConfig(config)) {
    const clusterParam = config.cluster === 'mainnet-beta' ? '' : `?cluster=${config.cluster}`;
    return `${config.explorerUrl}/account/${address}${clusterParam}`;
  } else {
    return `${config.explorerUrl}/address/${address}`;
  }
}

/**
 * Helper: Get native token info for a network
 */
export function getNativeTokenInfo(network: string) {
  const config = getChainConfig(network);
  return config?.nativeToken || null;
}

/**
 * Helper: Get CoinGecko platform ID for a network
 */
export function getCoingeckoPlatform(network: string): string | null {
  const config = getChainConfig(network);
  return config?.coingeckoPlatform || null;
}

/**
 * Helper: Check if a network is supported
 */
export function isSupportedNetwork(network: string): network is SupportedNetwork {
  return network in CHAIN_CONFIGS;
}

/**
 * Helper: Check if a network is a mainnet
 */
export function isMainnet(network: string): boolean {
  return MAINNET_NETWORKS.includes(network as SupportedNetwork);
}

/**
 * Helper: Check if a network is a testnet
 */
export function isTestnet(network: string): boolean {
  return TESTNET_NETWORKS.includes(network as SupportedNetwork);
}

/**
 * Helper: Check if CDP SDK supports swaps on a network (EVM only)
 * Always returns false for Solana networks
 */
export function isCdpSwapSupported(network: string): boolean {
  const config = getChainConfig(network);
  return config && isEvmChainConfig(config) ? config.swap.cdpSupported : false;
}

/**
 * Helper: Get networks that support CDP swaps
 */
export function getCdpSwapSupportedNetworks(): SupportedNetwork[] {
  return ALL_NETWORKS.filter(network => isCdpSwapSupported(network));
}

/**
 * Helper: Get Solana chain config (typed narrowing)
 */
export function getSolanaConfig(network: string): SolanaChainConfig | null {
  const config = getChainConfig(network);
  return config && isSolanaChainConfig(config) ? config : null;
}

/**
 * Helper: Get EVM chain config (typed narrowing)
 */
export function getEvmConfig(network: string): EvmChainConfig | null {
  const config = getChainConfig(network);
  return config && isEvmChainConfig(config) ? config : null;
}

/**
 * Helper: Get Solana RPC URL
 * @param network - Solana network identifier
 * @param heliusKey - Optional Helius API key (falls back to public RPC)
 */
export function getSolanaRpcUrl(network: string, heliusKey?: string): string | null {
  const config = getSolanaConfig(network);
  return config ? config.rpcUrl(heliusKey) : null;
}

/**
 * Helper: Get Solana cluster type
 */
export function getSolanaCluster(network: string): 'mainnet-beta' | 'devnet' | 'testnet' | null {
  const config = getSolanaConfig(network);
  return config?.cluster || null;
}

/**
 * Helper: Check if Jupiter swaps are supported on a Solana network
 */
export function isJupiterSwapSupported(network: string): boolean {
  const config = getSolanaConfig(network);
  return config?.swap.jupiterSupported || false;
}

/**
 * Helper: Get networks that support Jupiter swaps
 */
export function getJupiterSwapSupportedNetworks(): SolanaNetwork[] {
  return ALL_NETWORKS.filter(
    (network): network is SolanaNetwork =>
      isSolanaNetwork(network) && isJupiterSwapSupported(network)
  );
}

/**
 * Helper: Get Solana explorer URL for transaction
 * @param network - Solana network identifier
 * @param txSignature - Transaction signature (base58 encoded)
 * @param cluster - Optional cluster query param (auto-detected from network if omitted)
 */
export function getSolanaTxExplorerUrl(
  network: string,
  txSignature: string,
  cluster?: 'mainnet-beta' | 'devnet' | 'testnet'
): string | null {
  const config = getSolanaConfig(network);
  if (!config) return null;

  const clusterParam = cluster || config.cluster;
  const queryString = clusterParam === 'mainnet-beta' ? '' : `?cluster=${clusterParam}`;

  return `${config.explorerUrl}/tx/${txSignature}${queryString}`;
}

/**
 * Helper: Get Solana explorer URL for address
 * @param network - Solana network identifier
 * @param address - Base58-encoded public key
 * @param cluster - Optional cluster query param (auto-detected from network if omitted)
 */
export function getSolanaAddressExplorerUrl(
  network: string,
  address: string,
  cluster?: 'mainnet-beta' | 'devnet' | 'testnet'
): string | null {
  const config = getSolanaConfig(network);
  if (!config) return null;

  const clusterParam = cluster || config.cluster;
  const queryString = clusterParam === 'mainnet-beta' ? '' : `?cluster=${clusterParam}`;

  return `${config.explorerUrl}/account/${address}${queryString}`;
}

// ============================================================================
// Swap Protocol Constants
// ============================================================================

/**
 * Native token address used by swap protocols (0x + Ee repeated)
 * This special address represents native tokens (ETH, MATIC, etc.) in swap protocols
 */
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/**
 * Normalize token address for swap protocols
 * If the token address is not a valid contract address (0x...), treat it as native token
 */
export function normalizeTokenAddress(token: string): string {
  // Check if it's already a valid contract address (0x followed by 40 hex chars)
  if (/^0x[a-fA-F0-9]{40}$/.test(token)) {
    return token;
  }
  // Otherwise, treat it as native token
  return NATIVE_TOKEN_ADDRESS;
}

/**
 * Uniswap V3 SwapRouter addresses per network
 */
export const UNISWAP_V3_ROUTER: Record<string, string> = {
  'ethereum': '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  'polygon': '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  'arbitrum': '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  'optimism': '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  'base': '0x2626664c2603336E57B271c5C0b26F421741e481',
};

/**
 * Uniswap V3 Quoter V2 addresses per network
 */
export const UNISWAP_V3_QUOTER: Record<string, string> = {
  'ethereum': '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  'polygon': '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  'arbitrum': '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  'optimism': '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  'base': '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
};

/**
 * Wrapped native token addresses per network
 * Uniswap V3 requires wrapped tokens for native currency swaps
 */
export const WRAPPED_NATIVE_TOKEN: Record<string, string> = {
  'ethereum': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  'polygon': '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',  // WMATIC
  'arbitrum': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
  'optimism': '0x4200000000000000000000000000000000000006', // WETH
  'base': '0x4200000000000000000000000000000000000006',     // WETH
};

/**
 * Uniswap V3 pool fee tiers (in hundredths of a bip, i.e. 1e-6)
 */
export const UNISWAP_POOL_FEES = {
  LOW: 500,      // 0.05%
  MEDIUM: 3000,  // 0.3%
  HIGH: 10000,   // 1%
};
