/**
 * FETCH_WITH_SOLANA_PAYMENT Action
 *
 * Makes HTTP requests to x402-enabled paid APIs with automatic Solana USDC payment.
 *
 * Usage in chat:
 *   "fetch https://api.example.com/paid-endpoint with solana payment"
 *   "make a paid request to https://api.example.com/data"
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { Keypair } from '@solana/web3.js';
import { wrapFetchWithSolanaPayment } from '../client/x402-fetch';
import { RPC_ENDPOINTS } from '../constants';

export const fetchWithSolanaPayment: Action = {
  name: 'FETCH_WITH_SOLANA_PAYMENT',
  similes: [
    'SOLANA_PAID_FETCH',
    'X402_SOLANA_REQUEST',
    'PAID_API_SOLANA',
  ],
  description: 'Fetch data from x402-enabled paid APIs using Solana USDC payments',

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'fetch https://api.example.com/paid with solana payment' },
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'I\'ll make a paid request to that API using Solana USDC.',
          action: 'FETCH_WITH_SOLANA_PAYMENT',
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    // Check if Solana wallet is configured
    const solanaPrivateKey = runtime.getSetting('SOLANA_PRIVATE_KEY');
    if (!solanaPrivateKey) {
      console.log('[X402] SOLANA_PRIVATE_KEY not configured');
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      // Extract URL from message
      const urlMatch = message.content.text?.match(/https?:\/\/[^\s]+/);
      if (!urlMatch) {
        callback?.({
          text: 'Please provide a URL to fetch. Example: "fetch https://api.example.com/paid with solana payment"',
        });
        return false;
      }

      const url = urlMatch[0];

      // Get Solana keypair from settings
      const solanaPrivateKey = runtime.getSetting('SOLANA_PRIVATE_KEY');
      if (!solanaPrivateKey) {
        callback?.({
          text: 'Solana wallet not configured. Please set SOLANA_PRIVATE_KEY in your environment.',
        });
        return false;
      }

      // Parse keypair (support both base58 and JSON array formats)
      let keypair: Keypair;
      try {
        if (solanaPrivateKey.startsWith('[')) {
          // JSON array format
          const secretKey = new Uint8Array(JSON.parse(solanaPrivateKey));
          keypair = Keypair.fromSecretKey(secretKey);
        } else {
          // Base58 format - decode
          const bs58 = await import('bs58');
          const secretKey = bs58.default.decode(solanaPrivateKey);
          keypair = Keypair.fromSecretKey(secretKey);
        }
      } catch (e) {
        callback?.({
          text: 'Invalid SOLANA_PRIVATE_KEY format. Use base58 or JSON array.',
        });
        return false;
      }

      // Get network settings
      const network = (runtime.getSetting('SOLANA_NETWORK') as 'mainnet-beta' | 'devnet') || 'devnet';
      const rpcEndpoint = runtime.getSetting('SOLANA_RPC_URL') || RPC_ENDPOINTS[network];
      const maxPaymentUSDC = parseFloat(runtime.getSetting('X402_MAX_PAYMENT_USDC') || '1.0');

      callback?.({
        text: `Making paid request to ${url} using Solana ${network}...`,
      });

      // Create payment-wrapped fetch
      const paidFetch = wrapFetchWithSolanaPayment(fetch, {
        keypair,
        maxPayment: BigInt(Math.floor(maxPaymentUSDC * 1_000_000)), // Convert to USDC base units
        rpcEndpoint,
        network,
      });

      // Make the request
      const response = await paidFetch(url);
      const data = await response.json();

      callback?.({
        text: `Successfully fetched data from ${url}`,
        content: {
          status: response.status,
          data,
          network,
          wallet: keypair.publicKey.toBase58(),
        },
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Provide helpful error messages
      if (errorMessage.includes('exceeds maximum')) {
        callback?.({
          text: `Payment amount exceeds your configured maximum. Increase X402_MAX_PAYMENT_USDC or use a cheaper API.`,
        });
      } else if (errorMessage.includes('expired')) {
        callback?.({
          text: `Payment request expired. Please try again.`,
        });
      } else if (errorMessage.includes('insufficient')) {
        callback?.({
          text: `Insufficient USDC balance. Please fund your Solana wallet with USDC.`,
        });
      } else {
        callback?.({
          text: `Request failed: ${errorMessage}`,
        });
      }

      return false;
    }
  },
};
