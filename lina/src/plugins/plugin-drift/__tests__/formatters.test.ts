/**
 * Formatter Functions Tests
 *
 * Tests display utilities for USD, PnL, positions, markets, and account info
 */

import { describe, it, expect } from 'bun:test';
import {
  formatUsd,
  formatPnl,
  formatVolume,
  formatAccountInfo,
  formatPositions,
  formatMarkets,
  formatPositionResult,
  formatCloseResult,
  formatDepositResult,
  formatWithdrawResult,
} from '../src/utils/formatters';
import type { DriftPosition, DriftAccountInfo, DriftMarket, PositionResult } from '../src/types';

describe('Formatters - formatUsd', () => {
  it('should format positive number with $ prefix', () => {
    expect(formatUsd(1234.56)).toBe('$1,234.56');
  });

  it('should format string numbers', () => {
    expect(formatUsd('9876.54')).toBe('$9,876.54');
  });

  it('should format with custom decimals', () => {
    expect(formatUsd(100, 4)).toBe('$100.0000');
  });

  it('should format large numbers with commas', () => {
    expect(formatUsd(1000000)).toBe('$1,000,000.00');
  });

  it('should format zero', () => {
    expect(formatUsd(0)).toBe('$0.00');
  });

  it('should handle negative numbers', () => {
    expect(formatUsd(-500.25)).toBe('-$500.25');
  });

  it('should default to 2 decimals when not specified', () => {
    const result = formatUsd(123.456789);
    expect(result).toBe('$123.46'); // Rounded
  });
});

describe('Formatters - formatPnl', () => {
  it('should prefix positive PnL with +', () => {
    const result = formatPnl('1500.50');
    expect(result).toContain('+');
    expect(result).toContain('$1,500.50');
  });

  it('should prefix negative PnL with -', () => {
    const result = formatPnl('-750.25');
    expect(result).toContain('-');
    expect(result).toContain('$750.25');
  });

  it('should handle zero PnL', () => {
    const result = formatPnl('0');
    expect(result).toContain('+');
    expect(result).toContain('$0.00');
  });

  it('should format small positive PnL', () => {
    const result = formatPnl('0.01');
    expect(result).toContain('+');
    expect(result).toContain('$0.01');
  });

  it('should format large negative PnL', () => {
    const result = formatPnl('-125000.99');
    expect(result).toContain('-');
    expect(result).toContain('$125,000.99');
  });
});

describe('Formatters - formatVolume', () => {
  it('should format billions with B suffix', () => {
    expect(formatVolume('5000000000')).toBe('5.00B');
  });

  it('should format millions with M suffix', () => {
    expect(formatVolume('3500000')).toBe('3.50M');
  });

  it('should format thousands with K suffix', () => {
    expect(formatVolume('12500')).toBe('12.50K');
  });

  it('should format small numbers without suffix', () => {
    expect(formatVolume('500')).toBe('500.00');
  });

  it('should handle edge case at 1B threshold', () => {
    expect(formatVolume('1000000000')).toBe('1.00B');
  });

  it('should handle edge case at 1M threshold', () => {
    expect(formatVolume('1000000')).toBe('1.00M');
  });

  it('should handle edge case at 1K threshold', () => {
    expect(formatVolume('1000')).toBe('1.00K');
  });

  it('should handle zero', () => {
    expect(formatVolume('0')).toBe('0.00');
  });
});

