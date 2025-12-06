/**
 * Constants & Helper Functions Tests (TDD RED Phase)
 *
 * Testing market lookups, error messages, and utility functions
 */

import { describe, it, expect } from 'bun:test';
import {
  DRIFT_PROGRAM_ID,
  SERVICE_NAME,
  DEVNET_MARKETS,
  MAINNET_MARKETS,
  CONFIG,
  ACTION_NAMES,
  MINTS,
  ERRORS,
  getMarketSymbols,
  getMarketIndex,
} from '../src/constants';

describe('Constants - Program & Service', () => {
  it('should have correct Drift program ID', () => {
    expect(DRIFT_PROGRAM_ID).toBe('dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH');
  });

  it('should have correct service name', () => {
    expect(SERVICE_NAME).toBe('DRIFT_SERVICE');
  });
});

describe('Constants - Market Configuration', () => {
  it('should have 3 markets on devnet', () => {
    expect(Object.keys(DEVNET_MARKETS).length).toBe(3);
  });

  it('should include SOL-PERP in devnet markets', () => {
    expect(DEVNET_MARKETS['SOL-PERP']).toBe(0);
  });

  it('should include BTC-PERP in devnet markets', () => {
    expect(DEVNET_MARKETS['BTC-PERP']).toBe(1);
  });

  it('should include ETH-PERP in devnet markets', () => {
    expect(DEVNET_MARKETS['ETH-PERP']).toBe(2);
  });

  it('should have more markets on mainnet than devnet', () => {
    expect(Object.keys(MAINNET_MARKETS).length).toBeGreaterThan(Object.keys(DEVNET_MARKETS).length);
  });

  it('should have at least 30 markets on mainnet', () => {
    expect(Object.keys(MAINNET_MARKETS).length).toBeGreaterThanOrEqual(30);
  });

  it('should include all devnet markets in mainnet', () => {
    const devnetSymbols = Object.keys(DEVNET_MARKETS);
    const mainnetSymbols = Object.keys(MAINNET_MARKETS);

    for (const symbol of devnetSymbols) {
      expect(mainnetSymbols).toContain(symbol);
    }
  });

  it('should have WIF-PERP in mainnet markets', () => {
    expect(MAINNET_MARKETS['WIF-PERP']).toBeDefined();
  });

  it('should have JUP-PERP in mainnet markets', () => {
    expect(MAINNET_MARKETS['JUP-PERP']).toBeDefined();
  });
});

describe('Constants - Service Configuration', () => {
  it('should have max leverage of 20x', () => {
    expect(CONFIG.MAX_LEVERAGE).toBe(20);
  });

  it('should have default leverage of 1x', () => {
    expect(CONFIG.DEFAULT_LEVERAGE).toBe(1);
  });

  it('should have default slippage of 0.5%', () => {
    expect(CONFIG.DEFAULT_SLIPPAGE).toBe(0.5);
  });

  it('should have minimum collateral of $10', () => {
    expect(CONFIG.MIN_COLLATERAL).toBe(10);
  });

  it('should have minimum SOL for account init of 0.02', () => {
    expect(CONFIG.MIN_SOL_FOR_INIT).toBe(0.02);
  });

  it('should use subaccount ID 0 by default', () => {
    expect(CONFIG.SUBACCOUNT_ID).toBe(0);
  });

  it('should have high risk leverage threshold of 5x', () => {
    expect(CONFIG.HIGH_RISK_LEVERAGE_THRESHOLD).toBe(5);
  });
});

describe('Constants - Action Names', () => {
  it('should have DRIFT_OPEN_LONG action', () => {
    expect(ACTION_NAMES.DRIFT_OPEN_LONG).toBe('DRIFT_OPEN_LONG');
  });

  it('should have DRIFT_OPEN_SHORT action', () => {
    expect(ACTION_NAMES.DRIFT_OPEN_SHORT).toBe('DRIFT_OPEN_SHORT');
  });

  it('should have DRIFT_CLOSE_POSITION action', () => {
    expect(ACTION_NAMES.DRIFT_CLOSE_POSITION).toBe('DRIFT_CLOSE_POSITION');
  });

  it('should have DRIFT_GET_POSITIONS action', () => {
    expect(ACTION_NAMES.DRIFT_GET_POSITIONS).toBe('DRIFT_GET_POSITIONS');
  });

  it('should have DRIFT_GET_MARKETS action', () => {
    expect(ACTION_NAMES.DRIFT_GET_MARKETS).toBe('DRIFT_GET_MARKETS');
  });

  it('should have DRIFT_ACCOUNT_INFO action', () => {
    expect(ACTION_NAMES.DRIFT_ACCOUNT_INFO).toBe('DRIFT_ACCOUNT_INFO');
  });

  it('should have DRIFT_DEPOSIT action', () => {
    expect(ACTION_NAMES.DRIFT_DEPOSIT).toBe('DRIFT_DEPOSIT');
  });

  it('should have 7 total actions', () => {
    expect(Object.keys(ACTION_NAMES).length).toBe(7);
  });
});

