import { describe, it, expect } from 'bun:test';
import {
  toWireNetwork,
  fromWireNetwork,
  isInternalNetwork,
  isWireNetwork,
} from '../src/utils/network';

describe('network utilities', () => {
  describe('toWireNetwork', () => {
    it('should convert mainnet-beta to solana-mainnet', () => {
      expect(toWireNetwork('mainnet-beta')).toBe('solana-mainnet');
    });

    it('should convert devnet to solana-devnet', () => {
      expect(toWireNetwork('devnet')).toBe('solana-devnet');
    });
  });

  describe('fromWireNetwork', () => {
    it('should convert solana-mainnet to mainnet-beta', () => {
      expect(fromWireNetwork('solana-mainnet')).toBe('mainnet-beta');
    });

    it('should convert solana-devnet to devnet', () => {
      expect(fromWireNetwork('solana-devnet')).toBe('devnet');
    });
  });

  describe('round-trip conversion', () => {
    it('should maintain identity for mainnet-beta', () => {
      expect(fromWireNetwork(toWireNetwork('mainnet-beta'))).toBe('mainnet-beta');
    });

    it('should maintain identity for devnet', () => {
      expect(fromWireNetwork(toWireNetwork('devnet'))).toBe('devnet');
    });

    it('should maintain identity for solana-mainnet', () => {
      expect(toWireNetwork(fromWireNetwork('solana-mainnet'))).toBe('solana-mainnet');
    });

    it('should maintain identity for solana-devnet', () => {
      expect(toWireNetwork(fromWireNetwork('solana-devnet'))).toBe('solana-devnet');
    });
  });

  describe('isInternalNetwork', () => {
    it('should return true for mainnet-beta', () => {
      expect(isInternalNetwork('mainnet-beta')).toBe(true);
    });

    it('should return true for devnet', () => {
      expect(isInternalNetwork('devnet')).toBe(true);
    });

    it('should return false for solana-mainnet', () => {
      expect(isInternalNetwork('solana-mainnet')).toBe(false);
    });

    it('should return false for invalid string', () => {
      expect(isInternalNetwork('ethereum')).toBe(false);
    });
  });

  describe('isWireNetwork', () => {
    it('should return true for solana-mainnet', () => {
      expect(isWireNetwork('solana-mainnet')).toBe(true);
    });

    it('should return true for solana-devnet', () => {
      expect(isWireNetwork('solana-devnet')).toBe(true);
    });

    it('should return false for mainnet-beta', () => {
      expect(isWireNetwork('mainnet-beta')).toBe(false);
    });

    it('should return false for invalid string', () => {
      expect(isWireNetwork('ethereum')).toBe(false);
    });
  });
});
