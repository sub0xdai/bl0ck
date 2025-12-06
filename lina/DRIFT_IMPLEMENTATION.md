# Drift Protocol Integration - Solana Perpetuals

**Goal:** Enable Lina to trade perpetuals on Solana via Drift Protocol
**Scenario:** User says "Open a 5x long on SOL with $100 on Drift" → it works

---

## Executive Summary

| Metric | Status |
|--------|--------|
| Architecture | ✅ Sound - follows Hyperliquid patterns |
| Risk Level | MODERATE - SDK mature, integration points clear |
| Timeline | 5-6 days (with auto-collateral + TDD) |

**Critical Path:**
```
SolanaTransactionManager.getOrCreateWallet(userId)
        ↓
   DriftClient (wrap @drift-labs/sdk)
        ↓
   JupiterService (auto SOL→USDC if needed)
        ↓
   Trade executes
```

**Dual-Chain Perps System:**
- **Solana funds → Drift Protocol** (this integration)
- **EVM funds → Hyperliquid** (already complete, 78 tests)

---

## Why Drift?

| Feature | Drift | Jupiter Perps |
|---------|-------|---------------|
| Markets | 30+ (BTC, ETH, SOL, DOGE, WIF, JUP, BONK, etc.) | ~10 |
| Max Leverage | 20x | 100x |
| Liquidity | Highest on Solana | Growing |
| Track Record | 2+ years, battle-tested | New (2024) |
| SDK | Mature `@drift-labs/sdk` | Newer |
| Cross-margin | Yes | No |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER REQUEST                            │
│              "Open a 5x long on SOL with $100"                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WALLET ROUTER                                │
│  Check balances:                                                │
│  - Solana: 2 SOL ($300) ✓ → Route to DRIFT                     │
│  - EVM: $0              → Skip Hyperliquid                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DRIFT SERVICE                                │
│  1. Check USDC collateral (auto-swap SOL→USDC if needed)       │
│  2. Initialize Drift client for user                           │
│  3. Deposit USDC as collateral                                  │
│  4. Open perp position (SOL-PERP, 5x long)                     │
│  5. Return position details                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation (Day 1)

### 1.1 Plugin Structure

```
src/plugins/plugin-drift/
├── package.json
├── tsconfig.json
├── build.ts
├── src/
│   ├── index.ts                    # Plugin export
│   ├── types.ts                    # TypeScript interfaces
│   ├── constants.ts                # Markets, config
│   ├── services/
│   │   └── drift.service.ts        # Core Drift integration
│   ├── actions/
│   │   ├── drift-open-long.ts      # DRIFT_OPEN_LONG
│   │   ├── drift-open-short.ts     # DRIFT_OPEN_SHORT
│   │   ├── drift-close-position.ts # DRIFT_CLOSE_POSITION
│   │   ├── drift-get-positions.ts  # DRIFT_GET_POSITIONS
│   │   ├── drift-get-markets.ts    # DRIFT_GET_MARKETS
│   │   ├── drift-account-info.ts   # DRIFT_ACCOUNT_INFO
│   │   └── drift-deposit.ts        # DRIFT_DEPOSIT (collateral)
│   └── utils/
│       ├── action-factory.ts       # Port from Hyperliquid
│       └── formatters.ts           # Response formatters
└── __tests__/
    ├── drift.service.test.ts       # Service unit tests
    ├── drift-client.test.ts        # Client lifecycle
    ├── actions.test.ts             # Action validation
    ├── formatters.test.ts          # Display utilities
    ├── integration.test.ts         # E2E flows
    ├── collateral.test.ts          # Auto-provision logic
    ├── markets.test.ts             # Market index handling
    └── error-handling.test.ts      # Failure cases
```

### 1.2 Package.json

```json
{
  "name": "plugin-drift",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "bun run build.ts",
    "test": "bun test"
  },
  "dependencies": {
    "@drift-labs/sdk": "2.90.0",
    "@coral-xyz/anchor": "^0.29.0",
    "@solana/web3.js": "^1.95.0"
  }
}
```

> **Note:** Pin `@drift-labs/sdk` to exact version (no caret) until tested.

### 1.3 Types

