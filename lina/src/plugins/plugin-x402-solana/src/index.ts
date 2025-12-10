/**
 * x402-solana: Solana-native payment protocol plugin
 *
 * Provides both client and server functionality for x402 payments using USDC-SPL.
 *
 * ## Client Usage
 * ```typescript
 * import { wrapFetchWithSolanaPayment } from '@elizaos/plugin-x402-solana';
 *
 * const paidFetch = wrapFetchWithSolanaPayment(fetch, {
 *   keypair: myKeypair,
 *   maxPayment: BigInt(100000), // $0.10 max
 *   rpcEndpoint: 'https://api.mainnet-beta.solana.com',
 * });
 *
 * const response = await paidFetch('https://api.example.com/paid-endpoint');
 * ```
 *
 * ## Server Usage
 * ```typescript
 * import { createX402Middleware, PaymentListener } from '@elizaos/plugin-x402-solana';
 *
 * const middleware = createX402Middleware({
 *   pricePerRequest: BigInt(15000), // $0.015
 *   recipientTokenAccount: myUsdcAccount,
 *   rpcEndpoint: 'https://api.mainnet-beta.solana.com',
 * });
 * ```
 */

import type { Plugin } from '@elizaos/core';

// Client exports
export {
  wrapFetchWithSolanaPayment,
  buildPaymentTransaction,
  sendPaymentTransaction,
} from './client';
export type { BuildPaymentParams } from './client';

// Server exports
export {
  createX402Middleware,
  generate402Response,
  parsePaymentProof,
  createPaymentResponseHeader,
  PaymentListener,
  InMemoryPaymentStore,
} from './server';

// Utils exports
export {
  parseMemo,
  extractRequestId,
  createMemo,
  toWireNetwork,
  fromWireNetwork,
} from './utils';

// Type guards
export {
  isX402PaymentRequired,
  isX402PaymentProof,
  isValidBase58PublicKey,
  isValidTransactionSignature,
} from './guards';

// Error classes
export {
  X402PaymentError,
  X402ValidationError,
  X402NetworkError,
  X402TransactionError,
  X402ExpiredError,
} from './errors';

// Types
export type {
  X402PaymentConfig,
  X402PaymentRequired,
  X402PaymentProof,
  X402VerifiedPayment,
  X402FetchOptions,
  X402MiddlewareConfig,
  PendingPayment,
  PendingPaymentStore,
  PaymentListenerConfig,
  DetectedPayment,
} from './types';

// Constants
export {
  USDC_MINT_MAINNET,
  USDC_MINT_DEVNET,
  MEMO_PROGRAM_ID,
  RPC_ENDPOINTS,
  WS_ENDPOINTS,
  DEFAULT_PAYMENT_EXPIRY_MS,
  MEMO_PREFIX,
  HEADERS,
  USDC_DECIMALS,
} from './constants';

// Plugin definition (for ElizaOS integration)
export const x402SolanaPlugin: Plugin = {
  name: 'x402-solana',
  description: 'Solana-native x402 payment protocol for API micropayments',
  evaluators: [],
  providers: [],
  actions: [],
  services: [],
};

export default x402SolanaPlugin;
