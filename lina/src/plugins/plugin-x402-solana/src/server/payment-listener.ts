/**
 * Payment Listener
 *
 * WebSocket-based listener for incoming USDC payments.
 * Monitors a token account for transfers and parses memos to match payments to requests.
 */

import {
  Connection,
  PublicKey,
  type ParsedTransactionWithMeta,
} from '@solana/web3.js';
import { extractRequestId } from '../utils/memo';
import { MEMO_PROGRAM_ID } from '../constants';
import type { PaymentListenerConfig, DetectedPayment } from '../types';

export class PaymentListener {
  private connection: Connection;
  private tokenAccount: PublicKey;
  private onPayment: (payment: DetectedPayment) => void;
  private onError?: (error: Error) => void;
  private subscriptionId: number | null = null;

  constructor(config: PaymentListenerConfig) {
    this.connection = new Connection(config.wsEndpoint, {
      commitment: 'confirmed',
      wsEndpoint: config.wsEndpoint,
    });
    this.tokenAccount = config.tokenAccount;
    this.onPayment = config.onPayment;
    this.onError = config.onError;
  }

  /**
   * Start listening for incoming payments
   */
  async start(): Promise<void> {
    try {
      this.subscriptionId = this.connection.onAccountChange(
        this.tokenAccount,
        async (_accountInfo, context) => {
          try {
            // Get the transaction that caused this change
            const signatures = await this.connection.getSignaturesForAddress(
              this.tokenAccount,
              { limit: 1 }
            );

            if (signatures.length === 0) return;

            const signature = signatures[0].signature;
            const tx = await this.connection.getParsedTransaction(signature, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            });

            if (!tx) return;

            const payment = this.parsePaymentFromTransaction(tx, signature, context.slot);
            if (payment) {
              this.onPayment(payment);
            }
          } catch (error) {
            this.onError?.(error as Error);
          }
        },
        'confirmed'
      );
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Stop listening
   */
  async stop(): Promise<void> {
    if (this.subscriptionId !== null) {
      await this.connection.removeAccountChangeListener(this.subscriptionId);
      this.subscriptionId = null;
    }
  }

  /**
   * Check if listener is active
   */
  isActive(): boolean {
    return this.subscriptionId !== null;
  }

  /**
   * Parse payment details from a transaction
   */
  private parsePaymentFromTransaction(
    tx: ParsedTransactionWithMeta,
    signature: string,
    slot: number
  ): DetectedPayment | null {
    if (!tx.meta || tx.meta.err) return null;

    // Find memo instruction
    let memo = '';
    for (const ix of tx.transaction.message.instructions) {
      if ('programId' in ix && ix.programId.equals(MEMO_PROGRAM_ID)) {
        // Parsed memo instruction
        if ('parsed' in ix && typeof ix.parsed === 'string') {
          memo = ix.parsed;
          break;
        }
      }
    }

    // Extract requestId from memo - only process x402 payments
    const requestId = extractRequestId(memo);
    if (!requestId) return null;

    // Find token transfer details
    const preBalances = tx.meta.preTokenBalances || [];
    const postBalances = tx.meta.postTokenBalances || [];

    // Calculate amount transferred to our account
    let amount = BigInt(0);
    let payer = '';

    for (const post of postBalances) {
      if (post.owner === this.tokenAccount.toBase58()) {
        const pre = preBalances.find(
          (p) => p.accountIndex === post.accountIndex
        );
        const preAmount = BigInt(pre?.uiTokenAmount.amount || '0');
        const postAmount = BigInt(post.uiTokenAmount.amount);
        amount = postAmount - preAmount;
      }
    }

    // Get payer from first signer
    const signers = tx.transaction.message.accountKeys.filter((k) => k.signer);
    if (signers.length > 0) {
      payer = signers[0].pubkey.toBase58();
    }

    if (amount <= 0n) return null;

    return {
      signature,
      payer,
      amount,
      memo,
      slot,
    };
  }
}