describe('Constants - Token Mints', () => {
  it('should have correct SOL mint address', () => {
    expect(MINTS.SOL).toBe('So11111111111111111111111111111111111111112');
  });

  it('should have correct USDC mint address', () => {
    expect(MINTS.USDC).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });
});

describe('Error Messages - Dynamic Builders', () => {
  it('should build unknown market error with available markets', () => {
    const error = ERRORS.unknownMarket('DOGE-PERP', ['SOL-PERP', 'BTC-PERP', 'ETH-PERP']);

    expect(error).toContain('Unknown market');
    expect(error).toContain('DOGE-PERP');
    expect(error).toContain('SOL-PERP');
    expect(error).toContain('BTC-PERP');
  });

  it('should build insufficient collateral error with amounts', () => {
    const error = ERRORS.insufficientCollateral(100, 50);

    expect(error).toContain('Insufficient collateral');
    expect(error).toContain('100');
    expect(error).toContain('50');
  });

  it('should build insufficient SOL error with amounts', () => {
    const error = ERRORS.insufficientSol(0.02, 0.005);

    expect(error).toContain('0.02');
    expect(error).toContain('0.0050'); // Should format with decimals
    expect(error).toContain('SOL');
  });

  it('should build no position error with symbol', () => {
    const error = ERRORS.noPosition('BTC-PERP');

    expect(error).toContain('No open position');
    expect(error).toContain('BTC-PERP');
  });

  it('should build leverage too high error with values', () => {
    const error = ERRORS.leverageTooHigh(25, 20);

    expect(error).toContain('25');
    expect(error).toContain('20');
    expect(error).toContain('exceeds');
  });

  it('should build size too small error with values', () => {
    const error = ERRORS.sizeTooSmall(5, 10);

    expect(error).toContain('5');
    expect(error).toContain('10');
    expect(error).toContain('below minimum');
  });

  it('should have static service not found error', () => {
    expect(ERRORS.SERVICE_NOT_FOUND).toContain('Drift service');
  });

  it('should have static Jupiter not found error', () => {
    expect(ERRORS.JUPITER_NOT_FOUND).toContain('Jupiter');
  });
});

describe('Helper Functions - getMarketSymbols', () => {
  it('should return devnet market symbols when isDevnet=true', () => {
    const symbols = getMarketSymbols(true);

    expect(symbols).toBeArray();
    expect(symbols.length).toBe(3);
    expect(symbols).toContain('SOL-PERP');
    expect(symbols).toContain('BTC-PERP');
    expect(symbols).toContain('ETH-PERP');
  });

  it('should return mainnet market symbols when isDevnet=false', () => {
    const symbols = getMarketSymbols(false);

    expect(symbols).toBeArray();
    expect(symbols.length).toBeGreaterThan(3);
    expect(symbols).toContain('SOL-PERP');
    expect(symbols).toContain('WIF-PERP');
    expect(symbols).toContain('JUP-PERP');
  });

  it('should return all symbols ending with -PERP', () => {
    const devnetSymbols = getMarketSymbols(true);
    const mainnetSymbols = getMarketSymbols(false);

    expect(devnetSymbols.every(s => s.endsWith('-PERP'))).toBe(true);
    expect(mainnetSymbols.every(s => s.endsWith('-PERP'))).toBe(true);
  });
});

