/**
 * Formatter Tests
 *
 * Tests for all formatting utilities used in action responses.
 */

import { describe, it, expect } from 'bun:test';
import {
  formatVolume,
  formatUsd,
  formatPnl,
  formatAccountInfo,
  formatPositions,
  formatMarkets,
  formatCloseResult,
  formatPositionResult,
} from '../src/utils/formatters';
import type { Position, AccountInfo, Market, CloseResult, PositionResult } from '../src/types';

describe('formatVolume', () => {
  it('should format billions correctly', () => {
    expect(formatVolume(1_500_000_000)).toBe('1.50B');
    expect(formatVolume(2_345_678_901)).toBe('2.35B');
  });

  it('should format millions correctly', () => {
    expect(formatVolume(1_500_000)).toBe('1.50M');
    expect(formatVolume(25_678_901)).toBe('25.68M');
  });

  it('should format thousands correctly', () => {
    expect(formatVolume(1_500)).toBe('1.50K');
    expect(formatVolume(999_999)).toBe('1000.00K');
  });

  it('should format small numbers correctly', () => {
    expect(formatVolume(500)).toBe('500.00');
    expect(formatVolume(0)).toBe('0.00');
    expect(formatVolume(1.5)).toBe('1.50');
  });
});

describe('formatUsd', () => {
  it('should format positive values with dollar sign', () => {
    expect(formatUsd(1000)).toBe('$1,000.00');
    expect(formatUsd(1234567.89)).toBe('$1,234,567.89');
  });

  it('should format zero', () => {
    expect(formatUsd(0)).toBe('$0.00');
  });

  it('should format negative values', () => {
    // toLocaleString puts currency before negative sign
    expect(formatUsd(-500)).toBe('$-500.00');
  });

  it('should respect decimal parameter', () => {
    expect(formatUsd(1234.5678, 4)).toBe('$1,234.5678');
    expect(formatUsd(1234.5, 0)).toBe('$1,235');
  });
});

describe('formatPnl', () => {
  it('should prefix positive PnL with +', () => {
    expect(formatPnl(500)).toBe('+$500.00');
    expect(formatPnl(1234.56)).toBe('+$1,234.56');
  });

  it('should format negative PnL without + prefix', () => {
    // formatPnl uses formatUsd which puts $ before negative
    expect(formatPnl(-500)).toBe('$-500.00');
    expect(formatPnl(-1234.56)).toBe('$-1,234.56');
  });

  it('should handle zero', () => {
    expect(formatPnl(0)).toBe('+$0.00');
  });
});

describe('formatAccountInfo', () => {
  const mockAccount: AccountInfo = {
    equity: 10000,
    availableBalance: 8000,
    marginUsed: 2000,
    unrealizedPnl: 500,
    realizedPnl: -100,
    totalPositionValue: 5000,
    leverage: 5,
    marginRatio: 0.25,
  };

  it('should include all account fields', () => {
    const result = formatAccountInfo(mockAccount);
    expect(result).toContain('Hyperliquid Account');
    expect(result).toContain('Equity');
    expect(result).toContain('$10,000.00');
    expect(result).toContain('Available Balance');
    expect(result).toContain('$8,000.00');
    expect(result).toContain('Margin Used');
    expect(result).toContain('$2,000.00');
    expect(result).toContain('Unrealized PnL');
    expect(result).toContain('+$500.00');
    expect(result).toContain('Realized PnL');
    expect(result).toContain('$-100.00');
    expect(result).toContain('Leverage');
    expect(result).toContain('5x');
    expect(result).toContain('Margin Ratio');
    expect(result).toContain('25.00%');
  });
});

describe('formatPositions', () => {
  it('should return empty message when no positions', () => {
    const result = formatPositions([]);
    expect(result).toContain('No open positions');
  });

  it('should format long position with green emoji', () => {
    const positions: Position[] = [
      {
        symbol: 'BTC',
        side: 'long',
        size: 0.5,
        entryPrice: 67000,
        markPrice: 68000,
        liquidationPrice: 54000,
        unrealizedPnl: 500,
        realizedPnl: 0,
        leverage: 5,
        marginUsed: 6700,
        timestamp: Date.now(),
      },
    ];
    const result = formatPositions(positions);
    expect(result).toContain('Open Positions (1)');
    expect(result).toContain('BTC');
    expect(result).toContain('LONG');
    expect(result).toContain('5x');
    expect(result).toContain('0.5000');
    expect(result).toContain('$67,000.00');
    expect(result).toContain('$68,000.00');
    expect(result).toContain('+$500.00');
    expect(result).toContain('$54,000.00');
  });

  it('should format short position with red emoji', () => {
    const positions: Position[] = [
      {
        symbol: 'ETH',
        side: 'short',
        size: 2.0,
        entryPrice: 2500,
        markPrice: 2400,
        liquidationPrice: 3000,
        unrealizedPnl: 200,
        realizedPnl: 0,
        leverage: 3,
        marginUsed: 1666.67,
        timestamp: Date.now(),
      },
    ];
    const result = formatPositions(positions);
    expect(result).toContain('SHORT');
    expect(result).toContain('3x');
  });

  it('should handle null liquidation price', () => {
    const positions: Position[] = [
      {
        symbol: 'SOL',
        side: 'long',
        size: 10,
        entryPrice: 100,
        markPrice: 105,
        liquidationPrice: null,
        unrealizedPnl: 50,
        realizedPnl: 0,
        leverage: 1,
        marginUsed: 1000,
        timestamp: Date.now(),
      },
    ];
    const result = formatPositions(positions);
    expect(result).not.toContain('Liquidation');
  });
});

