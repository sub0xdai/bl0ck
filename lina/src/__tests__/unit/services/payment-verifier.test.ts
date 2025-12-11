// src/__tests__/unit/services/payment-verifier.test.ts
/**
 * Unit tests for PaymentVerifier interface and implementations
 *
 * The PaymentVerifier abstracts payment verification logic, allowing:
 * - NoOpVerifier for devnet (trusts any signature)
 * - SolanaVerifier for mainnet (verifies on-chain)
 */
import { describe, it, expect, mock } from 'bun:test';
import {
  NoOpPaymentVerifier,
  SolanaPaymentVerifier,
  createPaymentVerifier,
} from '../../../services/autotrade/payment-verifier';

// Test USDC mint address (devnet)
const TEST_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const TEST_TREASURY = 'TreasuryWallet123456789012345678901234567890123';

describe('PaymentVerifier', () => {
  describe('NoOpPaymentVerifier', () => {
    it('always returns valid=true for any signature', async () => {
      const verifier = new NoOpPaymentVerifier();

      const result = await verifier.verify({
        signature: 'any-signature-here',
        expectedAmount: '1000000',
        expectedRecipient: TEST_TREASURY,
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns valid=true even for empty signature', async () => {
      const verifier = new NoOpPaymentVerifier();

      const result = await verifier.verify({
        signature: '',
        expectedAmount: '1000000',
        expectedRecipient: TEST_TREASURY,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('SolanaPaymentVerifier', () => {
    it('returns valid=false when transaction not found', async () => {
      const mockConnection = {
        getParsedTransaction: mock(() => Promise.resolve(null)),
      };

      const verifier = new SolanaPaymentVerifier(mockConnection as any, TEST_USDC_MINT);

      const result = await verifier.verify({
        signature: 'not-found-signature',
        expectedAmount: '1000000',
        expectedRecipient: TEST_TREASURY,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns valid=false when transaction failed', async () => {
      const mockConnection = {
        getParsedTransaction: mock(() => Promise.resolve({
          meta: { err: { InsufficientFunds: {} } },
          transaction: { message: { instructions: [] } },
        })),
      };

      const verifier = new SolanaPaymentVerifier(mockConnection as any, TEST_USDC_MINT);

      const result = await verifier.verify({
        signature: 'failed-tx-signature',
        expectedAmount: '1000000',
        expectedRecipient: TEST_TREASURY,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('failed');
    });

    it('returns valid=false when no USDC transfer found', async () => {
      const mockConnection = {
        getParsedTransaction: mock(() => Promise.resolve({
          meta: { err: null, innerInstructions: [] },
          transaction: {
            message: {
              // No token transfers
              instructions: [],
            },
          },
        })),
      };

      const verifier = new SolanaPaymentVerifier(mockConnection as any, TEST_USDC_MINT);

      const result = await verifier.verify({
        signature: 'valid-signature',
        expectedAmount: '1000000',
        expectedRecipient: TEST_TREASURY,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('No USDC transfer found');
    });

    it('returns valid=true when correct USDC transfer is found', async () => {
      const mockConnection = {
        getParsedTransaction: mock(() => Promise.resolve({
          meta: { err: null, innerInstructions: [] },
          transaction: {
            message: {
              instructions: [
                {
                  program: 'spl-token',
                  parsed: {
                    type: 'transferChecked',
                    info: {
                      mint: TEST_USDC_MINT,
                      destination: TEST_TREASURY, // Direct match
                      amount: '1000000',
                      tokenAmount: { amount: '1000000' },
                    },
                  },
                },
              ],
            },
          },
        })),
      };

      const verifier = new SolanaPaymentVerifier(mockConnection as any, TEST_USDC_MINT);

      const result = await verifier.verify({
        signature: 'valid-transfer-signature',
        expectedAmount: '1000000',
        expectedRecipient: TEST_TREASURY,
      });

      expect(result.valid).toBe(true);
      expect(result.actualAmount).toBe('1000000');
    });

    it('returns valid=false when amount is insufficient', async () => {
      const mockConnection = {
        getParsedTransaction: mock(() => Promise.resolve({
          meta: { err: null, innerInstructions: [] },
          transaction: {
            message: {
              instructions: [
                {
                  program: 'spl-token',
                  parsed: {
                    type: 'transfer',
                    info: {
                      mint: TEST_USDC_MINT,
                      destination: TEST_TREASURY,
                      amount: '500000', // Only half the expected amount
                    },
                  },
                },
              ],
            },
          },
        })),
      };

      const verifier = new SolanaPaymentVerifier(mockConnection as any, TEST_USDC_MINT);

      const result = await verifier.verify({
        signature: 'partial-payment-signature',
        expectedAmount: '1000000',
        expectedRecipient: TEST_TREASURY,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient payment');
      expect(result.actualAmount).toBe('500000');
    });

    it('handles connection errors gracefully', async () => {
      const mockConnection = {
        getParsedTransaction: mock(() => Promise.reject(new Error('Network error'))),
      };

      const verifier = new SolanaPaymentVerifier(mockConnection as any, TEST_USDC_MINT);

      const result = await verifier.verify({
        signature: 'any-signature',
        expectedAmount: '1000000',
        expectedRecipient: TEST_TREASURY,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('createPaymentVerifier factory', () => {
    it('returns NoOpPaymentVerifier for devnet', () => {
      const verifier = createPaymentVerifier('devnet');
      expect(verifier).toBeInstanceOf(NoOpPaymentVerifier);
    });

    it('returns SolanaPaymentVerifier for mainnet with connection and mint', () => {
      const mockConnection = { getParsedTransaction: mock(() => Promise.resolve(null)) };
      const verifier = createPaymentVerifier('mainnet-beta', mockConnection as any, TEST_USDC_MINT);
      expect(verifier).toBeInstanceOf(SolanaPaymentVerifier);
    });

    it('throws when mainnet is requested without connection', () => {
      expect(() => createPaymentVerifier('mainnet-beta')).toThrow('Connection required');
    });

    it('throws when mainnet is requested without USDC mint', () => {
      const mockConnection = { getParsedTransaction: mock(() => Promise.resolve(null)) };
      expect(() => createPaymentVerifier('mainnet-beta', mockConnection as any)).toThrow('USDC mint address required');
    });
  });
});
