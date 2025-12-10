/**
 * Runtime Type Guards for x402-solana
 *
 * These functions validate untrusted input at runtime.
 * Critical for security in payment protocol handling.
 */

import type {
  X402PaymentRequired,
  X402PaymentProof,
  PendingPayment,
  DetectedPayment,
} from './types';

/**
 * Validate that a value is a non-null object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Validate X402PaymentRequired response from server
 */
export function isX402PaymentRequired(value: unknown): value is X402PaymentRequired {
  if (!isObject(value)) return false;

  if (value.status !== 402) return false;
  if (typeof value.error !== 'string') return false;
  if (typeof value.requestId !== 'string') return false;

  const accepts = value.accepts;
  if (!isObject(accepts)) return false;

  if (accepts.network !== 'solana-mainnet' && accepts.network !== 'solana-devnet') return false;
  if (typeof accepts.token !== 'string') return false;
  if (typeof accepts.amount !== 'string') return false;
  if (typeof accepts.payTo !== 'string') return false;
  if (typeof accepts.memo !== 'string') return false;
  if (typeof accepts.expiresAt !== 'number') return false;

  return true;
}

/**
 * Validate X402PaymentProof from client
 */
export function isX402PaymentProof(value: unknown): value is X402PaymentProof {
  if (!isObject(value)) return false;

  if (typeof value.signature !== 'string') return false;
  if (typeof value.payer !== 'string') return false;
  if (value.network !== 'solana-mainnet' && value.network !== 'solana-devnet') return false;

  // Validate signature format (base58, 88 chars)
  if (!/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(value.signature)) return false;

  // Validate payer is valid base58 pubkey (32-44 chars)
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.payer)) return false;

  return true;
}

/**
 * Validate PendingPayment record
 */
export function isPendingPayment(value: unknown): value is PendingPayment {
  if (!isObject(value)) return false;

  if (typeof value.requestId !== 'string') return false;
  if (typeof value.amount !== 'bigint') return false;
  if (typeof value.createdAt !== 'number') return false;
  if (typeof value.expiresAt !== 'number') return false;
  if (value.status !== 'pending' && value.status !== 'paid' && value.status !== 'expired') {
    return false;
  }

  // Optional fields
  if (value.signature !== undefined && typeof value.signature !== 'string') return false;
  if (value.payer !== undefined && typeof value.payer !== 'string') return false;

  return true;
}

/**
 * Validate DetectedPayment from listener
 */
export function isDetectedPayment(value: unknown): value is DetectedPayment {
  if (!isObject(value)) return false;

  if (typeof value.signature !== 'string') return false;
  if (typeof value.payer !== 'string') return false;
  if (typeof value.amount !== 'bigint') return false;
  if (typeof value.memo !== 'string') return false;
  if (typeof value.slot !== 'number') return false;

  return true;
}

/**
 * Validate Solana base58 public key format
 */
export function isValidBase58PublicKey(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

/**
 * Validate Solana transaction signature format
 */
export function isValidTransactionSignature(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(value);
}