describe('Formatters - formatAccountInfo', () => {
  it('should format complete account info', () => {
    const accountInfo: DriftAccountInfo = {
      authority: 'mockAuthority123',
      subAccountId: 0,
      collateral: '100000000', // $100 (6 decimals)
      freeCollateral: '50000000', // $50
      totalPositionValue: '200000000', // $200
      unrealizedPnl: '5000000', // $5
      settledPnl: '0',
      cumulativeFunding: '0',
      marginRatio: '25.5',
      leverage: 3.5,
    };

    const result = formatAccountInfo(accountInfo);

    expect(result).toContain('mockAuthority123');
    expect(result).toContain('Subaccount ID');
    expect(result).toContain('0');
    expect(result).toContain('$100.00'); // Collateral
    expect(result).toContain('$50.00'); // Free collateral
    expect(result).toContain('$200.00'); // Position value
    expect(result).toContain('+$5.00'); // Unrealized PnL
    expect(result).toContain('3.50x'); // Leverage
    expect(result).toContain('25.5%'); // Margin ratio
  });

  it('should format negative unrealized PnL', () => {
    const accountInfo: DriftAccountInfo = {
      authority: 'mockAuth',
      subAccountId: 0,
      collateral: '100000000',
      freeCollateral: '50000000',
      totalPositionValue: '0',
      unrealizedPnl: '-3000000', // -$3
      settledPnl: '0',
      cumulativeFunding: '0',
      marginRatio: '0',
      leverage: 1,
    };

    const result = formatAccountInfo(accountInfo);

    expect(result).toContain('-$3.00');
  });

  it('should handle zero values', () => {
    const accountInfo: DriftAccountInfo = {
      authority: 'mockAuth',
      subAccountId: 0,
      collateral: '0',
      freeCollateral: '0',
      totalPositionValue: '0',
      unrealizedPnl: '0',
      settledPnl: '0',
      cumulativeFunding: '0',
      marginRatio: '0',
      leverage: 0,
    };

    const result = formatAccountInfo(accountInfo);

    expect(result).toContain('$0.00');
    expect(result).toContain('0.00x');
  });

  it('should display settled PnL and cumulative funding', () => {
    const accountInfo: DriftAccountInfo = {
      authority: 'mockAuth123',
      subAccountId: 0,
      collateral: '100000000',        // $100
      freeCollateral: '50000000',     // $50
      totalPositionValue: '150000000', // $150
      unrealizedPnl: '5000000',       // +$5
      settledPnl: '25000000',         // +$25 realized
      cumulativeFunding: '-2000000',  // -$2 funding paid
      marginRatio: '66.67',
      leverage: 1.5,
    };

    const result = formatAccountInfo(accountInfo);

    expect(result).toContain('Settled PnL');
    expect(result).toContain('+$25.00');
    expect(result).toContain('Cumulative Funding');
    expect(result).toContain('-$2.00');
  });
});

describe('Formatters - formatPositions', () => {
  it('should format empty positions list', () => {
    const result = formatPositions([]);

    expect(result).toContain('No open positions');
    expect(result).toContain('Drift');
  });

  it('should format single long position', () => {
    // Position data is now normalized (service divides by precision constants)
    const positions: DriftPosition[] = [
      {
        marketSymbol: 'SOL-PERP',
        marketIndex: 0,
        side: 'long',
        size: '100', // 100 SOL (normalized from 100_000_000_000 raw)
        notionalValue: '15000.00',
        entryPrice: '150.00',
        markPrice: '155.00',
        unrealizedPnl: '500.00',
        liquidationPrice: '135.00',
        leverage: 5,
        marginUsed: '3000.00',
      },
    ];

    const result = formatPositions(positions);

    expect(result).toContain('SOL-PERP');
    expect(result).toContain('LONG');
    expect(result).toContain('5.00x');
    expect(result).toContain('$15,000.00');
    expect(result).toContain('$150.00'); // Entry
    expect(result).toContain('$155.00'); // Mark
    expect(result).toContain('+$500.00'); // PnL
    expect(result).toContain('$135.00'); // Liquidation
  });

  it('should format single short position', () => {
    // Position data is now normalized (service divides by precision constants)
    const positions: DriftPosition[] = [
      {
        marketSymbol: 'BTC-PERP',
        marketIndex: 1,
        side: 'short',
        size: '1', // 1 BTC (normalized)
        notionalValue: '67000.00',
        entryPrice: '67000.00',
        markPrice: '66000.00',
        unrealizedPnl: '1000.00',
        liquidationPrice: '73700.00',
        leverage: 10,
        marginUsed: '6700.00',
      },
    ];

    const result = formatPositions(positions);

    expect(result).toContain('BTC-PERP');
    expect(result).toContain('SHORT');
    expect(result).toContain('10.00x');
    expect(result).toContain('🔴'); // Short emoji
  });

  it('should format multiple positions', () => {
    // Position data is now normalized (service divides by precision constants)
    const positions: DriftPosition[] = [
      {
        marketSymbol: 'SOL-PERP',
        marketIndex: 0,
        side: 'long',
        size: '100', // 100 SOL (normalized)
        notionalValue: '15000.00',
        entryPrice: '150.00',
        markPrice: '155.00',
        unrealizedPnl: '500.00',
        liquidationPrice: '135.00',
        leverage: 5,
        marginUsed: '3000.00',
      },
      {
        marketSymbol: 'ETH-PERP',
        marketIndex: 2,
        side: 'short',
        size: '1', // 1 ETH (normalized)
        notionalValue: '3500.00',
        entryPrice: '3500.00',
        markPrice: '3450.00',
        unrealizedPnl: '50.00',
        liquidationPrice: '3850.00',
        leverage: 3,
        marginUsed: '1166.67',
      },
    ];

    const result = formatPositions(positions);

    expect(result).toContain('Open Positions (2)');
    expect(result).toContain('SOL-PERP');
    expect(result).toContain('ETH-PERP');
  });

  it('should show long position emoji', () => {
    // Position data is now normalized (service divides by precision constants)
    const positions: DriftPosition[] = [
      {
        marketSymbol: 'SOL-PERP',
        marketIndex: 0,
        side: 'long',
        size: '100', // 100 SOL (normalized)
        notionalValue: '15000.00',
        entryPrice: '150.00',
        markPrice: '155.00',
        unrealizedPnl: '500.00',
        liquidationPrice: '135.00',
        leverage: 5,
        marginUsed: '3000.00',
      },
    ];

    const result = formatPositions(positions);

    expect(result).toContain('🟢'); // Long emoji
  });
});

