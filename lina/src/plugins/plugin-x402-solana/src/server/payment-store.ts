/**
 * Pending Payment Store
 *
 * Tracks pending x402 payment requests and their status.
 */

import type { PendingPayment, PendingPaymentStore } from '../types';
import type { TransactionSignature } from '@solana/web3.js';

/**
 * In-memory implementation of PendingPaymentStore
 *
 * For production, implement with Redis or database backend.
 */
export class InMemoryPaymentStore implements PendingPaymentStore {
  private payments: Map<string, PendingPayment> = new Map();

  async create(
    payment: Omit<PendingPayment, 'status'>
  ): Promise<PendingPayment> {
    const pendingPayment: PendingPayment = {
      ...payment,
      status: 'pending',
    };
    this.payments.set(payment.requestId, pendingPayment);
    return pendingPayment;
  }

  async get(requestId: string): Promise<PendingPayment | null> {
    return this.payments.get(requestId) || null;
  }

  async markPaid(
    requestId: string,
    signature: TransactionSignature,
    payer: string
  ): Promise<void> {
    const payment = this.payments.get(requestId);
    if (payment) {
      payment.status = 'paid';
      payment.signature = signature;
      payment.payer = payer;
    }
  }

  async markExpired(requestId: string): Promise<void> {
    const payment = this.payments.get(requestId);
    if (payment) {
      payment.status = 'expired';
    }
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [requestId, payment] of this.payments.entries()) {
      // Only clean up pending payments that are expired
      if (payment.status === 'pending' && payment.expiresAt < now) {
        this.payments.delete(requestId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /** Get all pending payments (for debugging/monitoring) */
  async getAllPending(): Promise<PendingPayment[]> {
    return Array.from(this.payments.values()).filter(
      (p) => p.status === 'pending'
    );
  }
}
