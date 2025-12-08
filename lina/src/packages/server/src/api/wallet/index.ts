import express from 'express';
import { logger } from '@elizaos/core';
import type { AgentServer } from '../../index';
import { sendError, sendSuccess } from '../shared/response-utils';
import { requireAuth, type AuthenticatedRequest } from '../../middleware';
import { CdpTransactionManager } from '@/managers/cdp-transaction-manager';
import { SolanaTransactionManager } from '@/managers/solana-transaction-manager';
import { isSolanaNetwork, MAINNET_NETWORKS } from '@/constants/chains';
import { LAMPORTS_PER_SOL, PublicKey, type Connection, type Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

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

// Known SPL token metadata
const KNOWN_SPL_TOKENS: Record<string, { symbol: string; name: string; decimals: number; coingeckoId?: string }> = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD', decimals: 6, coingeckoId: 'tether' },
  'So11111111111111111111111111111111111111112': { symbol: 'WSOL', name: 'Wrapped SOL', decimals: 9, coingeckoId: 'solana' },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk', decimals: 5, coingeckoId: 'bonk' },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', name: 'Jupiter', decimals: 6, coingeckoId: 'jupiter-exchange-solana' },
};

// Price cache
const priceCache: Map<string, { price: number; timestamp: number }> = new Map();
const PRICE_CACHE_TTL = 60_000;

/**
 * Fetch live SOL price from CoinGecko (with Jupiter fallback)
 */
async function getSolPrice(): Promise<number> {
  const cached = priceCache.get('solana');
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }

  // Try CoinGecko first
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await res.json();
    const price = data.solana?.usd;
    if (price && price > 0) {
      priceCache.set('solana', { price, timestamp: Date.now() });
      return price;
    }
  } catch (e) {
    logger.warn('[Wallet API] CoinGecko SOL price failed:', e);
  }

  // Fallback to Jupiter Price API
  try {
    const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
    const data = await res.json() as { data?: { So11111111111111111111111111111111111111112?: { price?: string } } };
    const priceStr = data?.data?.So11111111111111111111111111111111111111112?.price;
    if (priceStr) {
      const price = parseFloat(priceStr);
      if (price > 0) {
        priceCache.set('solana', { price, timestamp: Date.now() });
        return price;
      }
    }
  } catch (e) {
    logger.warn('[Wallet API] Jupiter SOL price failed:', e);
  }

  // Return cached or error (never hardcode)
  if (cached?.price) {
    return cached.price;
  }
  throw new Error('Failed to fetch SOL price from all sources');
}

// Stablecoins that should default to $1.00 if price fetch fails
const STABLECOIN_IDS = ['usd-coin', 'tether', 'dai', 'usdc', 'usdt'];

/**
 * Fetch token price from CoinGecko (with stablecoin fallback)
 */
async function getTokenPrice(coingeckoId: string): Promise<number> {
  const isStablecoin = STABLECOIN_IDS.includes(coingeckoId.toLowerCase());
  const stablecoinDefault = isStablecoin ? 1.0 : 0;

  const cached = priceCache.get(coingeckoId);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`);
    const data = await res.json() as Record<string, { usd?: number }>;
    const price = data[coingeckoId]?.usd;
    if (price && price > 0) {
      priceCache.set(coingeckoId, { price, timestamp: Date.now() });
      return price;
    }
    // API returned but no valid price - use stablecoin default
    return stablecoinDefault;
  } catch (e) {
    logger.warn(`[Wallet API] CoinGecko price fetch failed for ${coingeckoId}:`, e);
    return cached?.price || stablecoinDefault;
  }
}

/**
 * Map Solana wallet data to unified Token format (includes SPL tokens)
 */
async function mapSolanaToTokensResponse(
  publicKey: string,
  solBalance: number,
  chain: string,
  connection: Connection,
  keypair: Keypair
): Promise<TokensResponse> {
  const tokens: Token[] = [];
  let totalUsdValue = 0;

  // Fetch live SOL price
  const solPrice = await getSolPrice();

  // Always include SOL (even if 0) so downstream code can check balance
  const solUsdValue = solBalance * solPrice;
  tokens.push({
    symbol: 'SOL',
    name: 'Solana',
    balance: String(Math.floor(solBalance * LAMPORTS_PER_SOL)),
    balanceFormatted: solBalance.toFixed(9).replace(/\.?0+$/, ''),
    usdValue: solUsdValue,
    usdPrice: solPrice,
    contractAddress: null, // Native token
    chain,
    decimals: 9,
    icon: undefined,
  });
  totalUsdValue += solUsdValue;

  // Fetch SPL token accounts
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

      const tokenInfo = KNOWN_SPL_TOKENS[mint];
      const decimals = tokenInfo?.decimals ?? 9;
      const tokenBalance = Number(amount) / Math.pow(10, decimals);

      // Get price for known tokens
      let tokenUsdPrice = 0;
      let tokenUsdValue = 0;
      if (tokenInfo?.coingeckoId) {
        tokenUsdPrice = await getTokenPrice(tokenInfo.coingeckoId);
        tokenUsdValue = tokenBalance * tokenUsdPrice;
      } else if (tokenInfo?.symbol === 'USDC' || tokenInfo?.symbol === 'USDT') {
        tokenUsdPrice = 1;
        tokenUsdValue = tokenBalance;
      }

      tokens.push({
        symbol: tokenInfo?.symbol ?? mint.slice(0, 4) + '...',
        name: tokenInfo?.name ?? 'Unknown Token',
        balance: String(amount),
        balanceFormatted: tokenBalance.toFixed(decimals).replace(/\.?0+$/, ''),
        usdValue: tokenUsdValue,
        usdPrice: tokenUsdPrice,
        contractAddress: mint,
        chain,
        decimals,
        icon: undefined,
      });
      totalUsdValue += tokenUsdValue;
    }
  } catch (tokenError) {
    logger.warn('[Wallet API] Failed to fetch SPL token accounts:', tokenError);
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
        const connection = (solanaTransactionManager as any).connection as Connection;
        const balance = await connection.getBalance(keypair.publicKey);
        const solBalance = Number(balance) / LAMPORTS_PER_SOL;

        // Map to unified format (includes SPL tokens)
        const result = await mapSolanaToTokensResponse(publicKey, solBalance, chain, connection, keypair);

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
        const connection = (solanaTransactionManager as any).connection as Connection;
        const balance = await connection.getBalance(keypair.publicKey);
        const solBalance = Number(balance) / LAMPORTS_PER_SOL;

        // Map to unified format (includes SPL tokens)
        const result = await mapSolanaToTokensResponse(publicKey, solBalance, chain, connection, keypair);

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
