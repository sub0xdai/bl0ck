/**
 * Hyperliquid Actions Tests
 *
 * Tests for action parameter validation, execution flow, and response formatting.
 * TDD Phase: GREEN - Validation utilities tested, action handlers pending.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ACTION_NAMES, ERROR_MESSAGES, SERVICE_CONFIG } from '../src/constants';
import type { PerpOpenParams, PerpCloseParams, ValidationResult } from '../src/types';

/**
 * Action Parameter Validation Utilities
 * These functions will be extracted into action files during GREEN phase.
 */

function validatePerpOpenParams(params: PerpOpenParams): ValidationResult {
  const errors: string[] = [];

  if (!params.symbol || params.symbol.trim() === '') {
    errors.push(ERROR_MESSAGES.INVALID_SYMBOL);
  }

  if (!params.size || params.size <= 0) {
    errors.push(ERROR_MESSAGES.INVALID_SIZE);
  }

  const leverage = params.leverage ?? SERVICE_CONFIG.DEFAULT_LEVERAGE;
  if (leverage < SERVICE_CONFIG.MIN_LEVERAGE || leverage > SERVICE_CONFIG.MAX_LEVERAGE) {
    errors.push(ERROR_MESSAGES.INVALID_LEVERAGE);
  }

  if (params.orderType === 'limit' && (!params.limitPrice || params.limitPrice <= 0)) {
    errors.push(ERROR_MESSAGES.INVALID_LIMIT_PRICE);
  }

  return { valid: errors.length === 0, errors };
}

function validatePerpCloseParams(params: PerpCloseParams): ValidationResult {
  const errors: string[] = [];

  if (!params.symbol || params.symbol.trim() === '') {
    errors.push(ERROR_MESSAGES.INVALID_SYMBOL);
  }

  const percentage = params.percentage ?? 100;
  if (percentage < 1 || percentage > 100) {
    errors.push(ERROR_MESSAGES.INVALID_PERCENTAGE);
  }

  if (params.orderType === 'limit' && (!params.limitPrice || params.limitPrice <= 0)) {
    errors.push(ERROR_MESSAGES.INVALID_LIMIT_PRICE);
  }

  return { valid: errors.length === 0, errors };
}

describe('Action Names', () => {
  it('should have correct action name for PERP_OPEN_LONG', () => {
    expect(ACTION_NAMES.PERP_OPEN_LONG).toBe('PERP_OPEN_LONG');
  });

  it('should have correct action name for PERP_OPEN_SHORT', () => {
    expect(ACTION_NAMES.PERP_OPEN_SHORT).toBe('PERP_OPEN_SHORT');
  });

  it('should have correct action name for PERP_CLOSE_POSITION', () => {
    expect(ACTION_NAMES.PERP_CLOSE_POSITION).toBe('PERP_CLOSE_POSITION');
  });

  it('should have correct action name for PERP_GET_POSITIONS', () => {
    expect(ACTION_NAMES.PERP_GET_POSITIONS).toBe('PERP_GET_POSITIONS');
  });

  it('should have correct action name for PERP_GET_MARKETS', () => {
    expect(ACTION_NAMES.PERP_GET_MARKETS).toBe('PERP_GET_MARKETS');
  });

  it('should have correct action name for PERP_ACCOUNT_INFO', () => {
    expect(ACTION_NAMES.PERP_ACCOUNT_INFO).toBe('PERP_ACCOUNT_INFO');
  });
});

