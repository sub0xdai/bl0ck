/**
 * Market Index Tests
 *
 * Tests devnet/mainnet market index handling and validation
 */

import { describe, it, expect } from 'bun:test';
import { DEVNET_MARKETS, MAINNET_MARKETS, getMarketSymbols, getMarketIndex } from '../src/constants';

describe('Markets - Devnet Configuration', () => {
  it('should have exactly 3 markets on devnet', () => {
    const symbols = getMarketSymbols(true);
    expect(symbols.length).toBe(3);
  });

  it('should have SOL-PERP at index 0 on devnet', () => {
    expect(getMarketIndex('SOL-PERP', true)).toBe(0);
  });

  it('should have BTC-PERP at index 1 on devnet', () => {
    expect(getMarketIndex('BTC-PERP', true)).toBe(1);
  });

  it('should have ETH-PERP at index 2 on devnet', () => {
    expect(getMarketIndex('ETH-PERP', true)).toBe(2);
  });

  it('should return undefined for WIF-PERP on devnet', () => {
    expect(getMarketIndex('WIF-PERP', true)).toBeUndefined();
  });

  it('should return undefined for JUP-PERP on devnet', () => {
    expect(getMarketIndex('JUP-PERP', true)).toBeUndefined();
  });
});

describe('Markets - Mainnet Configuration', () => {
  it('should have more markets on mainnet than devnet', () => {
    const devnetSymbols = getMarketSymbols(true);
    const mainnetSymbols = getMarketSymbols(false);

    expect(mainnetSymbols.length).toBeGreaterThan(devnetSymbols.length);
  });

  it('should have at least 30 markets on mainnet', () => {
    const symbols = getMarketSymbols(false);
    expect(symbols.length).toBeGreaterThanOrEqual(30);
  });

  it('should include all devnet markets in mainnet', () => {
    const devnetSymbols = getMarketSymbols(true);
    const mainnetSymbols = getMarketSymbols(false);

    for (const symbol of devnetSymbols) {
      expect(mainnetSymbols).toContain(symbol);
    }
  });

  it('should have SOL-PERP at same index as devnet', () => {
    const devnetIndex = getMarketIndex('SOL-PERP', true);
    const mainnetIndex = getMarketIndex('SOL-PERP', false);

    expect(devnetIndex).toBe(mainnetIndex);
  });

  it('should have WIF-PERP on mainnet', () => {
    const index = getMarketIndex('WIF-PERP', false);
    expect(index).toBeDefined();
    expect(typeof index).toBe('number');
  });

  it('should have JUP-PERP on mainnet', () => {
    const index = getMarketIndex('JUP-PERP', false);
    expect(index).toBeDefined();
    expect(typeof index).toBe('number');
  });
});

describe('Markets - Invalid Market Handling', () => {
  it('should return undefined for completely invalid market on devnet', () => {
    expect(getMarketIndex('INVALID-PERP', true)).toBeUndefined();
  });

  it('should return undefined for completely invalid market on mainnet', () => {
    expect(getMarketIndex('INVALID-PERP', false)).toBeUndefined();
  });

  it('should be case-sensitive (reject lowercase)', () => {
    expect(getMarketIndex('sol-perp', true)).toBeUndefined();
    expect(getMarketIndex('btc-perp', false)).toBeUndefined();
  });

  it('should reject partial matches', () => {
    expect(getMarketIndex('SOL', true)).toBeUndefined();
    expect(getMarketIndex('PERP', true)).toBeUndefined();
  });

  it('should reject empty string', () => {
    expect(getMarketIndex('', true)).toBeUndefined();
    expect(getMarketIndex('', false)).toBeUndefined();
  });
});
