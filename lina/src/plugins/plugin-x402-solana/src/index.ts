/**
 * x402-solana: Solana-native payment protocol plugin
 *
 * Provides both client and server functionality for x402 payments using USDC-SPL.
 */

import type { Plugin } from '@elizaos/core';

export const x402SolanaPlugin: Plugin = {
  name: 'x402-solana',
  description: 'Solana-native x402 payment protocol for API micropayments',
  evaluators: [],
  providers: [],
  actions: [],
  services: [],
};

export default x402SolanaPlugin;

// Re-exports will be added as we implement each module