```typescript
// src/plugins/plugin-drift/src/types.ts

export interface DriftPosition {
  marketIndex: number;
  marketSymbol: string;           // 'SOL-PERP', 'BTC-PERP'
  side: 'long' | 'short';
  size: string;                   // Base asset amount
  notionalValue: string;          // USD value
  entryPrice: string;
  markPrice: string;
  liquidationPrice: string;
  unrealizedPnl: string;
  leverage: number;
  marginUsed: string;
}

export interface DriftMarket {
  marketIndex: number;
  symbol: string;                 // 'SOL-PERP'
  baseAsset: string;              // 'SOL'
  price: string;
  volume24h: string;
  openInterest: string;
  fundingRate: string;            // Current funding rate
  maxLeverage: number;
}

export interface DriftAccountInfo {
  authority: string;              // User's Solana pubkey
  subAccountId: number;
  collateral: string;             // Total collateral (USDC)
  freeCollateral: string;         // Available for new positions
  totalPositionValue: string;
  unrealizedPnl: string;
  marginRatio: string;            // Current margin ratio
  leverage: number;               // Account-level leverage
}

export interface OpenPositionParams {
  marketSymbol: string;           // 'SOL-PERP', 'BTC-PERP'
  side: 'long' | 'short';
  size: number;                   // In USD
  leverage?: number;              // Default 1x, max 20x
  orderType?: 'market' | 'limit';
  limitPrice?: number;            // For limit orders
  reduceOnly?: boolean;
}

export interface ClosePositionParams {
  marketSymbol: string;
  percentage?: number;            // 1-100, default 100 (full close)
}

export interface PositionResult {
  success: boolean;
  position?: DriftPosition;
  txSignature?: string;
  error?: string;
}
```

### 1.4 Constants (with Devnet/Mainnet Split)

```typescript
// src/plugins/plugin-drift/src/constants.ts

export const DRIFT_PROGRAM_ID = 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH';

export const SERVICE_NAME = 'DRIFT_SERVICE';

// CRITICAL: Devnet has different/fewer markets than mainnet
export const DEVNET_MARKETS = {
  'SOL-PERP': 0,
  'BTC-PERP': 1,
  'ETH-PERP': 2,
} as const;

export const MAINNET_MARKETS = {
  'SOL-PERP': 0,
  'BTC-PERP': 1,
  'ETH-PERP': 2,
  'APT-PERP': 3,
  'ARB-PERP': 4,
  '1MBONK-PERP': 5,
  'MATIC-PERP': 6,
  'OP-PERP': 7,
  'DOGE-PERP': 8,
  'SUI-PERP': 9,
  'AVAX-PERP': 10,
  'WIF-PERP': 11,
  'JUP-PERP': 12,
  'JTO-PERP': 13,
  'PYTH-PERP': 14,
  'RNDR-PERP': 15,
  'INJ-PERP': 16,
  'LINK-PERP': 17,
  'PEPE-PERP': 18,
  // ... more markets
} as const;

export const CONFIG = {
  MAX_LEVERAGE: 20,
  DEFAULT_LEVERAGE: 1,
  DEFAULT_SLIPPAGE: 0.5,         // 0.5%
  MIN_COLLATERAL: 10,            // $10 minimum
  SUBACCOUNT_ID: 0,              // Default subaccount
  MIN_SOL_FOR_INIT: 0.02,        // SOL needed for account init
};

export const ACTION_NAMES = {
  DRIFT_OPEN_LONG: 'DRIFT_OPEN_LONG',
  DRIFT_OPEN_SHORT: 'DRIFT_OPEN_SHORT',
  DRIFT_CLOSE_POSITION: 'DRIFT_CLOSE_POSITION',
  DRIFT_GET_POSITIONS: 'DRIFT_GET_POSITIONS',
  DRIFT_GET_MARKETS: 'DRIFT_GET_MARKETS',
  DRIFT_ACCOUNT_INFO: 'DRIFT_ACCOUNT_INFO',
  DRIFT_DEPOSIT: 'DRIFT_DEPOSIT',
};

// Mint addresses for auto-collateral
export const MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};
```

---

## Phase 2: Core Service (Days 2-3)

### 2.1 Write Tests FIRST (TDD)

