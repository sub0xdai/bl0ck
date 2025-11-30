/**
 * Hyperliquid CDP Client
 *
 * Custom Hyperliquid client that uses CDP wallet signing instead of a private key.
 * Mirrors the essential functionality of the official Hyperliquid SDK's ExchangeAPI
 * while using the CdpHyperliquidSigner for EIP-712 signatures.
 */

import { CdpHyperliquidSigner, type Signature } from './cdp-signer';
import {
  removeTrailingZeros,
  floatToWire,
  ORDER_GROUPING,
} from '../utils/wire-format';

// ============================================================================
// Constants
// ============================================================================

const HYPERLIQUID_API = {
  mainnet: 'https://api.hyperliquid.xyz',
  testnet: 'https://api.hyperliquid-testnet.xyz',
} as const;

const ENDPOINTS = {
  INFO: '/info',
  EXCHANGE: '/exchange',
} as const;

// Exchange action types (from Hyperliquid SDK)
const ExchangeType = {
  ORDER: 'order',
  CANCEL: 'cancel',
  UPDATE_LEVERAGE: 'updateLeverage',
  UPDATE_ISOLATED_MARGIN: 'updateIsolatedMargin',
} as const;

// ============================================================================
// Types
// ============================================================================

export interface OrderRequest {
  coin: string;
  is_buy: boolean;
  sz: string;
  limit_px: string;
  order_type: OrderType;
  reduce_only: boolean;
  cloid?: string;
}

export interface OrderType {
  limit?: { tif: 'Gtc' | 'Ioc' | 'Alo' };
  trigger?: {
    isMarket: boolean;
    triggerPx: string;
    tpsl: 'tp' | 'sl';
  };
}

interface OrderWire {
  a: number; // asset index
  b: boolean; // is_buy
  p: string; // price
  s: string; // size
  r: boolean; // reduce_only
  t: OrderType;
  c?: string; // cloid
}

export interface Market {
  name: string;
  szDecimals: number;
}

export interface AccountState {
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  assetPositions: Array<{
    position: {
      coin: string;
      szi: string;
      entryPx: string;
      positionValue: string;
      unrealizedPnl: string;
      leverage: { type: string; value: number };
    };
  }>;
}

