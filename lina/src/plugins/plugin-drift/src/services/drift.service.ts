/**
 * Drift Protocol Service
 * Core service for Solana perpetual futures trading
 *
 * Phase 2.2: SDK integration complete with per-user DriftClient management
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { DriftClient, Wallet, BN, PositionDirection, MarketType, getMarketOrderParams } from '@drift-labs/sdk';
import { SolanaTransactionManager } from '@/managers/solana-transaction-manager';
import { SERVICE_NAME, CONFIG, DEVNET_MARKETS, MAINNET_MARKETS, MINTS, ERRORS } from '../constants';
import type { JupiterService } from '../../../plugin-jupiter/src/services/jupiter.service';
import type {
  DriftPosition,
  DriftMarket,
  DriftAccountInfo,
  OpenPositionParams,
  ClosePositionParams,
  PositionResult,
  DepositResult,
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
    const svc = new DriftService(runtime);
    await svc.initialize();
    return svc;
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

    // Initialize connection
    const rpcUrl = this.isDevnet
      ? 'https://api.devnet.solana.com'
      : (this.runtime.getSetting('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com');

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
    // Return existing client if already created
    if (this.clients.has(userId)) {
      return this.clients.get(userId)!;
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

      // Create DriftClient
      const client = new DriftClient({
        connection: this.connection!,
        wallet,
        env: this.isDevnet ? 'devnet' : 'mainnet-beta',
      });

      await client.subscribe();

      // Initialize user account if it doesn't exist
      const user = client.getUser();

      try {
        user.getUserAccount();
      } catch (error) {
        // User account doesn't exist - need to initialize
        logger.info(`[DRIFT_SERVICE] Drift account not found for user ${userId}, initializing...`);

        // Check SOL balance for account initialization
        const solBalance = await this.connection!.getBalance(keypair.publicKey);
        const minSolRequired = CONFIG.MIN_SOL_FOR_INIT * LAMPORTS_PER_SOL;

        if (solBalance < minSolRequired) {
          throw new Error(
            `Need at least ${CONFIG.MIN_SOL_FOR_INIT} SOL to initialize Drift account. ` +
            `Current balance: ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`
          );
        }

        // Initialize Drift user account
        await client.initializeUserAccount();
        logger.info(`[DRIFT_SERVICE] Drift account initialized for user ${userId}`);
      }

      // Cache client for reuse
      this.clients.set(userId, client);
      logger.info(`[DRIFT_SERVICE] Created DriftClient for user ${userId}`);

      return client;
    } finally {
      release();
    }
  }

  // ============================================================
  // POSITION OPERATIONS
  // ============================================================

  async openPosition(userId: string, params: OpenPositionParams): Promise<PositionResult> {
    // Validate parameters first
    const validation = this.validatePositionParams(params);
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

      // Get market info and oracle price
      const marketAccount = await client.getMarketAccountAndSlot(marketIndex);
      const oraclePrice = marketAccount.data.amm.historicalOracleData.lastOraclePrice;

      // Calculate required collateral
      const leverage = params.leverage || CONFIG.DEFAULT_LEVERAGE;
      const marginRequired = params.size / leverage;

      // Ensure sufficient collateral (auto-provision if needed)
      await this.ensureCollateral(userId, marginRequired);

      // Deposit USDC before opening position
      await this.deposit(userId, marginRequired);

      // Convert USD size to base asset amount
      const baseAssetAmount = new BN(params.size)
        .mul(new BN(1_000_000_000)) // BASE_PRECISION (9 decimals)
        .div(new BN(oraclePrice.toString()))
        .mul(new BN(leverage));

      // Determine direction
      const direction = params.side === 'long' ? PositionDirection.LONG : PositionDirection.SHORT;

      // Place market order
      const orderParams = getMarketOrderParams({
        marketIndex,
        direction,
        baseAssetAmount,
        marketType: MarketType.PERP,
      });

      const txSig = await client.openPosition(orderParams);
      await this.connection!.confirmTransaction(txSig, 'confirmed');

      // Get updated position
      const position = await this.getPosition(userId, params.marketSymbol);

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

      const user = client.getUser();
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

      const txSig = await client.closePosition(orderParams);
      await this.connection!.confirmTransaction(txSig, 'confirmed');

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

  // ============================================================
  // QUERIES
  // ============================================================

  async getPosition(userId: string, marketSymbol: string): Promise<DriftPosition | null> {
    const client = await this.getClientForUser(userId);
    const marketIndex = this.markets[marketSymbol];

    if (marketIndex === undefined) {
      return null;
    }

    const user = client.getUser();
    const position = user.getPerpPosition(marketIndex);

    if (!position || position.baseAssetAmount.isZero()) {
      return null;
    }

    // Get oracle price
    const marketAccount = await client.getMarketAccountAndSlot(marketIndex);
    const oraclePrice = marketAccount.data.amm.historicalOracleData.lastOraclePrice;

    // Calculate entry price
    const entryPrice = position.quoteAssetAmount.abs()
      .mul(new BN(1_000_000)) // QUOTE_PRECISION (6 decimals)
      .div(position.baseAssetAmount.abs())
      .div(new BN(1_000_000_000)); // BASE_PRECISION (9 decimals)

    return {
      marketIndex,
      marketSymbol,
      side: position.baseAssetAmount.gt(new BN(0)) ? 'long' : 'short',
      size: position.baseAssetAmount.abs().toString(),
      notionalValue: position.baseAssetAmount.abs().mul(new BN(oraclePrice.toString())).div(new BN(1_000_000_000)).toString(),
      entryPrice: entryPrice.toString(),
      markPrice: oraclePrice.toString(),
      liquidationPrice: '0', // TODO: Calculate from user account
      unrealizedPnl: user.getUnrealizedPNL().toString(),
      leverage: user.getLeverage() / 10000,
      marginUsed: position.quoteAssetAmount.abs().toString(),
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
    const user = client.getUser();
    const userAccount = user.getUserAccount();

    return {
      authority: userAccount.authority.toBase58(),
      subAccountId: userAccount.subAccountId,
      collateral: user.getTotalCollateral().toString(),
      freeCollateral: user.getFreeCollateral().toString(),
      totalPositionValue: user.getTotalPerpPositionValue().toString(),
      unrealizedPnl: user.getUnrealizedPNL().toString(),
      marginRatio: '0', // TODO: Calculate from user account
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

      // Check if user has enough USDC
      const user = client.getUser();
      const usdcPosition = user.getSpotPosition(0); // USDC is index 0
      const usdcBalance = usdcPosition ? usdcPosition.scaledBalance : BigInt(0);

      if (Number(usdcBalance) < amount * 1_000_000) { // 6 decimals
        return {
          success: false,
          error: `Insufficient USDC balance. Required: $${amount}, Available: $${(Number(usdcBalance) / 1_000_000).toFixed(2)}`,
        };
      }

      // Deposit USDC to Drift (amount in base units - 6 decimals)
      const depositAmount = new BN(amount * 1_000_000);
      const txSig = await client.deposit(depositAmount);

      await this.connection!.confirmTransaction(txSig, 'confirmed');

      logger.info(`[DRIFT_SERVICE] Deposited $${amount} USDC for user ${userId}`);

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
   * Ensure sufficient USDC collateral (auto-swap via Jupiter if needed)
   * @param userId User identifier
   * @param marginRequired Required margin in USD
   * @throws Error if insufficient SOL, Jupiter unavailable, or swap fails
   */
  private async ensureCollateral(userId: string, marginRequired: number): Promise<void> {
    const accountInfo = await this.getAccountInfo(userId);
    const freeCollateral = parseFloat(accountInfo.freeCollateral) / 1_000_000; // Convert from base units

    if (freeCollateral >= marginRequired) {
      logger.info(`[DRIFT_SERVICE] Sufficient collateral: $${freeCollateral.toFixed(2)} >= $${marginRequired.toFixed(2)}`);
      return;
    }

    const shortfall = marginRequired - freeCollateral;
    logger.info(`[DRIFT_SERVICE] Collateral shortfall: $${shortfall.toFixed(2)} (need $${marginRequired.toFixed(2)}, have $${freeCollateral.toFixed(2)})`);

    // Devnet: Jupiter only works on mainnet
    if (this.isDevnet) {
      throw new Error(
        `Insufficient collateral on devnet. Need $${marginRequired.toFixed(2)}, have $${freeCollateral.toFixed(2)}. ` +
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
