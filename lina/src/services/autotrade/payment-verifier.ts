// src/services/autotrade/payment-verifier.ts
/**
 * Payment verification abstraction for autotrade subscriptions.
 *
 * This module provides an interface for verifying Solana payment transactions,
 * with implementations for different environments:
 * - NoOpPaymentVerifier: For devnet/testing (trusts any signature)
 * - SolanaPaymentVerifier: For mainnet (verifies on-chain)
 */
import { logger } from '@elizaos/core';
import type { Connection } from '@solana/web3.js';

/**
 * Parameters for payment verification
 */
export interface PaymentVerificationParams {
  /** The transaction signature to verify */
  signature: string;
  /** Expected payment amount in base units (e.g., '1000000' for 1 USDC) */
  expectedAmount: string;
  /** Expected recipient wallet address */
  expectedRecipient: string;
}

/**
 * Result of payment verification
 */
export interface PaymentVerificationResult {
  /** Whether the payment is valid */
  valid: boolean;
  /** Error message if verification failed */
  error?: string;
  /** The actual amount transferred (if available) */
  actualAmount?: string;
  /** The actual recipient (if available) */
  actualRecipient?: string;
}

/**
 * Interface for payment verification strategies
 *
 * Implementations should verify that a given transaction signature
 * represents a valid payment to the expected recipient for the expected amount.
 */
export interface PaymentVerifier {
  /**
   * Verify a payment transaction
   *
   * @param params - Verification parameters
   * @returns Verification result indicating if payment is valid
   */
  verify(params: PaymentVerificationParams): Promise<PaymentVerificationResult>;
}

/**
 * No-op payment verifier for devnet/testing.
 *
 * Always returns valid=true without checking on-chain.
 * Use only in development or testing environments.
 */
export class NoOpPaymentVerifier implements PaymentVerifier {
  async verify(_params: PaymentVerificationParams): Promise<PaymentVerificationResult> {
    logger.debug('[NoOpPaymentVerifier] Skipping verification (devnet mode)');
    return { valid: true };
  }
}

/**
 * Solana on-chain payment verifier for production.
 *
 * Verifies that the transaction:
 * 1. Exists on-chain
 * 2. Did not fail
 * 3. (Future) Transferred the correct amount to the correct recipient
 */
export class SolanaPaymentVerifier implements PaymentVerifier {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async verify(params: PaymentVerificationParams): Promise<PaymentVerificationResult> {
    const { signature, expectedAmount, expectedRecipient } = params;

    try {
      // Fetch the transaction from chain
      const tx = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        logger.warn(`[SolanaPaymentVerifier] Transaction not found: ${signature}`);
        return {
          valid: false,
          error: `Transaction not found: ${signature}`,
        };
      }

      // Check if transaction failed
      if (tx.meta?.err) {
        logger.warn(`[SolanaPaymentVerifier] Transaction failed: ${JSON.stringify(tx.meta.err)}`);
        return {
          valid: false,
          error: `Transaction failed: ${JSON.stringify(tx.meta.err)}`,
        };
      }

      // TODO: Implement full verification:
      // 1. Parse token transfer instructions
      // 2. Verify recipient matches expectedRecipient
      // 3. Verify amount matches expectedAmount
      // 4. Verify token is USDC
      //
      // For now, if transaction exists and didn't fail, we accept it.
      // This is a security improvement over the previous TODO comment
      // but still needs the amount/recipient checks for production.

      logger.info(`[SolanaPaymentVerifier] Verified transaction: ${signature}`);
      return { valid: true };

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[SolanaPaymentVerifier] Verification error: ${msg}`);
      return {
        valid: false,
        error: msg,
      };
    }
  }
}

/**
 * Factory function to create the appropriate verifier based on network
 */
export function createPaymentVerifier(
  network: 'mainnet-beta' | 'devnet',
  connection?: Connection
): PaymentVerifier {
  if (network === 'devnet') {
    logger.info('[PaymentVerifier] Using NoOpPaymentVerifier for devnet');
    return new NoOpPaymentVerifier();
  }

  if (!connection) {
    throw new Error('Connection required for mainnet payment verification');
  }

  logger.info('[PaymentVerifier] Using SolanaPaymentVerifier for mainnet');
  return new SolanaPaymentVerifier(connection);
}
