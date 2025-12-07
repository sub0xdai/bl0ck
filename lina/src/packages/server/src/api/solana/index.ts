import express from 'express';
import { logger } from '@elizaos/core';
import type { AgentServer } from '../../index';
import { sendError, sendSuccess } from '../shared/response-utils';
import { requireAuth, type AuthenticatedRequest } from '../../middleware';
import { SolanaTransactionManager } from '@/managers/solana-transaction-manager';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

// Cache SOL price for 60 seconds to avoid rate limiting
let cachedSolPrice: number | null = null;
let lastPriceFetch = 0;
const PRICE_CACHE_TTL = 60_000;

async function getSolPrice(): Promise<number> {
  const now = Date.now();
  if (cachedSolPrice && now - lastPriceFetch < PRICE_CACHE_TTL) {
    return cachedSolPrice;
  }
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json() as { solana?: { usd?: number } };
    cachedSolPrice = data.solana?.usd ?? 200;
    lastPriceFetch = now;
    return cachedSolPrice;
  } catch (error) {
    logger.warn('[Solana API] Failed to fetch SOL price, using cached or fallback');
    return cachedSolPrice ?? 200;
  }
}

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
      const solPrice = await getSolPrice();
      const result = {
        publicKey,
        solBalance,
        tokens: [],
        totalUSD: solBalance * solPrice,
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

      const solPrice = await getSolPrice();
      const result = {
        publicKey,
        solBalance,
        tokens: [],
        totalUSD: solBalance * solPrice,
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
