/**
 * FETCH_WITH_SOLANA_PAYMENT Action
 *
 * Makes HTTP requests to x402-enabled paid APIs with automatic Solana USDC payment.
 * Uses the existing Solana wallet configured for the agent (same as Jupiter/Drift).
 *
 * Usage in chat:
 *   "fetch https://api.example.com/paid-endpoint with solana payment"
 *   "make a paid request to https://api.example.com/data"
 */

import { logger, type Action, type IAgentRuntime, type Memory, type State, type HandlerCallback } from '@elizaos/core';
import { wrapFetchWithSolanaPayment } from '../client/x402-fetch';
import { RPC_ENDPOINTS } from '../constants';
// Import from root src - will be available at runtime when loaded by agent
import { SolanaTransactionManager } from '../../../../managers/solana-transaction-manager';

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

  validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    // Check if Solana transaction manager is available
    try {
      const manager = SolanaTransactionManager.getInstance();
      const isValid = manager !== null;
      logger.info('[X402] Validate called, manager available:', isValid);
      return isValid;
    } catch (error) {
      logger.error('[X402] SolanaTransactionManager not available:', error);
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<boolean> => {
    logger.info('[X402] Handler called with message:', message.content.text);

    try {
      // Extract URL from message
      const urlMatch = message.content.text?.match(/https?:\/\/[^\s]+/);
      if (!urlMatch) {
        logger.warn('[X402] No URL found in message');
        callback?.({
          text: 'Please provide a URL to fetch. Example: "fetch https://api.example.com/paid with solana payment"',
        });
        return false;
      }

      const url = urlMatch[0];
      logger.info('[X402] Extracted URL:', url);

      // Get user ID for wallet lookup
      const userId = message.userId || 'default';
      logger.info('[X402] User ID:', userId);

      // Get Solana transaction manager and wallet
      const solanaManager = SolanaTransactionManager.getInstance();
      logger.info('[X402] Got SolanaTransactionManager');

      // Use getOrCreateWallet which returns { publicKey, keypair }
      const { keypair, publicKey } = await solanaManager.getOrCreateWallet(userId);
      logger.info('[X402] Got wallet:', publicKey.substring(0, 8) + '...');

      // Get network settings from existing config
      const networkSetting = runtime.getSetting('SOLANA_NETWORK') || 'solana-devnet';
      const network = networkSetting === 'solana' ? 'mainnet-beta' : 'devnet';
      const rpcEndpoint = runtime.getSetting('HELIUS_API_KEY')
        ? `https://${network === 'mainnet-beta' ? 'mainnet' : 'devnet'}.helius-rpc.com/?api-key=${runtime.getSetting('HELIUS_API_KEY')}`
        : RPC_ENDPOINTS[network];
      const maxPaymentUSDC = parseFloat(runtime.getSetting('X402_MAX_PAYMENT_USDC') || '1.0');

      callback?.({
        text: `Making paid request to ${url} using Solana ${network}...\nWallet: ${keypair.publicKey.toBase58()}`,
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

      let data: unknown;
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

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
      const errorStack = error instanceof Error ? error.stack : '';
      logger.error('[X402] Handler error:', errorMessage, errorStack);

      // Provide helpful error messages
      if (errorMessage.includes('exceeds maximum')) {
        callback?.({
          text: `Payment amount exceeds your configured maximum ($${runtime.getSetting('X402_MAX_PAYMENT_USDC') || '1.0'}). Increase X402_MAX_PAYMENT_USDC or use a cheaper API.`,
        });
      } else if (errorMessage.includes('expired')) {
        callback?.({
          text: `Payment request expired. Please try again.`,
        });
      } else if (errorMessage.includes('insufficient') || errorMessage.includes('Insufficient')) {
        callback?.({
          text: `Insufficient USDC balance. Please fund your Solana wallet with USDC.`,
        });
      } else if (errorMessage.includes('Invalid 402')) {
        callback?.({
          text: `The API returned a 402 status but not in x402 format. This endpoint may not support x402 payments.`,
        });
      } else {
        callback?.({
          text: `[X402] Request failed: ${errorMessage}`,
        });
      }

      return false;
    }
  },
};
