/**
 * x402-solana Type Definitions
 */

import type { Keypair, PublicKey, TransactionSignature } from '@solana/web3.js';

// ============================================================================
// Payment Configuration
// ============================================================================

/**
 * Configuration for x402 payment requirements
 */
export interface X402PaymentConfig {
  /** USDC amount in base units (6 decimals). E.g., 15000 = $0.015 */
  amount: bigint;
  /** Recipient's USDC token account address */
  recipient: PublicKey;
  /** Optional: Human-readable description */
  description?: string;
  /** Optional: Network (defaults to mainnet-beta) */
  network?: 'mainnet-beta' | 'devnet';
}

/**
 * 402 Payment Required response format
 */
export interface X402PaymentRequired {
  /** HTTP status code (always 402) */
  status: 402;
  /** Error message */
  error: string;
  /** Unique request ID (used in memo for payment matching) */
  requestId: string;
  /** Payment details */
  accepts: {
    /** Network identifier */
    network: 'solana-mainnet' | 'solana-devnet';
    /** Token mint address (USDC) */
    token: string;
    /** Amount in base units (6 decimals) */
    amount: string;
    /** Recipient token account */
    payTo: string;
    /** Request ID to include in memo */
    memo: string;
    /** Expiry timestamp (Unix ms) */
    expiresAt: number;
  };
}

// ============================================================================
// Payment Proof
// ============================================================================

/**
 * Payment proof submitted by client
 */
export interface X402PaymentProof {
  /** Solana transaction signature */
  signature: TransactionSignature;
  /** Payer's wallet address */
  payer: string;
  /** Network the payment was made on */
  network: 'solana-mainnet' | 'solana-devnet';
}

/**
 * Verified payment result
 */
export interface X402VerifiedPayment {
  /** Whether payment was valid */
  valid: boolean;
  /** Transaction signature */
  signature: TransactionSignature;
  /** Payer's wallet address */
  payer: string;
  /** Amount transferred (base units) */
  amount: bigint;
  /** Memo content (should contain requestId) */
  memo: string;
  /** Block time of confirmation */
  blockTime?: number;
  /** Error message if invalid */
  error?: string;
}

// ============================================================================
// Client Types
// ============================================================================

/**
 * Options for the payment-wrapped fetch
 */
export interface X402FetchOptions {
  /** Solana keypair for signing payments */
  keypair: Keypair;
  /** Maximum payment willing to make (base units) */
  maxPayment: bigint;
  /** RPC endpoint (defaults to mainnet) */
  rpcEndpoint?: string;
  /** Network (defaults to mainnet-beta) */
  network?: 'mainnet-beta' | 'devnet';
}

// ============================================================================
// Server Types
// ============================================================================

/**
 * Middleware configuration
 */
export interface X402MiddlewareConfig {
  /** USDC amount to charge per request (base units) */
  pricePerRequest: bigint;
  /** Recipient's USDC token account */
  recipientTokenAccount: PublicKey;
  /** RPC endpoint for verification */
  rpcEndpoint: string;
  /** Payment expiry time in ms (default: 5 minutes) */
  paymentExpiryMs?: number;
  /** Network (defaults to mainnet-beta) */
  network?: 'mainnet-beta' | 'devnet';
  /** Optional: Custom payment store */
  paymentStore?: PendingPaymentStore;
}

/**
 * Pending payment record
 */
export interface PendingPayment {
  /** Unique request ID */
  requestId: string;
  /** Expected amount (base units) */
  amount: bigint;
  /** Creation timestamp */
  createdAt: number;
  /** Expiry timestamp */
  expiresAt: number;
  /** Payment status */
  status: 'pending' | 'paid' | 'expired';
  /** Transaction signature (if paid) */
  signature?: TransactionSignature;
  /** Payer address (if paid) */
  payer?: string;
}

/**
 * Interface for pending payment storage
 */
export interface PendingPaymentStore {
  /** Create a new pending payment */
  create(payment: Omit<PendingPayment, 'status'>): Promise<PendingPayment>;
  /** Get payment by requestId */
  get(requestId: string): Promise<PendingPayment | null>;
  /** Mark payment as paid */
  markPaid(requestId: string, signature: TransactionSignature, payer: string): Promise<void>;
  /** Mark payment as expired */
  markExpired(requestId: string): Promise<void>;
  /** Clean up expired payments */
  cleanup(): Promise<number>;
}

// ============================================================================
// Listener Types
// ============================================================================

/**
 * Payment listener configuration
 */
export interface PaymentListenerConfig {
  /** RPC WebSocket endpoint */
  wsEndpoint: string;
  /** Token account to monitor */
  tokenAccount: PublicKey;
  /** Callback when payment received */
  onPayment: (payment: DetectedPayment) => void;
  /** Optional: Error callback */
  onError?: (error: Error) => void;
}

/**
 * Detected incoming payment
 */
export interface DetectedPayment {
  /** Transaction signature */
  signature: TransactionSignature;
  /** Payer's wallet address */
  payer: string;
  /** Amount received (base units) */
  amount: bigint;
  /** Memo content */
  memo: string;
  /** Slot number */
  slot: number;
}
