/**
 * Hyperliquid Service
 *
 * Provides perpetual futures trading functionality via Hyperliquid DEX.
 * Handles wallet management, position operations, and market data.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import type {
  Position,
  OpenPositionParams,
  ClosePositionParams,
  PositionResult,
  CloseResult,
  Market,
  AccountInfo,
  HyperliquidConfig,
  ValidationResult,
} from '../types';
import { SERVICE_CONFIG, ERROR_MESSAGES, SERVICE_NAME } from '../constants';

/**
 * HyperliquidService - Manages perpetual futures trading on Hyperliquid
 *
 * Responsibilities:
 * - Wallet management (encrypted, per-user)
 * - Position opening/closing (market and limit orders)
 * - Position and market data retrieval
 * - Account information
 */
export class HyperliquidService extends Service {
  static serviceType = 'HYPERLIQUID_SERVICE';
  capabilityDescription = 'Hyperliquid perpetual futures trading with leverage up to 25x';

  private hyperliquidConfig: HyperliquidConfig | null = null;

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
    this.hyperliquidConfig = null;
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

    this.hyperliquidConfig = {
      privateKey,
      testnet,
      maxLeverage: SERVICE_CONFIG.MAX_LEVERAGE,
    };

    logger.info(`[HYPERLIQUID_SERVICE] Initialized (testnet: ${testnet})`);
  }

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

  /**
   * Open a new position
   */
  async openPosition(params: OpenPositionParams): Promise<PositionResult> {
    // Validation
    const validation = this.validatePositionParams(params);
    if (!validation.valid) {
      return {
        success: false,
        message: 'Validation failed',
        error: validation.errors.join(', '),
      };
    }

    // TODO: Implement actual SDK integration in GREEN phase
    throw new Error('Not implemented');
  }

  /**
   * Close an existing position
   */
  async closePosition(params: ClosePositionParams): Promise<CloseResult> {
    // Validation
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

    // TODO: Implement actual SDK integration in GREEN phase
    throw new Error('Not implemented');
  }

  /**
   * Get all open positions for a user
   */
  async getPositions(userId: string): Promise<Position[]> {
    // TODO: Implement actual SDK integration in GREEN phase
    throw new Error('Not implemented');
  }

  /**
   * Get available markets
   */
  async getMarkets(): Promise<Market[]> {
    // TODO: Implement actual SDK integration in GREEN phase
    throw new Error('Not implemented');
  }

  /**
   * Get account information
   */
  async getAccountInfo(userId: string): Promise<AccountInfo> {
    // TODO: Implement actual SDK integration in GREEN phase
    throw new Error('Not implemented');
  }

  /**
   * Calculate liquidation price for a position
   */
  calculateLiquidationPrice(
    entryPrice: number,
    leverage: number,
    side: 'long' | 'short'
  ): number {
    // Simplified liquidation calculation
    // In reality, this depends on maintenance margin and other factors
    const maintenanceMargin = 0.005; // 0.5%
    const liquidationBuffer = 1 / leverage - maintenanceMargin;

    if (side === 'long') {
      return entryPrice * (1 - liquidationBuffer);
    } else {
      return entryPrice * (1 + liquidationBuffer);
    }
  }
}

export default HyperliquidService;
