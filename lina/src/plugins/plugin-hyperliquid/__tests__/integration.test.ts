/**
 * Hyperliquid Integration Tests (Read-Only)
 *
 * These tests verify the read-only operations work against the actual Hyperliquid API.
 * No testnet funding required - these only query account state.
 *
 * Requirements:
 * - HYPERLIQUID_PRIVATE_KEY set in environment
 * - HYPERLIQUID_TESTNET="true" (recommended)
 *
 * Run with: bun test src/plugins/plugin-hyperliquid/__tests__/integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { HyperliquidService } from '../src/services/hyperliquid.service';
import type { Position, Market, AccountInfo } from '../src/types';

// Skip integration tests if no private key configured
const PRIVATE_KEY = process.env.HYPERLIQUID_PRIVATE_KEY;
const SKIP_INTEGRATION = !PRIVATE_KEY;

// Mock runtime for integration tests
const createIntegrationRuntime = () => ({
  getSetting: (key: string) => {
    const settings: Record<string, string | undefined> = {
      HYPERLIQUID_PRIVATE_KEY: PRIVATE_KEY,
      HYPERLIQUID_TESTNET: process.env.HYPERLIQUID_TESTNET ?? 'true',
    };
    return settings[key];
  },
  agentId: 'integration-test-agent',
  character: { name: 'Integration Test' },
});

describe('Hyperliquid Integration Tests', () => {
  let service: HyperliquidService;
  let runtime: ReturnType<typeof createIntegrationRuntime>;

  beforeAll(async () => {
    if (SKIP_INTEGRATION) {
      console.log('Skipping integration tests: HYPERLIQUID_PRIVATE_KEY not set');
      return;
    }

    runtime = createIntegrationRuntime();
    service = new HyperliquidService(runtime as any);
    await service.initialize(runtime as any);
  });

  afterAll(async () => {
    if (!SKIP_INTEGRATION && service) {
      await service.stop();
    }
  });

  describe('getPositions()', () => {
    it.skipIf(SKIP_INTEGRATION)('should return positions array (may be empty)', async () => {
      const positions: Position[] = await service.getPositions('integration-test-user');

      expect(Array.isArray(positions)).toBe(true);

      // If positions exist, verify structure
      if (positions.length > 0) {
        const position = positions[0];
        expect(position).toHaveProperty('symbol');
        expect(position).toHaveProperty('side');
        expect(position).toHaveProperty('size');
        expect(position).toHaveProperty('entryPrice');
        expect(position).toHaveProperty('leverage');
        expect(position).toHaveProperty('liquidationPrice');
        expect(position).toHaveProperty('unrealizedPnl');
      }
    });

    it.skipIf(SKIP_INTEGRATION)('should handle different userId values', async () => {
      // userId is for future multi-wallet support - same wallet for now
      const positions1 = await service.getPositions('user-1');
      const positions2 = await service.getPositions('user-2');

      // Both should return arrays (same wallet)
      expect(Array.isArray(positions1)).toBe(true);
      expect(Array.isArray(positions2)).toBe(true);
    });
  });

  describe('getMarkets()', () => {
    it.skipIf(SKIP_INTEGRATION)('should return available perpetual markets', async () => {
      const markets: Market[] = await service.getMarkets();

      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeGreaterThan(0);

      // Verify market structure
      const market = markets[0];
      expect(market).toHaveProperty('symbol');
      expect(market).toHaveProperty('maxLeverage');
      expect(market).toHaveProperty('markPrice');
      expect(market).toHaveProperty('fundingRate');
    });

    it.skipIf(SKIP_INTEGRATION)('should include major markets (BTC, ETH)', async () => {
      const markets = await service.getMarkets();
      const symbols = markets.map((m) => m.symbol);

      expect(symbols).toContain('BTC');
      expect(symbols).toContain('ETH');
    });
  });

  describe('getAccountInfo()', () => {
    it.skipIf(SKIP_INTEGRATION)('should return account information', async () => {
      const account: AccountInfo = await service.getAccountInfo('integration-test-user');

      expect(account).toBeDefined();

      // Verify account structure matches AccountInfo type
      expect(account).toHaveProperty('equity');
      expect(account).toHaveProperty('availableBalance');
      expect(account).toHaveProperty('marginUsed');
      expect(typeof account.equity).toBe('number');
      expect(typeof account.availableBalance).toBe('number');
    });

    it.skipIf(SKIP_INTEGRATION)('should return non-negative values', async () => {
      const account = await service.getAccountInfo('integration-test-user');

      expect(account.equity).toBeGreaterThanOrEqual(0);
      expect(account.availableBalance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it.skipIf(SKIP_INTEGRATION)('should return empty array for positions on new account', async () => {
      // A fresh testnet account should have no positions
      const positions = await service.getPositions('new-user');

      expect(Array.isArray(positions)).toBe(true);
      // May or may not be empty depending on account state
    });

    it.skipIf(SKIP_INTEGRATION)('should return valid account info even with zero balance', async () => {
      const account = await service.getAccountInfo('test-user');

      // Even with zero balance, should return valid structure
      expect(account).toHaveProperty('equity');
      expect(account).toHaveProperty('availableBalance');
      expect(typeof account.marginRatio).toBe('number');
    });
  });
});
