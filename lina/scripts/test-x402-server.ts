#!/usr/bin/env bun
/**
 * Test x402 Server
 *
 * Run: bun run scripts/test-x402-server.ts
 *
 * This creates a simple HTTP server that returns 402 Payment Required
 * responses in x402 format, allowing you to test the FETCH_WITH_SOLANA_PAYMENT action.
 */

import { createX402Middleware, InMemoryPaymentStore, USDC_MINT_DEVNET } from './src/plugins/plugin-x402-solana/src';
import { Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

const PORT = 4402;

// Generate a test recipient wallet (in production, use your real wallet)
const recipientWallet = Keypair.generate();
const recipientUsdcAccount = getAssociatedTokenAddressSync(USDC_MINT_DEVNET, recipientWallet.publicKey);

console.log('='.repeat(60));
console.log('x402 Test Server');
console.log('='.repeat(60));
console.log(`Recipient wallet: ${recipientWallet.publicKey.toBase58()}`);
console.log(`Recipient USDC account: ${recipientUsdcAccount.toBase58()}`);
console.log('='.repeat(60));

// Create payment store and middleware
const store = new InMemoryPaymentStore();
const middleware = createX402Middleware({
  pricePerRequest: BigInt(1000), // $0.001 (very cheap for testing)
  recipientTokenAccount: recipientUsdcAccount,
  rpcEndpoint: 'https://api.devnet.solana.com',
  network: 'devnet',
  paymentStore: store,
});

// Simple HTTP server
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS headers for browser requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-payment-proof',
    };

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    console.log(`\n[${new Date().toISOString()}] ${req.method} ${url.pathname}`);

    // Health check endpoint (no payment required)
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', message: 'x402 test server running' }, { headers: corsHeaders });
    }

    // Paid endpoint
    if (url.pathname === '/paid' || url.pathname === '/api/paid') {
      // Convert request to format expected by middleware
      const paymentRequired = await middleware({ headers: req.headers });

      if (paymentRequired) {
        // Return 402 Payment Required
        console.log(`  → Returning 402 (requestId: ${paymentRequired.requestId})`);
        return Response.json(paymentRequired, {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Payment verified - return premium content
      console.log('  → Payment verified! Returning premium content');
      return Response.json({
        success: true,
        message: 'Payment received! Here is your premium content.',
        data: {
          secret: 'The answer to life, the universe, and everything is 42.',
          timestamp: new Date().toISOString(),
        }
      }, { headers: corsHeaders });
    }

    // Info endpoint
    if (url.pathname === '/' || url.pathname === '/info') {
      return Response.json({
        name: 'x402 Test Server',
        endpoints: {
          '/health': 'Health check (free)',
          '/paid': 'Paid endpoint ($0.001 USDC)',
        },
        testInChat: `Use FETCH_WITH_SOLANA_PAYMENT to fetch http://localhost:${PORT}/paid`,
      }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  },
});

console.log(`\nServer running at http://localhost:${PORT}`);
console.log(`\nTest endpoints:`);
console.log(`  http://localhost:${PORT}/         - Info`);
console.log(`  http://localhost:${PORT}/health   - Health check (free)`);
console.log(`  http://localhost:${PORT}/paid     - Paid endpoint ($0.001 USDC)`);
console.log(`\nIn chat, try:`);
console.log(`  "Use FETCH_WITH_SOLANA_PAYMENT to fetch http://localhost:${PORT}/paid"`);
console.log(`\nPress Ctrl+C to stop`);
