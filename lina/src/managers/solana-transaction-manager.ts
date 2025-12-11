import { logger, type IAgentRuntime } from '@elizaos/core';
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  getMint,
} from '@solana/spl-token';
import { getSolanaRpcUrl, getSolanaCluster } from '@/constants/chains';
import { UnifiedWalletProvider, type WalletData } from '@/repositories/wallet-provider';

// ============================================================================
// Known Token Metadata (fallback when CoinGecko is unavailable)
// ============================================================================

const KNOWN_SPL_TOKENS: Record<string, { symbol: string; name: string; decimals: number; coingeckoId?: string }> = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD', decimals: 6, coingeckoId: 'tether' },
  'So11111111111111111111111111111111111111112': { symbol: 'WSOL', name: 'Wrapped SOL', decimals: 9, coingeckoId: 'solana' },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk', decimals: 5, coingeckoId: 'bonk' },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', name: 'Jupiter', decimals: 6, coingeckoId: 'jupiter-exchange-solana' },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': { symbol: 'mSOL', name: 'Marinade Staked SOL', decimals: 9, coingeckoId: 'msol' },
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj': { symbol: 'stSOL', name: 'Lido Staked SOL', decimals: 9, coingeckoId: 'lido-staked-sol' },
  'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof': { symbol: 'RNDR', name: 'Render Token', decimals: 8, coingeckoId: 'render-token' },
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { symbol: 'RAY', name: 'Raydium', decimals: 6, coingeckoId: 'raydium' },
  'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE': { symbol: 'ORCA', name: 'Orca', decimals: 6, coingeckoId: 'orca' },
};