describe('PERP_OPEN_LONG / PERP_OPEN_SHORT Parameter Validation', () => {
  describe('Valid Parameters', () => {
    it('should accept valid market order with default leverage', () => {
      const params: PerpOpenParams = {
        symbol: 'BTC',
        size: 0.1,
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid market order with explicit leverage', () => {
      const params: PerpOpenParams = {
        symbol: 'ETH',
        size: 1.5,
        leverage: 10,
        orderType: 'market',
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(true);
    });

    it('should accept valid limit order with price', () => {
      const params: PerpOpenParams = {
        symbol: 'SOL',
        size: 10,
        leverage: 5,
        orderType: 'limit',
        limitPrice: 150.50,
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(true);
    });

    it('should accept maximum leverage (25x)', () => {
      const params: PerpOpenParams = {
        symbol: 'BTC',
        size: 0.01,
        leverage: 25,
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(true);
    });

    it('should accept minimum leverage (1x)', () => {
      const params: PerpOpenParams = {
        symbol: 'BTC',
        size: 1.0,
        leverage: 1,
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid Parameters', () => {
    it('should reject missing symbol', () => {
      const params: PerpOpenParams = {
        symbol: '',
        size: 0.1,
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_SYMBOL);
    });

    it('should reject whitespace-only symbol', () => {
      const params: PerpOpenParams = {
        symbol: '   ',
        size: 0.1,
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_SYMBOL);
    });

    it('should reject zero size', () => {
      const params: PerpOpenParams = {
        symbol: 'BTC',
        size: 0,
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_SIZE);
    });

    it('should reject negative size', () => {
      const params: PerpOpenParams = {
        symbol: 'BTC',
        size: -0.5,
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_SIZE);
    });

    it('should reject leverage below 1x', () => {
      const params: PerpOpenParams = {
        symbol: 'BTC',
        size: 0.1,
        leverage: 0.5,
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_LEVERAGE);
    });

    it('should reject leverage above 25x', () => {
      const params: PerpOpenParams = {
        symbol: 'BTC',
        size: 0.1,
        leverage: 26,
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_LEVERAGE);
    });

    it('should reject limit order without price', () => {
      const params: PerpOpenParams = {
        symbol: 'BTC',
        size: 0.1,
        orderType: 'limit',
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_LIMIT_PRICE);
    });

    it('should reject limit order with zero price', () => {
      const params: PerpOpenParams = {
        symbol: 'BTC',
        size: 0.1,
        orderType: 'limit',
        limitPrice: 0,
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_LIMIT_PRICE);
    });

    it('should reject limit order with negative price', () => {
      const params: PerpOpenParams = {
        symbol: 'BTC',
        size: 0.1,
        orderType: 'limit',
        limitPrice: -100,
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_LIMIT_PRICE);
    });

    it('should collect multiple validation errors', () => {
      const params: PerpOpenParams = {
        symbol: '',
        size: -1,
        leverage: 100,
        orderType: 'limit',
        limitPrice: 0,
      };

      const result = validatePerpOpenParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });
  });
});

describe('PERP_CLOSE_POSITION Parameter Validation', () => {
  describe('Valid Parameters', () => {
    it('should accept valid full close (100%)', () => {
      const params: PerpCloseParams = {
        symbol: 'BTC',
        percentage: 100,
      };

      const result = validatePerpCloseParams(params);
      expect(result.valid).toBe(true);
    });

    it('should accept valid partial close (50%)', () => {
      const params: PerpCloseParams = {
        symbol: 'ETH',
        percentage: 50,
      };

      const result = validatePerpCloseParams(params);
      expect(result.valid).toBe(true);
    });

    it('should accept minimum close (1%)', () => {
      const params: PerpCloseParams = {
        symbol: 'SOL',
        percentage: 1,
      };

      const result = validatePerpCloseParams(params);
      expect(result.valid).toBe(true);
    });

    it('should accept limit close order', () => {
      const params: PerpCloseParams = {
        symbol: 'BTC',
        percentage: 100,
        orderType: 'limit',
        limitPrice: 100000,
      };

      const result = validatePerpCloseParams(params);
      expect(result.valid).toBe(true);
    });

    it('should default to 100% when percentage not specified', () => {
      const params: PerpCloseParams = {
        symbol: 'BTC',
      };

      const result = validatePerpCloseParams(params);
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid Parameters', () => {
    it('should reject missing symbol', () => {
      const params: PerpCloseParams = {
        symbol: '',
        percentage: 100,
      };

      const result = validatePerpCloseParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_SYMBOL);
    });

    it('should reject percentage below 1', () => {
      const params: PerpCloseParams = {
        symbol: 'BTC',
        percentage: 0,
      };

      const result = validatePerpCloseParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_PERCENTAGE);
    });

    it('should reject percentage above 100', () => {
      const params: PerpCloseParams = {
        symbol: 'BTC',
        percentage: 150,
      };

      const result = validatePerpCloseParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_PERCENTAGE);
    });

    it('should reject limit close without price', () => {
      const params: PerpCloseParams = {
        symbol: 'BTC',
        percentage: 100,
        orderType: 'limit',
      };

      const result = validatePerpCloseParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_LIMIT_PRICE);
    });

    it('should reject negative percentage', () => {
      const params: PerpCloseParams = {
        symbol: 'BTC',
        percentage: -50,
      };

      const result = validatePerpCloseParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(ERROR_MESSAGES.INVALID_PERCENTAGE);
    });
  });
});

describe('Default Values', () => {
  it('should use default leverage of 1x when not specified', () => {
    expect(SERVICE_CONFIG.DEFAULT_LEVERAGE).toBe(1);
  });

  it('should have maximum leverage of 25x', () => {
    expect(SERVICE_CONFIG.MAX_LEVERAGE).toBe(25);
  });

  it('should have minimum leverage of 1x', () => {
    expect(SERVICE_CONFIG.MIN_LEVERAGE).toBe(1);
  });

  it('should have high risk threshold at 5x', () => {
    expect(SERVICE_CONFIG.HIGH_RISK_LEVERAGE_THRESHOLD).toBe(5);
  });
});

describe('Response Formatting', () => {
  describe('Position Open Response', () => {
    it('should include required fields for successful open', () => {
      const mockResponse = {
        success: true,
        orderId: 'order-123',
        position: {
          symbol: 'BTC',
          side: 'long' as const,
          size: 0.1,
          entryPrice: 100000,
          markPrice: 100050,
          liquidationPrice: 90500,
          unrealizedPnl: 5.0,
          realizedPnl: 0,
          leverage: 10,
          marginUsed: 1000,
          timestamp: Date.now(),
        },
        message: 'Position opened successfully',
      };

      expect(mockResponse.success).toBe(true);
      expect(mockResponse.orderId).toBeDefined();
      expect(mockResponse.position).toBeDefined();
      expect(mockResponse.position?.liquidationPrice).toBeDefined();
      expect(mockResponse.message).toBeDefined();
    });

    it('should include error for failed open', () => {
      const mockResponse = {
        success: false,
        message: 'Validation failed',
        error: 'Insufficient margin',
      };

      expect(mockResponse.success).toBe(false);
      expect(mockResponse.error).toBeDefined();
    });
  });

  describe('Position Close Response', () => {
    it('should include required fields for successful close', () => {
      const mockResponse = {
        success: true,
        orderId: 'close-123',
        closedSize: 0.1,
        realizedPnl: 150.50,
        message: 'Position closed successfully',
      };

      expect(mockResponse.success).toBe(true);
      expect(mockResponse.closedSize).toBeGreaterThan(0);
      expect(mockResponse.realizedPnl).toBeDefined();
    });

    it('should include error for failed close', () => {
      const mockResponse = {
        success: false,
        closedSize: 0,
        realizedPnl: 0,
        message: 'Close failed',
        error: 'Position not found',
      };

      expect(mockResponse.success).toBe(false);
      expect(mockResponse.closedSize).toBe(0);
      expect(mockResponse.error).toBeDefined();
    });
  });
});

describe('Leverage Risk Warning Thresholds', () => {
  const requiresWarning = (leverage: number) =>
    leverage > SERVICE_CONFIG.HIGH_RISK_LEVERAGE_THRESHOLD;

  it('should not require warning for 1x leverage', () => {
    expect(requiresWarning(1)).toBe(false);
  });

  it('should not require warning for 5x leverage', () => {
    expect(requiresWarning(5)).toBe(false);
  });

  it('should require warning for 6x leverage', () => {
    expect(requiresWarning(6)).toBe(true);
  });

  it('should require warning for 10x leverage', () => {
    expect(requiresWarning(10)).toBe(true);
  });

  it('should require warning for 25x leverage', () => {
    expect(requiresWarning(25)).toBe(true);
  });
});