describe('formatMarkets', () => {
  const mockMarkets: Market[] = [
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      baseCurrency: 'BTC',
      quoteCurrency: 'USD',
      minSize: 0.001,
      tickSize: 0.1,
      maxLeverage: 50,
      fundingRate: 0.0001,
      markPrice: 67000,
      indexPrice: 67050,
      volume24h: 1_000_000_000,
      openInterest: 500_000_000,
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      baseCurrency: 'ETH',
      quoteCurrency: 'USD',
      minSize: 0.01,
      tickSize: 0.01,
      maxLeverage: 50,
      fundingRate: -0.0002,
      markPrice: 2500,
      indexPrice: 2505,
      volume24h: 500_000_000,
      openInterest: 250_000_000,
    },
  ];

  it('should return empty message when no markets', () => {
    const result = formatMarkets([], 10);
    expect(result).toBe('**No markets available**');
  });

  it('should format markets sorted by volume', () => {
    const result = formatMarkets(mockMarkets, 10);
    expect(result).toContain('Perpetual Markets (2)');
    expect(result).toContain('BTC');
    expect(result).toContain('ETH');
    // BTC should appear first (higher volume)
    expect(result.indexOf('BTC')).toBeLessThan(result.indexOf('ETH'));
  });

  it('should include funding rate with sign', () => {
    const result = formatMarkets(mockMarkets, 10);
    expect(result).toContain('+0.0100%'); // positive funding
    expect(result).toContain('-0.0200%'); // negative funding
  });

  it('should respect displayCount limit', () => {
    const result = formatMarkets(mockMarkets, 1);
    expect(result).toContain('BTC');
    expect(result).toContain('...and 1 more markets');
  });
});

describe('formatCloseResult', () => {
  it('should format close result with all fields', () => {
    const result: CloseResult = {
      success: true,
      orderId: 'order-123',
      closedSize: 0.5,
      realizedPnl: 250,
      message: 'Position closed',
    };
    const formatted = formatCloseResult(result, 'BTC', 100);
    expect(formatted).toContain('Position Closed');
    expect(formatted).toContain('BTC');
    expect(formatted).toContain('100%');
    expect(formatted).toContain('0.5000');
    expect(formatted).toContain('+$250.00');
    expect(formatted).toContain('order-123');
  });

  it('should handle negative realized PnL', () => {
    const result: CloseResult = {
      success: true,
      closedSize: 1.0,
      realizedPnl: -500,
      message: 'Position closed',
    };
    const formatted = formatCloseResult(result, 'ETH', 50);
    expect(formatted).toContain('$-500.00');
  });

  it('should handle missing orderId', () => {
    const result: CloseResult = {
      success: true,
      closedSize: 1.0,
      realizedPnl: 100,
      message: 'Position closed',
    };
    const formatted = formatCloseResult(result, 'SOL', 100);
    expect(formatted).not.toContain('Order ID');
  });
});

describe('formatPositionResult', () => {
  const mockPosition: Position = {
    symbol: 'BTC',
    side: 'long',
    size: 0.1,
    entryPrice: 67000,
    markPrice: 67000,
    liquidationPrice: 60000,
    unrealizedPnl: 0,
    realizedPnl: 0,
    leverage: 5,
    marginUsed: 1340,
    timestamp: Date.now(),
  };

  it('should format long position result', () => {
    const result: PositionResult = {
      success: true,
      orderId: 'order-456',
      position: mockPosition,
      message: 'Position opened',
    };
    const formatted = formatPositionResult(result, 'BTC', 'long', 5, false);
    expect(formatted).toContain('LONG Position Opened');
    expect(formatted).toContain('BTC');
    expect(formatted).toContain('0.1000');
    expect(formatted).toContain('$67,000.00');
    expect(formatted).toContain('5x');
    expect(formatted).toContain('Liquidation Price');
    expect(formatted).toContain('order-456');
  });

  it('should show high leverage warning for >5x', () => {
    const result: PositionResult = {
      success: true,
      position: { ...mockPosition, leverage: 10 },
      message: 'Position opened',
    };
    const formatted = formatPositionResult(result, 'BTC', 'long', 10, true);
    expect(formatted).toContain('High Leverage Position (10x)');
  });

  it('should calculate liquidation distance for long', () => {
    const result: PositionResult = {
      success: true,
      position: mockPosition,
      message: 'Position opened',
    };
    const formatted = formatPositionResult(result, 'BTC', 'long', 5, false);
    // Distance = (67000 - 60000) / 67000 * 100 = 10.45%
    expect(formatted).toContain('10.4% away');
  });

  it('should calculate liquidation distance for short', () => {
    const shortPosition: Position = {
      ...mockPosition,
      side: 'short',
      liquidationPrice: 74000,
    };
    const result: PositionResult = {
      success: true,
      position: shortPosition,
      message: 'Position opened',
    };
    const formatted = formatPositionResult(result, 'BTC', 'short', 5, false);
    // Distance = (74000 - 67000) / 67000 * 100 = 10.45%
    expect(formatted).toContain('10.4% away');
  });

  it('should handle missing position data', () => {
    const result: PositionResult = {
      success: true,
      message: 'Order submitted',
    };
    const formatted = formatPositionResult(result, 'BTC', 'long', 5, false);
    expect(formatted).toContain('LONG Position Opened');
    expect(formatted).toContain('BTC');
    expect(formatted).not.toContain('Size:');
  });
});