// Stablecoin symbols that should default to $1.00
const STABLECOINS = ['USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'USDP'];

// ============================================================================
// Types
// ============================================================================

/**
 * Generic cache entry with TTL
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Token balance info with USD values and metadata
 */
interface SolanaTokenBalance {
  symbol: string;
  name: string;
  balance: string;
  balanceFormatted: string;
  usdValue: number;
  usdPrice: number;
  mintAddress: string | null; // null for SOL
  decimals: number;
  icon?: string; // Optional token icon URL from CoinGecko
}

// ============================================================================
// Solana Transaction Manager Class (Singleton)
// ============================================================================

export class SolanaTransactionManager {
  private static instance: SolanaTransactionManager | null = null;

  private connection: Connection | null = null;
  private network: 'solana' | 'solana-devnet' = 'solana-devnet';

  // Balance cache only - wallet caching is handled by UnifiedWalletProvider
  private balancesCache = new Map<string, CacheEntry<any>>();
  private readonly CACHE_TTL = 60 * 1000; // 60 seconds

  // Unified wallet provider - single source of truth for wallet operations
  private walletProvider: UnifiedWalletProvider;

  // Transaction configuration
  private readonly MIN_SOL_BUFFER = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL for fees/rent
  private readonly CONFIRMATION_TIMEOUT = 60000; // 60s timeout

  // Private constructor to prevent direct instantiation
  private constructor() {
    // Get the unified wallet provider singleton
    this.walletProvider = UnifiedWalletProvider.getInstance();

    this.initializeConnection();
    this.validateConfiguration();
  }

  /**
   * Validate critical configuration at startup
   * Logs warnings for missing config but doesn't throw (allows read-only ops)
   */
  private validateConfiguration(): void {
    const issues: string[] = [];

    if (!this.walletProvider.isConfigured()) {
      issues.push('WALLET_DB_URL or SOLANA_WALLET_SECRET not set - wallet operations will fail');
    }

    if (!this.connection) {
      issues.push('Solana RPC connection failed - transactions will fail');
    }

    if (issues.length > 0) {
      logger.warn('[SolanaTransactionManager] Configuration issues detected:');
      issues.forEach((issue) => logger.warn(`  - ${issue}`));
      logger.warn('[SolanaTransactionManager] Some operations may fail. Please check your .env file.');
    } else {
      logger.info('[SolanaTransactionManager] Configuration validated successfully');
    }
  }

  /**
   * Get the singleton instance of SolanaTransactionManager
   * Matches CDP pattern
   */
  public static getInstance(): SolanaTransactionManager {
    if (!SolanaTransactionManager.instance) {
      SolanaTransactionManager.instance = new SolanaTransactionManager();
    }
    return SolanaTransactionManager.instance;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize Solana RPC connection
   * Uses Helius if API key available, falls back to public RPC
   * Matches CDP's graceful degradation pattern
   *
   * COMMITMENT STRATEGY:
   * - Connection uses 'confirmed' commitment (faster, ~400ms avg)
   *   for balance queries and action feedback
   * - Value transfer methods (sendToken, sendAndConfirmTransactionWithRetry)
   *   explicitly override to 'finalized' commitment (~32s avg) for security
   * - This dual approach balances UX responsiveness with transaction safety
   */
  private initializeConnection(): void {
    if (this.connection) {
      return; // Already initialized
    }

    const heliusKey = process.env.HELIUS_API_KEY;
    const networkEnv = process.env.SOLANA_NETWORK as 'solana' | 'solana-devnet' | undefined;

    // Use env var if set, otherwise default to devnet
    if (networkEnv && (networkEnv === 'solana' || networkEnv === 'solana-devnet')) {
      this.network = networkEnv;
    }

    try {
      // Get RPC URL using chains.ts helper (completed in Task 1.1)
      const rpcUrl = getSolanaRpcUrl(this.network, heliusKey);

      if (!rpcUrl) {
        logger.warn('[SolanaTransactionManager] Failed to get RPC URL, using public fallback');
        // Public fallback
        const fallbackUrl = this.network === 'solana'
          ? 'https://api.mainnet-beta.solana.com'
          : 'https://api.devnet.solana.com';

        this.connection = new Connection(fallbackUrl, {
          commitment: 'confirmed', // Faster than finalized, sufficient for most actions
          confirmTransactionInitialTimeout: 60000, // 60s timeout
        });

        logger.info(`[SolanaTransactionManager] Connection initialized (public RPC): ${this.network}`);
        return;
      }

      // Initialize with Helius or config RPC
      this.connection = new Connection(rpcUrl, {
        commitment: 'confirmed', // Faster than finalized, sufficient for most actions
        confirmTransactionInitialTimeout: 60000,
      });

      const rpcType = heliusKey ? 'Helius' : 'public';
      logger.info(`[SolanaTransactionManager] Connection initialized (${rpcType}): ${this.network}`);
    } catch (error) {
      logger.error(
        '[SolanaTransactionManager] Failed to initialize connection:',
        error instanceof Error ? error.message : String(error)
      );
      // Don't throw - allow manager to exist but fail on usage
      // Matches CDP pattern
    }
  }

  /**
   * Get the initialized Solana connection
   * Throws if not initialized (matches CDP pattern)
   * @throws Error if connection not initialized
   * @returns Solana Connection instance
   */
  public getConnection(): Connection {
    if (!this.connection) {
      throw new Error(
        'Solana connection not initialized. Check HELIUS_API_KEY or SOLANA_NETWORK environment variables.'
      );
    }
    return this.connection;
  }

  /**
   * Get current network
   * @returns Current Solana network identifier
   */
  public getNetwork(): 'solana' | 'solana-devnet' {
    return this.network;
  }

  // ============================================================================
  // Cache Helpers
  // ============================================================================

  /**
   * Check if cache entry is still valid
   * @param entry Cache entry to check
   * @returns True if entry exists and is within TTL
   */
  private isCacheValid<T>(entry: CacheEntry<T> | undefined): boolean {
    if (!entry) return false;
    return (Date.now() - entry.timestamp) < this.CACHE_TTL;
  }

  /**
   * Get cached data if valid
   * Similar to CDP's cache check pattern
   */
  private getCachedData<T>(
    cacheKey: string,
    cache: Map<string, CacheEntry<T>>
  ): T | undefined {
    const entry = cache.get(cacheKey);
    if (this.isCacheValid(entry)) {
      return entry?.data;
    }
    return undefined;
  }

  /**
   * Store data in cache with current timestamp
   * Similar to CDP's cache update
   */
  private setCacheData<T>(
    cacheKey: string,
    data: T,
    cache: Map<string, CacheEntry<T>>
  ): void {
    cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
  }

  // ============================================================================
  // Wallet Operations (Delegated to UnifiedWalletProvider)
  // ============================================================================

  /**
   * Get or create a Solana wallet for a user
   * Delegates to UnifiedWalletProvider which handles:
   * - Mutex for concurrent operations
   * - Encryption/decryption
   * - Database persistence
   * - Caching
   *
   * @param userId Unique user identifier
   * @returns Wallet public key and keypair
   */
  async getOrCreateWallet(userId: string): Promise<{
    publicKey: string;
    keypair: Keypair;
  }> {
    logger.info(`[SolanaTransactionManager] Getting/creating wallet for user: ${userId.substring(0, 8)}...`);

    const walletData = await this.walletProvider.getOrCreateWallet(userId);

    return {
      publicKey: walletData.publicKey,
      keypair: walletData.keypair,
    };
  }

  // ============================================================================
  // Balance Query Methods
  // ============================================================================

  /**
   * Get SPL token balance for a user (simple version without runtime)
   * Used by API endpoints that don't have access to agent runtime.
   *
   * @param userId User identifier
   * @param mint SPL token mint address (Base58)
   * @returns Balance in raw units (bigint)
   */
  public async getSplTokenBalance(
    userId: string,
    mint: string
  ): Promise<{ balance: bigint; decimals: number }> {
    const { keypair } = await this.getOrCreateWallet(userId);
    const connection = this.getConnection();
    const mintPubkey = new PublicKey(mint);

    try {
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        mintPubkey,
        keypair.publicKey
      );
      return {
        balance: ata.amount,
        decimals: (await getMint(connection, mintPubkey)).decimals,
      };
    } catch (error) {
      // Token account doesn't exist = 0 balance
      logger.warn(`[SolanaTransactionManager] Token account not found for ${mint.substring(0, 8)}...`);
      return { balance: 0n, decimals: 6 };
    }
  }

  /**
   * Get token balances for a user (SOL + SPL tokens)
   * - Checks cache first (5-min TTL)
   * - Fetches SOL balance + SPL token accounts
   * - Enriches with prices from CoinGecko
   * - Returns USD values for all tokens
   *
   * @param userId User identifier
   * @param runtime Agent runtime for CoinGecko service access
   * @param forceSync Bypass cache and fetch fresh data
   * @returns Token balances with USD values
   */
  public async getTokenBalances(
    userId: string,
    runtime: IAgentRuntime,
    forceSync: boolean = false
  ): Promise<{
    tokens: SolanaTokenBalance[];
    totalUsdValue: number;
    address: string;
    fromCache: boolean;
  }> {
    logger.info(
      `[SolanaTransactionManager] Getting token balances for user: ${userId.substring(0, 8)}...${forceSync ? ' (force sync)' : ''}`
    );

    // Check cache first (unless force sync)
    if (!forceSync) {
      const cached = this.getCachedData(userId, this.balancesCache);
      if (cached) {
        logger.info(`[SolanaTransactionManager] Returning cached token balances`);
        return { ...cached, fromCache: true };
      }
    }

    // Get wallet
    const { publicKey, keypair } = await this.getOrCreateWallet(userId);
    const pubkey = keypair.publicKey;

    const allTokens: SolanaTokenBalance[] = [];
    let totalUsdValue = 0;

    try {
      // Get SOL balance
      const { balance: solBalance, usdValue: solUsdValue, usdPrice: solUsdPrice } =
        await this.getSOLBalance(pubkey, runtime);

      // Always include SOL in tokens list (even if 0) so downstream code can check balance
      const balanceFormatted = this.formatTokenBalance(solBalance, 9);
      allTokens.push({
        symbol: 'SOL',
        name: 'Solana',
        balance: solBalance.toString(),
        balanceFormatted: this.formatBalanceForDisplay(balanceFormatted),
        usdValue: solUsdValue,
        usdPrice: solUsdPrice,
        mintAddress: null,
        decimals: 9,
      });
      totalUsdValue += solUsdValue;

      // Get SPL tokens
      const splAccounts = await this.getSPLTokenAccounts(pubkey);

      // Enrich with prices (parallel)
      const enrichmentPromises = splAccounts.map((account) =>
        this.enrichTokenWithPrice(account.mint, account.balance, account.decimals, runtime)
      );
      const splTokens = await Promise.all(enrichmentPromises);

      // Add SPL tokens to list and calculate total value
      for (const token of splTokens) {
        allTokens.push(token);
        totalUsdValue += token.usdValue;
      }

      const finalTotalUsdValue = isNaN(totalUsdValue) ? 0 : totalUsdValue;

      logger.info(
        `[SolanaTransactionManager] Found ${allTokens.length} tokens, total value: $${finalTotalUsdValue.toFixed(2)}`
      );

      // Prepare result
      const result = {
        tokens: allTokens,
        totalUsdValue: finalTotalUsdValue,
        address: publicKey,
      };

      // Cache result
      this.setCacheData(userId, result, this.balancesCache);

      return { ...result, fromCache: false };
    } catch (error) {
      logger.error(
        '[SolanaTransactionManager] Failed to fetch token balances:',
        error instanceof Error ? error.message : String(error)
      );
      return {
        tokens: [],
        totalUsdValue: 0,
        address: publicKey,
        fromCache: false,
      };
    }
  }

  /**
   * Get SOL balance for a public key
   * @param publicKey Solana public key
   * @param runtime Agent runtime for CoinGecko service
   * @returns SOL balance in lamports with USD value
   */
  private async getSOLBalance(
    publicKey: PublicKey,
    runtime: IAgentRuntime
  ): Promise<{ balance: bigint; usdValue: number; usdPrice: number }> {
    try {
      const connection = this.getConnection();
      const lamports = await connection.getBalance(publicKey);
      const balance = BigInt(lamports);

      logger.debug(`[SolanaTransactionManager] SOL balance: ${lamports} lamports`);

      // Fetch SOL price: CoinGecko Service → CoinGecko Direct → Jupiter fallback
      let usdPrice = 0;

      // Try CoinGecko service first
      try {
        const coingeckoService = runtime.getService('CoinGeckoService' as any);
        if (coingeckoService) {
          const metadata = await (coingeckoService as any).getTokenMetadata('solana');
          if (metadata && metadata.length > 0 && metadata[0].success) {
            const marketData = metadata[0].data as any;
            usdPrice = marketData?.market_data?.current_price?.usd || 0;
          }
        }
      } catch (cgServiceError) {
        logger.warn('[SolanaTransactionManager] CoinGecko service failed:', cgServiceError);
      }

      // Fallback: direct CoinGecko API
      if (usdPrice === 0) {
        try {
          const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
          const data = await response.json() as { solana?: { usd?: number } };
          usdPrice = data.solana?.usd ?? 0;
          if (usdPrice > 0) {
            logger.debug(`[SolanaTransactionManager] SOL price from CoinGecko direct: $${usdPrice}`);
          }
        } catch (cgDirectError) {
          logger.warn('[SolanaTransactionManager] CoinGecko direct API failed:', cgDirectError);
        }
      }

      // Fallback: Jupiter Price API
      if (usdPrice === 0) {
        try {
          const SOL_MINT = 'So11111111111111111111111111111111111111112';
          const res = await fetch(`https://api.jup.ag/price/v2?ids=${SOL_MINT}`);
          const data = await res.json() as { data?: Record<string, { price?: string }> };
          const priceStr = data?.data?.[SOL_MINT]?.price;
          if (priceStr) {
            usdPrice = parseFloat(priceStr);
            logger.debug(`[SolanaTransactionManager] SOL price from Jupiter: $${usdPrice}`);
          }
        } catch (jupError) {
          logger.warn('[SolanaTransactionManager] Jupiter price API failed:', jupError);
        }
      }

      if (usdPrice === 0) {
        logger.error('[SolanaTransactionManager] Failed to fetch SOL price from all sources');
      }

      // Calculate USD value
      const balanceNum = parseFloat(this.formatTokenBalance(balance, 9));
      const usdValue = balanceNum * usdPrice;

      return {
        balance,
        usdValue: isNaN(usdValue) ? 0 : usdValue,
        usdPrice: isNaN(usdPrice) ? 0 : usdPrice,
      };
    } catch (error) {
      logger.error(
        '[SolanaTransactionManager] Failed to get SOL balance:',
        error instanceof Error ? error.message : String(error)
      );
      return { balance: 0n, usdValue: 0, usdPrice: 0 };
    }
  }

  /**
   * Get SPL token accounts for a public key
   * @param publicKey Solana public key
   * @returns Array of SPL token accounts with non-zero balances
   */
  private async getSPLTokenAccounts(
    publicKey: PublicKey
  ): Promise<Array<{ mint: string; balance: bigint; decimals: number }>> {
    try {
      const connection = this.getConnection();

      logger.debug('[SolanaTransactionManager] Fetching SPL token accounts...');

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      const accounts: Array<{ mint: string; balance: bigint; decimals: number }> = [];

      for (const accountInfo of tokenAccounts.value) {
        try {
          const parsedData = accountInfo.account.data.parsed;
          const tokenAmount = parsedData?.info?.tokenAmount;

          if (!tokenAmount) continue;

          const balance = BigInt(tokenAmount.amount);
          if (balance === 0n) continue; // Skip zero-balance tokens

          accounts.push({
            mint: parsedData.info.mint,
            balance,
            decimals: tokenAmount.decimals,
          });
        } catch (parseError) {
          logger.warn(
            '[SolanaTransactionManager] Failed to parse token account:',
            parseError instanceof Error ? parseError.message : String(parseError)
          );
        }
      }

      logger.info(`[SolanaTransactionManager] Found ${accounts.length} SPL tokens`);
      return accounts;
    } catch (error) {
      logger.error(
        '[SolanaTransactionManager] Failed to get SPL token accounts:',
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Enrich token with price data (local metadata → CoinGecko → Jupiter fallback)
   * @param mint Token mint address
   * @param balance Raw balance
   * @param decimals Token decimals
   * @param runtime Agent runtime for CoinGecko service
   * @returns Complete token balance object
   */
  private async enrichTokenWithPrice(
    mint: string,
    balance: bigint,
    decimals: number,
    runtime: IAgentRuntime
  ): Promise<SolanaTokenBalance> {
    // Check local known tokens FIRST
    const knownToken = KNOWN_SPL_TOKENS[mint];
    let symbol = knownToken?.symbol || 'UNKNOWN';
    let name = knownToken?.name || 'Unknown Token';
    let usdPrice = 0;
    let icon: string | undefined = undefined;

    // Try CoinGecko for price and additional metadata
    try {
      const coingeckoService = runtime.getService('CoinGeckoService' as any);

      if (coingeckoService) {
        const metadata = await (coingeckoService as any).getTokenMetadata(mint);

        if (metadata && metadata.length > 0 && metadata[0].success) {
          const tokenData = metadata[0].data as any;
          // Only override if CoinGecko has data and we don't have local
          if (!knownToken) {
            symbol = tokenData.symbol?.toUpperCase() || symbol;
            name = tokenData.name || name;
          }
          usdPrice = tokenData.market_data?.current_price?.usd || 0;
          icon = tokenData.image?.small || tokenData.image?.thumb;
        }
      }
    } catch (error) {
      logger.warn(
        `[SolanaTransactionManager] CoinGecko failed for ${mint}:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    // Fallback: Jupiter Price API if CoinGecko failed
    if (usdPrice === 0) {
      try {
        const res = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
        const data = await res.json() as { data?: Record<string, { price?: string }> };
        const priceStr = data?.data?.[mint]?.price;
        if (priceStr) {
          usdPrice = parseFloat(priceStr);
          logger.debug(`[SolanaTransactionManager] Jupiter price for ${symbol}: $${usdPrice}`);
        }
      } catch (jupError) {
        logger.warn(
          `[SolanaTransactionManager] Jupiter price failed for ${mint}:`,
          jupError instanceof Error ? jupError.message : String(jupError)
        );
      }
    }

    // Stablecoin fallback: default to $1.00 if still no price
    if (usdPrice === 0 && STABLECOINS.includes(symbol)) {
      usdPrice = 1.0;
      logger.debug(`[SolanaTransactionManager] Using stablecoin default for ${symbol}: $1.00`);
    }

    // Format balance
    const balanceFormatted = this.formatTokenBalance(balance, decimals);
    const balanceNum = parseFloat(balanceFormatted);
    const usdValue = balanceNum * usdPrice;

    return {
      symbol,
      name,
      balance: balance.toString(),
      balanceFormatted: this.formatBalanceForDisplay(balanceFormatted),
      usdValue: isNaN(usdValue) ? 0 : usdValue,
      usdPrice: isNaN(usdPrice) ? 0 : usdPrice,
      mintAddress: mint,
      decimals,
      icon,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Format token balance from raw to human-readable
   * Handles very small balances with leading zeros
   * @param balance Raw balance as BigInt
   * @param decimals Token decimals
   * @returns Formatted string (e.g., "1.234567")
   */
  private formatTokenBalance(balance: bigint, decimals: number): string {
    try {
      const balanceStr = balance.toString();
      const decimalPoint = balanceStr.length - decimals;

      if (decimalPoint <= 0) {
        // Very small amounts: "0.00000123"
        const zeros = '0'.repeat(Math.abs(decimalPoint));
        return `0.${zeros}${balanceStr}`;
      } else {
        // Normal amounts: "123.456"
        const intPart = balanceStr.slice(0, decimalPoint);
        const fracPart = balanceStr.slice(decimalPoint);
        return `${intPart}.${fracPart}`;
      }
    } catch (error) {
      logger.warn(
        `[SolanaTransactionManager] Error formatting balance:`,
        error instanceof Error ? error.message : String(error)
      );
      return '0';
    }
  }

  /**
   * Remove trailing zeros for display
   * @param balance Formatted balance string
   * @returns Display-friendly balance (e.g., "1.000000" → "1")
   */
  private formatBalanceForDisplay(balance: string): string {
    return balance.replace(/\.?0+$/, '');
  }

  /**
   * Calculate total USD value from token array
   * @param tokens Array of token balances
   * @returns Total USD value with NaN safety
   */
  private calculateTotalUsdValue(tokens: SolanaTokenBalance[]): number {
    const total = tokens.reduce((sum, token) => {
      const value = token.usdValue || 0;
      return sum + (isNaN(value) ? 0 : value);
    }, 0);
    return isNaN(total) ? 0 : total;
  }

  // ============================================================================
  // Transaction Methods (Task 1.5)
  // ============================================================================

  /**
   * Send SOL or SPL tokens to a recipient
   * - Auto-creates ATAs for SPL token recipients if needed
   * - Validates balances before sending
   * - Waits for finalized confirmation
   * - Returns transaction signature and explorer URL
   *
   * @param params Transaction parameters
   * @returns Transaction result with signature and explorer URL
   */
  public async sendToken(params: {
    userId: string;
    to: string; // Base58 recipient address
    mint: string | null; // null = SOL, otherwise SPL token mint
    amount: string; // Raw amount (lamports for SOL, base units for SPL)
  }): Promise<{
    transactionHash: string;
    from: string;
    to: string;
    amount: string;
    token: string;
    network: string;
    explorerUrl: string;
  }> {
    logger.info(
      `[SolanaTransactionManager] User ${params.userId.substring(0, 8)}... sending ${params.mint || 'SOL'}...`
    );

    try {
      // Step 1: Validate and prepare
      const { senderKeypair, recipientPubkey, amountBigInt } =
        await this.validateAndPrepareSend(params);

      const connection = this.getConnection();

      // Step 2: Build transaction (SOL or SPL)
      let transaction: Transaction;
      if (params.mint === null) {
        logger.info('[SolanaTransactionManager] Building SOL transfer...');
        transaction = await this.buildSOLTransferTransaction(
          senderKeypair.publicKey,
          recipientPubkey,
          amountBigInt,
          connection
        );
      } else {
        logger.info(`[SolanaTransactionManager] Building SPL transfer for ${params.mint}...`);
        transaction = await this.buildSPLTransferTransaction(
          senderKeypair,
          recipientPubkey,
          new PublicKey(params.mint),
          amountBigInt,
          connection
        );
      }

      // Step 3: Send and confirm
      logger.info('[SolanaTransactionManager] Sending transaction...');
      const signature = await this.sendAndConfirmTransactionWithRetry(
        connection,
        transaction,
        [senderKeypair]
      );

      logger.info(`[SolanaTransactionManager] Transaction confirmed: ${signature}`);

      // Step 4: Return structured result
      return {
        transactionHash: signature,
        from: senderKeypair.publicKey.toBase58(),
        to: params.to,
        amount: params.amount,
        token: params.mint || 'SOL',
        network: this.network,
        explorerUrl: this.buildExplorerUrl(signature, this.network),
      };
    } catch (error) {
      logger.error(
        '[SolanaTransactionManager] Transaction failed:',
        error instanceof Error ? error.message : String(error)
      );
      throw error; // Re-throw for action layer handling
    }
  }

  /**
   * Validate transaction parameters and prepare for sending
   * @param params Transaction parameters
   * @returns Validated sender keypair, recipient pubkey, and amount
   */
  private async validateAndPrepareSend(params: {
    userId: string;
    to: string;
    mint: string | null;
    amount: string;
  }): Promise<{
    senderKeypair: Keypair;
    recipientPubkey: PublicKey;
    amountBigInt: bigint;
  }> {
    // Get sender wallet
    const { keypair: senderKeypair } = await this.getOrCreateWallet(params.userId);

    // Validate recipient address
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(params.to);
    } catch (error) {
      throw new Error(`Invalid Solana address: ${params.to}`);
    }

    // Validate amount
    const amountBigInt = BigInt(params.amount);
    if (amountBigInt <= 0n) {
      throw new Error('Amount must be greater than 0');
    }

    // Check balances
    const connection = this.getConnection();

    if (params.mint === null) {
      // SOL transfer - check SOL balance with buffer
      const balance = await connection.getBalance(senderKeypair.publicKey);
      const required = Number(amountBigInt) + this.MIN_SOL_BUFFER;

      if (balance < required) {
        throw new Error(
          `Insufficient SOL. Have: ${balance / LAMPORTS_PER_SOL} SOL, Need: ${required / LAMPORTS_PER_SOL} SOL (includes 0.01 SOL buffer for fees)`
        );
      }
    } else {
      // SPL transfer - check token balance and SOL for potential ATA creation
      const mintPubkey = new PublicKey(params.mint);

      try {
        const senderATA = await getOrCreateAssociatedTokenAccount(
          connection,
          senderKeypair,
          mintPubkey,
          senderKeypair.publicKey
        );

        if (BigInt(senderATA.amount.toString()) < amountBigInt) {
          throw new Error(
            `Insufficient token balance. Have: ${senderATA.amount.toString()}, Need: ${params.amount}`
          );
        }

        // Check SOL for potential ATA creation fee
        const solBalance = await connection.getBalance(senderKeypair.publicKey);
        if (solBalance < this.MIN_SOL_BUFFER) {
          throw new Error(
            `Insufficient SOL for transaction fees. Need at least 0.01 SOL, have: ${solBalance / LAMPORTS_PER_SOL} SOL`
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Insufficient')) {
          throw error;
        }
        throw new Error(
          `Failed to validate token balance: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return { senderKeypair, recipientPubkey, amountBigInt };
  }

  /**
   * Build SOL transfer transaction
   * @param from Sender public key
   * @param to Recipient public key
   * @param amount Amount in lamports
   * @param connection Solana connection
   * @returns Built transaction
   */
  private async buildSOLTransferTransaction(
    from: PublicKey,
    to: PublicKey,
    amount: bigint,
    connection: Connection
  ): Promise<Transaction> {
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports: Number(amount),
    });

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('finalized');

    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = from;
    transaction.add(transferInstruction);

    return transaction;
  }

  /**
   * Build SPL token transfer transaction
   * @param senderKeypair Sender keypair
   * @param recipient Recipient public key
   * @param mint Token mint address
   * @param amount Amount in base units
   * @param connection Solana connection
   * @returns Built transaction
   */
  private async buildSPLTransferTransaction(
    senderKeypair: Keypair,
    recipient: PublicKey,
    mint: PublicKey,
    amount: bigint,
    connection: Connection
  ): Promise<Transaction> {
    // Get or create sender ATA (should already exist from validation)
    const senderATA = await getOrCreateAssociatedTokenAccount(
      connection,
      senderKeypair,
      mint,
      senderKeypair.publicKey
    );

    // Get or create recipient ATA (may not exist - auto-create)
    logger.info('[SolanaTransactionManager] Checking recipient ATA...');
    const recipientATA = await getOrCreateAssociatedTokenAccount(
      connection,
      senderKeypair, // Payer (sender pays for recipient's ATA)
      mint,
      recipient // Owner
    );

    logger.info(
      `[SolanaTransactionManager] Recipient ATA: ${recipientATA.address.toBase58()}`
    );

    // Get mint info for decimals
    const mintInfo = await getMint(connection, mint);

    // Create transfer instruction
    const transferInstruction = createTransferCheckedInstruction(
      senderATA.address, // Source ATA
      mint, // Mint
      recipientATA.address, // Destination ATA
      senderKeypair.publicKey, // Owner (signer)
      Number(amount), // Amount
      mintInfo.decimals // Decimals (validation)
    );

    // Build transaction
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('finalized');

    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = senderKeypair.publicKey;
    transaction.add(transferInstruction);

    return transaction;
  }

  /**
   * Send and confirm transaction with retry on blockhash expiration
   * @param connection Solana connection
   * @param transaction Transaction to send
   * @param signers Signers for the transaction
   * @returns Transaction signature
   */
  private async sendAndConfirmTransactionWithRetry(
    connection: Connection,
    transaction: Transaction,
    signers: Keypair[]
  ): Promise<string> {
    try {
      // Send and confirm (built-in method with finalized commitment)
      const signature = await sendAndConfirmTransaction(connection, transaction, signers, {
        commitment: 'finalized',
        preflightCommitment: 'finalized',
      });

      return signature;
    } catch (error) {
      // Handle blockhash expiration
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Blockhash not found') || errorMessage.includes('block height exceeded')) {
        logger.warn('[SolanaTransactionManager] Blockhash expired, retrying...');

        // Refresh blockhash and retry once
        const { blockhash } = await connection.getLatestBlockhash('finalized');
        transaction.recentBlockhash = blockhash;

        const signature = await sendAndConfirmTransaction(connection, transaction, signers, {
          commitment: 'finalized',
          preflightCommitment: 'finalized',
        });

        return signature;
      }

      throw error;
    }
  }

  /**
   * Build explorer URL for transaction
   * @param signature Transaction signature
   * @param network Network identifier
   * @returns Explorer URL
   */
  private buildExplorerUrl(signature: string, network: string): string {
    if (network === 'solana') {
      return `https://solscan.io/tx/${signature}`;
    } else {
      return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
    }
  }
}
