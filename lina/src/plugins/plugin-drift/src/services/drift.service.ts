/**
 * Drift Protocol Service
 *
 * Solana perpetual futures trading via Drift Protocol with up to 20x leverage.
 * Uses existing SolanaTransactionManager for wallet management.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import {
  DriftClient,
  initialize,
  Wallet,
  BN,
  BASE_PRECISION,
  QUOTE_PRECISION,
  PositionDirection,
  MarketType,
  getMarketOrderParams,
  getLimitOrderParams,
} from '@drift-labs/sdk';
import { Connection, PublicKey } from '@solana/web3.js';

import {
  SERVICE_CONFIG,
  SERVICE_NAME,
  MARKETS,
  MARKET_SYMBOLS,
  DRIFT_PROGRAM_ID,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from '../constants';

import type {
  DriftPosition,
  DriftMarket,
  DriftAccountInfo,
  OpenPositionParams,
  ClosePositionParams,
  PositionResult,
  CloseResult,
  ValidationResult,
} from '../types';

// Import SolanaTransactionManager from the managers directory
// This will be resolved at runtime when integrated into the main project
let SolanaTransactionManager: any;

/**
 * Drift Protocol Service
 *
 * Provides perpetual futures trading on Solana with:
 * - 30+ markets (SOL, BTC, ETH, WIF, JUP, etc.)
 * - Up to 20x leverage
 * - Market and limit orders
 * - Cross-margin support
 */
export class DriftService extends Service {
  static serviceType = SERVICE_NAME;
  capabilityDescription = 'Solana perpetual futures trading via Drift Protocol with up to 20x leverage';

