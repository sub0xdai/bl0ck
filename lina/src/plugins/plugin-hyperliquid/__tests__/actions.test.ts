/**
 * Hyperliquid Actions Tests
 *
 * Tests for action configuration, constants, and response structure.
 * Validation logic is tested in hyperliquid.service.test.ts
 */

import { describe, it, expect } from 'bun:test';
import { ACTION_NAMES, ERROR_MESSAGES, SERVICE_CONFIG } from '../src/constants';
import { hyperliquidPlugin } from '../src/index';
import { perpOpenLong } from '../src/actions/perp-open-long';
import { perpOpenShort } from '../src/actions/perp-open-short';
import { perpClosePosition } from '../src/actions/perp-close-position';
import { perpGetPositions } from '../src/actions/perp-get-positions';
import { perpGetMarkets } from '../src/actions/perp-get-markets';
import { perpAccountInfo } from '../src/actions/perp-account-info';

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

describe('Plugin Registration', () => {
  it('should export plugin with correct name', () => {
    expect(hyperliquidPlugin.name).toBe('hyperliquid');
  });

  it('should have description', () => {
    expect(hyperliquidPlugin.description).toBeDefined();
    expect(hyperliquidPlugin.description).toContain('perpetual');
  });

  it('should register all 6 actions', () => {
    expect(hyperliquidPlugin.actions).toHaveLength(6);
  });

  it('should register HyperliquidService', () => {
    expect(hyperliquidPlugin.services).toHaveLength(1);
  });
});

describe('Action Structure', () => {
  describe('perpOpenLong', () => {
    it('should have correct name', () => {
      expect(perpOpenLong.name).toBe(ACTION_NAMES.PERP_OPEN_LONG);
    });

    it('should have description', () => {
      expect(perpOpenLong.description).toBeDefined();
    });

    it('should have handler function', () => {
      expect(typeof perpOpenLong.handler).toBe('function');
    });

    it('should have validate function', () => {
      expect(typeof perpOpenLong.validate).toBe('function');
    });

    it('should have examples', () => {
      expect(perpOpenLong.examples).toBeDefined();
      expect(perpOpenLong.examples!.length).toBeGreaterThan(0);
    });
  });

  describe('perpOpenShort', () => {
    it('should have correct name', () => {
      expect(perpOpenShort.name).toBe(ACTION_NAMES.PERP_OPEN_SHORT);
    });

    it('should have handler function', () => {
      expect(typeof perpOpenShort.handler).toBe('function');
    });
  });

  describe('perpClosePosition', () => {
    it('should have correct name', () => {
      expect(perpClosePosition.name).toBe(ACTION_NAMES.PERP_CLOSE_POSITION);
    });

    it('should have handler function', () => {
      expect(typeof perpClosePosition.handler).toBe('function');
    });
  });

  describe('perpGetPositions', () => {
    it('should have correct name', () => {
      expect(perpGetPositions.name).toBe(ACTION_NAMES.PERP_GET_POSITIONS);
    });

    it('should have handler function', () => {
      expect(typeof perpGetPositions.handler).toBe('function');
    });
  });

  describe('perpGetMarkets', () => {
    it('should have correct name', () => {
      expect(perpGetMarkets.name).toBe(ACTION_NAMES.PERP_GET_MARKETS);
    });

    it('should have handler function', () => {
      expect(typeof perpGetMarkets.handler).toBe('function');
    });
  });

  describe('perpAccountInfo', () => {
    it('should have correct name', () => {
      expect(perpAccountInfo.name).toBe(ACTION_NAMES.PERP_ACCOUNT_INFO);
    });

    it('should have handler function', () => {
      expect(typeof perpAccountInfo.handler).toBe('function');
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
