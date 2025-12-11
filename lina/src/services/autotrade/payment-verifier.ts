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
import { PublicKey, type Connection, type ParsedInstruction, type PartiallyDecodedInstruction } from '@solana/web3.js';

// SPL Token program ID
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

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
 * 1. Exists on-chain and didn't fail
 * 2. Contains an SPL token transfer to the expected recipient
 * 3. Transferred at least the expected amount
 * 4. Transfer was in USDC (correct mint)
 */
export class SolanaPaymentVerifier implements PaymentVerifier {
  private connection: Connection;
  private usdcMint: string;

  constructor(connection: Connection, usdcMint: string) {
    this.connection = connection;
    this.usdcMint = usdcMint;
  }

  async verify(params: PaymentVerificationParams): Promise<PaymentVerificationResult> {
    const { signature, expectedAmount, expectedRecipient } = params;

    try {
      // Fetch the parsed transaction from chain
      const tx = await this.connection.getParsedTransaction(signature, {
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

      // Parse instructions to find token transfers
      const instructions = tx.transaction.message.instructions;
      const tokenTransfers = this.findTokenTransfers(instructions, tx.meta?.innerInstructions ?? undefined);

      // Look for a transfer to the expected recipient with correct amount and mint
      const expectedAmountBigInt = BigInt(expectedAmount);
      let totalTransferred = 0n;
      let foundTransfer = false;

      for (const transfer of tokenTransfers) {
        // Check mint is USDC
        if (transfer.mint !== this.usdcMint) {
          continue;
        }

        // Check destination matches expected recipient's token account
        // The recipient could be either the wallet address or its associated token account
        if (this.isRecipientMatch(transfer.destination, expectedRecipient)) {
          totalTransferred += BigInt(transfer.amount);
          foundTransfer = true;
        }
      }

      if (!foundTransfer) {
        logger.warn(`[SolanaPaymentVerifier] No USDC transfer found to recipient ${expectedRecipient.substring(0, 8)}...`);
        return {
          valid: false,
          error: 'No USDC transfer found to expected recipient',
          actualRecipient: tokenTransfers[0]?.destination,
        };
      }

      if (totalTransferred < expectedAmountBigInt) {
        logger.warn(`[SolanaPaymentVerifier] Insufficient amount: expected ${expectedAmount}, got ${totalTransferred}`);
        return {
          valid: false,
          error: `Insufficient payment: expected ${expectedAmount}, received ${totalTransferred}`,
          actualAmount: totalTransferred.toString(),
          actualRecipient: expectedRecipient,
        };
      }

      logger.info(`[SolanaPaymentVerifier] Verified transaction: ${signature} (${totalTransferred} to ${expectedRecipient.substring(0, 8)}...)`);
      return {
        valid: true,
        actualAmount: totalTransferred.toString(),
        actualRecipient: expectedRecipient,
      };

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[SolanaPaymentVerifier] Verification error: ${msg}`);
      return {
        valid: false,
        error: msg,
      };
    }
  }

  /**
   * Check if a destination address matches the expected recipient.
   * The destination could be either the wallet address itself (for native SOL)
   * or an associated token account for that wallet.
   */
  private isRecipientMatch(destination: string, expectedRecipient: string): boolean {
    if (destination === expectedRecipient) {
      return true;
    }

    // For SPL tokens, the destination is usually an ATA (Associated Token Account)
    // We check if the destination derives from the expected recipient
    try {
      const destinationPubkey = new PublicKey(destination);
      const recipientPubkey = new PublicKey(expectedRecipient);
      const usdcMintPubkey = new PublicKey(this.usdcMint);

      // Derive the ATA for the recipient and compare
      const [expectedAta] = PublicKey.findProgramAddressSync(
        [recipientPubkey.toBytes(), new PublicKey(TOKEN_PROGRAM_ID).toBytes(), usdcMintPubkey.toBytes()],
        new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') // Associated Token Program
      );

      return destinationPubkey.equals(expectedAta);
    } catch {
      return false;
    }
  }

  /**
   * Find all token transfer instructions from parsed transaction
   */
  private findTokenTransfers(
    instructions: (ParsedInstruction | PartiallyDecodedInstruction)[],
    innerInstructions?: { instructions: (ParsedInstruction | PartiallyDecodedInstruction)[] }[]
  ): { mint: string; destination: string; amount: string }[] {
    const transfers: { mint: string; destination: string; amount: string }[] = [];

    // Helper to extract transfer info from a parsed instruction
    const extractTransfer = (ix: ParsedInstruction | PartiallyDecodedInstruction) => {
      if (!('parsed' in ix)) return;
      if (ix.program !== 'spl-token') return;

      const parsed = ix.parsed;
      if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
        const info = parsed.info;
        transfers.push({
          mint: info.mint || '',
          destination: info.destination,
          amount: info.amount || info.tokenAmount?.amount || '0',
        });
      }
    };

    // Check top-level instructions
    for (const ix of instructions) {
      extractTransfer(ix);
    }

    // Check inner instructions (for CPI calls)
    if (innerInstructions) {
      for (const inner of innerInstructions) {
        for (const ix of inner.instructions) {
          extractTransfer(ix);
        }
      }
    }

    return transfers;
  }
}

/**
 * Factory function to create the appropriate verifier based on network
 */
export function createPaymentVerifier(
  network: 'mainnet-beta' | 'devnet',
  connection?: Connection,
  usdcMint?: string
): PaymentVerifier {
  if (network === 'devnet') {
    logger.info('[PaymentVerifier] Using NoOpPaymentVerifier for devnet');
    return new NoOpPaymentVerifier();
  }

  if (!connection) {
    throw new Error('Connection required for mainnet payment verification');
  }

  if (!usdcMint) {
    throw new Error('USDC mint address required for mainnet payment verification');
  }

  logger.info('[PaymentVerifier] Using SolanaPaymentVerifier for mainnet');
  return new SolanaPaymentVerifier(connection, usdcMint);
}
