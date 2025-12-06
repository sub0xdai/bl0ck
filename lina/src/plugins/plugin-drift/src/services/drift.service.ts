/**
 * Drift Protocol Service
 * Core service for Solana perpetual futures trading
 * 
 * This is a skeleton implementation. Full implementation will be added in Phase 2.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { SERVICE_NAME, CONFIG, DEVNET_MARKETS, MAINNET_MARKETS } from '../constants';
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

export class DriftService extends Service {
  static serviceType = SERVICE_NAME;
  capabilityDescription = 'Solana perpetual futures trading via Drift Protocol with up to 20x leverage';

  // Instance getter for serviceType (tests access via instance)
  get serviceType(): string {
    return SERVICE_NAME;
  }

  private isDevnet: boolean = true;
  private markets: Record<string, number>;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    this.markets = DEVNET_MARKETS; // Default to devnet
  }

  static async start(runtime: IAgentRuntime): Promise<DriftService> {
    const svc = new DriftService(runtime);
    await svc.initialize();
    return svc;
  }

  async stop(): Promise<void> {
    logger.info('[DRIFT_SERVICE] Stopping service');
    // Cleanup will be implemented in Phase 2
  }

  private async initialize(): Promise<void> {
    // Detect network from runtime settings
    const network = this.runtime.getSetting('SOLANA_NETWORK');
    this.isDevnet = network !== 'solana'; // 'solana' = mainnet, anything else = devnet
    this.markets = this.isDevnet ? DEVNET_MARKETS : MAINNET_MARKETS;

    logger.info(
      '[DRIFT_SERVICE] Initialized on ' +
      (this.isDevnet ? 'devnet' : 'mainnet') +
      ' with ' + Object.keys(this.markets).length + ' markets'
    );
  }

  // ============================================================
  // POSITION OPERATIONS (Skeleton - to be implemented in Phase 2)
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

    // SDK integration will be implemented in Phase 2
    logger.info('[DRIFT_SERVICE] openPosition called - SDK integration not yet implemented');
    return {
      success: false,
      error: 'DriftService.openPosition SDK integration not yet implemented. Coming in Phase 2.',
    };
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

    // SDK integration will be implemented in Phase 2
    logger.info('[DRIFT_SERVICE] closePosition called - SDK integration not yet implemented');
    return {
      success: false,
      error: 'DriftService.closePosition SDK integration not yet implemented. Coming in Phase 2.',
    };
  }

  // ============================================================
  // QUERIES (Skeleton - to be implemented in Phase 2)
  // ============================================================

  async getPosition(userId: string, marketSymbol: string): Promise<DriftPosition | null> {
    logger.info('[DRIFT_SERVICE] getPosition called - not yet implemented');
    return null;
  }

  async getPositions(userId: string): Promise<DriftPosition[]> {
    logger.info('[DRIFT_SERVICE] getPositions called - not yet implemented');
    return [];
  }

  async getAccountInfo(userId: string): Promise<DriftAccountInfo> {
    logger.info('[DRIFT_SERVICE] getAccountInfo called - not yet implemented');
    return {
      authority: '',
      subAccountId: 0,
      collateral: '0',
      freeCollateral: '0',
      totalPositionValue: '0',
      unrealizedPnl: '0',
      marginRatio: '0',
      leverage: 0,
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
  // COLLATERAL MANAGEMENT (Skeleton - to be implemented in Phase 2)
  // ============================================================

  async deposit(userId: string, amount: number): Promise<DepositResult> {
    logger.info('[DRIFT_SERVICE] deposit called - not yet implemented');
    return {
      success: false,
      error: 'DriftService.deposit not yet implemented. Coming in Phase 2.',
    };
  }

  // ============================================================
  // VALIDATION (Stubs - to be implemented in Phase 2)
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

    // Limit price validation
    if (params.orderType === 'limit' && !params.limitPrice) {
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
  // RISK MANAGEMENT (Stubs - to be implemented in Phase 2)
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
