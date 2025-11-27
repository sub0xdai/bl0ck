import express from 'express';
import { logger } from '@elizaos/core';
import type { AgentServer } from '../../index';
import { sendError, sendSuccess } from '../shared/response-utils';
import { requireAuth, type AuthenticatedRequest } from '../../middleware';
import { SolanaTransactionManager } from '@/managers/solana-transaction-manager';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export function solanaRouter(_serverInstance: AgentServer): express.Router {
  const router = express.Router();

  // Get the singleton instance of SolanaTransactionManager
  const solanaTransactionManager = SolanaTransactionManager.getInstance();

  // SECURITY: Require authentication for all Solana wallet operations
  router.use(requireAuth);

  /**
   * GET /api/solana/wallet/:userId
   * Get Solana wallet info for authenticated user
   * SECURITY: Uses userId from JWT token, not URL parameter
   */
  router.get('/wallet/:userId', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;

      // Get or create wallet
      const { publicKey, keypair } = await solanaTransactionManager.getOrCreateWallet(userId);

      // Get SOL balance
      const connection = (solanaTransactionManager as any).connection;
      const balance = await connection.getBalance(keypair.publicKey);
      const solBalance = Number(balance) / LAMPORTS_PER_SOL;

      // TODO: Add token enrichment with getTokenBalances when runtime access is available
      // For now, return basic wallet info
      const result = {
        publicKey,
        solBalance,
        tokens: [],
        totalUSD: solBalance * 200, // Rough estimate, replace with CoinGecko price
      };

      sendSuccess(res, result);
    } catch (error) {
      logger.error(
        '[Solana API] Error with wallet:',
        error instanceof Error ? error.message : String(error)
      );
      sendError(
        res,
        500,
        'WALLET_FAILED',
        'Failed to get Solana wallet',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  /**
   * POST /api/solana/wallet/:userId/sync
   * Force sync Solana wallet balances (bypasses cache)
   * SECURITY: Uses userId from JWT token
   */
  router.post('/wallet/:userId/sync', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;

      // Get or create wallet
      const { publicKey, keypair } = await solanaTransactionManager.getOrCreateWallet(userId);

      // Get fresh SOL balance (bypasses any caching)
      const connection = (solanaTransactionManager as any).connection;
      const balance = await connection.getBalance(keypair.publicKey);
      const solBalance = Number(balance) / LAMPORTS_PER_SOL;

      const result = {
        publicKey,
        solBalance,
        tokens: [],
        totalUSD: solBalance * 200,
      };

      sendSuccess(res, result);
    } catch (error) {
      logger.error(
        '[Solana API] Error syncing wallet:',
        error instanceof Error ? error.message : String(error)
      );
      sendError(
        res,
        500,
        'SYNC_FAILED',
        'Failed to sync Solana wallet',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  return router;
}
