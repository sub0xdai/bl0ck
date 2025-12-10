import { describe, it, expect } from 'bun:test';
import { PublicKey } from '@solana/web3.js';
import {
  USDC_MINT_MAINNET,
  USDC_MINT_DEVNET,
  MEMO_PROGRAM_ID,
  RPC_ENDPOINTS,
  WS_ENDPOINTS,
  DEFAULT_PAYMENT_EXPIRY_MS,
  MEMO_PREFIX,
  HEADERS,
  USDC_DECIMALS,
} from '../src/constants';

describe('constants', () => {
  describe('USDC Mint Addresses', () => {
    it('should have valid mainnet USDC mint address', () => {
      expect(USDC_MINT_MAINNET).toBeInstanceOf(PublicKey);
      expect(USDC_MINT_MAINNET.toBase58()).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    });

    it('should have valid devnet USDC mint address', () => {
      expect(USDC_MINT_DEVNET).toBeInstanceOf(PublicKey);
      // Note: Circle's devnet USDC mint - may change occasionally
      expect(USDC_MINT_DEVNET.toBase58()).toBe('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
    });
  });

  describe('Memo Program ID', () => {
    it('should have valid SPL Memo program ID', () => {
      expect(MEMO_PROGRAM_ID).toBeInstanceOf(PublicKey);
      expect(MEMO_PROGRAM_ID.toBase58()).toBe('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    });
  });

  describe('RPC Endpoints', () => {
    it('should have mainnet-beta endpoint', () => {
      expect(RPC_ENDPOINTS['mainnet-beta']).toBe('https://api.mainnet-beta.solana.com');
    });

    it('should have devnet endpoint', () => {
      expect(RPC_ENDPOINTS.devnet).toBe('https://api.devnet.solana.com');
    });
  });

  describe('WebSocket Endpoints', () => {
    it('should have mainnet-beta WebSocket endpoint', () => {
      expect(WS_ENDPOINTS['mainnet-beta']).toBe('wss://api.mainnet-beta.solana.com');
    });

    it('should have devnet WebSocket endpoint', () => {
      expect(WS_ENDPOINTS.devnet).toBe('wss://api.devnet.solana.com');
    });
  });

  describe('Payment Configuration', () => {
    it('should have 5 minute default payment expiry', () => {
      expect(DEFAULT_PAYMENT_EXPIRY_MS).toBe(5 * 60 * 1000);
      expect(DEFAULT_PAYMENT_EXPIRY_MS).toBe(300000);
    });

    it('should have correct memo prefix', () => {
      expect(MEMO_PREFIX).toBe('x402:');
    });

    it('should have correct USDC decimals', () => {
      expect(USDC_DECIMALS).toBe(6);
    });
  });

  describe('HTTP Headers', () => {
    it('should have payment proof header', () => {
      expect(HEADERS.PAYMENT_PROOF).toBe('x-payment-proof');
    });

    it('should have payment response header', () => {
      expect(HEADERS.PAYMENT_RESPONSE).toBe('x-payment-response');
    });
  });
});