```typescript
// __tests__/drift.service.test.ts

describe('DriftService', () => {
  describe('Initialization', () => {
    it('initializes with correct network');
    it('connects to devnet when SOLANA_NETWORK=solana-devnet');
    it('connects to mainnet when SOLANA_NETWORK=solana');
  });

  describe('Client Management', () => {
    it('reuses client for same user');
    it('creates new client for different user');
    it('initializes user account if not exists');
    it('checks SOL balance before account init');
    it('prevents race condition on concurrent init');
  });

  describe('Position Operations', () => {
    it('opens long position');
    it('opens short position');
    it('rejects leverage > 20x');
    it('rejects size < $10');
    it('closes full position');
    it('closes partial position (50%)');
  });

  describe('Auto-Collateral', () => {
    it('swaps SOL to USDC when insufficient collateral');
    it('deposits USDC before opening position');
    it('skips swap if user has enough USDC');
  });
});
```

### 2.2 DriftService Implementation

```typescript
// src/plugins/plugin-drift/src/services/drift.service.ts

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import {
  DriftClient,
  Wallet,
  BN,
  BASE_PRECISION,
  QUOTE_PRECISION,
  PositionDirection,
  MarketType,
  getMarketOrderParams,
  initialize,
} from '@drift-labs/sdk';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SolanaTransactionManager } from '../../../../managers/solana-transaction-manager';
import { CONFIG, SERVICE_NAME, DEVNET_MARKETS, MAINNET_MARKETS, DRIFT_PROGRAM_ID, MINTS } from '../constants';
import type {
  DriftPosition,
  DriftMarket,
  DriftAccountInfo,
  OpenPositionParams,
  ClosePositionParams,
  PositionResult,
} from '../types';

// Simple mutex for account init race condition
class AsyncMutex {
  private locks: Map<string, Promise<void>> = new Map();

  async acquire(key: string): Promise<() => void> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }
    let release: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(key, promise);
    return () => {
      this.locks.delete(key);
      release!();
    };
  }
}

export class DriftService extends Service {
  static serviceType = SERVICE_NAME;
  capabilityDescription = 'Solana perpetual futures trading via Drift Protocol with up to 20x leverage';

  private connection: Connection | null = null;
  private clients: Map<string, DriftClient> = new Map();
  private solanaManager: SolanaTransactionManager;
  private isDevnet: boolean = true;
  private markets: Record<string, number>;
  private accountInitLock = new AsyncMutex();

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    this.solanaManager = SolanaTransactionManager.getInstance();
  }

  static async start(runtime: IAgentRuntime): Promise<DriftService> {
    const svc = new DriftService(runtime);
    await svc.initialize();
    return svc;
  }

  async stop(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.unsubscribe();
    }
    this.clients.clear();
  }

  private async initialize(): Promise<void> {
    const network = this.solanaManager.getNetwork();
    this.isDevnet = network === 'solana-devnet';

    // Use correct market indices for network
    this.markets = this.isDevnet ? DEVNET_MARKETS : MAINNET_MARKETS;

    const rpcUrl = this.isDevnet
      ? 'https://api.devnet.solana.com'
      : process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

    this.connection = new Connection(rpcUrl, 'confirmed');

    // Initialize Drift SDK
    initialize({ env: this.isDevnet ? 'devnet' : 'mainnet-beta' });

    logger.info(`[DRIFT_SERVICE] Initialized on ${this.isDevnet ? 'devnet' : 'mainnet'} with ${Object.keys(this.markets).length} markets`);
  }

  // ============================================================
  // CLIENT MANAGEMENT
  // ============================================================

  private async getClientForUser(userId: string): Promise<DriftClient> {
    if (this.clients.has(userId)) {
      return this.clients.get(userId)!;
    }

    // Get user's Solana keypair from SolanaTransactionManager
    const walletInfo = await this.solanaManager.getOrCreateWallet(userId);
    const keypair = walletInfo.keypair;
    const wallet = new Wallet(keypair);

    const client = new DriftClient({
      connection: this.connection!,
      wallet,
      programID: new PublicKey(DRIFT_PROGRAM_ID),
      env: this.isDevnet ? 'devnet' : 'mainnet-beta',
      userStats: true,
      perpMarkets: true,
      spotMarkets: true,
      accountSubscription: {
        type: 'polling',
        frequency: 5000,
      },
    });

    await client.subscribe();

    // Initialize user account if needed (with race condition protection)
    const user = client.getUser();
    if (!user.exists()) {
      const release = await this.accountInitLock.acquire(userId);
      try {
        // Double-check after acquiring lock
        if (!user.exists()) {
          // Check SOL balance for account init
          const solBalance = await this.connection!.getBalance(keypair.publicKey);
          if (solBalance < CONFIG.MIN_SOL_FOR_INIT * LAMPORTS_PER_SOL) {
            throw new Error(`Need at least ${CONFIG.MIN_SOL_FOR_INIT} SOL to initialize Drift account. Current: ${solBalance / LAMPORTS_PER_SOL} SOL`);
          }

          logger.info(`[DRIFT_SERVICE] Creating Drift account for user ${userId}`);
          await client.initializeUserAccount();
        }
      } finally {
        release();
      }
    }

    this.clients.set(userId, client);
    logger.info(`[DRIFT_SERVICE] Created Drift client for user ${userId}`);

    return client;
  }

  // ============================================================
  // AUTO-COLLATERAL (Jupiter Integration)
  // ============================================================

  private async ensureCollateral(userId: string, marginRequired: number): Promise<void> {
    const accountInfo = await this.getAccountInfo(userId);
    const freeCollateral = parseFloat(accountInfo.freeCollateral) / 1_000_000; // Convert from base units

    if (freeCollateral >= marginRequired) {
      logger.info(`[DRIFT_SERVICE] Sufficient collateral: $${freeCollateral.toFixed(2)} >= $${marginRequired.toFixed(2)}`);
      return;
    }

    const shortfall = marginRequired - freeCollateral;
    const swapAmount = shortfall * 1.1; // 10% buffer

    logger.info(`[DRIFT_SERVICE] Insufficient collateral. Need $${marginRequired.toFixed(2)}, have $${freeCollateral.toFixed(2)}. Auto-swapping...`);

    // Get Jupiter service for SOL→USDC swap
    const jupiterService = this.runtime.getService('JUPITER_SERVICE');
    if (!jupiterService) {
      throw new Error(`Insufficient USDC collateral ($${freeCollateral.toFixed(2)}). Need $${marginRequired.toFixed(2)}. Swap SOL to USDC first.`);
    }

    // Swap SOL to USDC
    await (jupiterService as any).swapTokens({
      userId,
      inputMint: MINTS.SOL,
      outputMint: MINTS.USDC,
      amount: swapAmount,
    });

    // Deposit USDC to Drift
    await this.deposit(userId, swapAmount);

    logger.info(`[DRIFT_SERVICE] Auto-provisioned $${swapAmount.toFixed(2)} USDC collateral`);
  }

  // ============================================================
  // POSITION OPERATIONS
  // ============================================================

  async openPosition(userId: string, params: OpenPositionParams): Promise<PositionResult> {
    try {
      const client = await this.getClientForUser(userId);
      const marketIndex = this.markets[params.marketSymbol as keyof typeof this.markets];

      if (marketIndex === undefined) {
        throw new Error(`Unknown market: ${params.marketSymbol}. Available: ${Object.keys(this.markets).join(', ')}`);
      }

      const leverage = Math.min(params.leverage || CONFIG.DEFAULT_LEVERAGE, CONFIG.MAX_LEVERAGE);
      const marginRequired = params.size / leverage;

      // Auto-provision collateral if needed
      await this.ensureCollateral(userId, marginRequired);

      const direction = params.side === 'long' ? PositionDirection.LONG : PositionDirection.SHORT;

      // Convert USD size to base asset size
      const oraclePrice = client.getOracleDataForPerpMarket(marketIndex).price;
      const baseAssetAmount = new BN(params.size)
        .mul(BASE_PRECISION)
        .div(oraclePrice)
        .mul(new BN(leverage));

      // Place market order
      const orderParams = getMarketOrderParams({
        marketIndex,
        direction,
        baseAssetAmount,
        marketType: MarketType.PERP,
      });

      const txSig = await client.placePerpOrder(orderParams);
      await this.connection!.confirmTransaction(txSig, 'confirmed');

      // Get updated position
      const position = await this.getPosition(userId, params.marketSymbol);

      logger.info(`[DRIFT_SERVICE] Opened ${params.side} position on ${params.marketSymbol} for user ${userId}`);

      return {
        success: true,
        position,
        txSignature: txSig,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[DRIFT_SERVICE] Failed to open position: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  async closePosition(userId: string, params: ClosePositionParams): Promise<PositionResult> {
    try {
      const client = await this.getClientForUser(userId);
      const marketIndex = this.markets[params.marketSymbol as keyof typeof this.markets];

      if (marketIndex === undefined) {
        throw new Error(`Unknown market: ${params.marketSymbol}`);
      }

      const user = client.getUser();
      const position = user.getPerpPosition(marketIndex);

      if (!position || position.baseAssetAmount.isZero()) {
        throw new Error(`No open position in ${params.marketSymbol}`);
      }

      // Calculate close amount
      const percentage = params.percentage || 100;
      const closeAmount = position.baseAssetAmount.mul(new BN(percentage)).div(new BN(100));

      // Determine direction (opposite of position)
      const direction = position.baseAssetAmount.gt(new BN(0))
        ? PositionDirection.SHORT  // Close long
        : PositionDirection.LONG;  // Close short

      const orderParams = getMarketOrderParams({
        marketIndex,
        direction,
        baseAssetAmount: closeAmount.abs(),
        marketType: MarketType.PERP,
        reduceOnly: true,
      });

      const txSig = await client.placePerpOrder(orderParams);
      await this.connection!.confirmTransaction(txSig, 'confirmed');

      logger.info(`[DRIFT_SERVICE] Closed ${percentage}% of ${params.marketSymbol} position for user ${userId}`);

      return {
        success: true,
        txSignature: txSig,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[DRIFT_SERVICE] Failed to close position: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  // ============================================================
  // QUERIES
  // ============================================================

  async getPosition(userId: string, marketSymbol: string): Promise<DriftPosition | null> {
    const client = await this.getClientForUser(userId);
    const marketIndex = this.markets[marketSymbol as keyof typeof this.markets];
    const user = client.getUser();

    const position = user.getPerpPosition(marketIndex);
    if (!position || position.baseAssetAmount.isZero()) {
      return null;
    }

    const oraclePrice = client.getOracleDataForPerpMarket(marketIndex).price;
    const entryPrice = position.quoteAssetAmount.abs()
      .mul(QUOTE_PRECISION)
      .div(position.baseAssetAmount.abs())
      .div(BASE_PRECISION);

    return {
      marketIndex,
      marketSymbol,
      side: position.baseAssetAmount.gt(new BN(0)) ? 'long' : 'short',
      size: position.baseAssetAmount.abs().toString(),
      notionalValue: position.baseAssetAmount.abs().mul(oraclePrice).div(BASE_PRECISION).toString(),
      entryPrice: entryPrice.toString(),
      markPrice: oraclePrice.toString(),
      liquidationPrice: user.liquidationPrice(marketIndex)?.toString() || '0',
      unrealizedPnl: user.getUnrealizedPNL(true, marketIndex).toString(),
      leverage: user.getLeverage().toNumber() / 10000,
      marginUsed: position.quoteAssetAmount.abs().toString(),
    };
  }

  async getPositions(userId: string): Promise<DriftPosition[]> {
    const positions: DriftPosition[] = [];

    for (const symbol of Object.keys(this.markets)) {
      const position = await this.getPosition(userId, symbol);
      if (position) {
        positions.push(position);
      }
    }

    return positions;
  }

  async getAccountInfo(userId: string): Promise<DriftAccountInfo> {
    const client = await this.getClientForUser(userId);
    const user = client.getUser();

    return {
      authority: client.wallet.publicKey.toBase58(),
      subAccountId: 0,
      collateral: user.getTotalCollateral().toString(),
      freeCollateral: user.getFreeCollateral().toString(),
      totalPositionValue: user.getTotalPerpPositionValue().toString(),
      unrealizedPnl: user.getUnrealizedPNL(true).toString(),
      marginRatio: user.getMarginRatio().toString(),
      leverage: user.getLeverage().toNumber() / 10000,
    };
  }

  async getMarkets(): Promise<DriftMarket[]> {
    const client = await this.getClientForUser('system');
    const markets: DriftMarket[] = [];

    for (const [symbol, marketIndex] of Object.entries(this.markets)) {
      try {
        const market = client.getPerpMarketAccount(marketIndex);
        const oraclePrice = client.getOracleDataForPerpMarket(marketIndex).price;

        markets.push({
          marketIndex,
          symbol,
          baseAsset: symbol.replace('-PERP', ''),
          price: oraclePrice.toString(),
          volume24h: market.amm.volume24H.toString(),
          openInterest: market.amm.baseAssetAmountWithAmm.abs().toString(),
          fundingRate: market.amm.lastFundingRate.toString(),
          maxLeverage: CONFIG.MAX_LEVERAGE,
        });
      } catch (e) {
        // Market may not exist on devnet
      }
    }

    return markets;
  }

  // ============================================================
  // COLLATERAL MANAGEMENT
  // ============================================================

  async deposit(userId: string, amount: number): Promise<{ success: boolean; txSignature?: string; error?: string }> {
    try {
      const client = await this.getClientForUser(userId);

      // Amount in USDC base units (6 decimals)
      const depositAmount = new BN(amount * 1_000_000);

      const txSig = await client.deposit(
        depositAmount,
        0, // USDC spot market index
        client.wallet.publicKey
      );

      await this.connection!.confirmTransaction(txSig, 'confirmed');

      logger.info(`[DRIFT_SERVICE] Deposited $${amount} USDC for user ${userId}`);

      return { success: true, txSignature: txSig };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }
}
```