  private connection: Connection | null = null;
  private clients: Map<string, DriftClient> = new Map();
  private solanaManager: any;
  private isDevnet: boolean = true;
  private isInitialized: boolean = false;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime): Promise<DriftService> {
    const svc = new DriftService(runtime);
    await svc.initialize();
    return svc;
  }

  async stop(): Promise<void> {
    logger.info('[DRIFT_SERVICE] Stopping');
    for (const client of this.clients.values()) {
      try {
        await client.unsubscribe();
      } catch (error) {
        // Ignore unsubscribe errors during shutdown
      }
    }
    this.clients.clear();
  }

  private async initialize(): Promise<void> {
    try {
      // Dynamically import SolanaTransactionManager
      const managerModule = await import('../../../../managers/solana-transaction-manager');
      SolanaTransactionManager = managerModule.SolanaTransactionManager;
      this.solanaManager = SolanaTransactionManager.getInstance();

      const network = this.solanaManager.getNetwork();
      this.isDevnet = network === 'solana-devnet';

      const rpcUrl = this.isDevnet
        ? 'https://api.devnet.solana.com'
        : process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

      this.connection = new Connection(rpcUrl, 'confirmed');

      // Initialize Drift SDK
      initialize({ env: this.isDevnet ? 'devnet' : 'mainnet-beta' });

      this.isInitialized = true;
      logger.info(`[DRIFT_SERVICE] Initialized on ${this.isDevnet ? 'devnet' : 'mainnet'}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[DRIFT_SERVICE] Failed to initialize: ${errorMsg}`);
      throw error;
    }
  }

  // ============================================================
  // VALIDATION
  // ============================================================

  /**
   * Validate position parameters
   */
  validatePositionParams(params: OpenPositionParams): ValidationResult {
    const errors: string[] = [];

    // Validate symbol
    const normalizedSymbol = this.normalizeSymbol(params.symbol);
    if (this.getMarketIndex(normalizedSymbol) === undefined) {
      errors.push(ERROR_MESSAGES.INVALID_SYMBOL);
    }

    // Validate size
    if (params.size < SERVICE_CONFIG.MIN_COLLATERAL) {
      errors.push(ERROR_MESSAGES.MIN_COLLATERAL);
    }

    // Validate leverage
    if (params.leverage < SERVICE_CONFIG.MIN_LEVERAGE || params.leverage > SERVICE_CONFIG.MAX_LEVERAGE) {
      errors.push(ERROR_MESSAGES.INVALID_LEVERAGE);
    }

    // Validate limit price for limit orders
    if (params.orderType === 'limit' && (!params.limitPrice || params.limitPrice <= 0)) {
      errors.push(ERROR_MESSAGES.INVALID_LIMIT_PRICE);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate close position parameters
   */
  validateCloseParams(params: ClosePositionParams): ValidationResult {
    const errors: string[] = [];

    // Validate symbol
    const normalizedSymbol = this.normalizeSymbol(params.symbol);
    if (this.getMarketIndex(normalizedSymbol) === undefined) {
      errors.push(ERROR_MESSAGES.INVALID_SYMBOL);
    }

    // Validate percentage
    if (params.percentage <= 0 || params.percentage > 100) {
      errors.push(ERROR_MESSAGES.INVALID_PERCENTAGE);
    }

    // Validate limit price for limit orders
    if (params.orderType === 'limit' && (!params.limitPrice || params.limitPrice <= 0)) {
      errors.push(ERROR_MESSAGES.INVALID_LIMIT_PRICE);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if leverage requires high risk confirmation
   */
  requiresHighRiskConfirmation(leverage: number): boolean {
    return leverage > SERVICE_CONFIG.HIGH_RISK_LEVERAGE_THRESHOLD;
  }

  /**
   * Normalize symbol to include -PERP suffix
   */
  normalizeSymbol(symbol: string): string {
    const upper = symbol.toUpperCase().trim();
    return upper.endsWith('-PERP') ? upper : `${upper}-PERP`;
  }

  /**
   * Get market index for symbol
   */
  getMarketIndex(symbol: string): number | undefined {
    const normalized = this.normalizeSymbol(symbol);
    return MARKETS[normalized as keyof typeof MARKETS];
  }

  // ============================================================
  // CLIENT MANAGEMENT
  // ============================================================

  /**
   * Get or create Drift client for user
   */
  private async getClientForUser(userId: string): Promise<DriftClient> {
    if (this.clients.has(userId)) {
      return this.clients.get(userId)!;
    }

    if (!this.connection) {
      throw new Error('Connection not initialized');
    }

    // Get user's Solana keypair from SolanaTransactionManager
    const walletInfo = await this.solanaManager.getWalletForUser(userId);
    const keypair = walletInfo.keypair;

    const wallet = new Wallet(keypair);

    const client = new DriftClient({
      connection: this.connection,
      wallet,
      programID: new PublicKey(DRIFT_PROGRAM_ID),
      env: this.isDevnet ? 'devnet' : 'mainnet-beta',
    });

    await client.subscribe();

    // Initialize user account if needed
    const user = client.getUser();
    if (!user.exists()) {
      logger.info(`[DRIFT_SERVICE] Creating Drift account for user ${userId}`);
      await client.initializeUserAccount();
    }

    this.clients.set(userId, client);
    logger.info(`[DRIFT_SERVICE] Created Drift client for user ${userId}`);

    return client;
  }

  // ============================================================
  // POSITION OPERATIONS
  // ============================================================

  /**
   * Open a perpetual position
   */
  async openPosition(params: OpenPositionParams): Promise<PositionResult> {
    try {
      // Validate params
      const validation = this.validatePositionParams(params);
      if (!validation.valid) {
        return {
          success: false,
          message: validation.errors.join(', '),
          error: validation.errors.join(', '),
        };
      }

      const client = await this.getClientForUser(params.userId);
      const normalizedSymbol = this.normalizeSymbol(params.symbol);
      const marketIndex = this.getMarketIndex(normalizedSymbol)!;

      const direction = params.side === 'long' ? PositionDirection.LONG : PositionDirection.SHORT;

      // Get oracle price for size calculation
      const oracleData = client.getOracleDataForPerpMarket(marketIndex);
      const oraclePrice = oracleData.price;

      // Convert USD size to base asset amount
      // size (USD) * leverage / price = base amount
      const baseAssetAmount = new BN(params.size * params.leverage)
        .mul(BASE_PRECISION)
        .div(oraclePrice);

      let orderParams;
      if (params.orderType === 'limit' && params.limitPrice) {
        // Limit order
        const limitPriceBN = new BN(params.limitPrice).mul(QUOTE_PRECISION);
        orderParams = getLimitOrderParams({
          marketIndex,
          direction,
          baseAssetAmount,
          price: limitPriceBN,
          marketType: MarketType.PERP,
          reduceOnly: params.reduceOnly || false,
        });
      } else {
        // Market order
        orderParams = getMarketOrderParams({
          marketIndex,
          direction,
          baseAssetAmount,
          marketType: MarketType.PERP,
          reduceOnly: params.reduceOnly || false,
        });
      }

      const txSig = await client.placePerpOrder(orderParams);
      await this.connection!.confirmTransaction(txSig, 'confirmed');

      // Get updated position
      const position = await this.getPosition(params.userId, normalizedSymbol);

      logger.info(`[DRIFT_SERVICE] Opened ${params.side} on ${normalizedSymbol} for user ${params.userId}`);

      return {
        success: true,
        position: position || undefined,
        txSignature: txSig,
        message: SUCCESS_MESSAGES.POSITION_OPENED,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[DRIFT_SERVICE] Failed to open position: ${errorMsg}`);
      return {
        success: false,
        message: errorMsg,
        error: errorMsg,
      };
    }
  }

  /**
   * Close a perpetual position
   */
  async closePosition(params: ClosePositionParams): Promise<CloseResult> {
    try {
      // Validate params
      const validation = this.validateCloseParams(params);
      if (!validation.valid) {
        return {
          success: false,
          closedSize: '0',
          realizedPnl: '0',
          message: validation.errors.join(', '),
          error: validation.errors.join(', '),
        };
      }

      const client = await this.getClientForUser(params.userId);
      const normalizedSymbol = this.normalizeSymbol(params.symbol);
      const marketIndex = this.getMarketIndex(normalizedSymbol)!;

      const user = client.getUser();
      const position = user.getPerpPosition(marketIndex);

      if (!position || position.baseAssetAmount.isZero()) {
        return {
          success: false,
          closedSize: '0',
          realizedPnl: '0',
          message: ERROR_MESSAGES.POSITION_NOT_FOUND,
          error: ERROR_MESSAGES.POSITION_NOT_FOUND,
        };
      }

      // Calculate close amount
      const closeAmount = position.baseAssetAmount.mul(new BN(params.percentage)).div(new BN(100));

      // Determine direction (opposite of position)
      const direction = position.baseAssetAmount.gt(new BN(0))
        ? PositionDirection.SHORT  // Close long
        : PositionDirection.LONG;  // Close short

      let orderParams;
      if (params.orderType === 'limit' && params.limitPrice) {
        const limitPriceBN = new BN(params.limitPrice).mul(QUOTE_PRECISION);
        orderParams = getLimitOrderParams({
          marketIndex,
          direction,
          baseAssetAmount: closeAmount.abs(),
          price: limitPriceBN,
          marketType: MarketType.PERP,
          reduceOnly: true,
        });
      } else {
        orderParams = getMarketOrderParams({
          marketIndex,
          direction,
          baseAssetAmount: closeAmount.abs(),
          marketType: MarketType.PERP,
          reduceOnly: true,
        });
      }

      const txSig = await client.placePerpOrder(orderParams);
      await this.connection!.confirmTransaction(txSig, 'confirmed');

      logger.info(`[DRIFT_SERVICE] Closed ${params.percentage}% of ${normalizedSymbol} for user ${params.userId}`);

      return {
        success: true,
        txSignature: txSig,
        closedSize: closeAmount.abs().toString(),
        realizedPnl: '0', // Would need to calculate from before/after
        message: SUCCESS_MESSAGES.POSITION_CLOSED,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[DRIFT_SERVICE] Failed to close position: ${errorMsg}`);
      return {
        success: false,
        closedSize: '0',
        realizedPnl: '0',
        message: errorMsg,
        error: errorMsg,
      };
    }
  }

  // ============================================================
  // QUERIES
  // ============================================================

  /**
   * Get single position
   */
  async getPosition(userId: string, symbol: string): Promise<DriftPosition | null> {
    try {
      const client = await this.getClientForUser(userId);
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const marketIndex = this.getMarketIndex(normalizedSymbol);

      if (marketIndex === undefined) {
        return null;
      }

      const user = client.getUser();
      const position = user.getPerpPosition(marketIndex);

      if (!position || position.baseAssetAmount.isZero()) {
        return null;
      }

      const oracleData = client.getOracleDataForPerpMarket(marketIndex);
      const markPrice = oracleData.price;

      // Calculate entry price
      const entryPrice = position.quoteAssetAmount.abs()
        .mul(QUOTE_PRECISION)
        .div(position.baseAssetAmount.abs())
        .div(BASE_PRECISION);

      const liquidationPrice = user.liquidationPrice(marketIndex);

      return {
        marketIndex,
        symbol: normalizedSymbol,
        side: position.baseAssetAmount.gt(new BN(0)) ? 'long' : 'short',
        size: position.baseAssetAmount.abs().toString(),
        notionalValue: position.baseAssetAmount.abs().mul(markPrice).div(BASE_PRECISION).toString(),
        entryPrice: entryPrice.toString(),
        markPrice: markPrice.toString(),
        liquidationPrice: liquidationPrice?.toString() || '0',
        unrealizedPnl: user.getUnrealizedPNL(true, marketIndex).toString(),
        leverage: user.getLeverage().toNumber() / 10000,
        marginUsed: position.quoteAssetAmount.abs().toString(),
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error(`[DRIFT_SERVICE] Failed to get position: ${error}`);
      return null;
    }
  }

  /**
   * Get all positions for user
   */
  async getPositions(userId: string): Promise<DriftPosition[]> {
    const positions: DriftPosition[] = [];

    for (const symbol of MARKET_SYMBOLS) {
      const position = await this.getPosition(userId, symbol);
      if (position) {
        positions.push(position);
      }
    }

    return positions;
  }

  /**
   * Get account info
   */
  async getAccountInfo(userId: string): Promise<DriftAccountInfo> {
    const client = await this.getClientForUser(userId);
    const user = client.getUser();

    // Calculate total position value from all perp positions
    let totalPositionValue = new BN(0);
    for (const marketIndex of Object.values(MARKETS)) {
      try {
        const posValue = user.getPerpPositionValue(marketIndex, client.getOracleDataForPerpMarket(marketIndex));
        if (posValue) {
          totalPositionValue = totalPositionValue.add(posValue.abs());
        }
      } catch {
        // Skip markets without positions
      }
    }

    return {
      authority: client.wallet.publicKey.toBase58(),
      subAccountId: SERVICE_CONFIG.SUBACCOUNT_ID,
      equity: user.getTotalCollateral().toString(),
      availableBalance: user.getFreeCollateral().toString(),
      marginUsed: user.getTotalCollateral().sub(user.getFreeCollateral()).toString(),
      unrealizedPnl: user.getUnrealizedPNL(true).toString(),
      totalPositionValue: totalPositionValue.toString(),
      leverage: user.getLeverage().toNumber() / 10000,
      marginRatio: user.getMarginRatio().toString(),
    };
  }

  /**
   * Get available markets
   */
  async getMarkets(): Promise<DriftMarket[]> {
    try {
      // Use a system client for market data
      const client = await this.getClientForUser('system');
      const markets: DriftMarket[] = [];

      for (const [symbol, marketIndex] of Object.entries(MARKETS)) {
        try {
          const market = client.getPerpMarketAccount(marketIndex);
          if (!market) {
            continue; // Skip if market not found
          }
          const oracleData = client.getOracleDataForPerpMarket(marketIndex);

          markets.push({
            marketIndex: marketIndex as number,
            symbol,
            baseAsset: symbol.replace('-PERP', ''),
            price: oracleData.price.toString(),
            volume24h: market.amm.volume24H.toString(),
            openInterest: market.amm.baseAssetAmountWithAmm.abs().toString(),
            fundingRate: market.amm.lastFundingRate.toString(),
            maxLeverage: SERVICE_CONFIG.MAX_LEVERAGE,
          });
        } catch (e) {
          // Market may not exist on devnet
          logger.debug(`[DRIFT_SERVICE] Market ${symbol} not available: ${e}`);
        }
      }

      return markets;
    } catch (error) {
      logger.error(`[DRIFT_SERVICE] Failed to get markets: ${error}`);
      return [];
    }
  }

  // ============================================================
  // COLLATERAL MANAGEMENT
  // ============================================================

  /**
   * Deposit USDC collateral to Drift account
   */
  async deposit(userId: string, amount: number): Promise<{ success: boolean; txSignature?: string; error?: string }> {
    try {
      const client = await this.getClientForUser(userId);

      // Amount in USDC base units (6 decimals)
      const depositAmount = new BN(amount * 1_000_000);

      const txSig = await client.deposit(
        depositAmount,
        0, // USDC spot market index
        client.wallet.publicKey
      );

      await this.connection!.confirmTransaction(txSig, 'confirmed');

      logger.info(`[DRIFT_SERVICE] Deposited $${amount} USDC for user ${userId}`);

      return { success: true, txSignature: txSig };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[DRIFT_SERVICE] Failed to deposit: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }
}
