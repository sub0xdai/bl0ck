import { describe, it, expect, beforeEach } from 'bun:test';
import { Keypair } from '@solana/web3.js';
import {
  createX402Middleware,
  generate402Response,
  parsePaymentProof,
  createPaymentResponseHeader,
} from '../src/server/middleware';
import { InMemoryPaymentStore } from '../src/server/payment-store';
import { HEADERS, USDC_MINT_DEVNET } from '../src/constants';

describe('x402 Middleware', () => {
  describe('generate402Response', () => {
    it('should generate valid 402 response', () => {
      const recipient = Keypair.generate().publicKey;
      const expiresAt = Date.now() + 300000;
      const response = generate402Response({
        requestId: 'req-123',
        amount: BigInt(15000),
        recipientTokenAccount: recipient,
        network: 'devnet',
        expiresAt,
      });

      expect(response.status).toBe(402);
      expect(response.error).toBe('Payment required');
      expect(response.requestId).toBe('req-123');
      expect(response.accepts.network).toBe('solana-devnet');
      expect(response.accepts.token).toBe('USDC');
      expect(response.accepts.amount).toBe('15000');
      expect(response.accepts.payTo).toBe(recipient.toBase58());
      expect(response.accepts.memo).toBe('x402:req-123');
      expect(response.accepts.expiresAt).toBe(expiresAt);
    });

    it('should use mainnet network identifier for mainnet-beta', () => {
      const recipient = Keypair.generate().publicKey;
      const response = generate402Response({
        requestId: 'req-456',
        amount: BigInt(25000),
        recipientTokenAccount: recipient,
        network: 'mainnet-beta',
        expiresAt: Date.now() + 300000,
      });

      expect(response.accepts.network).toBe('solana-mainnet');
    });
  });

  describe('parsePaymentProof', () => {
    it('should parse valid base64 encoded proof', () => {
      const proof = {
        signature: '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW',
        payer: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
        network: 'solana-devnet',
      };
      const encoded = Buffer.from(JSON.stringify(proof)).toString('base64');

      const parsed = parsePaymentProof(encoded);
      expect(parsed).toEqual(proof);
    });

    it('should return null for null header', () => {
      expect(parsePaymentProof(null)).toBeNull();
    });

    it('should return null for invalid base64', () => {
      expect(parsePaymentProof('not-valid-base64!!!')).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const invalidJson = Buffer.from('not json').toString('base64');
      expect(parsePaymentProof(invalidJson)).toBeNull();
    });
  });

  describe('createPaymentResponseHeader', () => {
    it('should create valid base64 encoded response header', () => {
      const signature = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';
      const payer = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';

      const header = createPaymentResponseHeader(signature, payer, 'devnet');
      const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));

      expect(decoded.transaction).toBe(signature);
      expect(decoded.payer).toBe(payer);
      expect(decoded.network).toBe('solana-devnet');
    });

    it('should use mainnet network identifier for mainnet-beta', () => {
      const header = createPaymentResponseHeader('sig', 'payer', 'mainnet-beta');
      const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));

      expect(decoded.network).toBe('solana-mainnet');
    });
  });

  describe('createX402Middleware', () => {
    let store: InMemoryPaymentStore;
    let recipient: ReturnType<typeof Keypair.generate>['publicKey'];

    beforeEach(() => {
      store = new InMemoryPaymentStore();
      recipient = Keypair.generate().publicKey;
    });

    it('should return 402 for requests without payment proof', async () => {
      const middleware = createX402Middleware({
        pricePerRequest: BigInt(15000),
        recipientTokenAccount: recipient,
        rpcEndpoint: 'https://api.devnet.solana.com',
        network: 'devnet',
        paymentStore: store,
      });

      const mockReq = {
        headers: new Headers(),
      };

      const result = await middleware(mockReq);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(402);
      expect(result!.requestId).toBeDefined();
      expect(result!.accepts.amount).toBe('15000');
    });

    it('should create pending payment in store', async () => {
      const middleware = createX402Middleware({
        pricePerRequest: BigInt(15000),
        recipientTokenAccount: recipient,
        rpcEndpoint: 'https://api.devnet.solana.com',
        network: 'devnet',
        paymentStore: store,
      });

      const mockReq = {
        headers: new Headers(),
      };

      const result = await middleware(mockReq);
      const pending = await store.get(result!.requestId);

      expect(pending).not.toBeNull();
      expect(pending!.status).toBe('pending');
      expect(pending!.amount).toBe(BigInt(15000));
    });

    it('should return null when valid payment proof provided', async () => {
      const middleware = createX402Middleware({
        pricePerRequest: BigInt(15000),
        recipientTokenAccount: recipient,
        rpcEndpoint: 'https://api.devnet.solana.com',
        network: 'devnet',
        paymentStore: store,
      });

      const proof = {
        signature: '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW',
        payer: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
        network: 'solana-devnet',
      };
      const proofHeader = Buffer.from(JSON.stringify(proof)).toString('base64');

      const mockReq = {
        headers: new Headers({
          [HEADERS.PAYMENT_PROOF]: proofHeader,
        }),
      };

      const result = await middleware(mockReq);

      // With payment proof, should return null (allowing request to proceed)
      expect(result).toBeNull();
    });

    it('should use custom payment expiry', async () => {
      const customExpiry = 60000; // 1 minute
      const middleware = createX402Middleware({
        pricePerRequest: BigInt(15000),
        recipientTokenAccount: recipient,
        rpcEndpoint: 'https://api.devnet.solana.com',
        network: 'devnet',
        paymentStore: store,
        paymentExpiryMs: customExpiry,
      });

      const mockReq = {
        headers: new Headers(),
      };

      const before = Date.now();
      const result = await middleware(mockReq);
      const after = Date.now();

      // Expiry should be within custom expiry range
      expect(result!.accepts.expiresAt).toBeGreaterThanOrEqual(before + customExpiry);
      expect(result!.accepts.expiresAt).toBeLessThanOrEqual(after + customExpiry);
    });
  });
});
