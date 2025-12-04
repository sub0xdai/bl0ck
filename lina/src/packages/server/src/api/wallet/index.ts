import express from 'express';
import { logger } from '@elizaos/core';
import type { AgentServer } from '../../index';
import { sendError, sendSuccess } from '../shared/response-utils';
import { requireAuth, type AuthenticatedRequest } from '../../middleware';
import { CdpTransactionManager } from '@/managers/cdp-transaction-manager';
import { SolanaTransactionManager } from '@/managers/solana-transaction-manager';
import { isSolanaNetwork, MAINNET_NETWORKS } from '@/constants/chains';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

/**
 * Token interface (unified format for all chains)
 * Matches CDP Token format from api-client
 */
interface Token {
  symbol: string;
  name: string;
  balance: string;
  balanceFormatted: string;
  usdValue: number;
  usdPrice: number;
  contractAddress: string | null;
  chain: string;
  decimals: number;
  icon?: string;
}

interface TokensResponse {
  tokens: Token[];
  totalUsdValue: number;
  address: string;
  fromCache?: boolean;
  synced?: boolean;
}

/**
 * Fetch live SOL price from CoinGecko
 */
async function getSolPrice(): Promise<number> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await res.json();
    return data.solana?.usd || 200;
  } catch {
    return 200; // Fallback
  }
}

/**
 * Map Solana wallet data to unified Token format
 */
async function mapSolanaToTokensResponse(
  publicKey: string,
  solBalance: number,
  chain: string
): Promise<TokensResponse> {
  const tokens: Token[] = [];
  let totalUsdValue = 0;

  // Fetch live SOL price
  const solPrice = await getSolPrice();

  if (solBalance > 0) {
    const usdValue = solBalance * solPrice;
    tokens.push({
      symbol: 'SOL',
      name: 'Solana',
      balance: String(Math.floor(solBalance * LAMPORTS_PER_SOL)),
      balanceFormatted: solBalance.toFixed(9).replace(/\.?0+$/, ''),
      usdValue,
      usdPrice: solPrice,
      contractAddress: null, // Native token
      chain,
      decimals: 9,
      icon: undefined,
    });
    totalUsdValue += usdValue;
  }

  return {
    tokens,
    totalUsdValue,
    address: publicKey,
    fromCache: false,
  };
}

