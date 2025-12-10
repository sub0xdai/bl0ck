import { describe, it, expect } from 'bun:test';
import {
  X402PaymentError,
  X402ValidationError,
  X402ExpirationError,
  X402AmountError,
  X402NetworkError,
  X402VerificationError,
} from '../src/errors';

describe('error types', () => {
  describe('X402PaymentError', () => {
    it('should be an instance of Error', () => {
      const error = new X402PaymentError('test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(X402PaymentError);
    });

    it('should have correct name', () => {
      const error = new X402PaymentError('test');
      expect(error.name).toBe('X402PaymentError');
    });

    it('should have correct message', () => {
      const error = new X402PaymentError('payment failed');
      expect(error.message).toBe('payment failed');
    });
  });

  describe('X402ValidationError', () => {
    it('should extend X402PaymentError', () => {
      const error = new X402ValidationError('invalid input');
      expect(error).toBeInstanceOf(X402PaymentError);
      expect(error).toBeInstanceOf(X402ValidationError);
    });

    it('should have correct name', () => {
      const error = new X402ValidationError('test');
      expect(error.name).toBe('X402ValidationError');
    });
  });

  describe('X402ExpirationError', () => {
    it('should extend X402PaymentError', () => {
      const error = new X402ExpirationError('payment expired');
      expect(error).toBeInstanceOf(X402PaymentError);
      expect(error).toBeInstanceOf(X402ExpirationError);
    });

    it('should have correct name', () => {
      const error = new X402ExpirationError('test');
      expect(error.name).toBe('X402ExpirationError');
    });
  });

  describe('X402AmountError', () => {
    it('should extend X402PaymentError', () => {
      const error = new X402AmountError('amount too high', BigInt(100000));
      expect(error).toBeInstanceOf(X402PaymentError);
      expect(error).toBeInstanceOf(X402AmountError);
    });

    it('should store requestedAmount', () => {
      const error = new X402AmountError('amount too high', BigInt(100000));
      expect(error.requestedAmount).toBe(BigInt(100000));
    });

    it('should store maxAmount when provided', () => {
      const error = new X402AmountError('amount too high', BigInt(100000), BigInt(50000));
      expect(error.maxAmount).toBe(BigInt(50000));
    });

    it('should have undefined maxAmount when not provided', () => {
      const error = new X402AmountError('amount too high', BigInt(100000));
      expect(error.maxAmount).toBeUndefined();
    });
  });

  describe('X402NetworkError', () => {
    it('should extend X402PaymentError', () => {
      const error = new X402NetworkError('RPC failed');
      expect(error).toBeInstanceOf(X402PaymentError);
      expect(error).toBeInstanceOf(X402NetworkError);
    });

    it('should store cause when provided', () => {
      const cause = new Error('connection refused');
      const error = new X402NetworkError('RPC failed', cause);
      expect(error.cause).toBe(cause);
    });

    it('should have undefined cause when not provided', () => {
      const error = new X402NetworkError('RPC failed');
      expect(error.cause).toBeUndefined();
    });
  });

  describe('X402VerificationError', () => {
    it('should extend X402PaymentError', () => {
      const error = new X402VerificationError('verification failed');
      expect(error).toBeInstanceOf(X402PaymentError);
      expect(error).toBeInstanceOf(X402VerificationError);
    });

    it('should store signature when provided', () => {
      const sig = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';
      const error = new X402VerificationError('verification failed', sig);
      expect(error.signature).toBe(sig);
    });

    it('should have undefined signature when not provided', () => {
      const error = new X402VerificationError('verification failed');
      expect(error.signature).toBeUndefined();
    });
  });

  describe('error hierarchy for catch blocks', () => {
    it('should allow catching all x402 errors with base class', () => {
      const errors = [
        new X402PaymentError('base'),
        new X402ValidationError('validation'),
        new X402ExpirationError('expiration'),
        new X402AmountError('amount', BigInt(100)),
        new X402NetworkError('network'),
        new X402VerificationError('verification'),
      ];

      errors.forEach((error) => {
        expect(error).toBeInstanceOf(X402PaymentError);
      });
    });
  });
});
