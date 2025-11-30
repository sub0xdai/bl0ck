/**
 * Hyperliquid Service
 *
 * Provides perpetual futures trading functionality via Hyperliquid DEX.
 * Uses CDP (Coinbase Developer Platform) for per-user wallet management.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { HyperliquidCdpClient } from './hyperliquid-cdp-client';
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
 * - Per-user CDP wallet management
 */
export class HyperliquidService extends Service {
  static serviceType = 'HYPERLIQUID_SERVICE';
  capabilityDescription = 'Hyperliquid perpetual futures trading with leverage up to 25x';

  private serviceConfig: ServiceConfig | null = null;
  private clients: Map<string, HyperliquidCdpClient> = new Map();
  private testnet: boolean = true;

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
    this.clients.clear();
    this.serviceConfig = null;
  }

  /**
   * Initialize the service with runtime
   */
  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.testnet = runtime.getSetting('HYPERLIQUID_TESTNET') !== 'false';
    this.serviceConfig = { testnet: this.testnet, maxLeverage: SERVICE_CONFIG.MAX_LEVERAGE };
    logger.info(`[HYPERLIQUID_SERVICE] Initialized (testnet: ${this.testnet}, mode: CDP)`);
  }

  // ============================================================
  // CLIENT MANAGEMENT
  // ============================================================

  /**
   * Get or create CDP client for user
   */
  private async getClientForUser(userId: string): Promise<HyperliquidCdpClient> {
    if (!this.clients.has(userId)) {
      const client = new HyperliquidCdpClient(userId, this.testnet);
      await client.connect();
      this.clients.set(userId, client);
      logger.info(`[HYPERLIQUID_SERVICE] Created CDP client for user ${userId}`);
    }
    return this.clients.get(userId)!;
  }

  // ============================================================
  // HELPER METHODS (DRY extraction)
  // ============================================================

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
   * Extract order ID from CDP client response
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

    try {
      const client = await this.getClientForUser(params.userId);

      logger.info(
        `[HYPERLIQUID_SERVICE] Setting leverage to ${params.leverage}x for ${params.symbol}`
      );
      await client.updateLeverage(params.symbol, 'cross', params.leverage);

      // Determine order price
      let limitPrice: number;
      if (params.orderType === 'market') {
        const allMids = await client.getMidPrices();
        const currentPrice = parseFloat(allMids[params.symbol] || '0');
        if (currentPrice === 0) {
          return {
            success: false,
            message: 'Failed to get market price',
            error: ERROR_MESSAGES.API_ERROR,
          };
        }
        limitPrice = this.calculateSlippagePrice(currentPrice, params.side === 'long');
      } else {
        limitPrice = params.limitPrice!;
      }

      logger.info(
        `[HYPERLIQUID_SERVICE] Opening ${params.side} position: ${params.size} ${params.symbol} @ ${limitPrice} (${params.orderType})`
      );

      const response = await client.placeOrder({
        coin: params.symbol,
        is_buy: params.side === 'long',
        sz: params.size.toString(),
        limit_px: limitPrice.toString(),
        order_type: params.orderType === 'market' ? { limit: { tif: 'Ioc' } } : { limit: { tif: 'Gtc' } },
        reduce_only: params.reduceOnly || false,
      });

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

    try {
      const client = await this.getClientForUser(params.userId);
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
      const allMids = await client.getMidPrices();
      const currentPrice = parseFloat(allMids[params.symbol] || '0');

      // Determine order price
      let limitPrice: number;
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
        limitPrice = this.calculateSlippagePrice(currentPrice, position.side === 'short');
      } else {
        limitPrice = params.limitPrice!;
      }

      logger.info(
        `[HYPERLIQUID_SERVICE] Closing ${params.percentage}% of ${params.symbol} position (${sizeToClose})`
      );

      const response = await client.placeOrder({
        coin: params.symbol,
        is_buy: position.side === 'short',
        sz: sizeToClose.toString(),
        limit_px: limitPrice.toString(),
        order_type: params.orderType === 'market' ? { limit: { tif: 'Ioc' } } : { limit: { tif: 'Gtc' } },
        reduce_only: true,
      });

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
   */
  async getPositions(userId: string): Promise<Position[]> {
    try {
      const client = await this.getClientForUser(userId);
      const walletAddress = client.getAddress();

      const state = await client.getAccountState();
      const allMids = await client.getMidPrices();

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
          liquidationPrice: null, // CDP client doesn't expose liquidationPx
          unrealizedPnl: parseFloat(pos.unrealizedPnl),
          realizedPnl: 0,
          leverage: pos.leverage.value,
          marginUsed: 0, // Not exposed by CDP client AccountState
          timestamp: Date.now(),
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
    try {
      // Use any existing client or create temporary one for global data
      let client: HyperliquidCdpClient;
      if (this.clients.size > 0) {
        client = Array.from(this.clients.values())[0];
      } else {
        // Create temporary client for global market data (no user needed)
        client = new HyperliquidCdpClient('system', this.testnet);
        await client.connect();
      }

      const meta = await client.getMarkets();
      const allMids = await client.getMidPrices();
      const predictedFundings = await client.getPredictedFundings();

      const markets: Market[] = [];

      for (const asset of meta) {
        const symbol = asset.name;
        const markPrice = parseFloat(allMids[symbol] || '0');

        // Extract funding rate from predicted fundings structure
        const fundingData = predictedFundings[symbol];
        const fundingRate = fundingData ? parseFloat(fundingData.fundingRate || '0') : 0;

        markets.push({
          symbol,
          name: symbol,
          baseCurrency: symbol.replace('-PERP', ''),
          quoteCurrency: 'USD',
          minSize: Math.pow(10, -asset.szDecimals),
          tickSize: 0.01,
          maxLeverage: SERVICE_CONFIG.MAX_LEVERAGE,
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
   */
  async getAccountInfo(userId: string): Promise<AccountInfo> {
    try {
      const client = await this.getClientForUser(userId);
      const state = await client.getAccountState();

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
        availableBalance: equity - marginUsed, // CDP client doesn't expose withdrawable
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