---

## Phase 3: Actions (Day 4)

### 3.1 Action Factory (Port from Hyperliquid)

Port `/src/plugins/plugin-hyperliquid/src/utils/action-factory.ts` and adapt:
- Max leverage: 20x (not 25x)
- Market format: `SOL-PERP` (not just `BTC`)

### 3.2 Open Long Action

```typescript
// src/plugins/plugin-drift/src/actions/drift-open-long.ts

import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type HandlerCallback,
  logger,
} from '@elizaos/core';
import { DriftService } from '../services/drift.service';
import { ACTION_NAMES, SERVICE_NAME, CONFIG } from '../constants';

export const driftOpenLong: Action = {
  name: ACTION_NAMES.DRIFT_OPEN_LONG,
  similes: ['DRIFT_LONG', 'SOL_PERP_LONG', 'OPEN_DRIFT_LONG', 'SOLANA_LONG', 'DRIFT LONG'],
  description: 'Open a leveraged long position on Drift Protocol (Solana perpetuals)',

  validate: async (runtime: IAgentRuntime) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch {
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state,
    options,
    callback?: HandlerCallback
  ) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      const userId = message.entityId as string;

      const symbol = (options?.symbol as string)?.toUpperCase() || 'SOL-PERP';
      const size = options?.size as number;
      const leverage = Math.min(options?.leverage as number || 1, CONFIG.MAX_LEVERAGE);

      if (!size || size < CONFIG.MIN_COLLATERAL) {
        throw new Error(`Size must be at least $${CONFIG.MIN_COLLATERAL}`);
      }

      const result = await service.openPosition(userId, {
        marketSymbol: symbol.includes('-PERP') ? symbol : `${symbol}-PERP`,
        side: 'long',
        size,
        leverage,
        orderType: 'market',
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      const pos = result.position!;
      const text = `Opened ${leverage}x long on ${symbol} @ $${parseFloat(pos.entryPrice).toFixed(2)}. ` +
        `Size: $${parseFloat(pos.notionalValue).toFixed(2)}. Liq: $${parseFloat(pos.liquidationPrice).toFixed(2)}. ` +
        `Tx: ${result.txSignature}`;

      callback?.({ text, content: result });
      return { text, success: true, data: result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const text = `Failed to open Drift long: ${errorMsg}`;
      callback?.({ text, content: null });
      return { text, success: false, error: errorMsg };
    }
  },

  examples: [
    [
      { name: '{{user}}', content: { text: 'open a 5x long on SOL on Drift' } },
      { name: '{{agent}}', content: { text: 'Opening position...', action: 'DRIFT_OPEN_LONG' } },
    ],
    [
      { name: '{{user}}', content: { text: 'long BTC with $100 at 3x on Drift' } },
      { name: '{{agent}}', content: { text: 'Opening position...', action: 'DRIFT_OPEN_LONG' } },
    ],
  ],
};

export default driftOpenLong;
```