export interface OrderResponse {
  status: string;
  response?: {
    type: string;
    data: {
      statuses: Array<{ resting?: { oid: number }; filled?: { oid: number } }>;
    };
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert order request to wire format.
 */
function orderToWire(order: OrderRequest, assetIndex: number): OrderWire {
  const orderWire: OrderWire = {
    a: assetIndex,
    b: order.is_buy,
    p:
      typeof order.limit_px === 'string'
        ? removeTrailingZeros(order.limit_px)
        : floatToWire(parseFloat(order.limit_px)),
    s:
      typeof order.sz === 'string'
        ? removeTrailingZeros(order.sz)
        : floatToWire(parseFloat(order.sz)),
    r: order.reduce_only,
    t: order.order_type,
  };

  if (order.cloid !== undefined) {
    orderWire.c = order.cloid;
  }

  return orderWire;
}

/**
 * Convert order wires to action format.
 */
function orderWireToAction(
  orders: OrderWire[],
  grouping: string = ORDER_GROUPING.NOT_APPLICABLE
): unknown {
  return {
    type: ExchangeType.ORDER,
    orders,
    grouping,
  };
}

// ============================================================================
// HyperliquidCdpClient Class
// ============================================================================

/**
 * Hyperliquid client using CDP wallet for signing.
 * Provides core trading functionality without requiring a private key.
 */
export class HyperliquidCdpClient {
  private signer: CdpHyperliquidSigner;
  private baseUrl: string;
  private isMainnet: boolean;
  private walletAddress: string | null = null;
  private connected: boolean = false;

  // Caches
  private assetIndexCache: Map<string, number> = new Map();
  private marketsCache: Market[] | null = null;

  // Nonce management
  private lastNonceTimestamp: number = 0;

  constructor(userId: string, testnet: boolean = true) {
    this.signer = new CdpHyperliquidSigner(userId);
    this.baseUrl = testnet ? HYPERLIQUID_API.testnet : HYPERLIQUID_API.mainnet;
    this.isMainnet = !testnet;
  }

  /**
   * Connect to Hyperliquid and retrieve wallet address.
   * Must be called before any operations.
   */
  async connect(): Promise<void> {
    this.walletAddress = await this.signer.getAddress();
    this.connected = true;
  }

  /**
   * Get the connected wallet address.
   * @throws Error if not connected
   */
  getAddress(): string {
    if (!this.connected || !this.walletAddress) {
      throw new Error('Client not connected. Call connect() first.');
    }
    return this.walletAddress;
  }

  // ==========================================================================
  // Read Operations (no signing required)
  // ==========================================================================

  /**
   * Get account state including positions and margin.
   */
  async getAccountState(): Promise<AccountState> {
    this.ensureConnected();
    return this.makeInfoRequest({
      type: 'clearinghouseState',
      user: this.walletAddress,
    });
  }

  /**
   * Get available markets.
   */
  async getMarkets(): Promise<Market[]> {
    if (this.marketsCache) {
      return this.marketsCache;
    }

    const response = await this.makeInfoRequest({ type: 'meta' });
    this.marketsCache = response.universe;

    // Build asset index cache
    this.marketsCache.forEach((market: Market, index: number) => {
      this.assetIndexCache.set(market.name, index);
    });

    return this.marketsCache;
  }

  /**
   * Get mid prices for all assets.
   */
  async getMidPrices(): Promise<Record<string, string>> {
    return this.makeInfoRequest({ type: 'allMids' });
  }

  /**
   * Get asset index for a symbol.
   * @throws Error if symbol not found
   */
  async getAssetIndex(symbol: string): Promise<number> {
    // Check cache first
    if (this.assetIndexCache.has(symbol)) {
      return this.assetIndexCache.get(symbol)!;
    }

    // Fetch markets to populate cache
    await this.getMarkets();

    const index = this.assetIndexCache.get(symbol);
    if (index === undefined) {
      throw new Error(`Unknown asset: ${symbol}`);
    }

    return index;
  }

  // ==========================================================================
  // Write Operations (requires CDP signing)
  // ==========================================================================

  /**
   * Place an order.
   */
  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    this.ensureConnected();

    const assetIndex = await this.getAssetIndex(order.coin);
    const orderWire = orderToWire(order, assetIndex);
    const action = orderWireToAction([orderWire]);

    const nonce = this.generateUniqueNonce();
    const signature = await this.signer.signL1Action(action, null, nonce, this.isMainnet);

    return this.makeExchangeRequest({
      action,
      nonce,
      signature,
      vaultAddress: null,
    });
  }

  /**
   * Cancel an order by order ID.
   */
  async cancelOrder(symbol: string, oid: number): Promise<OrderResponse> {
    this.ensureConnected();

    const assetIndex = await this.getAssetIndex(symbol);

    const action = {
      type: ExchangeType.CANCEL,
      cancels: [{ a: assetIndex, o: oid }],
    };

    const nonce = this.generateUniqueNonce();
    const signature = await this.signer.signL1Action(action, null, nonce, this.isMainnet);

    return this.makeExchangeRequest({
      action,
      nonce,
      signature,
      vaultAddress: null,
    });
  }

  /**
   * Update leverage for a symbol.
   */
  async updateLeverage(
    symbol: string,
    leverageMode: 'cross' | 'isolated',
    leverage: number
  ): Promise<OrderResponse> {
    this.ensureConnected();

    const assetIndex = await this.getAssetIndex(symbol);

    const action = {
      type: ExchangeType.UPDATE_LEVERAGE,
      asset: assetIndex,
      isCross: leverageMode === 'cross',
      leverage,
    };

    const nonce = this.generateUniqueNonce();
    const signature = await this.signer.signL1Action(action, null, nonce, this.isMainnet);

    return this.makeExchangeRequest({
      action,
      nonce,
      signature,
      vaultAddress: null,
    });
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Ensure the client is connected before operations.
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Client not connected. Call connect() first.');
    }
  }

  /**
   * Generate a unique nonce (timestamp-based with collision handling).
   */
  private generateUniqueNonce(): number {
    const timestamp = Date.now();

    if (timestamp <= this.lastNonceTimestamp) {
      this.lastNonceTimestamp += 1;
      return this.lastNonceTimestamp;
    }

    this.lastNonceTimestamp = timestamp;
    return timestamp;
  }

  /**
   * Make a request to the info endpoint.
   */
  private async makeInfoRequest<T>(body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${ENDPOINTS.INFO}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Make a request to the exchange endpoint.
   */
  private async makeExchangeRequest(payload: {
    action: unknown;
    nonce: number;
    signature: Signature;
    vaultAddress: string | null;
  }): Promise<OrderResponse> {
    const response = await fetch(`${this.baseUrl}${ENDPOINTS.EXCHANGE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status}`);
    }

    return response.json();
  }
}