describe('Helper Functions - getMarketIndex', () => {
  it('should return correct index for SOL-PERP on devnet', () => {
    const index = getMarketIndex('SOL-PERP', true);

    expect(index).toBe(0);
  });

  it('should return correct index for BTC-PERP on devnet', () => {
    const index = getMarketIndex('BTC-PERP', true);

    expect(index).toBe(1);
  });

  it('should return correct index for ETH-PERP on devnet', () => {
    const index = getMarketIndex('ETH-PERP', true);

    expect(index).toBe(2);
  });

  it('should return undefined for unknown market on devnet', () => {
    const index = getMarketIndex('WIF-PERP', true); // Not on devnet

    expect(index).toBeUndefined();
  });

  it('should return correct index for SOL-PERP on mainnet', () => {
    const index = getMarketIndex('SOL-PERP', false);

    expect(index).toBe(0);
  });

  it('should return defined index for WIF-PERP on mainnet', () => {
    const index = getMarketIndex('WIF-PERP', false);

    expect(index).toBeDefined();
    expect(typeof index).toBe('number');
  });

  it('should return undefined for completely invalid market', () => {
    const devnetIndex = getMarketIndex('INVALID-PERP', true);
    const mainnetIndex = getMarketIndex('INVALID-PERP', false);

    expect(devnetIndex).toBeUndefined();
    expect(mainnetIndex).toBeUndefined();
  });

  it('should handle case-sensitive market symbols', () => {
    // Market symbols should be uppercase
    const upperIndex = getMarketIndex('SOL-PERP', true);
    const lowerIndex = getMarketIndex('sol-perp', true);

    expect(upperIndex).toBe(0);
    expect(lowerIndex).toBeUndefined(); // Should fail for lowercase
  });
});

describe('Market Symbol Consistency', () => {
  it('should have consistent indices across devnet and mainnet for common markets', () => {
    const devnetSol = getMarketIndex('SOL-PERP', true);
    const mainnetSol = getMarketIndex('SOL-PERP', false);

    const devnetBtc = getMarketIndex('BTC-PERP', true);
    const mainnetBtc = getMarketIndex('BTC-PERP', false);

    const devnetEth = getMarketIndex('ETH-PERP', true);
    const mainnetEth = getMarketIndex('ETH-PERP', false);

    // Same markets should have same indices across networks
    expect(devnetSol).toBe(mainnetSol);
    expect(devnetBtc).toBe(mainnetBtc);
    expect(devnetEth).toBe(mainnetEth);
  });

  it('should not have duplicate indices in devnet markets', () => {
    const indices = Object.values(DEVNET_MARKETS);
    const uniqueIndices = [...new Set(indices)];

    expect(indices.length).toBe(uniqueIndices.length);
  });

  it('should not have duplicate indices in mainnet markets', () => {
    const indices = Object.values(MAINNET_MARKETS);
    const uniqueIndices = [...new Set(indices)];

    expect(indices.length).toBe(uniqueIndices.length);
  });

  it('should have sequential indices starting from 0', () => {
    const devnetIndices = Object.values(DEVNET_MARKETS).sort((a, b) => a - b);
    const mainnetIndices = Object.values(MAINNET_MARKETS).sort((a, b) => a - b);

    expect(devnetIndices[0]).toBe(0);
    expect(mainnetIndices[0]).toBe(0);

    // Check for gaps in sequence
    for (let i = 1; i < devnetIndices.length; i++) {
      expect(devnetIndices[i]).toBe(devnetIndices[i - 1] + 1);
    }
  });
});

describe('Configuration Constraints', () => {
  it('should have max leverage >= high risk threshold', () => {
    expect(CONFIG.MAX_LEVERAGE).toBeGreaterThanOrEqual(CONFIG.HIGH_RISK_LEVERAGE_THRESHOLD);
  });

  it('should have default leverage <= max leverage', () => {
    expect(CONFIG.DEFAULT_LEVERAGE).toBeLessThanOrEqual(CONFIG.MAX_LEVERAGE);
  });

  it('should have default leverage <= high risk threshold (safe default)', () => {
    expect(CONFIG.DEFAULT_LEVERAGE).toBeLessThanOrEqual(CONFIG.HIGH_RISK_LEVERAGE_THRESHOLD);
  });

  it('should have slippage between 0 and 100%', () => {
    expect(CONFIG.DEFAULT_SLIPPAGE).toBeGreaterThan(0);
    expect(CONFIG.DEFAULT_SLIPPAGE).toBeLessThan(100);
  });

  it('should have minimum collateral > 0', () => {
    expect(CONFIG.MIN_COLLATERAL).toBeGreaterThan(0);
  });

  it('should have minimum SOL for init > 0', () => {
    expect(CONFIG.MIN_SOL_FOR_INIT).toBeGreaterThan(0);
  });

  it('should have minimum SOL sufficient for rent exemption', () => {
    // Drift account init typically needs ~0.01-0.02 SOL for rent
    expect(CONFIG.MIN_SOL_FOR_INIT).toBeGreaterThanOrEqual(0.01);
  });
});