### 3.3 Plugin Index

```typescript
// src/plugins/plugin-drift/src/index.ts

import type { Plugin } from '@elizaos/core';
import { DriftService } from './services/drift.service';

import { driftOpenLong } from './actions/drift-open-long';
import { driftOpenShort } from './actions/drift-open-short';
import { driftClosePosition } from './actions/drift-close-position';
import { driftGetPositions } from './actions/drift-get-positions';
import { driftGetMarkets } from './actions/drift-get-markets';
import { driftAccountInfo } from './actions/drift-account-info';
import { driftDeposit } from './actions/drift-deposit';

export const driftPlugin: Plugin = {
  name: 'drift',
  description: 'Solana perpetual futures trading via Drift Protocol with up to 20x leverage',
  evaluators: [],
  providers: [],
  actions: [
    driftOpenLong,
    driftOpenShort,
    driftClosePosition,
    driftGetPositions,
    driftGetMarkets,
    driftAccountInfo,
    driftDeposit,
  ],
  services: [DriftService],
};

export default driftPlugin;
```

---

## Phase 4: Testing & Hardening (Days 5-6)

### 4.1 Test Suite (Target: 78+ tests)

```
__tests__/
├── drift.service.test.ts      # Service unit tests (25 tests)
├── drift-client.test.ts       # Client lifecycle (10 tests)
├── actions.test.ts            # Action validation (15 tests)
├── formatters.test.ts         # Display utilities (8 tests)
├── integration.test.ts        # E2E flows (10 tests)
├── collateral.test.ts         # Auto-provision logic (5 tests)
├── markets.test.ts            # Market index handling (3 tests)
└── error-handling.test.ts     # Failure cases (10 tests)
```

