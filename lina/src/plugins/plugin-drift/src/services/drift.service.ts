/**
 * Drift Protocol Service
 * Core service for Solana perpetual futures trading
 *
 * Phase 2.2: SDK integration complete with per-user DriftClient management
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { DriftClient, Wallet, BN, PositionDirection, MarketType, getMarketOrderParams, User } from '@drift-labs/sdk';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { SolanaTransactionManager } from '@/managers/solana-transaction-manager';
import { SERVICE_NAME, CONFIG, WS_CONFIG, PRIORITY_FEE_OPTS, DEVNET_MARKETS, MAINNET_MARKETS, MINTS, ERRORS } from '../constants';
import type { JupiterService } from '../../../plugin-jupiter/src/services/jupiter.service';
import type {
  DriftPosition,
  DriftMarket,
  DriftAccountInfo,
  OpenPositionParams,
  ClosePositionParams,
  PositionResult,
  DepositResult,
  WithdrawResult,
  CloseAllResult,
  ValidationResult,
  PositionSide,
} from '../types';

/**
 * Simple mutex for async lock management (prevents race conditions)
 */
class AsyncMutex {
  private locks: Map<string, Promise<void>> = new Map();

  async acquire(key: string): Promise<() => void> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }
    let release: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(key, promise);
    return () => {
      this.locks.delete(key);
      release!();
    };
  }
}

