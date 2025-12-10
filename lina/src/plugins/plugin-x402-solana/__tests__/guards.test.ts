import { describe, it, expect } from 'bun:test';
import {
  isX402PaymentRequired,
  isX402PaymentProof,
  isPendingPayment,
  isDetectedPayment,
  isValidBase58PublicKey,
  isValidTransactionSignature,
} from '../src/guards';

describe('type guards', () => {
  describe('isX402PaymentRequired', () => {
    const validPaymentRequired = {
      status: 402,
      error: 'Payment required',
      requestId: 'req-123',
      accepts: {
        network: 'solana-mainnet',
        token: 'USDC',
        amount: '15000',
        payTo: '7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi',
        memo: 'x402:req-123',
        expiresAt: Date.now() + 300000,
      },
    };

    it('should return true for valid payment required response', () => {
      expect(isX402PaymentRequired(validPaymentRequired)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isX402PaymentRequired(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isX402PaymentRequired('string')).toBe(false);
      expect(isX402PaymentRequired(123)).toBe(false);
    });

    it('should return false for wrong status', () => {
      expect(isX402PaymentRequired({ ...validPaymentRequired, status: 200 })).toBe(false);
    });

    it('should return false for missing requestId', () => {
      const { requestId, ...rest } = validPaymentRequired;
      expect(isX402PaymentRequired(rest)).toBe(false);
    });

    it('should return false for invalid network in accepts', () => {
      expect(
        isX402PaymentRequired({
          ...validPaymentRequired,
          accepts: { ...validPaymentRequired.accepts, network: 'ethereum' },
        })
      ).toBe(false);
    });

    it('should accept solana-devnet network', () => {
      expect(
        isX402PaymentRequired({
          ...validPaymentRequired,
          accepts: { ...validPaymentRequired.accepts, network: 'solana-devnet' },
        })
      ).toBe(true);
    });
  });

  describe('isX402PaymentProof', () => {
    const validPaymentProof = {
      signature: '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW',
      payer: '7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi',
      network: 'solana-mainnet',
    };

    it('should return true for valid payment proof', () => {
      expect(isX402PaymentProof(validPaymentProof)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isX402PaymentProof(null)).toBe(false);
    });

    it('should return false for invalid signature format', () => {
      expect(
        isX402PaymentProof({ ...validPaymentProof, signature: 'invalid' })
      ).toBe(false);
    });

    it('should return false for invalid payer format', () => {
      expect(
        isX402PaymentProof({ ...validPaymentProof, payer: 'invalid' })
      ).toBe(false);
    });

    it('should return false for invalid network', () => {
      expect(
        isX402PaymentProof({ ...validPaymentProof, network: 'ethereum' })
      ).toBe(false);
    });

    it('should accept solana-devnet network', () => {
      expect(
        isX402PaymentProof({ ...validPaymentProof, network: 'solana-devnet' })
      ).toBe(true);
    });
  });

  describe('isPendingPayment', () => {
    const validPendingPayment = {
      requestId: 'req-123',
      amount: BigInt(15000),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
      status: 'pending',
    };

    it('should return true for valid pending payment', () => {
      expect(isPendingPayment(validPendingPayment)).toBe(true);
    });

    it('should return true for paid payment with signature', () => {
      expect(
        isPendingPayment({
          ...validPendingPayment,
          status: 'paid',
          signature: '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW',
          payer: '7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi',
        })
      ).toBe(true);
    });

    it('should return true for expired payment', () => {
      expect(
        isPendingPayment({ ...validPendingPayment, status: 'expired' })
      ).toBe(true);
    });

    it('should return false for invalid status', () => {
      expect(
        isPendingPayment({ ...validPendingPayment, status: 'invalid' })
      ).toBe(false);
    });

    it('should return false for non-bigint amount', () => {
      expect(
        isPendingPayment({ ...validPendingPayment, amount: 15000 })
      ).toBe(false);
    });
  });

  describe('isDetectedPayment', () => {
    const validDetectedPayment = {
      signature: '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW',
      payer: '7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi',
      amount: BigInt(15000),
      memo: 'x402:req-123',
      slot: 12345678,
    };

    it('should return true for valid detected payment', () => {
      expect(isDetectedPayment(validDetectedPayment)).toBe(true);
    });

    it('should return false for non-bigint amount', () => {
      expect(
        isDetectedPayment({ ...validDetectedPayment, amount: 15000 })
      ).toBe(false);
    });

    it('should return false for missing memo', () => {
      const { memo, ...rest } = validDetectedPayment;
      expect(isDetectedPayment(rest)).toBe(false);
    });
  });

  describe('isValidBase58PublicKey', () => {
    it('should return true for valid public key', () => {
      expect(isValidBase58PublicKey('7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi')).toBe(true);
    });

    it('should return true for system program', () => {
      expect(isValidBase58PublicKey('11111111111111111111111111111111')).toBe(true);
    });

    it('should return false for too short', () => {
      expect(isValidBase58PublicKey('abc')).toBe(false);
    });

    it('should return false for invalid characters', () => {
      expect(isValidBase58PublicKey('0OIl' + 'a'.repeat(40))).toBe(false);
    });
  });

  describe('isValidTransactionSignature', () => {
    it('should return true for valid signature', () => {
      expect(
        isValidTransactionSignature(
          '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW'
        )
      ).toBe(true);
    });

    it('should return false for too short', () => {
      expect(isValidTransactionSignature('abc')).toBe(false);
    });

    it('should return false for invalid characters', () => {
      expect(isValidTransactionSignature('0' + 'a'.repeat(87))).toBe(false);
    });
  });
});