### 4.2 Code-Hound Review Targets

| Metric | Target |
|--------|--------|
| TDD | 90/100 (tests written first) |
| KISS | 95/100 (factory pattern) |
| SOLID | 85/100 (clean interfaces) |
| DRY | 95/100 (reuse Hyperliquid patterns) |

### 4.3 Devnet Validation

```bash
# 1. Start with devnet
SOLANA_NETWORK=solana-devnet bun run dev

# 2. Test markets (should show 3, not 30)
"Show Drift markets"

# 3. Test position (requires devnet SOL)
"Open a 2x long on SOL with $50 on Drift"

# 4. Verify on Solana Explorer (devnet)
```

---

## Plugin Registration

Plugin is already registered in `src/index.ts`:
- Line 10: `import driftPlugin from './plugins/plugin-drift/src/index.ts';`
- Line 41: `driftPlugin,` in `projectAgent.plugins` array

---

## Environment Variables

```bash
# .env additions

# Drift (optional - uses defaults from SolanaTransactionManager)
DRIFT_DEVNET=true              # Use devnet for testing
```

---

## Timeline Summary

| Day | Deliverable |
|-----|-------------|
| 1 | Plugin structure, types, constants (devnet/mainnet split) |
| 2 | DriftService skeleton, getMarkets, getPositions |
| 3 | openPosition, closePosition, deposit, auto-collateral |
| 4 | 7 actions via factory pattern |
| 5 | Tests (TDD), code-hound review |
| 6 | Devnet validation, mainnet prep |

