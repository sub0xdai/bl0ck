/**
 * Network Mapping Utilities
 *
 * Single source of truth for network name conversions.
 */

/** Internal network type (Solana SDK format) */
export type InternalNetwork = 'mainnet-beta' | 'devnet';

/** Wire format network type (x402 protocol format) */
export type WireNetwork = 'solana-mainnet' | 'solana-devnet';

/**
 * Convert internal network format to wire format
 *
 * @example
 * toWireNetwork('mainnet-beta') // => 'solana-mainnet'
 * toWireNetwork('devnet') // => 'solana-devnet'
 */
export function toWireNetwork(network: InternalNetwork): WireNetwork {
  return network === 'mainnet-beta' ? 'solana-mainnet' : 'solana-devnet';
}

/**
 * Convert wire format to internal network format
 *
 * @example
 * fromWireNetwork('solana-mainnet') // => 'mainnet-beta'
 * fromWireNetwork('solana-devnet') // => 'devnet'
 */
export function fromWireNetwork(network: WireNetwork): InternalNetwork {
  return network === 'solana-mainnet' ? 'mainnet-beta' : 'devnet';
}

/**
 * Check if a string is a valid internal network
 */
export function isInternalNetwork(value: string): value is InternalNetwork {
  return value === 'mainnet-beta' || value === 'devnet';
}

/**
 * Check if a string is a valid wire network
 */
export function isWireNetwork(value: string): value is WireNetwork {
  return value === 'solana-mainnet' || value === 'solana-devnet';
}