export function walletRouter(_serverInstance: AgentServer): express.Router {
  const router = express.Router();

  // Get manager instances
  const cdpTransactionManager = CdpTransactionManager.getInstance();
  const solanaTransactionManager = SolanaTransactionManager.getInstance();

  // SECURITY: Require authentication for all wallet operations
  router.use(requireAuth);

  /**
   * GET /api/wallet/tokens
   * Unified token endpoint - routes to CDP or Solana based on chain param
   * Query params:
   *   - chain (optional): Specific chain to fetch (e.g., 'base', 'ethereum', 'solana')
   * SECURITY: Uses authenticated userId from JWT token
   */
  router.get('/tokens', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const chain = req.query.chain as string | undefined;

      // Validate chain if provided
      if (chain && !MAINNET_NETWORKS.includes(chain as any)) {
        return sendError(res, 400, 'INVALID_CHAIN', `Invalid or unsupported chain: ${chain}`);
      }

      // Route based on chain type
      if (chain && isSolanaNetwork(chain)) {
        // Solana chain - use Solana manager
        logger.info(`[Wallet API] Fetching Solana tokens for user: ${userId.substring(0, 8)}...`);

        const { publicKey, keypair } = await solanaTransactionManager.getOrCreateWallet(userId);

        // Get SOL balance
        const connection = (solanaTransactionManager as any).connection;
        const balance = await connection.getBalance(keypair.publicKey);
        const solBalance = Number(balance) / LAMPORTS_PER_SOL;

        // Map to unified format
        const result = await mapSolanaToTokensResponse(publicKey, solBalance, chain);

        sendSuccess(res, result);
      } else {
        // EVM chain - use CDP manager
        const result = await cdpTransactionManager.getTokenBalances(userId, chain, false);
        sendSuccess(res, result);
      }
    } catch (error) {
      logger.error(
        '[Wallet API] Error fetching tokens:',
        error instanceof Error ? error.message : String(error)
      );
      sendError(
        res,
        500,
        'FETCH_TOKENS_FAILED',
        'Failed to fetch token balances',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  /**
   * POST /api/wallet/tokens/sync
   * Force sync token balances (bypasses cache)
   * Body params:
   *   - chain (optional): Specific chain to sync
   * SECURITY: Uses authenticated userId from JWT token
   */
  router.post('/tokens/sync', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const { chain } = req.body;

      // Validate chain if provided
      if (chain && !MAINNET_NETWORKS.includes(chain as any)) {
        return sendError(res, 400, 'INVALID_CHAIN', `Invalid or unsupported chain: ${chain}`);
      }

      // Route based on chain type
      if (chain && isSolanaNetwork(chain)) {
        // Solana chain - use Solana manager
        logger.info(`[Wallet API] Syncing Solana tokens for user: ${userId.substring(0, 8)}...`);

        const { publicKey, keypair } = await solanaTransactionManager.getOrCreateWallet(userId);

        // Get fresh SOL balance
        const connection = (solanaTransactionManager as any).connection;
        const balance = await connection.getBalance(keypair.publicKey);
        const solBalance = Number(balance) / LAMPORTS_PER_SOL;

        // Map to unified format
        const result = await mapSolanaToTokensResponse(publicKey, solBalance, chain);

        sendSuccess(res, { ...result, synced: true });
      } else {
        // EVM chain - use CDP manager (force sync)
        const result = await cdpTransactionManager.getTokenBalances(userId, chain, true);
        sendSuccess(res, { ...result, synced: true });
      }
    } catch (error) {
      logger.error(
        '[Wallet API] Error syncing tokens:',
        error instanceof Error ? error.message : String(error)
      );
      sendError(
        res,
        500,
        'SYNC_TOKENS_FAILED',
        'Failed to sync token balances',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  /**
   * GET /api/wallet/address
   * Get wallet address for a specific chain
   * Query params:
   *   - chain (required): Chain to get address for
   * SECURITY: Uses authenticated userId from JWT token
   */
  router.get('/address', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const chain = req.query.chain as string | undefined;

      if (!chain) {
        return sendError(res, 400, 'CHAIN_REQUIRED', 'Chain parameter is required');
      }

      if (!MAINNET_NETWORKS.includes(chain as any)) {
        return sendError(res, 400, 'INVALID_CHAIN', `Invalid or unsupported chain: ${chain}`);
      }

      if (isSolanaNetwork(chain)) {
        // Solana - get Solana wallet address
        logger.info(`[Wallet API] Fetching Solana address for user: ${userId.substring(0, 8)}...`);
        const { publicKey } = await solanaTransactionManager.getOrCreateWallet(userId);
        logger.info(`[Wallet API] Solana address: ${publicKey}`);
        sendSuccess(res, { address: publicKey, chain });
      } else {
        // EVM - get CDP wallet address
        logger.info(`[Wallet API] Fetching EVM address for user: ${userId.substring(0, 8)}... chain: ${chain}`);
        const result = await cdpTransactionManager.getOrCreateWallet(userId);
        logger.info(`[Wallet API] CDP result:`, result);
        logger.info(`[Wallet API] EVM address: ${result.address}`);
        sendSuccess(res, { address: result.address, chain });
      }
    } catch (error) {
      logger.error(
        '[Wallet API] Error getting address:',
        error instanceof Error ? error.message : String(error)
      );
      sendError(
        res,
        500,
        'GET_ADDRESS_FAILED',
        'Failed to get wallet address',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  return router;
}