**Total: 5-6 days**

---

## Success Criteria

- [ ] User with SOL can open perp positions via Drift
- [ ] Auto-collateral works (SOL→USDC→deposit→trade in one command)
- [ ] 30+ Drift markets accessible on mainnet
- [ ] 3 markets accessible on devnet
- [ ] Leverage up to 20x working
- [ ] Position queries return accurate data
- [ ] Wallet router correctly chooses Drift vs Hyperliquid
- [ ] 78+ tests passing

---

## Risk Matrix

| Risk | Severity | Mitigation |
|------|----------|------------|
| SDK version incompatibility | HIGH | Pin exact version `2.90.0`, test before implementing |
| Devnet market indices wrong | HIGH | Split `DEVNET_MARKETS` / `MAINNET_MARKETS` constants |
| User has no SOL for account init | MEDIUM | Check 0.02 SOL minimum before init |
| Concurrent account init | MEDIUM | Use mutex lock (`AsyncMutex`) |
| Jupiter swap fails | LOW | Fallback to manual "swap first" message |

---

## Drift vs Hyperliquid Summary

| Feature | Drift (Solana) | Hyperliquid (EVM) |
|---------|----------------|-------------------|
| Chain | Solana | Arbitrum L1 |
| Markets | 30+ | 20+ |
| Max Leverage | 20x | 25x |
| Collateral | USDC | USDC |
| Speed | ~400ms | ~200ms |
| Fees | Low | Very low |
| Use when | User has SOL/Solana funds | User has EVM funds |
