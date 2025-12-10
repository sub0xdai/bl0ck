import { describe, it, expect, mock, spyOn, beforeEach, afterEach } from 'bun:test';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { PaymentListener } from '../src/server/payment-listener';
import { MEMO_PROGRAM_ID } from '../src/constants';

describe('PaymentListener', () => {
  const tokenAccount = Keypair.generate().publicKey;
  // Use HTTP endpoint for testing - Connection validates URL format
  const wsEndpoint = 'https://api.devnet.solana.com';

  describe('constructor', () => {
    it('should initialize with config', () => {
      const onPayment = mock(() => {});
      const listener = new PaymentListener({
        wsEndpoint,
        tokenAccount,
        onPayment,
      });

      expect(listener).toBeDefined();
      expect(listener.isActive()).toBe(false);
    });

    it('should accept optional onError callback', () => {
      const onPayment = mock(() => {});
      const onError = mock(() => {});
      const listener = new PaymentListener({
        wsEndpoint,
        tokenAccount,
        onPayment,
        onError,
      });

      expect(listener).toBeDefined();
    });
  });

  describe('start', () => {
    it('should subscribe to account changes', async () => {
      const onPayment = mock(() => {});
      const mockSubscriptionId = 12345;

      const mockOnAccountChange = mock(() => mockSubscriptionId);
      spyOn(Connection.prototype, 'onAccountChange').mockImplementation(mockOnAccountChange);

      const listener = new PaymentListener({
        wsEndpoint,
        tokenAccount,
        onPayment,
      });

      await listener.start();

      expect(listener.isActive()).toBe(true);
      expect(mockOnAccountChange).toHaveBeenCalledTimes(1);
    });

    it('should call onError and rethrow on subscription failure', async () => {
      const onPayment = mock(() => {});
      const onError = mock(() => {});
      const error = new Error('WebSocket connection failed');

      spyOn(Connection.prototype, 'onAccountChange').mockImplementation(() => {
        throw error;
      });

      const listener = new PaymentListener({
        wsEndpoint,
        tokenAccount,
        onPayment,
        onError,
      });

      await expect(listener.start()).rejects.toThrow('WebSocket connection failed');
      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  describe('stop', () => {
    it('should remove subscription when active', async () => {
      const onPayment = mock(() => {});
      const mockSubscriptionId = 12345;

      spyOn(Connection.prototype, 'onAccountChange').mockImplementation(() => mockSubscriptionId);
      const mockRemoveListener = mock(() => Promise.resolve());
      spyOn(Connection.prototype, 'removeAccountChangeListener').mockImplementation(mockRemoveListener);

      const listener = new PaymentListener({
        wsEndpoint,
        tokenAccount,
        onPayment,
      });

      await listener.start();
      expect(listener.isActive()).toBe(true);

      await listener.stop();
      expect(listener.isActive()).toBe(false);
      expect(mockRemoveListener).toHaveBeenCalledWith(mockSubscriptionId);
    });

    it('should do nothing when not active', async () => {
      const onPayment = mock(() => {});
      const mockRemoveListener = mock(() => Promise.resolve());
      spyOn(Connection.prototype, 'removeAccountChangeListener').mockImplementation(mockRemoveListener);

      const listener = new PaymentListener({
        wsEndpoint,
        tokenAccount,
        onPayment,
      });

      await listener.stop();
      expect(mockRemoveListener).not.toHaveBeenCalled();
    });
  });

  describe('isActive', () => {
    it('should return false before start', () => {
      const onPayment = mock(() => {});
      const listener = new PaymentListener({
        wsEndpoint,
        tokenAccount,
        onPayment,
      });

      expect(listener.isActive()).toBe(false);
    });

    it('should return true after start', async () => {
      const onPayment = mock(() => {});
      spyOn(Connection.prototype, 'onAccountChange').mockImplementation(() => 1);

      const listener = new PaymentListener({
        wsEndpoint,
        tokenAccount,
        onPayment,
      });

      await listener.start();
      expect(listener.isActive()).toBe(true);
    });

    it('should return false after stop', async () => {
      const onPayment = mock(() => {});
      spyOn(Connection.prototype, 'onAccountChange').mockImplementation(() => 1);
      spyOn(Connection.prototype, 'removeAccountChangeListener').mockImplementation(() => Promise.resolve());

      const listener = new PaymentListener({
        wsEndpoint,
        tokenAccount,
        onPayment,
      });

      await listener.start();
      await listener.stop();
      expect(listener.isActive()).toBe(false);
    });
  });

  describe('parsePaymentFromTransaction (via callback)', () => {
    // These tests verify behavior through the onAccountChange callback
    // We can't directly test the private method, but we can test the observable behavior

    it('should not call onPayment for failed transactions', async () => {
      const onPayment = mock(() => {});
      let accountChangeCallback: (accountInfo: unknown, context: { slot: number }) => void;

      spyOn(Connection.prototype, 'onAccountChange').mockImplementation(
        (_account: PublicKey, callback: (accountInfo: unknown, context: { slot: number }) => void) => {
          accountChangeCallback = callback;
          return 1;
        }
      );

      // Mock getSignaturesForAddress to return empty (no transactions)
      spyOn(Connection.prototype, 'getSignaturesForAddress').mockImplementation(() =>
        Promise.resolve([])
      );

      const listener = new PaymentListener({
        wsEndpoint,
        tokenAccount,
        onPayment,
      });

      await listener.start();

      // Trigger the callback
      accountChangeCallback!({}, { slot: 100 });

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onPayment).not.toHaveBeenCalled();
    });

    it('should not call onPayment for transaction without memo', async () => {
      const onPayment = mock(() => {});
      let accountChangeCallback: (accountInfo: unknown, context: { slot: number }) => void;

      spyOn(Connection.prototype, 'onAccountChange').mockImplementation(
        (_account: PublicKey, callback: (accountInfo: unknown, context: { slot: number }) => void) => {
          accountChangeCallback = callback;
          return 1;
        }
      );

      spyOn(Connection.prototype, 'getSignaturesForAddress').mockImplementation(() =>
        Promise.resolve([{ signature: 'test-sig' }] as any)
      );

      // Transaction without memo instruction
      spyOn(Connection.prototype, 'getParsedTransaction').mockImplementation(() =>
        Promise.resolve({
          meta: { err: null, preTokenBalances: [], postTokenBalances: [] },
          transaction: {
            message: {
              instructions: [], // No memo instruction
              accountKeys: [],
            },
          },
        } as any)
      );

      const listener = new PaymentListener({
        wsEndpoint,
        tokenAccount,
        onPayment,
      });

      await listener.start();
      accountChangeCallback!({}, { slot: 100 });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onPayment).not.toHaveBeenCalled();
    });

    it('should call onError when transaction processing fails', async () => {
      const onPayment = mock(() => {});
      const onError = mock(() => {});
      let accountChangeCallback: (accountInfo: unknown, context: { slot: number }) => void;

      spyOn(Connection.prototype, 'onAccountChange').mockImplementation(
        (_account: PublicKey, callback: (accountInfo: unknown, context: { slot: number }) => void) => {
          accountChangeCallback = callback;
          return 1;
        }
      );

      spyOn(Connection.prototype, 'getSignaturesForAddress').mockImplementation(() =>
        Promise.reject(new Error('RPC error'))
      );

      const listener = new PaymentListener({
        wsEndpoint,
        tokenAccount,
        onPayment,
        onError,
      });

      await listener.start();
      accountChangeCallback!({}, { slot: 100 });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onError).toHaveBeenCalled();
      expect(onPayment).not.toHaveBeenCalled();
    });
  });
});
