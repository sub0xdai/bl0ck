/**
 * Hyperliquid Service
 *
 * Provides perpetual futures trading functionality via Hyperliquid DEX.
 * Handles wallet management, position operations, and market data.
 *
 * Architecture Note: The `userId` parameter is accepted for future multi-wallet
 * support but currently uses a single configured wallet (HYPERLIQUID_PRIVATE_KEY).
 * This allows the API to remain stable when per-user wallets are implemented.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { Hyperliquid } from 'hyperliquid';
import type {
  Position,
  OpenPositionParams,
  ClosePositionParams,
  PositionResult,
  CloseResult,
  Market,
  AccountInfo,
  ValidationResult,
} from '../types';
import { SERVICE_CONFIG, ERROR_MESSAGES, SERVICE_NAME, SUCCESS_MESSAGES } from '../constants';

/**
 * Runtime configuration (excludes sensitive data after initialization)
 */
interface ServiceConfig {
  testnet: boolean;
  maxLeverage: number;
}

/**
 * HyperliquidService - Manages perpetual futures trading on Hyperliquid
 *
 * Responsibilities:
 * - Position opening/closing (market and limit orders)
 * - Position and market data retrieval
 * - Account information
 */
export class HyperliquidService extends Service {
  static serviceType = 'HYPERLIQUID_SERVICE';
  capabilityDescription = 'Hyperliquid perpetual futures trading with leverage up to 25x';

  private serviceConfig: ServiceConfig | null = null;
  private sdk: Hyperliquid | null = null;
  private walletAddress: string | null = null;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  /**
   * Get the service type identifier
   */
  get serviceType(): string {
    return SERVICE_NAME;
  }

  /**
   * Start the service
   */
  static async start(runtime: IAgentRuntime): Promise<HyperliquidService> {
    const svc = new HyperliquidService(runtime);
    await svc.initialize(runtime);
    logger.info('[HYPERLIQUID_SERVICE] Started');
    return svc;
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    logger.info('[HYPERLIQUID_SERVICE] Stopping');
    if (this.sdk) {
      this.sdk.disconnect();
    }
    this.serviceConfig = null;
    this.sdk = null;
    this.walletAddress = null;
  }

  /**
   * Initialize the service with runtime
   */
  async initialize(runtime: IAgentRuntime): Promise<void> {
    const privateKey = runtime.getSetting('HYPERLIQUID_PRIVATE_KEY');
    const testnet = runtime.getSetting('HYPERLIQUID_TESTNET') !== 'false';

    if (!privateKey) {
      throw new Error(ERROR_MESSAGES.MISSING_PRIVATE_KEY);
    }

    // Store only non-sensitive config (private key NOT stored after init)
    this.serviceConfig = {
      testnet,
      maxLeverage: SERVICE_CONFIG.MAX_LEVERAGE,
    };

    // Initialize SDK with private key (SDK manages key internally)
    this.sdk = new Hyperliquid({
      privateKey,
      testnet,
      enableWs: false,
    });

    await this.sdk.connect();

    // Cache wallet address after successful connection
    this.walletAddress = this.extractWalletAddress();

    logger.info(`[HYPERLIQUID_SERVICE] Initialized (testnet: ${testnet})`);
  }

  // ============================================================
  // HELPER METHODS (DRY extraction)
  // ============================================================

  /**
   * Ensure SDK is initialized, return error result if not
   */
  private ensureSdkInitialized(): { ok: true; sdk: Hyperliquid } | { ok: false; error: string } {
    if (!this.sdk) {
      return { ok: false, error: ERROR_MESSAGES.API_ERROR };
    }
    return { ok: true, sdk: this.sdk };
  }

  /**
   * Extract wallet address from SDK (handles internal property access)
   */
  private extractWalletAddress(): string | null {
    if (!this.sdk || !this.sdk.isAuthenticated()) {
      return null;
    }
    // Access SDK internal wallet address (SDK doesn't expose public getter)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdk = this.sdk as unknown as Record<string, string | undefined>;
    return sdk.walletAddress || sdk._walletAddress || null;
  }

  /**
   * Get cached wallet address or extract fresh
   */
  private getWalletAddress(): string | null {
    if (this.walletAddress) {
      return this.walletAddress;
    }
    this.walletAddress = this.extractWalletAddress();
    return this.walletAddress;
  }

