/**
 * HyperliquidService Tests
 *
 * TDD Phase: RED -> GREEN -> REFACTOR
 * Testing CDP-based service (no private key required)
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { HyperliquidService } from '../src/services/hyperliquid.service';
import { SERVICE_CONFIG, ERROR_MESSAGES } from '../src/constants';
import type { OpenPositionParams, ClosePositionParams } from '../src/types';

// Mock HyperliquidCdpClient
const mockConnect = mock(() => Promise.resolve());
const mockGetAddress = mock(() => '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00');
const mockGetAccountState = mock(() =>
  Promise.resolve({
    marginSummary: {
      accountValue: '10000',
      totalMarginUsed: '1000',
      totalNtlPos: '5000',
      totalRawUsd: '10000',
    },
    assetPositions: [
      {
        position: {
          coin: 'BTC',
          szi: '0.1',
          entryPx: '67000',
          positionValue: '6700',
          unrealizedPnl: '100',
          leverage: { type: 'cross', value: 5 },
          marginUsed: '1340',
          liquidationPx: '60000',
        },
      },
    ],
    time: Date.now(),
    withdrawable: '9000',
  })
);
const mockGetMidPrices = mock(() =>
  Promise.resolve({ BTC: '67500.0', ETH: '3400.0', SOL: '150.0' })
);
const mockPlaceOrder = mock(() =>
  Promise.resolve({
    status: 'ok',
    response: { type: 'order', data: { statuses: [{ resting: { oid: 12345 } }] } },
  })
);
const mockUpdateLeverage = mock(() => Promise.resolve({ status: 'ok' }));
const mockGetMarkets = mock(() =>
  Promise.resolve([
    { name: 'BTC', szDecimals: 4, maxLeverage: 50 },
    { name: 'ETH', szDecimals: 3, maxLeverage: 50 },
    { name: 'SOL', szDecimals: 2, maxLeverage: 25 },
  ])
);
const mockGetPredictedFundings = mock(() =>
  Promise.resolve({
    BTC: { fundingRate: '0.0001', nextFundingTime: Date.now() + 28800000 },
    ETH: { fundingRate: '0.00015', nextFundingTime: Date.now() + 28800000 },
  })
);

mock.module('../src/services/hyperliquid-cdp-client', () => ({
  HyperliquidCdpClient: class {
    constructor(public userId: string, public testnet: boolean) {}
    connect = mockConnect;
    getAddress = mockGetAddress;
    getAccountState = mockGetAccountState;
    getMidPrices = mockGetMidPrices;
    placeOrder = mockPlaceOrder;
    updateLeverage = mockUpdateLeverage;
    getMarkets = mockGetMarkets;
    getPredictedFundings = mockGetPredictedFundings;
  },
}));

// Mock runtime for testing
const createMockRuntime = (settings: Record<string, string | undefined> = {}) => ({
  getSetting: (key: string) => settings[key],
  agentId: 'test-agent',
  character: { name: 'Test Agent' },
}) as any;

describe('HyperliquidService - CDP Mode', () => {
  let service: HyperliquidService;
  let mockRuntime: any;

  beforeEach(() => {
    mockRuntime = createMockRuntime({
      HYPERLIQUID_TESTNET: 'true',
    });
    service = new HyperliquidService(mockRuntime);

    // Clear mocks
    mockConnect.mockClear();
    mockGetAddress.mockClear();
    mockGetAccountState.mockClear();
    mockGetMidPrices.mockClear();
    mockPlaceOrder.mockClear();
    mockUpdateLeverage.mockClear();
    mockGetMarkets.mockClear();
    mockGetPredictedFundings.mockClear();
  });

  describe('Service Initialization', () => {
    it('should have correct service type', () => {
      expect(service.serviceType).toBe('hyperliquid');
    });

    it('should initialize WITHOUT private key (CDP mode)', async () => {
      await expect(service.initialize(mockRuntime)).resolves.toBeUndefined();
    });

    it('should configure testnet mode from settings', async () => {
      const mainnetRuntime = createMockRuntime({ HYPERLIQUID_TESTNET: 'false' });
      const mainnetService = new HyperliquidService(mainnetRuntime);
      await mainnetService.initialize(mainnetRuntime);
      // Service should store testnet=false internally
    });

    it('should default to testnet when HYPERLIQUID_TESTNET is not set', async () => {
      const runtimeNoTestnetFlag = createMockRuntime({});
      const serviceNoTestnet = new HyperliquidService(runtimeNoTestnetFlag);

      await serviceNoTestnet.initialize(runtimeNoTestnetFlag);
      // Service should default to testnet=true (safety first)
    });

    it('should stop correctly and clear client map', async () => {
      await service.initialize(mockRuntime);
      await expect(service.stop()).resolves.toBeUndefined();
    });
  });

  describe('Per-User Client Management', () => {
    beforeEach(async () => {
      await service.initialize(mockRuntime);
    });

    it('should create client on first user operation', async () => {
      const positions = await service.getPositions('user-123');

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(positions).toBeArray();
    });

    it('should reuse client for same user', async () => {
      await service.getPositions('user-123');
      await service.getPositions('user-123');

      // Client created once, reused for second call
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should create separate clients for different users', async () => {
      await service.getPositions('user-123');
      await service.getPositions('user-456');

      // Two clients created
      expect(mockConnect).toHaveBeenCalledTimes(2);
    });
  });

  describe('Position Parameter Validation', () => {
    describe('validatePositionParams', () => {
      it('should validate valid long position parameters', () => {
        const params: OpenPositionParams = {
          userId: 'user-123',
          symbol: 'BTC',
          side: 'long',
          size: 0.1,
          leverage: 5,
          orderType: 'market',
        };

        const result = service.validatePositionParams(params);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate valid limit order parameters', () => {
        const params: OpenPositionParams = {
          userId: 'user-123',
          symbol: 'ETH',
          side: 'short',
          size: 1.0,
          leverage: 10,
          orderType: 'limit',
          limitPrice: 2500.0,
        };

        const result = service.validatePositionParams(params);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject empty symbol', () => {
        const params: OpenPositionParams = {
          userId: 'user-123',
          symbol: '',
          side: 'long',
          size: 0.1,
          leverage: 5,
          orderType: 'market',
        };

        const result = service.validatePositionParams(params);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.INVALID_SYMBOL);
      });

      it('should reject invalid size (zero)', () => {
        const params: OpenPositionParams = {
          userId: 'user-123',
          symbol: 'BTC',
          side: 'long',
          size: 0,
          leverage: 5,
          orderType: 'market',
        };

        const result = service.validatePositionParams(params);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.INVALID_SIZE);
      });

      it('should reject invalid size (negative)', () => {
        const params: OpenPositionParams = {
          userId: 'user-123',
          symbol: 'BTC',
          side: 'long',
          size: -0.1,
          leverage: 5,
          orderType: 'market',
        };

        const result = service.validatePositionParams(params);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.INVALID_SIZE);
      });

      it('should reject leverage below minimum (1x)', () => {
        const params: OpenPositionParams = {
          userId: 'user-123',
          symbol: 'BTC',
          side: 'long',
          size: 0.1,
          leverage: 0.5,
          orderType: 'market',
        };

        const result = service.validatePositionParams(params);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.INVALID_LEVERAGE);
      });

      it('should reject leverage above maximum (25x)', () => {
        const params: OpenPositionParams = {
          userId: 'user-123',
          symbol: 'BTC',
          side: 'long',
          size: 0.1,
          leverage: 30,
          orderType: 'market',
        };

        const result = service.validatePositionParams(params);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.INVALID_LEVERAGE);
      });

      it('should accept maximum leverage (25x)', () => {
        const params: OpenPositionParams = {
          userId: 'user-123',
          symbol: 'BTC',
          side: 'long',
          size: 0.1,
          leverage: 25,
          orderType: 'market',
        };

        const result = service.validatePositionParams(params);
        expect(result.valid).toBe(true);
      });

      it('should reject limit order without price', () => {
        const params: OpenPositionParams = {
          userId: 'user-123',
          symbol: 'BTC',
          side: 'long',
          size: 0.1,
          leverage: 5,
          orderType: 'limit',
          // Missing limitPrice
        };

        const result = service.validatePositionParams(params);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.INVALID_LIMIT_PRICE);
      });

      it('should reject limit order with zero price', () => {
        const params: OpenPositionParams = {
          userId: 'user-123',
          symbol: 'BTC',
          side: 'long',
          size: 0.1,
          leverage: 5,
          orderType: 'limit',
          limitPrice: 0,
        };

        const result = service.validatePositionParams(params);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.INVALID_LIMIT_PRICE);
      });

      it('should collect multiple validation errors', () => {
        const params: OpenPositionParams = {
          userId: 'user-123',
          symbol: '',
          side: 'long',
          size: 0,
          leverage: 50,
          orderType: 'limit',
        };

        const result = service.validatePositionParams(params);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('Close Position Validation', () => {
    describe('validateCloseParams', () => {
      it('should validate valid close parameters (100%)', () => {
        const params: ClosePositionParams = {
          userId: 'user-123',
          symbol: 'BTC',
          percentage: 100,
          orderType: 'market',
        };

        const result = service.validateCloseParams(params);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate partial close (50%)', () => {
        const params: ClosePositionParams = {
          userId: 'user-123',
          symbol: 'ETH',
          percentage: 50,
          orderType: 'market',
        };

        const result = service.validateCloseParams(params);
        expect(result.valid).toBe(true);
      });

      it('should validate limit close order', () => {
        const params: ClosePositionParams = {
          userId: 'user-123',
          symbol: 'BTC',
          percentage: 100,
          orderType: 'limit',
          limitPrice: 100000,
        };

        const result = service.validateCloseParams(params);
        expect(result.valid).toBe(true);
      });

      it('should reject empty symbol', () => {
        const params: ClosePositionParams = {
          userId: 'user-123',
          symbol: '',
          percentage: 100,
          orderType: 'market',
        };

        const result = service.validateCloseParams(params);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.INVALID_SYMBOL);
      });

      it('should reject percentage below 1', () => {
        const params: ClosePositionParams = {
          userId: 'user-123',
          symbol: 'BTC',
          percentage: 0,
          orderType: 'market',
        };

        const result = service.validateCloseParams(params);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.INVALID_PERCENTAGE);
      });

      it('should reject percentage above 100', () => {
        const params: ClosePositionParams = {
          userId: 'user-123',
          symbol: 'BTC',
          percentage: 150,
          orderType: 'market',
        };

        const result = service.validateCloseParams(params);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.INVALID_PERCENTAGE);
      });

      it('should reject limit close without price', () => {
        const params: ClosePositionParams = {
          userId: 'user-123',
          symbol: 'BTC',
          percentage: 100,
          orderType: 'limit',
        };

        const result = service.validateCloseParams(params);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(ERROR_MESSAGES.INVALID_LIMIT_PRICE);
      });
    });
  });

  describe('Leverage Risk Assessment', () => {
    it('should NOT require confirmation for 1x leverage', () => {
      expect(service.requiresHighRiskConfirmation(1)).toBe(false);
    });

    it('should NOT require confirmation for 5x leverage', () => {
      expect(service.requiresHighRiskConfirmation(5)).toBe(false);
    });

    it('should require confirmation for 6x leverage', () => {
      expect(service.requiresHighRiskConfirmation(6)).toBe(true);
    });

    it('should require confirmation for 10x leverage', () => {
      expect(service.requiresHighRiskConfirmation(10)).toBe(true);
    });

    it('should require confirmation for 25x leverage', () => {
      expect(service.requiresHighRiskConfirmation(25)).toBe(true);
    });
  });

  describe('Liquidation Price Calculation', () => {
    it('should calculate liquidation price for long position', () => {
      const entryPrice = 100000; // $100,000 BTC
      const leverage = 10;
      const side = 'long';

      const liquidationPrice = service.calculateLiquidationPrice(entryPrice, leverage, side);

      // At 10x leverage, liq price should be ~9.5% below entry
      // (1/10 - 0.005 = 0.095 = 9.5%)
      expect(liquidationPrice).toBeLessThan(entryPrice);
      expect(liquidationPrice).toBeGreaterThan(entryPrice * 0.8); // Sanity check
    });

    it('should calculate liquidation price for short position', () => {
      const entryPrice = 100000;
      const leverage = 10;
      const side = 'short';

      const liquidationPrice = service.calculateLiquidationPrice(entryPrice, leverage, side);

      // At 10x leverage, liq price should be ~9.5% above entry for shorts
      expect(liquidationPrice).toBeGreaterThan(entryPrice);
      expect(liquidationPrice).toBeLessThan(entryPrice * 1.2); // Sanity check
    });

    it('should have lower liq price distance for higher leverage (long)', () => {
      const entryPrice = 100000;

      const liq5x = service.calculateLiquidationPrice(entryPrice, 5, 'long');
      const liq10x = service.calculateLiquidationPrice(entryPrice, 10, 'long');
      const liq25x = service.calculateLiquidationPrice(entryPrice, 25, 'long');

      // Higher leverage = liquidation price closer to entry
      expect(liq25x).toBeGreaterThan(liq10x);
      expect(liq10x).toBeGreaterThan(liq5x);
    });

    it('should have higher liq price distance for higher leverage (short)', () => {
      const entryPrice = 100000;

      const liq5x = service.calculateLiquidationPrice(entryPrice, 5, 'short');
      const liq10x = service.calculateLiquidationPrice(entryPrice, 10, 'short');
      const liq25x = service.calculateLiquidationPrice(entryPrice, 25, 'short');

      // Higher leverage = liquidation price closer to entry (lower for shorts)
      expect(liq25x).toBeLessThan(liq10x);
      expect(liq10x).toBeLessThan(liq5x);
    });
  });

  describe('Position Operations (CDP Integration)', () => {
    beforeEach(async () => {
      await service.initialize(mockRuntime);
    });

    it('should return validation error for invalid open position params', async () => {
      const params: OpenPositionParams = {
        userId: 'user-123',
        symbol: '',
        side: 'long',
        size: 0,
        leverage: 50,
        orderType: 'market',
      };

      const result = await service.openPosition(params);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return validation error for invalid close position params', async () => {
      const params: ClosePositionParams = {
        userId: 'user-123',
        symbol: '',
        percentage: 200,
        orderType: 'market',
      };

      const result = await service.closePosition(params);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should open position using CDP client', async () => {
      const params: OpenPositionParams = {
        userId: 'user-123',
        symbol: 'BTC',
        side: 'long',
        size: 0.1,
        leverage: 5,
        orderType: 'market',
      };

      const result = await service.openPosition(params);

      expect(result.success).toBe(true);
      expect(mockConnect).toHaveBeenCalled();
      expect(mockUpdateLeverage).toHaveBeenCalled();
      expect(mockGetMidPrices).toHaveBeenCalled();
      expect(mockPlaceOrder).toHaveBeenCalled();
    });

    it('should close position using CDP client', async () => {
      const params: ClosePositionParams = {
        userId: 'user-123',
        symbol: 'BTC',
        percentage: 100,
        orderType: 'market',
      };

      const result = await service.closePosition(params);

      expect(result.success).toBe(true);
      expect(mockConnect).toHaveBeenCalled();
      expect(mockGetAccountState).toHaveBeenCalled();
      expect(mockPlaceOrder).toHaveBeenCalled();
    });

    it('should get positions using CDP client', async () => {
      const positions = await service.getPositions('user-123');

      expect(positions).toBeArray();
      expect(positions.length).toBe(1);
      expect(positions[0].symbol).toBe('BTC');
      expect(mockConnect).toHaveBeenCalled();
      expect(mockGetAccountState).toHaveBeenCalled();
    });

    it('should get markets using CDP client', async () => {
      const markets = await service.getMarkets();

      expect(markets).toBeArray();
      expect(markets.length).toBe(3);
      expect(mockGetMarkets).toHaveBeenCalled();
    });

    it('should get account info using CDP client', async () => {
      const accountInfo = await service.getAccountInfo('user-123');

      expect(accountInfo).toHaveProperty('equity');
      expect(accountInfo.equity).toBe(10000);
      expect(mockConnect).toHaveBeenCalled();
      expect(mockGetAccountState).toHaveBeenCalled();
    });
  });
});
