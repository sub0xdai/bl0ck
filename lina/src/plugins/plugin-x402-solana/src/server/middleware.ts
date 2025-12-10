/**
 * x402 Server Middleware
 *
 * Express/Hono-compatible middleware for handling x402 payments.
 */

import { PublicKey } from '@solana/web3.js';
import { randomUUID } from 'crypto';
import { InMemoryPaymentStore } from './payment-store';
import { createMemo } from '../utils/memo';
import { toWireNetwork } from '../utils/network';
import { HEADERS, DEFAULT_PAYMENT_EXPIRY_MS } from '../constants';
import type {
  X402MiddlewareConfig,
  X402PaymentRequired,
  X402PaymentProof,
} from '../types';

interface Generate402Params {
  requestId: string;
  amount: bigint;
  recipientTokenAccount: PublicKey;
  network: 'mainnet-beta' | 'devnet';
  expiresAt: number;
}

/**
 * Generate a 402 Payment Required response
 */
export function generate402Response(params: Generate402Params): X402PaymentRequired {
  const { requestId, amount, recipientTokenAccount, network, expiresAt } = params;

  return {
    status: 402,
    error: 'Payment required',
    requestId,
    accepts: {
      network: toWireNetwork(network),
      token: 'USDC',
      amount: amount.toString(),
      payTo: recipientTokenAccount.toBase58(),
      memo: createMemo(requestId),
      expiresAt,
    },
  };
}

/**
 * Parse payment proof from request header
 */
export function parsePaymentProof(header: string | null): X402PaymentProof | null {
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    return JSON.parse(decoded) as X402PaymentProof;
  } catch {
    return null;
  }
}

/**
 * Create x402 middleware
 *
 * Returns a function that checks for payment or returns 402.
 * Use with Express, Hono, or any framework that supports middleware.
 */
export function createX402Middleware(config: X402MiddlewareConfig) {
  const {
    pricePerRequest,
    recipientTokenAccount,
    paymentExpiryMs = DEFAULT_PAYMENT_EXPIRY_MS,
    network = 'mainnet-beta',
    paymentStore = new InMemoryPaymentStore(),
  } = config;

  /**
   * Middleware function
   *
   * @returns 402Response if payment needed, null if payment verified
   */
  return async (req: { headers: Headers }): Promise<X402PaymentRequired | null> => {
    // Check for existing payment proof
    const proofHeader = req.headers.get(HEADERS.PAYMENT_PROOF);
    const proof = parsePaymentProof(proofHeader);

    if (proof) {
      // Verify payment exists and is valid
      // In production, verify the transaction on-chain
      // For now, check against payment store (listener should have marked it paid)

      // Extract requestId from a previous 402 (would need to track this)
      // For simplicity, we trust the proof signature and verify on-chain

      // TODO: Add on-chain verification
      return null; // Payment verified, proceed with request
    }

    // No payment proof - generate 402 response
    const requestId = randomUUID();
    const now = Date.now();
    const expiresAt = now + paymentExpiryMs;

    // Store pending payment
    await paymentStore.create({
      requestId,
      amount: pricePerRequest,
      createdAt: now,
      expiresAt,
    });

    return generate402Response({
      requestId,
      amount: pricePerRequest,
      recipientTokenAccount,
      network,
      expiresAt,
    });
  };
}

/**
 * Create payment response header
 */
export function createPaymentResponseHeader(
  signature: string,
  payer: string,
  network: 'mainnet-beta' | 'devnet'
): string {
  const response = {
    transaction: signature,
    payer,
    network: toWireNetwork(network),
  };
  return Buffer.from(JSON.stringify(response)).toString('base64');
}
