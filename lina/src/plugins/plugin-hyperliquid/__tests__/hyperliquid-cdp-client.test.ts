import { describe, it, expect, beforeEach, mock, afterEach } from 'bun:test';

// Mock fetch globally for API calls
const mockFetch = mock((url: string, options?: RequestInit) => {
  const body = options?.body ? JSON.parse(options.body as string) : {};

  // Default responses based on request type
  if (body.type === 'clearinghouseState') {
    return Promise.resolve({
      ok: true,
      json: () =>
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
              },
            },
          ],
        }),
    });
  }

  if (body.type === 'meta') {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          universe: [
            { name: 'BTC', szDecimals: 4 },
            { name: 'ETH', szDecimals: 3 },
            { name: 'SOL', szDecimals: 2 },
          ],
        }),
    });
  }

  if (body.type === 'allMids') {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          BTC: '67500.0',
          ETH: '3400.0',
          SOL: '150.0',
        }),
    });
  }

  // Exchange endpoint (orders)
  if (body.action) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          response: {
            type: 'order',
            data: {
              statuses: [{ resting: { oid: 12345 } }],
            },
          },
        }),
    });
  }

  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  });
});

// @ts-ignore - Override global fetch
globalThis.fetch = mockFetch;

// Mock the CDP signer
const mockSignL1Action = mock(() =>
  Promise.resolve({
    r: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as const,
    s: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as const,
    v: 27,
  })
);

const mockSignUserSignedAction = mock(() =>
  Promise.resolve({
    r: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as const,
    s: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as const,
    v: 28,
  })
);

const mockGetAddress = mock(() =>
  Promise.resolve('0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00')
);

mock.module('../src/services/cdp-signer', () => ({
  CdpHyperliquidSigner: class {
    constructor(public userId: string) {}
    getAddress = mockGetAddress;
    signL1Action = mockSignL1Action;
    signUserSignedAction = mockSignUserSignedAction;
  },
}));

// Import after mocking
import { HyperliquidCdpClient } from '../src/services/hyperliquid-cdp-client';

