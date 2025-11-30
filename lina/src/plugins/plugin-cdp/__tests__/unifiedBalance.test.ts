/**
 * Unified Balance Provider Tests
 *
 * Phase 5: TDD test suite for multi-chain portfolio aggregation
 * Tests Solana + EVM + Hyperliquid balance integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';
import { unifiedBalanceProvider } from '../providers/unifiedBalance';

// Mock services
const mockSolanaService = {
  getTokenBalances: vi.fn(),
};

const mockCdpService = {
  fetchWalletInfo: vi.fn(),
};

const mockHyperliquidService = {
  getAccountInfo: vi.fn(),
  getPositions: vi.fn(),
  getAddress: vi.fn(),
};

// Mock runtime
const createMockRuntime = (services: Record<string, unknown> = {}): IAgentRuntime => {
  const defaultServices = {
    SOLANA_SERVICE: mockSolanaService,
    CDP_SERVICE: mockCdpService,
    HYPERLIQUID_SERVICE: mockHyperliquidService,
  };

  return {
    getService: vi.fn((name: string) => {
      return services[name] ?? defaultServices[name] ?? null;
    }),
    getEntityById: vi.fn(async () => ({
      metadata: { author_id: 'test-user-123' },
    })),
  } as unknown as IAgentRuntime;
};

const createMockMessage = (): Memory => ({
  entityId: 'entity-456',
  userId: 'test-user-123',
  roomId: 'room-789',
  content: { text: 'test' },
  agentId: 'agent-123',
} as Memory);

describe('UnifiedBalanceProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get()', () => {
    it('should aggregate Solana + EVM + Hyperliquid balances correctly', async () => {
      // Mock Solana response
      mockSolanaService.getTokenBalances.mockResolvedValue({
        address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        tokens: [
          {
            symbol: 'SOL',
            name: 'Solana',
            balance: '10500000000',
            balanceFormatted: '10.5',
            usdValue: 1260,
            usdPrice: 120,
            mintAddress: null,
            decimals: 9,
          },
          {
            symbol: 'USDC',
            name: 'USD Coin',
            balance: '500000000',
            balanceFormatted: '500',
            usdValue: 500,
            usdPrice: 1,
            mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            decimals: 6,
          },
        ],
        totalUsdValue: 1760,
        fromCache: false,
      });

      // Mock EVM response
      mockCdpService.fetchWalletInfo.mockResolvedValue({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        tokens: [
          {
            symbol: 'ETH',
            name: 'Ethereum',
            balance: '500000000000000000',
            balanceFormatted: '0.5',
            usdValue: 2000,
            usdPrice: 4000,
            contractAddress: null,
            chain: 'base',
            decimals: 18,
          },
          {
            symbol: 'USDC',
            name: 'USD Coin',
            balance: '1500000000',
            balanceFormatted: '1500',
            usdValue: 1500,
            usdPrice: 1,
            contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            chain: 'base',
            decimals: 6,
          },
          {
            symbol: 'ETH',
            name: 'Ethereum',
            balance: '100000000000000000',
            balanceFormatted: '0.1',
            usdValue: 400,
            usdPrice: 4000,
            contractAddress: null,
            chain: 'arbitrum',
            decimals: 18,
          },
          {
            symbol: 'USDC',
            name: 'USD Coin',
            balance: '850000000',
            balanceFormatted: '850',
            usdValue: 850,
            usdPrice: 1,
            contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
            chain: 'arbitrum',
            decimals: 6,
          },
        ],
        nfts: [],
        totalUsdValue: 4750,
      });

      // Mock Hyperliquid response
      mockHyperliquidService.getAccountInfo.mockResolvedValue({
        equity: 1233.0,
        availableBalance: 1200.0,
        marginUsed: 33.0,
        unrealizedPnl: 33.0,
        realizedPnl: 0,
        totalPositionValue: 800.0,
        leverage: 0.65,
        marginRatio: 0.027,
      });

      mockHyperliquidService.getPositions.mockResolvedValue([
        {
          symbol: 'BTC',
          side: 'long',
          size: 0.01,
          entryPrice: 95000,
          markPrice: 99500,
          liquidationPrice: null,
          unrealizedPnl: 45.0,
          realizedPnl: 0,
          leverage: 5,
          marginUsed: 190,
          timestamp: Date.now(),
        },
        {
          symbol: 'ETH',
          side: 'short',
          size: 0.2,
          entryPrice: 4000,
          markPrice: 4060,
          liquidationPrice: null,
          unrealizedPnl: -12.0,
          realizedPnl: 0,
          leverage: 3,
          marginUsed: 266.67,
          timestamp: Date.now(),
        },
      ]);

      mockHyperliquidService.getAddress.mockResolvedValue('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0');

      const runtime = createMockRuntime();
      const message = createMockMessage();
      const result = await unifiedBalanceProvider.get(runtime, message, undefined as unknown as State);

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(result.data.portfolio).toBeDefined();

      // Verify portfolio calculations
      const portfolio = result.data.portfolio;
      expect(portfolio.totalAvailable).toBeCloseTo(7710.0, 2); // 1760 (SOL) + 4750 (EVM) + 1200 (HL available)
      expect(portfolio.inPositions).toBeCloseTo(800.0, 2);
      expect(portfolio.netWorth).toBeCloseTo(7743.0, 2); // 1760 + 4750 + 1233 (HL equity, not available balance)
      expect(portfolio.unrealizedPnl).toBeCloseTo(33.0, 2);

      // Verify Solana data
      expect(result.data.solana).toBeDefined();
      expect(result.data.solana.address).toBe('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
      expect(result.data.solana.totalUsdValue).toBe(1760);

      // Verify EVM data
      expect(result.data.evm).toBeDefined();
      expect(result.data.evm.address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0');
      expect(result.data.evm.totalUsdValue).toBe(4750);

      // Verify Hyperliquid data
      expect(result.data.hyperliquid).toBeDefined();
      expect(result.data.hyperliquid.equity).toBe(1233.0);
      expect(result.data.hyperliquid.positions).toHaveLength(2);

      // Verify text output contains all sections
      expect(result.text).toContain('Solana Wallet');
      expect(result.text).toContain('EVM Wallet');
      expect(result.text).toContain('Hyperliquid');
      expect(result.text).toContain('Portfolio Summary');

      // Verify values for template
      expect(result.values).toBeDefined();
      expect(result.values.netWorth).toBeDefined();
      expect(result.values.positionCount).toBe('2');
    });

    it('should calculate total net worth correctly', async () => {
      mockSolanaService.getTokenBalances.mockResolvedValue({
        address: '7xKX...', tokens: [], totalUsdValue: 1000, fromCache: false,
      });

      mockCdpService.fetchWalletInfo.mockResolvedValue({
        address: '0x742...', tokens: [], nfts: [], totalUsdValue: 2000,
      });

      mockHyperliquidService.getAccountInfo.mockResolvedValue({
        equity: 3000, availableBalance: 2900, marginUsed: 100, unrealizedPnl: 100,
        realizedPnl: 0, totalPositionValue: 0, leverage: 0, marginRatio: 0,
      });

      mockHyperliquidService.getPositions.mockResolvedValue([]);
      mockHyperliquidService.getAddress.mockResolvedValue('0x742...');

      const runtime = createMockRuntime();
      const message = createMockMessage();
      const result = await unifiedBalanceProvider.get(runtime, message, undefined as unknown as State);

      expect(result.data.portfolio.netWorth).toBeCloseTo(6000, 2); // 1000 + 2000 + 3000
    });

    it('should handle missing Solana gracefully', async () => {
      mockSolanaService.getTokenBalances.mockRejectedValue(new Error('Solana RPC error'));

      mockCdpService.fetchWalletInfo.mockResolvedValue({
        address: '0x742...', tokens: [], nfts: [], totalUsdValue: 2000,
      });

      mockHyperliquidService.getAccountInfo.mockResolvedValue({
        equity: 3000, availableBalance: 2900, marginUsed: 100, unrealizedPnl: 0,
        realizedPnl: 0, totalPositionValue: 0, leverage: 0, marginRatio: 0,
      });

      mockHyperliquidService.getPositions.mockResolvedValue([]);
      mockHyperliquidService.getAddress.mockResolvedValue('0x742...');

      const runtime = createMockRuntime();
      const message = createMockMessage();
      const result = await unifiedBalanceProvider.get(runtime, message, undefined as unknown as State);

      expect(result.data.solana).toBeNull();
      expect(result.data.evm).toBeDefined();
      expect(result.data.hyperliquid).toBeDefined();
      expect(result.data.portfolio.netWorth).toBeCloseTo(5000, 2); // 2000 + 3000 (no Solana)
    });

    it('should handle missing EVM gracefully', async () => {
      mockSolanaService.getTokenBalances.mockResolvedValue({
        address: '7xKX...', tokens: [], totalUsdValue: 1000, fromCache: false,
      });

      mockCdpService.fetchWalletInfo.mockRejectedValue(new Error('CDP error'));

      mockHyperliquidService.getAccountInfo.mockResolvedValue({
        equity: 3000, availableBalance: 2900, marginUsed: 100, unrealizedPnl: 0,
        realizedPnl: 0, totalPositionValue: 0, leverage: 0, marginRatio: 0,
      });

      mockHyperliquidService.getPositions.mockResolvedValue([]);
      mockHyperliquidService.getAddress.mockResolvedValue('0x742...');

      const runtime = createMockRuntime();
      const message = createMockMessage();
      const result = await unifiedBalanceProvider.get(runtime, message, undefined as unknown as State);

      expect(result.data.solana).toBeDefined();
      expect(result.data.evm).toBeNull();
      expect(result.data.hyperliquid).toBeDefined();
      expect(result.data.portfolio.netWorth).toBeCloseTo(4000, 2); // 1000 + 3000 (no EVM)
    });

    it('should handle missing Hyperliquid gracefully', async () => {
      mockSolanaService.getTokenBalances.mockResolvedValue({
        address: '7xKX...', tokens: [], totalUsdValue: 1000, fromCache: false,
      });

      mockCdpService.fetchWalletInfo.mockResolvedValue({
        address: '0x742...', tokens: [], nfts: [], totalUsdValue: 2000,
      });

      mockHyperliquidService.getAccountInfo.mockRejectedValue(new Error('Hyperliquid API error'));
      mockHyperliquidService.getPositions.mockRejectedValue(new Error('Hyperliquid API error'));

      const runtime = createMockRuntime();
      const message = createMockMessage();
      const result = await unifiedBalanceProvider.get(runtime, message, undefined as unknown as State);

      expect(result.data.solana).toBeDefined();
      expect(result.data.evm).toBeDefined();
      expect(result.data.hyperliquid).toBeNull();
      expect(result.data.portfolio.netWorth).toBeCloseTo(3000, 2); // 1000 + 2000 (no HL)
    });

    it('should format position P&L with +/- signs', async () => {
      mockSolanaService.getTokenBalances.mockResolvedValue({
        address: '7xKX...', tokens: [], totalUsdValue: 0, fromCache: false,
      });

      mockCdpService.fetchWalletInfo.mockResolvedValue({
        address: '0x742...', tokens: [], nfts: [], totalUsdValue: 0,
      });

      mockHyperliquidService.getAccountInfo.mockResolvedValue({
        equity: 1000, availableBalance: 900, marginUsed: 100, unrealizedPnl: 40,
        realizedPnl: 0, totalPositionValue: 500, leverage: 0.5, marginRatio: 0.1,
      });

      mockHyperliquidService.getPositions.mockResolvedValue([
        {
          symbol: 'BTC',
          side: 'long',
          size: 0.01,
          entryPrice: 95000,
          markPrice: 100000,
          liquidationPrice: null,
          unrealizedPnl: 50.0,
          realizedPnl: 0,
          leverage: 5,
          marginUsed: 100,
          timestamp: Date.now(),
        },
        {
          symbol: 'ETH',
          side: 'short',
          size: 0.1,
          entryPrice: 4000,
          markPrice: 4100,
          liquidationPrice: null,
          unrealizedPnl: -10.0,
          realizedPnl: 0,
          leverage: 3,
          marginUsed: 100,
          timestamp: Date.now(),
        },
      ]);

      mockHyperliquidService.getAddress.mockResolvedValue('0x742...');

      const runtime = createMockRuntime();
      const message = createMockMessage();
      const result = await unifiedBalanceProvider.get(runtime, message, undefined as unknown as State);

      // Verify text contains +/- signs for P&L
      expect(result.text).toContain('+$50.00');
      expect(result.text).toContain('-$10.00');
      expect(result.text).toContain('+$40.00'); // Total unrealized P&L
    });

    it('should show position count and breakdown', async () => {
      mockSolanaService.getTokenBalances.mockResolvedValue({
        address: '7xKX...', tokens: [], totalUsdValue: 0, fromCache: false,
      });

      mockCdpService.fetchWalletInfo.mockResolvedValue({
        address: '0x742...', tokens: [], nfts: [], totalUsdValue: 0,
      });

      mockHyperliquidService.getAccountInfo.mockResolvedValue({
        equity: 1000, availableBalance: 900, marginUsed: 100, unrealizedPnl: 0,
        realizedPnl: 0, totalPositionValue: 500, leverage: 0.5, marginRatio: 0.1,
      });

      mockHyperliquidService.getPositions.mockResolvedValue([
        {
          symbol: 'BTC',
          side: 'long',
          size: 0.01,
          entryPrice: 95000,
          markPrice: 95000,
          liquidationPrice: null,
          unrealizedPnl: 0,
          realizedPnl: 0,
          leverage: 5,
          marginUsed: 190,
          timestamp: Date.now(),
        },
        {
          symbol: 'ETH',
          side: 'short',
          size: 0.1,
          entryPrice: 4000,
          markPrice: 4000,
          liquidationPrice: null,
          unrealizedPnl: 0,
          realizedPnl: 0,
          leverage: 3,
          marginUsed: 133,
          timestamp: Date.now(),
        },
        {
          symbol: 'SOL',
          side: 'long',
          size: 10,
          entryPrice: 120,
          markPrice: 120,
          liquidationPrice: null,
          unrealizedPnl: 0,
          realizedPnl: 0,
          leverage: 2,
          marginUsed: 600,
          timestamp: Date.now(),
        },
      ]);

      mockHyperliquidService.getAddress.mockResolvedValue('0x742...');

      const runtime = createMockRuntime();
      const message = createMockMessage();
      const result = await unifiedBalanceProvider.get(runtime, message, undefined as unknown as State);

      expect(result.text).toContain('Positions (3 open)');
      expect(result.text).toContain('BTC 5x Long');
      expect(result.text).toContain('ETH 3x Short');
      expect(result.text).toContain('SOL 2x Long');
      expect(result.values.positionCount).toBe('3');
    });

    it('should return partial data if one service fails', async () => {
      mockSolanaService.getTokenBalances.mockRejectedValue(new Error('RPC error'));

      mockCdpService.fetchWalletInfo.mockResolvedValue({
        address: '0x742...', tokens: [], nfts: [], totalUsdValue: 1000,
      });

      mockHyperliquidService.getAccountInfo.mockResolvedValue({
        equity: 2000, availableBalance: 1900, marginUsed: 100, unrealizedPnl: 0,
        realizedPnl: 0, totalPositionValue: 0, leverage: 0, marginRatio: 0,
      });

      mockHyperliquidService.getPositions.mockResolvedValue([]);
      mockHyperliquidService.getAddress.mockResolvedValue('0x742...');

      const runtime = createMockRuntime();
      const message = createMockMessage();
      const result = await unifiedBalanceProvider.get(runtime, message, undefined as unknown as State);

      expect(result.data.solana).toBeNull();
      expect(result.data.evm).toBeDefined();
      expect(result.data.hyperliquid).toBeDefined();
      expect(result.data.portfolio.netWorth).toBeCloseTo(3000, 2);
    });

    it('should return error if all services fail', async () => {
      mockSolanaService.getTokenBalances.mockRejectedValue(new Error('Solana error'));
      mockCdpService.fetchWalletInfo.mockRejectedValue(new Error('CDP error'));
      mockHyperliquidService.getAccountInfo.mockRejectedValue(new Error('HL error'));

      const runtime = createMockRuntime();
      const message = createMockMessage();
      const result = await unifiedBalanceProvider.get(runtime, message, undefined as unknown as State);

      expect(result.text).toContain('Unable to fetch wallet information');
      expect(result.data.solana).toBeNull();
      expect(result.data.evm).toBeNull();
      expect(result.data.hyperliquid).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle service not available', async () => {
      const runtime = createMockRuntime({
        SOLANA_SERVICE: null,
        CDP_SERVICE: null,
        HYPERLIQUID_SERVICE: null,
      });

      const message = createMockMessage();
      const result = await unifiedBalanceProvider.get(runtime, message, undefined as unknown as State);

      expect(result.data.solana).toBeNull();
      expect(result.data.evm).toBeNull();
      expect(result.data.hyperliquid).toBeNull();
      expect(result.text).toContain('Unable to fetch wallet information');
    });

    it('should handle invalid user ID', async () => {
      const runtime = {
        getService: vi.fn(() => mockSolanaService),
        getEntityById: vi.fn(async () => ({
          metadata: {}, // No author_id
        })),
      } as unknown as IAgentRuntime;

      const message = createMockMessage();

      await expect(
        unifiedBalanceProvider.get(runtime, message, undefined as unknown as State)
      ).rejects.toThrow('User ID not found');
    });
  });
});