/**
 * Retry wrapper with exponential backoff for RPC rate limiting (429 errors)
 * @param fn Async function to retry
 * @param maxRetries Maximum number of retries (default: 3)
 * @param baseDelayMs Base delay in milliseconds (default: 1000)
 * @returns Result of the function
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errorStr = String(error);

      // Only retry on 429 rate limit errors
      if (errorStr.includes('429') || errorStr.includes('Too Many Requests')) {
        if (attempt < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          logger.warn(`[DRIFT_SERVICE] RPC rate limited (429), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      }
      // Non-429 errors or max retries exceeded - throw immediately
      throw error;
    }
  }

  throw lastError;
}

export class DriftService extends Service {
  static serviceType = SERVICE_NAME;
  capabilityDescription = 'Solana perpetual futures trading via Drift Protocol with up to 20x leverage';

  // Instance getter for serviceType (tests access via instance)
  get serviceType(): string {
    return SERVICE_NAME;
  }

  private isDevnet: boolean = true;
  private markets: Record<string, number>;
  private connection: Connection | null = null;
  private clients: Map<string, DriftClient> = new Map();
  private accountInitLock = new AsyncMutex();
  private solanaManager: SolanaTransactionManager;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    this.markets = DEVNET_MARKETS; // Default to devnet
    this.solanaManager = SolanaTransactionManager.getInstance();
  }

  static async start(runtime: IAgentRuntime): Promise<DriftService> {
    logger.info('[DRIFT_SERVICE] === SERVICE START CALLED ===');
    try {
      const svc = new DriftService(runtime);
      await svc.initialize();
      logger.info('[DRIFT_SERVICE] === SERVICE STARTED SUCCESSFULLY ===');
      return svc;
    } catch (error) {
      logger.error('[DRIFT_SERVICE] === SERVICE START FAILED ===', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('[DRIFT_SERVICE] Stopping service');

    // Unsubscribe all clients
    for (const client of this.clients.values()) {
      try {
        await client.unsubscribe();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    this.clients.clear();
    this.connection = null;
  }

  private async initialize(): Promise<void> {
    // Detect network from runtime settings
    const network = this.runtime.getSetting('SOLANA_NETWORK');
    this.isDevnet = network !== 'solana'; // 'solana' = mainnet, anything else = devnet
    this.markets = this.isDevnet ? DEVNET_MARKETS : MAINNET_MARKETS;

    // Initialize connection - prioritize Helius for better rate limits
    let rpcUrl: string;
    if (this.isDevnet) {
      rpcUrl = 'https://api.devnet.solana.com';
    } else {
      // Check for Helius API key first (same as SolanaTransactionManager)
      const heliusKey = process.env.HELIUS_API_KEY || this.runtime.getSetting('HELIUS_API_KEY');
      if (heliusKey) {
        rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
        logger.info('[DRIFT_SERVICE] Using Helius RPC');
      } else {
        rpcUrl = this.runtime.getSetting('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
        logger.warn('[DRIFT_SERVICE] No HELIUS_API_KEY found, using public RPC (may rate-limit)');
      }
    }

    this.connection = new Connection(rpcUrl, 'confirmed');

    logger.info(
      '[DRIFT_SERVICE] Initialized on ' +
      (this.isDevnet ? 'devnet' : 'mainnet') +
      ' with ' + Object.keys(this.markets).length + ' markets'
    );
  }

  // ============================================================
  // CLIENT MANAGEMENT (Per-User Isolation)
  // ============================================================

  /**
   * Get or create DriftClient for a specific user
   * Handles account initialization and wallet management
   */
  private async getClientForUser(userId: string): Promise<DriftClient> {
    // Return existing client if already created and still valid
    if (this.clients.has(userId)) {
      const cachedClient = this.clients.get(userId)!;
      // Validate cached client's user is still usable
      try {
        const user = cachedClient.getUser();
        if (user && user.isSubscribed) {
          return cachedClient;
        }
        // User not subscribed - clear cache and reinitialize
        logger.warn(`[DRIFT_SERVICE] Cached client for ${userId} has invalid user, reinitializing...`);
        this.clients.delete(userId);
      } catch (e) {
        // Cache corrupted - clear and reinitialize
        logger.warn(`[DRIFT_SERVICE] Cached client for ${userId} is corrupted, reinitializing...`);
        this.clients.delete(userId);
      }
    }

    // Acquire lock to prevent race conditions on concurrent user operations
    const release = await this.accountInitLock.acquire(userId);

    try {
      // Double-check after acquiring lock
      if (this.clients.has(userId)) {
        return this.clients.get(userId)!;
      }

      // Get user's Solana wallet from SolanaTransactionManager
      const walletInfo = await this.solanaManager.getOrCreateWallet(userId);
      const keypair = walletInfo.keypair;
      const wallet = new Wallet(keypair);

      // Create DriftClient with WebSocket subscription
      logger.info(`[DRIFT_SERVICE] [T+${Date.now() - Date.now()}ms] Creating DriftClient for ${userId}...`);
      const startClient = Date.now();
      const client = new DriftClient({
        connection: this.connection!,
        wallet,
        env: this.isDevnet ? 'devnet' : 'mainnet-beta',
        accountSubscription: {
          type: 'websocket',
          resubTimeoutMs: WS_CONFIG.RESUB_TIMEOUT_MS,
        },
      });
      logger.info(`[DRIFT_SERVICE] [T+${Date.now() - startClient}ms] DriftClient instantiated`);

      // Subscribe with timeout (15s max)
      logger.info(`[DRIFT_SERVICE] [T+${Date.now() - startClient}ms] Starting subscribe...`);
      const subscribeWithTimeout = async (): Promise<boolean> => {
        const timeout = new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('DriftClient subscribe timeout (15s)')), 15000)
        );
        return Promise.race([client.subscribe(), timeout]);
      };

      const subscribed = await subscribeWithTimeout();
      if (!subscribed) {
        throw new Error('DriftClient subscription failed');
      }
      logger.info(`[DRIFT_SERVICE] [T+${Date.now() - startClient}ms] DriftClient subscribed for ${userId}`);

      // Check if user account exists using SDK method (not try/catch hack)
      const needsInit = !client.hasUser();

      if (needsInit) {
        logger.info(`[DRIFT_SERVICE] Drift account not found for ${userId}, initializing...`);

        const solBalance = await this.connection!.getBalance(keypair.publicKey);
        const minSolRequired = CONFIG.MIN_SOL_FOR_INIT * LAMPORTS_PER_SOL;

        if (solBalance < minSolRequired) {
          throw new Error(
            `Need ${CONFIG.MIN_SOL_FOR_INIT} SOL to initialize Drift. ` +
            `Have: ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`
          );
        }

        // Initialize account - SDK calls addUser() internally, DO NOT unsubscribe after!
        await withRetry(() => client.initializeUserAccount());
        logger.info(`[DRIFT_SERVICE] Drift account initialized for ${userId}`);
      }

      // Verify user is ready
      const user = client.getUser();

      // Ensure user subscription is active
      if (!user.isSubscribed) {
        const userSubscribed = await user.subscribe();
        if (!userSubscribed) {
          throw new Error('User subscription failed');
        }
      }

      // Force fetch account data to ensure it's loaded
      await user.fetchAccounts();

      // CRITICAL: Validate account data exists before caching
      const userAccount = user.getUserAccount();
      if (!userAccount || userAccount.spotPositions === undefined) {
        throw new Error('User account data not loaded after subscription');
      }

      // Cache client for reuse
      this.clients.set(userId, client);
      logger.info(`[DRIFT_SERVICE] Client ready for ${userId}`);

      return client;
    } finally {
      release();
    }
  }

  /**
   * Get user with validated account data
   * LOW-LATENCY: Trusts WebSocket subscription cache, no network fetch on hot path
   */
  private async getValidatedUser(client: DriftClient): Promise<User> {
    const user = client.getUser();

    // Only re-subscribe if disconnected (rare edge case)
    if (!user.isSubscribed) {
      logger.warn('[DRIFT_SERVICE] User subscription lost, re-subscribing...');
      const subscribed = await user.subscribe();
      if (!subscribed) {
        throw new Error('User re-subscription failed');
      }
      // Only fetch after re-subscription to sync state
      await user.fetchAccounts();
    }

    // Trust WebSocket cache - validate structure exists (synchronous check)
    const account = user.getUserAccount();
    if (!account) {
      // Account data missing - likely not initialized, fetch once to confirm
      logger.warn('[DRIFT_SERVICE] Account data missing, fetching...');
      await user.fetchAccounts();
      const retryAccount = user.getUserAccount();
      if (!retryAccount) {
        throw new Error('Unable to load user account data - account may not be initialized');
      }
    }

    return user;
  }

  // ============================================================
  // POSITION OPERATIONS
  // ============================================================

  async openPosition(userId: string, params: OpenPositionParams): Promise<PositionResult> {
    const startTotal = Date.now();
    logger.info(`[DRIFT_SERVICE] === openPosition START === ${params.side} ${params.marketSymbol} $${params.size}`);

    // Validate parameters first
    const validation = this.validatePositionParams(params);
    if (!validation.valid) {
      const errorMsg = validation.errors.join('; ');
      logger.error(`[DRIFT_SERVICE] Validation failed: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }

    try {
      logger.info(`[DRIFT_SERVICE] [T+${Date.now() - startTotal}ms] Getting client...`);
      const client = await this.getClientForUser(userId);
      logger.info(`[DRIFT_SERVICE] [T+${Date.now() - startTotal}ms] Client ready`);

      const marketIndex = this.markets[params.marketSymbol];

      if (marketIndex === undefined) {
        throw new Error(`Unknown market: ${params.marketSymbol}`);
      }

      // Get market info and oracle price
      const marketAccount = client.getPerpMarketAccount(marketIndex);
      if (!marketAccount) {
        throw new Error(`Market account not found for index ${marketIndex}`);
      }
      const oraclePrice = marketAccount.amm.historicalOracleData.lastOraclePrice;

      // Calculate required collateral
      const leverage = params.leverage || CONFIG.DEFAULT_LEVERAGE;
      const marginRequired = params.size / leverage;

      // Check existing Drift collateral first (with validated user)
      const user = await this.getValidatedUser(client);
      const freeCollateral = Number(user.getFreeCollateral().toString()) / 1_000_000; // Convert from 6 decimals
      logger.info(`[DRIFT_SERVICE] Free collateral: $${freeCollateral.toFixed(2)}, Required: $${marginRequired.toFixed(2)}`);

      // Only deposit if there's a shortfall
      if (freeCollateral < marginRequired) {
        const shortfall = marginRequired - freeCollateral;
        logger.info(`[DRIFT_SERVICE] Need to deposit additional $${shortfall.toFixed(2)}`);
        await this.ensureCollateral(userId, shortfall);
        await this.deposit(userId, shortfall);
      } else {
        logger.info(`[DRIFT_SERVICE] Sufficient collateral in Drift, skipping deposit`);
      }

      // Convert USD size to base asset amount
      // Formula: (USD_Size * BASE_PRECISION * PRICE_PRECISION) / Oracle_Price_Raw
      const PRICE_PRECISION = new BN(1_000_000);
      const baseAssetAmount = new BN(params.size)
        .mul(new BN(1_000_000_000)) // BASE_PRECISION (9 decimals)
        .mul(PRICE_PRECISION)       // PRICE_PRECISION (6 decimals)
        .div(new BN(oraclePrice.toString()))
        .mul(new BN(leverage));

      // Determine direction
      const direction = params.side === 'long' ? PositionDirection.LONG : PositionDirection.SHORT;

      // Calculate slippage-protected price limit if slippageBps provided
      // For LONGs: max price = oracle + slippage (willing to pay up to X% more)
      // For SHORTs: min price = oracle - slippage (willing to sell at X% less)
      const slippageBps = params.slippageBps ?? CONFIG.DEFAULT_SLIPPAGE * 100; // Convert % to bps
      const oraclePriceNum = Number(oraclePrice.toString()) / PRICE_PRECISION.toNumber();
      const slippageMultiplier = slippageBps / 10000;
      let priceLimit: BN | undefined;

      if (slippageBps > 0) {
        if (params.side === 'long') {
          // Max price we're willing to pay
          const maxPrice = oraclePriceNum * (1 + slippageMultiplier);
          priceLimit = new BN(Math.floor(maxPrice * 1_000_000)); // PRICE_PRECISION
          logger.info(`[DRIFT_SERVICE] Slippage protection: maxPrice=${maxPrice.toFixed(4)} (${slippageBps}bps above oracle)`);
        } else {
          // Min price we're willing to receive
          const minPrice = oraclePriceNum * (1 - slippageMultiplier);
          priceLimit = new BN(Math.floor(minPrice * 1_000_000)); // PRICE_PRECISION
          logger.info(`[DRIFT_SERVICE] Slippage protection: minPrice=${minPrice.toFixed(4)} (${slippageBps}bps below oracle)`);
        }
      }

      // Place market order with optional price limit for slippage protection
      const orderParams = getMarketOrderParams({
        marketIndex,
        direction,
        baseAssetAmount,
        marketType: MarketType.PERP,
        price: priceLimit, // Acts as slippage limit when set
      });

      // DEBUG: Log order params to diagnose SHORT position issue
      logger.info(`[DRIFT_SERVICE] === ORDER PARAMS DEBUG ===`);
      logger.info(`[DRIFT_SERVICE] side: ${params.side}`);
      logger.info(`[DRIFT_SERVICE] direction: ${direction} (0=LONG, 1=SHORT)`);
      logger.info(`[DRIFT_SERVICE] baseAssetAmount: ${baseAssetAmount.toString()}`);
      logger.info(`[DRIFT_SERVICE] baseAssetAmount (negative check): isNeg=${baseAssetAmount.isNeg()}`);
      logger.info(`[DRIFT_SERVICE] marketIndex: ${marketIndex}`);
      logger.info(`[DRIFT_SERVICE] oraclePrice: ${oraclePrice.toString()}`);
      logger.info(`[DRIFT_SERVICE] leverage: ${leverage}`);
      logger.info(`[DRIFT_SERVICE] size (USD): ${params.size}`);

      // Use retry wrapper for RPC rate limiting + priority fees for tx landing
      const txSig = await withRetry(() => client.placeAndTakePerpOrder(
        orderParams,
        undefined, // makerInfo
        undefined, // referrerInfo
        undefined, // successCondition
        undefined, // auctionDurationPercentage
        PRIORITY_FEE_OPTS
      ));

      // Don't wait for confirmation - return immediately for low latency
      // Priority fees + good RPC should ensure tx lands
      logger.info(`[DRIFT_SERVICE] Submitted order tx: ${txSig}`);

      // Get position from cache (WebSocket keeps it updated)
      const position = await this.getPosition(userId, params.marketSymbol);

      // DEBUG: Log position data to diagnose SHORT position issue
      logger.info(`[DRIFT_SERVICE] === POSITION DEBUG ===`);
      logger.info(`[DRIFT_SERVICE] txSig: ${txSig}`);
      if (position) {
        logger.info(`[DRIFT_SERVICE] position.side: ${position.side}`);
        logger.info(`[DRIFT_SERVICE] position.size: ${position.size}`);
        logger.info(`[DRIFT_SERVICE] position.entryPrice: ${position.entryPrice}`);
        logger.info(`[DRIFT_SERVICE] position.notionalValue: ${position.notionalValue}`);
        logger.info(`[DRIFT_SERVICE] position.leverage: ${position.leverage}`);
      } else {
        logger.warn(`[DRIFT_SERVICE] position is NULL after order placement!`);
      }

      logger.info(`[DRIFT_SERVICE] Opened ${params.side} position on ${params.marketSymbol} for user ${userId}`);

      return {
        success: true,
        position: position!,
        txSignature: txSig,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[DRIFT_SERVICE] Failed to open position: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  async closePosition(userId: string, params: ClosePositionParams): Promise<PositionResult> {
    // Validate parameters first
    const validation = this.validateCloseParams(params);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join('; '),
      };
    }

    try {
      const client = await this.getClientForUser(userId);
      const marketIndex = this.markets[params.marketSymbol];

      if (marketIndex === undefined) {
        throw new Error(`Unknown market: ${params.marketSymbol}`);
      }

      const user = await this.getValidatedUser(client);
      const position = user.getPerpPosition(marketIndex);

      // Check if position exists
      if (!position || position.baseAssetAmount.isZero()) {
        return {
          success: false,
          error: `No open position in ${params.marketSymbol}`,
        };
      }

      // Calculate close amount
      const percentage = params.percentage || 100;
      const closeAmount = position.baseAssetAmount.mul(new BN(percentage)).div(new BN(100));

      // Determine direction (opposite of position)
      const direction = position.baseAssetAmount.gt(new BN(0))
        ? PositionDirection.SHORT  // Close long
        : PositionDirection.LONG;  // Close short

      const orderParams = getMarketOrderParams({
        marketIndex,
        direction,
        baseAssetAmount: closeAmount.abs(),
        marketType: MarketType.PERP,
        reduceOnly: true,
      });

      // Use placeAndTakePerpOrder with reduceOnly (closePosition is deprecated) + priority fees
      const txSig = await withRetry(() => client.placeAndTakePerpOrder(
        orderParams,
        undefined, // makerInfo
        undefined, // referrerInfo
        undefined, // successCondition
        undefined, // auctionDurationPercentage
        PRIORITY_FEE_OPTS
      ));
      await withRetry(() => this.connection!.confirmTransaction(txSig, 'confirmed'));

      logger.info(`[DRIFT_SERVICE] Closed ${percentage}% of ${params.marketSymbol} position for user ${userId}`);

      return {
        success: true,
        txSignature: txSig,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[DRIFT_SERVICE] Failed to close position: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Close all open positions
   * @param userId User identifier
   * @returns CloseAllResult with aggregate results
   */
  async closeAllPositions(userId: string): Promise<CloseAllResult> {
    try {
      // Get all open positions
      const positions = await this.getPositions(userId);

      if (positions.length === 0) {
        return {
          success: true,
          closedCount: 0,
          failedCount: 0,
          results: [],
        };
      }

      const results: CloseAllResult['results'] = [];
      let closedCount = 0;
      let failedCount = 0;

      // Close each position
      for (const position of positions) {
        try {
          const closeResult = await this.closePosition(userId, {
            marketSymbol: position.marketSymbol,
            percentage: 100,
          });

          if (closeResult.success) {
            closedCount++;
            results.push({
              marketSymbol: position.marketSymbol,
              success: true,
              txSignature: closeResult.txSignature,
            });
          } else {
            failedCount++;
            results.push({
              marketSymbol: position.marketSymbol,
              success: false,
              error: closeResult.error,
            });
          }
        } catch (error) {
          failedCount++;
          results.push({
            marketSymbol: position.marketSymbol,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info(`[DRIFT_SERVICE] Closed ${closedCount}/${positions.length} positions for user ${userId}`);

      return {
        success: failedCount === 0,
        closedCount,
        failedCount,
        results,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[DRIFT_SERVICE] Failed to close all positions: ${errorMsg}`);
      return {
        success: false,
        closedCount: 0,
        failedCount: 0,
        results: [],
        error: errorMsg,
      };
    }
  }

  // ============================================================
  // QUERIES
  // ============================================================

  async getPosition(userId: string, marketSymbol: string): Promise<DriftPosition | null> {
    const client = await this.getClientForUser(userId);
    const marketIndex = this.markets[marketSymbol];

    if (marketIndex === undefined) {
      return null;
    }

    const user = await this.getValidatedUser(client);
    const position = user.getPerpPosition(marketIndex);

    // Filter out closed positions and dust (< 0.0001 in base units)
    const MIN_BASE_AMOUNT = new BN(100000); // 0.0001 * 10^9 (BASE_PRECISION)
    if (!position || position.baseAssetAmount.abs().lt(MIN_BASE_AMOUNT)) {
      return null;
    }

    // Get oracle price
    const marketAccount = client.getPerpMarketAccount(marketIndex);
    if (!marketAccount) {
      return null;
    }
    const oraclePrice = marketAccount.amm.historicalOracleData.lastOraclePrice;

    // Precision constants from Drift SDK
    const BASE_PRECISION = 1_000_000_000;  // 10^9 for base asset amounts
    const QUOTE_PRECISION = 1_000_000;     // 10^6 for USD amounts
    const PRICE_PRECISION = 1_000_000;     // 10^6 for prices

    // Calculate position side and leverage
    const side: PositionSide = position.baseAssetAmount.gt(new BN(0)) ? 'long' : 'short';
    const leverage = user.getLeverage() / 10000;

    // Get values directly from Drift SDK where possible
    const sizeNormalized = Number(position.baseAssetAmount.abs().toString()) / BASE_PRECISION;
    const markPriceNormalized = Number(oraclePrice.toString()) / PRICE_PRECISION;
    const notionalNormalized = sizeNormalized * markPriceNormalized;

    // Entry price: cost basis / position size
    // quoteAssetAmount (6 decimals) / baseAssetAmount (9 decimals) = price
    const quoteAbs = Number(position.quoteAssetAmount.abs().toString());
    const baseAbs = Number(position.baseAssetAmount.abs().toString());
    const entryPriceNormalized = baseAbs > 0 ? (quoteAbs / QUOTE_PRECISION) / (baseAbs / BASE_PRECISION) : 0;

    // Use Drift SDK's liquidation price calculation if available, otherwise fallback
    let liquidationPriceNormalized: number;
    try {
      // Try SDK method first (returns BN in PRICE_PRECISION)
      const liqPriceBn = user.liquidationPrice(marketIndex);
      liquidationPriceNormalized = liqPriceBn ? Number(liqPriceBn.toString()) / PRICE_PRECISION : 0;
    } catch {
      // Fallback to estimate if SDK method fails
      liquidationPriceNormalized = this.calculateLiquidationPrice(entryPriceNormalized, leverage, side);
    }

    // Normalize PnL and margin (both in QUOTE_PRECISION)
    const unrealizedPnlNormalized = Number(user.getUnrealizedPNL().toString()) / QUOTE_PRECISION;
    const marginUsedNormalized = quoteAbs / QUOTE_PRECISION;

    return {
      marketIndex,
      marketSymbol,
      side,
      size: sizeNormalized.toString(),
      notionalValue: notionalNormalized.toFixed(2),
      entryPrice: entryPriceNormalized.toFixed(2),
      markPrice: markPriceNormalized.toFixed(2),
      liquidationPrice: liquidationPriceNormalized.toFixed(2),
      unrealizedPnl: unrealizedPnlNormalized.toFixed(2),
      leverage,
      marginUsed: marginUsedNormalized.toFixed(2),
    };
  }

  async getPositions(userId: string): Promise<DriftPosition[]> {
    const positions: DriftPosition[] = [];

    for (const symbol of Object.keys(this.markets)) {
      const position = await this.getPosition(userId, symbol);
      if (position) {
        positions.push(position);
      }
    }

    return positions;
  }

  async getAccountInfo(userId: string): Promise<DriftAccountInfo> {
    const client = await this.getClientForUser(userId);
    const user = await this.getValidatedUser(client);
    const userAccount = user.getUserAccount();

    // Calculate margin ratio (collateral / position value * 100)
    const totalCollateral = user.getTotalCollateral();
    const totalPositionValue = user.getTotalAssetValue();
    const marginRatio = totalPositionValue.gt(new BN(0))
      ? Number(totalCollateral.mul(new BN(10000)).div(totalPositionValue)) / 100
      : 100; // 100% if no positions

    // Extract settled PnL and funding from user account
    // These are stored in the account and updated on settlement
    const settledPnl = userAccount.settledPerpPnl || new BN(0);
    const cumulativeFunding = userAccount.cumulativePerpFunding || new BN(0);

    // Convert from QUOTE_PRECISION (6 decimals) to human-readable USD
    const QUOTE_PRECISION = 1_000_000;
    return {
      authority: userAccount.authority.toBase58(),
      subAccountId: userAccount.subAccountId,
      collateral: (Number(totalCollateral.toString()) / QUOTE_PRECISION).toString(),
      freeCollateral: (Number(user.getFreeCollateral().toString()) / QUOTE_PRECISION).toString(),
      totalPositionValue: (Number(totalPositionValue.toString()) / QUOTE_PRECISION).toString(),
      unrealizedPnl: (Number(user.getUnrealizedPNL().toString()) / QUOTE_PRECISION).toString(),
      settledPnl: (Number(settledPnl.toString()) / QUOTE_PRECISION).toString(),
      cumulativeFunding: (Number(cumulativeFunding.toString()) / QUOTE_PRECISION).toString(),
      marginRatio: marginRatio.toFixed(2),
      leverage: user.getLeverage() / 10000,
    };
  }

  async getMarkets(): Promise<DriftMarket[]> {
    // Return available markets based on network
    const marketList: DriftMarket[] = [];

    for (const [symbol, marketIndex] of Object.entries(this.markets)) {
      marketList.push({
        marketIndex,
        symbol,
        baseAsset: symbol.replace('-PERP', ''),
        price: '0', // Will be fetched from oracle in Phase 2
        volume24h: '0',
        openInterest: '0',
        fundingRate: '0',
        maxLeverage: CONFIG.MAX_LEVERAGE,
      });
    }

    return marketList;
  }

  // ============================================================
  // COLLATERAL MANAGEMENT
  // ============================================================

  async deposit(userId: string, amount: number): Promise<DepositResult> {
    // Validate amount
    if (amount < CONFIG.MIN_COLLATERAL) {
      return {
        success: false,
        error: `Deposit amount must be at least $${CONFIG.MIN_COLLATERAL} (minimum)`,
      };
    }

    try {
      const client = await this.getClientForUser(userId);

      // FIX: Check WALLET USDC balance, not Drift account balance
      const walletUsdcBalance = await this.getWalletUsdcBalance(userId);

      if (walletUsdcBalance < amount) {
        return {
          success: false,
          error: `Insufficient USDC in wallet. Required: $${amount}, Available: $${walletUsdcBalance.toFixed(2)}`,
        };
      }

      // Get user's USDC ATA for deposit
      const walletInfo = await this.solanaManager.getOrCreateWallet(userId);
      const usdcAta = getAssociatedTokenAddressSync(
        new PublicKey(MINTS.USDC),
        walletInfo.keypair.publicKey
      );

      // Deposit USDC from wallet to Drift (amount in base units - 6 decimals)
      // marketIndex 0 = USDC spot market (with retry wrapper)
      const depositAmount = new BN(amount * 1_000_000);
      const txSig = await withRetry(() => client.deposit(depositAmount, 0, usdcAta));

      await withRetry(() => this.connection!.confirmTransaction(txSig, 'confirmed'));

      logger.info(`[DRIFT_SERVICE] Deposited $${amount} USDC from wallet to Drift for user ${userId}`);

      return {
        success: true,
        txSignature: txSig,
        amount,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[DRIFT_SERVICE] Failed to deposit: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Withdraw USDC from Drift to user's wallet
   * @param userId User identifier
   * @param amount Amount in USD to withdraw
   * @returns WithdrawResult with success status and tx signature
   */
  async withdraw(userId: string, amount: number): Promise<WithdrawResult> {
    // Validate minimum amount
    if (amount < CONFIG.MIN_COLLATERAL) {
      return {
        success: false,
        error: `Withdrawal amount must be at least $${CONFIG.MIN_COLLATERAL} (minimum)`,
      };
    }

    try {
      const client = await this.getClientForUser(userId);
      const user = await this.getValidatedUser(client);

      // Check free collateral
      const freeCollateral = Number(user.getFreeCollateral().toString()) / 1_000_000;

      if (amount > freeCollateral) {
        return {
          success: false,
          error: `Insufficient free collateral. Requested: $${amount.toFixed(2)}, Available: $${freeCollateral.toFixed(2)}`,
        };
      }

      // Get user's USDC ATA for withdrawal destination
      const walletInfo = await this.solanaManager.getOrCreateWallet(userId);
      const usdcAta = getAssociatedTokenAddressSync(
        new PublicKey(MINTS.USDC),
        walletInfo.keypair.publicKey
      );

      // Withdraw USDC from Drift to wallet (amount in base units - 6 decimals)
      // marketIndex 0 = USDC spot market
      const withdrawAmount = new BN(amount * 1_000_000);
      const txSig = await withRetry(() => client.withdraw(withdrawAmount, 0, usdcAta));

      await withRetry(() => this.connection!.confirmTransaction(txSig, 'confirmed'));

      // Get updated free collateral
      await user.fetchAccounts();
      const newFreeCollateral = Number(user.getFreeCollateral().toString()) / 1_000_000;

      logger.info(`[DRIFT_SERVICE] Withdrew $${amount} USDC from Drift to wallet for user ${userId}`);

      return {
        success: true,
        txSignature: txSig,
        amount,
        newFreeCollateral,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[DRIFT_SERVICE] Failed to withdraw: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Ensure sufficient USDC in wallet (auto-swap via Jupiter if needed)
   * @param userId User identifier
   * @param marginRequired Required margin in USD
   * @throws Error if insufficient SOL, Jupiter unavailable, or swap fails
   */
  private async ensureCollateral(userId: string, marginRequired: number): Promise<void> {
    // FIX: Check WALLET USDC balance first, not Drift account
    const walletUsdcBalance = await this.getWalletUsdcBalance(userId);

    if (walletUsdcBalance >= marginRequired) {
      logger.info(`[DRIFT_SERVICE] Sufficient wallet USDC: $${walletUsdcBalance.toFixed(2)} >= $${marginRequired.toFixed(2)}`);
      return;
    }

    const shortfall = marginRequired - walletUsdcBalance;
    logger.info(`[DRIFT_SERVICE] Wallet USDC shortfall: $${shortfall.toFixed(2)} (need $${marginRequired.toFixed(2)}, have $${walletUsdcBalance.toFixed(2)})`);

    // Devnet: Jupiter only works on mainnet
    if (this.isDevnet) {
      throw new Error(
        `Insufficient USDC in wallet on devnet. Need $${marginRequired.toFixed(2)}, have $${walletUsdcBalance.toFixed(2)}. ` +
        `Please manually swap ${shortfall.toFixed(2)} USDC (Jupiter auto-swap only available on mainnet).`
      );
    }

    // Get Jupiter service from runtime
    const jupiterService = this.runtime.getService('JUPITER_SERVICE') as JupiterService | null;
    if (!jupiterService) {
      throw new Error(ERRORS.JUPITER_NOT_FOUND + `. Shortfall: $${shortfall.toFixed(2)} USDC`);
    }

    // Calculate swap amount with buffer (10% extra for price movement)
    const swapAmountUsdc = shortfall * CONFIG.SWAP_BUFFER_PERCENT;

    // Estimate SOL needed using configurable constants
    const estimatedSolLamports = Math.ceil(
      (swapAmountUsdc / CONFIG.ESTIMATED_SOL_PRICE_USD) * CONFIG.SOL_ESTIMATE_BUFFER * LAMPORTS_PER_SOL
    );

    // Check if user has enough SOL for the swap
    const walletInfo = await this.solanaManager.getOrCreateWallet(userId);
    const solBalance = await this.connection!.getBalance(walletInfo.keypair.publicKey);
    const requiredSolWithBuffer = estimatedSolLamports + (CONFIG.MIN_SOL_FOR_INIT * LAMPORTS_PER_SOL);

    if (solBalance < requiredSolWithBuffer) {
      throw new Error(
        ERRORS.insufficientSolForSwap(requiredSolWithBuffer / LAMPORTS_PER_SOL, solBalance / LAMPORTS_PER_SOL)
      );
    }

    logger.info(`[DRIFT_SERVICE] Requesting Jupiter quote for ~$${swapAmountUsdc.toFixed(2)} USDC`);

    // Get quote from Jupiter
    const quote = await jupiterService.getQuote(
      MINTS.SOL,
      MINTS.USDC,
      estimatedSolLamports.toString(),
      CONFIG.SWAP_SLIPPAGE_BPS
    );

    logger.info(`[DRIFT_SERVICE] Jupiter quote: ${quote.inAmount} lamports -> ${quote.outAmount} USDC (impact: ${quote.priceImpactPct}%)`);

    // Validate price impact before executing swap
    if (parseFloat(quote.priceImpactPct) > CONFIG.MAX_PRICE_IMPACT_PERCENT) {
      throw new Error(ERRORS.priceImpactTooHigh(quote.priceImpactPct, CONFIG.MAX_PRICE_IMPACT_PERCENT));
    }

    // Execute swap
    const swapResult = await jupiterService.executeSwap({
      userId,
      inputMint: MINTS.SOL,
      outputMint: MINTS.USDC,
      amount: quote.inAmount,
      slippageBps: CONFIG.SWAP_SLIPPAGE_BPS,
    });

    logger.info(`[DRIFT_SERVICE] Auto-swap complete: ${swapResult.transactionHash}`);
    logger.info(`[DRIFT_SERVICE] Swapped ${(parseInt(swapResult.inputAmount) / LAMPORTS_PER_SOL).toFixed(4)} SOL -> ${(parseInt(swapResult.outputAmount) / 1_000_000).toFixed(2)} USDC`);
  }

  /**
   * Get USDC balance in wallet (NOT Drift account)
   * @param userId User identifier
   * @returns USDC balance in USD (6 decimals normalized)
   */
  private async getWalletUsdcBalance(userId: string): Promise<number> {
    const walletInfo = await this.solanaManager.getOrCreateWallet(userId);
    const usdcAta = getAssociatedTokenAddressSync(
      new PublicKey(MINTS.USDC),
      walletInfo.keypair.publicKey
    );

    try {
      const balance = await this.connection!.getTokenAccountBalance(usdcAta);
      return Number(balance.value.amount) / 1_000_000; // 6 decimals -> USD
    } catch (error) {
      // Account doesn't exist yet (no USDC tokens)
      return 0;
    }
  }

  // ============================================================
  // VALIDATION
  // ============================================================

  validatePositionParams(params: OpenPositionParams): ValidationResult {
    const errors: string[] = [];

    // Symbol validation
    if (!params.marketSymbol) {
      errors.push('Market symbol is required');
    } else if (this.markets[params.marketSymbol] === undefined) {
      errors.push(`Unknown market: ${params.marketSymbol}`);
    }

    // Size validation
    if (params.size === undefined || params.size === null) {
      errors.push('Size is required');
    } else if (params.size < CONFIG.MIN_COLLATERAL) {
      errors.push(`Size $${params.size} is below minimum $${CONFIG.MIN_COLLATERAL}`);
    }

    // Leverage validation
    if (params.leverage !== undefined) {
      if (params.leverage < 1) {
        errors.push('Leverage must be at least 1x');
      } else if (params.leverage > CONFIG.MAX_LEVERAGE) {
        errors.push(`Leverage ${params.leverage}x exceeds maximum ${CONFIG.MAX_LEVERAGE}x`);
      }
    }

    // Side validation
    if (!params.side) {
      errors.push('Side (long/short) is required');
    } else if (params.side !== 'long' && params.side !== 'short') {
      errors.push('Side must be "long" or "short"');
    }

    // Limit price validation (must be positive for limit orders)
    if (params.orderType === 'limit' && (!params.limitPrice || params.limitPrice <= 0)) {
      errors.push('Limit price required for limit orders');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  validateCloseParams(params: ClosePositionParams): ValidationResult {
    const errors: string[] = [];

    // Symbol validation
    if (!params.marketSymbol) {
      errors.push('Market symbol is required');
    } else if (this.markets[params.marketSymbol] === undefined) {
      errors.push(`Unknown market: ${params.marketSymbol}`);
    }

    // Percentage validation
    if (params.percentage !== undefined) {
      if (params.percentage < 1) {
        errors.push('Percentage must be at least 1');
      } else if (params.percentage > 100) {
        errors.push('Percentage cannot exceed 100');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ============================================================
  // RISK MANAGEMENT
  // ============================================================

  requiresHighRiskConfirmation(leverage: number): boolean {
    return leverage > CONFIG.HIGH_RISK_LEVERAGE_THRESHOLD;
  }

  calculateLiquidationPrice(entryPrice: number, leverage: number, side: PositionSide): number {
    // Liquidation price formula:
    // Long: entryPrice * (1 - 1/leverage * maintenanceMarginRatio)
    // Short: entryPrice * (1 + 1/leverage * maintenanceMarginRatio)
    // Using simplified 0.9 maintenance margin ratio for now
    const maintenanceMarginRatio = 0.9;

    if (side === 'long') {
      return entryPrice * (1 - maintenanceMarginRatio / leverage);
    } else {
      return entryPrice * (1 + maintenanceMarginRatio / leverage);
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

  getNetworkInfo(): { isDevnet: boolean; marketCount: number } {
    return {
      isDevnet: this.isDevnet,
      marketCount: Object.keys(this.markets).length,
    };
  }
}
