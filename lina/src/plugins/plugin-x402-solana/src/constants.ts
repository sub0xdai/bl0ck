/**
 * x402-solana Constants
 */

import { PublicKey } from '@solana/web3.js';

/** USDC-SPL mint address on Solana mainnet */
export const USDC_MINT_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

/** USDC-SPL mint address on Solana devnet */
export const USDC_MINT_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

/** SPL Memo program ID */
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/** Default RPC endpoints */
export const RPC_ENDPOINTS = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
} as const;

/** Default WebSocket endpoints */
export const WS_ENDPOINTS = {
  'mainnet-beta': 'wss://api.mainnet-beta.solana.com',
  devnet: 'wss://api.devnet.solana.com',
} as const;

/** Default payment expiry (5 minutes) */
export const DEFAULT_PAYMENT_EXPIRY_MS = 5 * 60 * 1000;

/** Request ID prefix for memo parsing */
export const MEMO_PREFIX = 'x402:';

/** HTTP header names */
export const HEADERS = {
  /** Client sends payment proof in this header */
  PAYMENT_PROOF: 'x-payment-proof',
  /** Server sends payment receipt in this header */
  PAYMENT_RESPONSE: 'x-payment-response',
} as const;

/** USDC decimals */
export const USDC_DECIMALS = 6;