describe('Formatters - formatMarkets', () => {
  it('should format empty markets list', () => {
    const result = formatMarkets([]);

    expect(result).toContain('No markets available');
  });

  it('should format single market', () => {
    const markets: DriftMarket[] = [
      {
        symbol: 'SOL-PERP',
        marketIndex: 0,
        baseAsset: 'SOL',
        maxLeverage: 20,
      },
    ];

    const result = formatMarkets(markets);

    expect(result).toContain('SOL-PERP');
    expect(result).toContain('Index: 0');
    expect(result).toContain('Base Asset: SOL');
    expect(result).toContain('Max Leverage: 20x');
  });

  it('should format multiple markets', () => {
    const markets: DriftMarket[] = [
      {
        symbol: 'SOL-PERP',
        marketIndex: 0,
        baseAsset: 'SOL',
        maxLeverage: 20,
      },
      {
        symbol: 'BTC-PERP',
        marketIndex: 1,
        baseAsset: 'BTC',
        maxLeverage: 20,
      },
      {
        symbol: 'ETH-PERP',
        marketIndex: 2,
        baseAsset: 'ETH',
        maxLeverage: 20,
      },
    ];

    const result = formatMarkets(markets);

    expect(result).toContain('Drift Perpetual Markets (3)');
    expect(result).toContain('SOL-PERP');
    expect(result).toContain('BTC-PERP');
    expect(result).toContain('ETH-PERP');
  });
});

