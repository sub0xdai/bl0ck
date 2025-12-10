/**
 * x402 Fetch Wrapper for Solana
 *
 * Wraps fetch to automatically handle 402 Payment Required responses
 * by building, signing, and submitting USDC-SPL payments.
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { buildPaymentTransaction, sendPaymentTransaction } from './payment-builder';
import { HEADERS } from '../constants';
import { isX402PaymentRequired, isValidBase58PublicKey } from '../guards';
import {
  X402ValidationError,
  X402ExpirationError,
  X402AmountError,
} from '../errors';
import type { X402FetchOptions, X402PaymentRequired, X402PaymentProof } from '../types';
import { toWireNetwork } from '../utils/network';

/**
 * Function type compatible with fetch() for wrapping
 * Uses a narrower type than `typeof fetch` to avoid platform-specific properties like `preconnect`
 */
export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/**
 * Wrap fetch with automatic Solana USDC payment handling
 *
 * @param fetchFn - The fetch function to wrap (e.g., global fetch, node-fetch)
 * @param options - Payment configuration options
 * @returns A wrapped fetch function that handles 402 Payment Required responses
 */
export function wrapFetchWithSolanaPayment(
  fetchFn: FetchLike,
  options: X402FetchOptions
): FetchLike {
  const { keypair, maxPayment, rpcEndpoint, network = 'mainnet-beta' } = options;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Make initial request
    const response = await fetchFn(input, init);

    // If not 402, return as-is
    if (response.status !== 402) {
      return response;
    }

    // Parse 402 response
    let paymentRequired: X402PaymentRequired;
    try {
      const json = await response.json();
      if (!isX402PaymentRequired(json)) {
        throw new X402ValidationError('Invalid 402 response format');
      }
      paymentRequired = json;
    } catch (error) {
      if (error instanceof X402ValidationError) {
        throw error;
      }
      throw new X402ValidationError('Invalid 402 response format');
    }

    // Validate payment details
    const amount = BigInt(paymentRequired.accepts.amount);
    if (amount > maxPayment) {
      throw new X402AmountError(
        `Payment amount ${amount} exceeds maximum ${maxPayment}`,
        amount,
        maxPayment
      );
    }

    // Check expiry
    if (Date.now() > paymentRequired.accepts.expiresAt) {
      throw new X402ExpirationError('Payment request has expired');
    }

    // Validate payTo is a valid public key
    if (!isValidBase58PublicKey(paymentRequired.accepts.payTo)) {
      throw new X402ValidationError(
        `Invalid recipient address: ${paymentRequired.accepts.payTo}`
      );
    }

    // Build payment transaction
    const recipientTokenAccount = new PublicKey(paymentRequired.accepts.payTo);
    const transaction = await buildPaymentTransaction({
      payer: keypair,
      recipientTokenAccount,
      amount,
      memo: paymentRequired.accepts.memo,
      rpcEndpoint,
      network,
    });

    // Send payment
    const signature = await sendPaymentTransaction(transaction, keypair, rpcEndpoint);

    // Create payment proof
    const paymentProof: X402PaymentProof = {
      signature,
      payer: keypair.publicKey.toBase58(),
      network: toWireNetwork(network),
    };

    // Encode proof as base64
    const proofHeader = Buffer.from(JSON.stringify(paymentProof)).toString('base64');

    // Retry request with payment proof
    const retryInit: RequestInit = {
      ...init,
      headers: {
        ...((init?.headers as Record<string, string>) || {}),
        [HEADERS.PAYMENT_PROOF]: proofHeader,
      },
    };

    return fetchFn(input, retryInit);
  };
}
