import express from 'express';
import { logger } from '@elizaos/core';
import type { AgentServer } from '../../index';
import { sendError, sendSuccess } from '../shared/response-utils';
import { requireAuth, type AuthenticatedRequest } from '../../middleware';
import { SolanaTransactionManager } from '@/managers/solana-transaction-manager';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Cache SOL price for 60 seconds to avoid rate limiting
let cachedSolPrice: number | null = null;
let lastPriceFetch = 0;
const PRICE_CACHE_TTL = 60_000;

// Known token metadata (mint -> { symbol, name, decimals, coingeckoId })
const KNOWN_TOKENS: Record<string, { symbol: string; name: string; decimals: number; coingeckoId?: string }> = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD', decimals: 6, coingeckoId: 'tether' },
  'So11111111111111111111111111111111111111112': { symbol: 'WSOL', name: 'Wrapped SOL', decimals: 9, coingeckoId: 'solana' },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk', decimals: 5, coingeckoId: 'bonk' },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', name: 'Jupiter', decimals: 6, coingeckoId: 'jupiter-exchange-solana' },
};

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

// Token price cache
const tokenPriceCache: Map<string, { price: number; timestamp: number }> = new Map();

async function getTokenPrice(coingeckoId: string): Promise<number> {
  const cached = tokenPriceCache.get(coingeckoId);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`);
    const data = await response.json() as Record<string, { usd?: number }>;
    const price = data[coingeckoId]?.usd ?? 0;
    tokenPriceCache.set(coingeckoId, { price, timestamp: Date.now() });
    return price;
  } catch {
    return cached?.price ?? 0;
  }
}

interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  usdValue: number;
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

      // Get SPL token accounts
      const tokens: TokenBalance[] = [];
      try {
        const tokenAccounts = await connection.getTokenAccountsByOwner(
          keypair.publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );

        for (const { account } of tokenAccounts.value) {
          // Parse token account data (SPL Token layout)
          const data = account.data;
          const mint = new PublicKey(data.slice(0, 32)).toBase58();
          const amountBuffer = data.slice(64, 72);
          const amount = amountBuffer.readBigUInt64LE(0);

          // Skip zero balances
          if (amount === 0n) continue;

          const tokenInfo = KNOWN_TOKENS[mint];
          const decimals = tokenInfo?.decimals ?? 9;
          const tokenBalance = Number(amount) / Math.pow(10, decimals);

          // Get price for known tokens
          let usdValue = 0;
          if (tokenInfo?.coingeckoId) {
            const price = await getTokenPrice(tokenInfo.coingeckoId);
            usdValue = tokenBalance * price;
          } else if (tokenInfo?.symbol === 'USDC' || tokenInfo?.symbol === 'USDT') {
            usdValue = tokenBalance; // Stablecoins
          }

          tokens.push({
            mint,
            symbol: tokenInfo?.symbol ?? mint.slice(0, 4) + '...',
            name: tokenInfo?.name ?? 'Unknown Token',
            balance: tokenBalance,
            decimals,
            usdValue,
          });
        }
      } catch (tokenError) {
        logger.warn('[Solana API] Failed to fetch token accounts:', tokenError);
      }

      const solPrice = await getSolPrice();
      const tokenTotalUSD = tokens.reduce((sum, t) => sum + t.usdValue, 0);
      const result = {
        publicKey,
        solBalance,
        tokens,
        totalUSD: solBalance * solPrice + tokenTotalUSD,
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

      // Get SPL token accounts (fresh fetch)
      const tokens: TokenBalance[] = [];
      try {
        const tokenAccounts = await connection.getTokenAccountsByOwner(
          keypair.publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );

        for (const { account } of tokenAccounts.value) {
          const data = account.data;
          const mint = new PublicKey(data.slice(0, 32)).toBase58();
          const amountBuffer = data.slice(64, 72);
          const amount = amountBuffer.readBigUInt64LE(0);

          if (amount === 0n) continue;

          const tokenInfo = KNOWN_TOKENS[mint];
          const decimals = tokenInfo?.decimals ?? 9;
          const tokenBalance = Number(amount) / Math.pow(10, decimals);

          let usdValue = 0;
          if (tokenInfo?.coingeckoId) {
            const price = await getTokenPrice(tokenInfo.coingeckoId);
            usdValue = tokenBalance * price;
          } else if (tokenInfo?.symbol === 'USDC' || tokenInfo?.symbol === 'USDT') {
            usdValue = tokenBalance;
          }

          tokens.push({
            mint,
            symbol: tokenInfo?.symbol ?? mint.slice(0, 4) + '...',
            name: tokenInfo?.name ?? 'Unknown Token',
            balance: tokenBalance,
            decimals,
            usdValue,
          });
        }
      } catch (tokenError) {
        logger.warn('[Solana API] Failed to fetch token accounts on sync:', tokenError);
      }

      const solPrice = await getSolPrice();
      const tokenTotalUSD = tokens.reduce((sum, t) => sum + t.usdValue, 0);
      const result = {
        publicKey,
        solBalance,
        tokens,
        totalUSD: solBalance * solPrice + tokenTotalUSD,
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