describe('Formatters - formatPositionResult', () => {
  // Position data is now normalized (service divides by precision constants)
  it('should format long position result with normal leverage', () => {
    const positionResult: PositionResult = {
      success: true,
      position: {
        marketSymbol: 'SOL-PERP',
        marketIndex: 0,
        side: 'long',
        size: '100', // 100 SOL (normalized)
        notionalValue: '15000.00',
        entryPrice: '150.00',
        markPrice: '150.00',
        unrealizedPnl: '0.00',
        liquidationPrice: '135.00',
        leverage: 5,
        marginUsed: '3000.00',
      },
      txSignature: 'mockTxSig123',
    };

    const result = formatPositionResult(positionResult, 'SOL-PERP', 'long', 5, false);

    expect(result).toContain('LONG Position Opened');
    expect(result).toContain('SOL-PERP');
    expect(result).toContain('$150.00');
    expect(result).toContain('mockTxSig123');
    expect(result).not.toContain('High Leverage');
  });

  it('should format high risk position with warning', () => {
    const positionResult: PositionResult = {
      success: true,
      position: {
        marketSymbol: 'BTC-PERP',
        marketIndex: 1,
        side: 'short',
        size: '1', // 1 BTC (normalized)
        notionalValue: '67000.00',
        entryPrice: '67000.00',
        markPrice: '67000.00',
        unrealizedPnl: '0.00',
        liquidationPrice: '73700.00',
        leverage: 10,
        marginUsed: '6700.00',
      },
      txSignature: 'mockTxSig456',
    };

    const result = formatPositionResult(positionResult, 'BTC-PERP', 'short', 10, true);

    expect(result).toContain('⚠️ High Leverage Position (10x)');
    expect(result).toContain('SHORT');
  });

  it('should calculate liquidation distance for long position', () => {
    const positionResult: PositionResult = {
      success: true,
      position: {
        marketSymbol: 'SOL-PERP',
        marketIndex: 0,
        side: 'long',
        size: '100', // 100 SOL (normalized)
        notionalValue: '15000.00',
        entryPrice: '150.00',
        markPrice: '150.00',
        unrealizedPnl: '0.00',
        liquidationPrice: '135.00', // 10% below entry
        leverage: 5,
        marginUsed: '3000.00',
      },
      txSignature: 'mockTxSig',
    };

    const result = formatPositionResult(positionResult, 'SOL-PERP', 'long', 5, false);

    expect(result).toContain('10.0% away'); // (150 - 135) / 150 = 10%
  });

  it('should calculate liquidation distance for short position', () => {
    const positionResult: PositionResult = {
      success: true,
      position: {
        marketSymbol: 'BTC-PERP',
        marketIndex: 1,
        side: 'short',
        size: '50000000',
        notionalValue: '67000.00',
        entryPrice: '67000.00',
        markPrice: '67000.00',
        unrealizedPnl: '0.00',
        liquidationPrice: '73700.00', // 10% above entry
        leverage: 10,
        marginUsed: '6700.00',
      },
      txSignature: 'mockTxSig',
    };

    const result = formatPositionResult(positionResult, 'BTC-PERP', 'short', 10, true);

    expect(result).toContain('10.0% away'); // (73700 - 67000) / 67000 = 10%
  });
});

describe('Formatters - formatCloseResult', () => {
  it('should format full close (100%)', () => {
    const result = formatCloseResult('SOL-PERP', 100, 'mockCloseTx123');

    expect(result).toContain('Position Closed');
    expect(result).toContain('SOL-PERP');
    expect(result).toContain('100%');
    expect(result).toContain('mockCloseTx123');
  });

  it('should format partial close (50%)', () => {
    const result = formatCloseResult('BTC-PERP', 50, 'mockCloseTx456');

    expect(result).toContain('50%');
    expect(result).toContain('BTC-PERP');
  });

  it('should format without transaction signature', () => {
    const result = formatCloseResult('ETH-PERP', 100);

    expect(result).toContain('Position Closed');
    expect(result).not.toContain('Transaction:');
  });
});

describe('Formatters - formatDepositResult', () => {
  it('should format deposit with transaction', () => {
    const result = formatDepositResult(100, 'mockDepositTx123');

    expect(result).toContain('USDC Deposited to Drift');
    expect(result).toContain('$100.00');
    expect(result).toContain('mockDepositTx123');
  });

  it('should format deposit without transaction', () => {
    const result = formatDepositResult(250);

    expect(result).toContain('$250.00');
    expect(result).not.toContain('Transaction:');
  });

  it('should handle large deposit amounts', () => {
    const result = formatDepositResult(50000);

    expect(result).toContain('$50,000.00');
  });
});

describe('Formatters - formatWithdrawResult', () => {
  it('should format successful withdrawal', () => {
    const result = formatWithdrawResult(100, 500, 'txSig123');
    expect(result).toContain('USDC Withdrawn from Drift');
    expect(result).toContain('$100.00');
    expect(result).toContain('$500.00');
    expect(result).toContain('txSig123');
  });

  it('should format withdrawal without tx signature', () => {
    const result = formatWithdrawResult(50, 200);
    expect(result).toContain('$50.00');
    expect(result).toContain('$200.00');
    expect(result).not.toContain('Transaction:');
  });

  it('should handle large withdrawal amounts', () => {
    const result = formatWithdrawResult(25000, 75000, 'largeTx');
    expect(result).toContain('$25,000.00');
    expect(result).toContain('$75,000.00');
  });
});
