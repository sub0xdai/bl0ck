import { describe, it, expect, mock } from 'bun:test';
import { Keypair } from '@solana/web3.js';
import { wrapFetchWithSolanaPayment } from '../src/client/x402-fetch';

describe('wrapFetchWithSolanaPayment', () => {
  const keypair = Keypair.generate();

  it('should pass through non-402 responses', async () => {
    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ data: 'test' }), { status: 200 }))
    );

    const wrappedFetch = wrapFetchWithSolanaPayment(mockFetch as unknown as typeof fetch, {
      keypair,
      maxPayment: BigInt(100000),
      rpcEndpoint: 'https://api.devnet.solana.com',
      network: 'devnet',
    });

    const response = await wrappedFetch('https://example.com/api');
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should pass through error responses (not 402)', async () => {
    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }))
    );

    const wrappedFetch = wrapFetchWithSolanaPayment(mockFetch as unknown as typeof fetch, {
      keypair,
      maxPayment: BigInt(100000),
      rpcEndpoint: 'https://api.devnet.solana.com',
      network: 'devnet',
    });

    const response = await wrappedFetch('https://example.com/api');
    expect(response.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should reject payment exceeding maxPayment', async () => {
    const paymentRequired = {
      status: 402,
      error: 'Payment required',
      requestId: 'req-123',
      accepts: {
        network: 'solana-devnet',
        token: 'USDC',
        amount: '1000000', // $1.00 - exceeds max
        payTo: Keypair.generate().publicKey.toBase58(),
        memo: 'x402:req-123',
        expiresAt: Date.now() + 300000,
      },
    };

    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(paymentRequired), { status: 402 }))
    );

    const wrappedFetch = wrapFetchWithSolanaPayment(mockFetch as unknown as typeof fetch, {
      keypair,
      maxPayment: BigInt(50000), // $0.05 max
      rpcEndpoint: 'https://api.devnet.solana.com',
      network: 'devnet',
    });

    await expect(wrappedFetch('https://example.com/api')).rejects.toThrow(
      'exceeds maximum'
    );
  });

  it('should reject expired payment request', async () => {
    const paymentRequired = {
      status: 402,
      error: 'Payment required',
      requestId: 'req-123',
      accepts: {
        network: 'solana-devnet',
        token: 'USDC',
        amount: '15000',
        payTo: Keypair.generate().publicKey.toBase58(),
        memo: 'x402:req-123',
        expiresAt: Date.now() - 1000, // Already expired
      },
    };

    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(paymentRequired), { status: 402 }))
    );

    const wrappedFetch = wrapFetchWithSolanaPayment(mockFetch as unknown as typeof fetch, {
      keypair,
      maxPayment: BigInt(100000),
      rpcEndpoint: 'https://api.devnet.solana.com',
      network: 'devnet',
    });

    await expect(wrappedFetch('https://example.com/api')).rejects.toThrow(
      'expired'
    );
  });

  it('should reject invalid 402 response format', async () => {
    const invalidResponse = {
      status: 402,
      error: 'Payment required',
      // Missing requestId and accepts
    };

    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(invalidResponse), { status: 402 }))
    );

    const wrappedFetch = wrapFetchWithSolanaPayment(mockFetch as unknown as typeof fetch, {
      keypair,
      maxPayment: BigInt(100000),
      rpcEndpoint: 'https://api.devnet.solana.com',
      network: 'devnet',
    });

    await expect(wrappedFetch('https://example.com/api')).rejects.toThrow(
      'Invalid 402 response'
    );
  });

  it('should reject invalid payTo address', async () => {
    const paymentRequired = {
      status: 402,
      error: 'Payment required',
      requestId: 'req-123',
      accepts: {
        network: 'solana-devnet',
        token: 'USDC',
        amount: '15000',
        payTo: 'invalid-not-base58!!!', // Invalid public key
        memo: 'x402:req-123',
        expiresAt: Date.now() + 300000,
      },
    };

    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(paymentRequired), { status: 402 }))
    );

    const wrappedFetch = wrapFetchWithSolanaPayment(mockFetch as unknown as typeof fetch, {
      keypair,
      maxPayment: BigInt(100000),
      rpcEndpoint: 'https://api.devnet.solana.com',
      network: 'devnet',
    });

    await expect(wrappedFetch('https://example.com/api')).rejects.toThrow(
      'Invalid recipient address'
    );
  });
});