describe('HyperliquidCdpClient', () => {
  let client: HyperliquidCdpClient;

  beforeEach(() => {
    mockFetch.mockClear();
    mockSignL1Action.mockClear();
    mockSignUserSignedAction.mockClear();
    mockGetAddress.mockClear();
  });

  describe('Initialization', () => {
    it('should construct with userId and testnet flag', () => {
      client = new HyperliquidCdpClient('user-123', true);
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(HyperliquidCdpClient);
    });

    it('should connect and retrieve wallet address', async () => {
      client = new HyperliquidCdpClient('user-123', true);
      await client.connect();

      expect(mockGetAddress).toHaveBeenCalled();
      expect(client.getAddress()).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00');
    });

    it('should throw on operations before connect()', () => {
      client = new HyperliquidCdpClient('user-123', true);

      expect(() => client.getAddress()).toThrow('Client not connected');
    });

    it('should use testnet URL when testnet=true', async () => {
      client = new HyperliquidCdpClient('user-123', true);
      await client.connect();
      await client.getMarkets();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('testnet'),
        expect.any(Object)
      );
    });

    it('should use mainnet URL when testnet=false', async () => {
      client = new HyperliquidCdpClient('user-123', false);
      await client.connect();
      await client.getMarkets();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.hyperliquid.xyz'),
        expect.any(Object)
      );
    });
  });

  describe('Read Operations', () => {
    beforeEach(async () => {
      client = new HyperliquidCdpClient('user-123', true);
      await client.connect();
    });

    it('should fetch account state from API', async () => {
      const state = await client.getAccountState();

      expect(state).toHaveProperty('marginSummary');
      expect(state.marginSummary.accountValue).toBe('10000');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('clearinghouseState'),
        })
      );
    });

    it('should fetch markets from API', async () => {
      const markets = await client.getMarkets();

      expect(markets).toBeArray();
      expect(markets.length).toBe(3);
      expect(markets[0]).toEqual({ name: 'BTC', szDecimals: 4 });
    });

    it('should fetch all mid prices', async () => {
      const prices = await client.getMidPrices();

      expect(prices).toHaveProperty('BTC');
      expect(prices.BTC).toBe('67500.0');
    });
  });

  describe('Symbol Conversion', () => {
    beforeEach(async () => {
      client = new HyperliquidCdpClient('user-123', true);
      await client.connect();
    });

    it('should convert symbol to asset index', async () => {
      const index = await client.getAssetIndex('BTC');
      expect(index).toBe(0);
    });

    it('should cache asset indices', async () => {
      await client.getAssetIndex('BTC');
      await client.getAssetIndex('BTC');

      // Markets should only be fetched once (cached)
      const metaCalls = mockFetch.mock.calls.filter(
        (call) => call[1]?.body && JSON.parse(call[1].body as string).type === 'meta'
      );
      expect(metaCalls.length).toBe(1);
    });

    it('should throw for unknown symbol', async () => {
      await expect(client.getAssetIndex('UNKNOWN')).rejects.toThrow('Unknown asset');
    });
  });

  describe('Order Operations', () => {
    beforeEach(async () => {
      client = new HyperliquidCdpClient('user-123', true);
      await client.connect();
    });

    it('should place market order with CDP signature', async () => {
      const result = await client.placeOrder({
        coin: 'BTC',
        is_buy: true,
        sz: '0.1',
        limit_px: '67500',
        order_type: { limit: { tif: 'Ioc' } },
        reduce_only: false,
      });

      expect(result.status).toBe('ok');
      expect(mockSignL1Action).toHaveBeenCalled();

      // Verify the action structure
      const signCall = mockSignL1Action.mock.calls[0];
      expect(signCall[0]).toHaveProperty('type', 'order');
    });

    it('should place limit order with CDP signature', async () => {
      const result = await client.placeOrder({
        coin: 'ETH',
        is_buy: false,
        sz: '1.0',
        limit_px: '3500',
        order_type: { limit: { tif: 'Gtc' } },
        reduce_only: false,
      });

      expect(result.status).toBe('ok');
      expect(mockSignL1Action).toHaveBeenCalled();
    });

    it('should update leverage with CDP signature', async () => {
      const result = await client.updateLeverage('BTC', 'cross', 10);

      expect(result.status).toBe('ok');
      expect(mockSignL1Action).toHaveBeenCalled();

      const signCall = mockSignL1Action.mock.calls[0];
      expect(signCall[0]).toHaveProperty('type', 'updateLeverage');
      expect(signCall[0]).toHaveProperty('leverage', 10);
    });

    it('should cancel order with CDP signature', async () => {
      const result = await client.cancelOrder('BTC', 12345);

      expect(result.status).toBe('ok');
      expect(mockSignL1Action).toHaveBeenCalled();

      const signCall = mockSignL1Action.mock.calls[0];
      expect(signCall[0]).toHaveProperty('type', 'cancel');
    });
  });

  describe('Nonce Management', () => {
    beforeEach(async () => {
      client = new HyperliquidCdpClient('user-123', true);
      await client.connect();
    });

    it('should generate unique incrementing nonces', async () => {
      const nonces: number[] = [];

      // Make multiple rapid requests
      for (let i = 0; i < 5; i++) {
        await client.placeOrder({
          coin: 'BTC',
          is_buy: true,
          sz: '0.1',
          limit_px: '67500',
          order_type: { limit: { tif: 'Ioc' } },
          reduce_only: false,
        });

        // Extract nonce from the fetch call
        const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
        const body = JSON.parse(lastCall[1]?.body as string);
        nonces.push(body.nonce);
      }

      // Verify nonces are strictly increasing
      for (let i = 1; i < nonces.length; i++) {
        expect(nonces[i]).toBeGreaterThan(nonces[i - 1]);
      }
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      client = new HyperliquidCdpClient('user-123', true);
      await client.connect();
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

      await expect(client.getMarkets()).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getMarkets()).rejects.toThrow('Network error');
    });

    it('should handle signing errors', async () => {
      mockSignL1Action.mockRejectedValueOnce(new Error('Signing failed'));

      await expect(
        client.placeOrder({
          coin: 'BTC',
          is_buy: true,
          sz: '0.1',
          limit_px: '67500',
          order_type: { limit: { tif: 'Ioc' } },
          reduce_only: false,
        })
      ).rejects.toThrow('Signing failed');
    });
  });

  describe('Mainnet vs Testnet', () => {
    it('should sign with isMainnet=true for mainnet client', async () => {
      client = new HyperliquidCdpClient('user-123', false); // false = mainnet
      await client.connect();

      await client.placeOrder({
        coin: 'BTC',
        is_buy: true,
        sz: '0.1',
        limit_px: '67500',
        order_type: { limit: { tif: 'Ioc' } },
        reduce_only: false,
      });

      // Fourth argument to signL1Action is isMainnet
      const signCall = mockSignL1Action.mock.calls[0];
      expect(signCall[3]).toBe(true); // isMainnet should be true
    });

    it('should sign with isMainnet=false for testnet client', async () => {
      client = new HyperliquidCdpClient('user-123', true); // true = testnet
      await client.connect();

      await client.placeOrder({
        coin: 'BTC',
        is_buy: true,
        sz: '0.1',
        limit_px: '67500',
        order_type: { limit: { tif: 'Ioc' } },
        reduce_only: false,
      });

      const signCall = mockSignL1Action.mock.calls[0];
      expect(signCall[3]).toBe(false); // isMainnet should be false (testnet)
    });
  });
});