  /**
   * Calculate slippage-adjusted price for market orders
   * Uses SERVICE_CONFIG.DEFAULT_SLIPPAGE (converted from percentage to factor)
   */
  private calculateSlippagePrice(currentPrice: number, isBuy: boolean): number {
    // DEFAULT_SLIPPAGE is 0.5, meaning 0.5% -> factor of 1.005 or 0.995
    // For market orders we use a larger buffer (5%) to ensure execution
    const slippagePercent = 5; // 5% buffer for market order execution
    const slippageFactor = isBuy ? 1 + slippagePercent / 100 : 1 - slippagePercent / 100;
    return currentPrice * slippageFactor;
  }

  /**
   * Extract order ID from SDK response
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractOrderId(response: any): string {
    const resting = response?.response?.data?.statuses?.[0]?.resting;
    const filled = response?.response?.data?.statuses?.[0]?.filled;
    return resting?.oid?.toString() || filled?.oid?.toString() || 'pending';
  }

  // ============================================================
  // VALIDATION METHODS
  // ============================================================

  /**
   * Validate position parameters
   */
  validatePositionParams(params: OpenPositionParams): ValidationResult {
    const errors: string[] = [];

    if (!params.symbol || params.symbol.trim() === '') {
      errors.push(ERROR_MESSAGES.INVALID_SYMBOL);
    }

    if (!params.size || params.size <= 0) {
      errors.push(ERROR_MESSAGES.INVALID_SIZE);
    }

    if (
      params.leverage < SERVICE_CONFIG.MIN_LEVERAGE ||
      params.leverage > SERVICE_CONFIG.MAX_LEVERAGE
    ) {
      errors.push(ERROR_MESSAGES.INVALID_LEVERAGE);
    }

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

    if (!params.symbol || params.symbol.trim() === '') {
      errors.push(ERROR_MESSAGES.INVALID_SYMBOL);
    }

    if (params.percentage < 1 || params.percentage > 100) {
      errors.push(ERROR_MESSAGES.INVALID_PERCENTAGE);
    }

    if (params.orderType === 'limit' && (!params.limitPrice || params.limitPrice <= 0)) {
      errors.push(ERROR_MESSAGES.INVALID_LIMIT_PRICE);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if leverage requires double confirmation (>5x)
   */
  requiresHighRiskConfirmation(leverage: number): boolean {
    return leverage > SERVICE_CONFIG.HIGH_RISK_LEVERAGE_THRESHOLD;
  }

  // ============================================================
  // TRADING OPERATIONS
  // ============================================================

  /**
   * Open a new position
   * @param params - Position parameters including symbol, size, leverage, order type
   * @note userId is accepted for API stability but currently uses configured wallet
   */
  async openPosition(params: OpenPositionParams): Promise<PositionResult> {
    const validation = this.validatePositionParams(params);
    if (!validation.valid) {
      return {
        success: false,
        message: 'Validation failed',
        error: validation.errors.join(', '),
      };
    }

    const sdkCheck = this.ensureSdkInitialized();
    if (!sdkCheck.ok) {
      return {
        success: false,
        message: 'SDK not initialized',
        error: sdkCheck.error,
      };
    }
    const sdk = sdkCheck.sdk;

    try {
      logger.info(
        `[HYPERLIQUID_SERVICE] Setting leverage to ${params.leverage}x for ${params.symbol}`
      );
      await sdk.exchange.updateLeverage(params.symbol, 'cross', params.leverage);

      // Build order request (using any due to SDK type limitations)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orderRequest: any = {
        coin: params.symbol,
        is_buy: params.side === 'long',
        sz: params.size,
        reduce_only: params.reduceOnly || false,
      };

      let limitPrice: number;
      if (params.orderType === 'market') {
        const allMids = await sdk.info.getAllMids();
        const currentPrice = parseFloat(allMids[params.symbol] || '0');
        if (currentPrice === 0) {
          return {
            success: false,
            message: 'Failed to get market price',
            error: ERROR_MESSAGES.API_ERROR,
          };
        }
        limitPrice = this.calculateSlippagePrice(currentPrice, params.side === 'long');
        orderRequest.limit_px = limitPrice;
        orderRequest.order_type = { limit: { tif: 'Ioc' } };
      } else {
        limitPrice = params.limitPrice!;
        orderRequest.limit_px = limitPrice;
        orderRequest.order_type = { limit: { tif: 'Gtc' } };
      }

      logger.info(
        `[HYPERLIQUID_SERVICE] Opening ${params.side} position: ${params.size} ${params.symbol} @ ${limitPrice} (${params.orderType})`
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = (await sdk.exchange.placeOrder(orderRequest)) as any;

      if (response?.status === 'ok') {
        logger.info(`[HYPERLIQUID_SERVICE] Order placed successfully`);

        const positions = await this.getPositions(params.userId);
        const position = positions.find((p) => p.symbol === params.symbol);

        return {
          success: true,
          orderId: this.extractOrderId(response),
          position,
          message: SUCCESS_MESSAGES.POSITION_OPENED,
        };
      } else {
        return {
          success: false,
          message: ERROR_MESSAGES.ORDER_FAILED,
          error: JSON.stringify(response),
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[HYPERLIQUID_SERVICE] Failed to open position: ${errorMessage}`);
      return {
        success: false,
        message: ERROR_MESSAGES.ORDER_FAILED,
        error: errorMessage,
      };
    }
  }

  /**
   * Close an existing position
   * @param params - Close parameters including symbol, percentage, order type
   * @note userId is accepted for API stability but currently uses configured wallet
   */
  async closePosition(params: ClosePositionParams): Promise<CloseResult> {
    const validation = this.validateCloseParams(params);
    if (!validation.valid) {
      return {
        success: false,
        closedSize: 0,
        realizedPnl: 0,
        message: 'Validation failed',
        error: validation.errors.join(', '),
      };
    }

    const sdkCheck = this.ensureSdkInitialized();
    if (!sdkCheck.ok) {
      return {
        success: false,
        closedSize: 0,
        realizedPnl: 0,
        message: 'SDK not initialized',
        error: sdkCheck.error,
      };
    }
    const sdk = sdkCheck.sdk;

    try {
      const positions = await this.getPositions(params.userId);
      const position = positions.find((p) => p.symbol === params.symbol);

      if (!position) {
        return {
          success: false,
          closedSize: 0,
          realizedPnl: 0,
          message: ERROR_MESSAGES.POSITION_NOT_FOUND,
        };
      }

      const sizeToClose = (Math.abs(position.size) * params.percentage) / 100;

      // Fetch market prices once and cache for this operation
      const allMids = await sdk.info.getAllMids();
      const currentPrice = parseFloat(allMids[params.symbol] || '0');

      // Build order request (using any due to SDK type limitations)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orderRequest: any = {
        coin: params.symbol,
        is_buy: position.side === 'short',
        sz: sizeToClose,
        reduce_only: true,
      };

      if (params.orderType === 'market') {
        if (currentPrice === 0) {
          return {
            success: false,
            closedSize: 0,
            realizedPnl: 0,
            message: 'Failed to get market price',
            error: ERROR_MESSAGES.API_ERROR,
          };
        }
        orderRequest.limit_px = this.calculateSlippagePrice(
          currentPrice,
          position.side === 'short'
        );
        orderRequest.order_type = { limit: { tif: 'Ioc' } };
      } else {
        orderRequest.limit_px = params.limitPrice;
        orderRequest.order_type = { limit: { tif: 'Gtc' } };
      }

      logger.info(
        `[HYPERLIQUID_SERVICE] Closing ${params.percentage}% of ${params.symbol} position (${sizeToClose})`
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = (await sdk.exchange.placeOrder(orderRequest)) as any;

      if (response?.status === 'ok') {
        logger.info(`[HYPERLIQUID_SERVICE] Position closed successfully`);

        // Calculate realized PnL using cached price (no second API call)
        const priceDiff =
          position.side === 'long'
            ? currentPrice - position.entryPrice
            : position.entryPrice - currentPrice;
        const realizedPnl = priceDiff * sizeToClose;

        return {
          success: true,
          orderId: this.extractOrderId(response),
          closedSize: sizeToClose,
          realizedPnl,
          message: SUCCESS_MESSAGES.POSITION_CLOSED,
        };
      } else {
        return {
          success: false,
          closedSize: 0,
          realizedPnl: 0,
          message: ERROR_MESSAGES.ORDER_FAILED,
          error: JSON.stringify(response),
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[HYPERLIQUID_SERVICE] Failed to close position: ${errorMessage}`);
      return {
        success: false,
        closedSize: 0,
        realizedPnl: 0,
        message: ERROR_MESSAGES.ORDER_FAILED,
        error: errorMessage,
      };
    }
  }

  // ============================================================
  // READ OPERATIONS
  // ============================================================

  /**
   * Get all open positions
   * @param _userId - Reserved for future multi-wallet support (currently unused)
   */
  async getPositions(_userId: string): Promise<Position[]> {
    const sdkCheck = this.ensureSdkInitialized();
    if (!sdkCheck.ok) {
      throw new Error(sdkCheck.error);
    }
    const sdk = sdkCheck.sdk;

    try {
      const walletAddress = this.getWalletAddress();

      if (!walletAddress) {
        logger.warn('[HYPERLIQUID_SERVICE] No wallet address available');
        return [];
      }

      const state = await sdk.info.perpetuals.getClearinghouseState(walletAddress);
      const allMids = await sdk.info.getAllMids();

      const positions: Position[] = [];

      for (const assetPosition of state.assetPositions) {
        const pos = assetPosition.position;
        const size = parseFloat(pos.szi);

        if (size === 0) continue;

        const symbol = pos.coin;
        const markPrice = parseFloat(allMids[symbol] || '0');

        positions.push({
          symbol,
          side: size > 0 ? 'long' : 'short',
          size: Math.abs(size),
          entryPrice: parseFloat(pos.entryPx),
          markPrice,
          liquidationPrice: pos.liquidationPx ? parseFloat(pos.liquidationPx) : null,
          unrealizedPnl: parseFloat(pos.unrealizedPnl),
          realizedPnl: 0,
          leverage: pos.leverage.value,
          marginUsed: parseFloat(pos.marginUsed),
          timestamp: state.time,
        });
      }

      return positions;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[HYPERLIQUID_SERVICE] Failed to get positions: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get available markets
   */
  async getMarkets(): Promise<Market[]> {
    const sdkCheck = this.ensureSdkInitialized();
    if (!sdkCheck.ok) {
      throw new Error(sdkCheck.error);
    }
    const sdk = sdkCheck.sdk;

    try {
      const meta = await sdk.info.perpetuals.getMeta();
      const allMids = await sdk.info.getAllMids();
      const predictedFundings = await sdk.info.perpetuals.getPredictedFundings();

      const markets: Market[] = [];

      for (const asset of meta.universe) {
        const symbol = asset.name;
        const markPrice = parseFloat(allMids[symbol] || '0');

        // Extract funding rate from predicted fundings structure
        const fundingData = predictedFundings[symbol] as Array<Record<string, unknown>> | undefined;
        let fundingRate = 0;

        if (fundingData && Array.isArray(fundingData) && fundingData.length > 0) {
          const firstVenue = fundingData[0];
          const venueKeys = Object.keys(firstVenue);
          if (venueKeys.length > 0) {
            const predictedFunding = firstVenue[venueKeys[0]] as Record<string, unknown>;
            fundingRate = parseFloat(String(predictedFunding.fundingRate || 0));
          }
        }

        markets.push({
          symbol,
          name: symbol,
          baseCurrency: symbol.replace('-PERP', ''),
          quoteCurrency: 'USD',
          minSize: Math.pow(10, -asset.szDecimals),
          tickSize: 0.01,
          maxLeverage: asset.maxLeverage,
          fundingRate,
          markPrice,
          indexPrice: markPrice,
          volume24h: 0,
          openInterest: 0,
        });
      }

      return markets;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[HYPERLIQUID_SERVICE] Failed to get markets: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get account information
   * @param _userId - Reserved for future multi-wallet support (currently unused)
   */
  async getAccountInfo(_userId: string): Promise<AccountInfo> {
    const sdkCheck = this.ensureSdkInitialized();
    if (!sdkCheck.ok) {
      throw new Error(sdkCheck.error);
    }
    const sdk = sdkCheck.sdk;

    try {
      const walletAddress = this.getWalletAddress();

      if (!walletAddress) {
        throw new Error('No wallet address available');
      }

      const state = await sdk.info.perpetuals.getClearinghouseState(walletAddress);

      const marginSummary = state.marginSummary;
      const equity = parseFloat(marginSummary.accountValue);
      const marginUsed = parseFloat(marginSummary.totalMarginUsed);
      const positionValue = parseFloat(marginSummary.totalNtlPos);

      let totalUnrealizedPnl = 0;
      for (const assetPosition of state.assetPositions) {
        totalUnrealizedPnl += parseFloat(assetPosition.position.unrealizedPnl);
      }

      return {
        equity,
        availableBalance: parseFloat(state.withdrawable),
        marginUsed,
        unrealizedPnl: totalUnrealizedPnl,
        realizedPnl: 0,
        totalPositionValue: positionValue,
        leverage: positionValue === 0 ? 0 : positionValue / equity,
        marginRatio: equity === 0 ? 0 : marginUsed / equity,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[HYPERLIQUID_SERVICE] Failed to get account info: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Calculate liquidation price for a position
   */
  calculateLiquidationPrice(entryPrice: number, leverage: number, side: 'long' | 'short'): number {
    const maintenanceMargin = 0.005;
    const liquidationBuffer = 1 / leverage - maintenanceMargin;

    if (side === 'long') {
      return entryPrice * (1 - liquidationBuffer);
    } else {
      return entryPrice * (1 + liquidationBuffer);
    }
  }
}

export default HyperliquidService;
