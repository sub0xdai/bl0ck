# Drift Protocol Integration - Solana Perpetuals

**Goal:** Enable Lina to trade perpetuals on Solana via Drift Protocol, creating a dual-chain perps system:
- **Solana funds → Drift Protocol**
- **EVM funds → Hyperliquid**

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

**Drift Markets Include:**
BTC, ETH, SOL, DOGE, WIF, JUP, BONK, PYTH, JTO, RNDR, INJ, SUI, APT, ARB, OP, AVAX, MATIC, LINK, UNI, LDO, MKR, AAVE, CRV, SNX, PEPE, 1000BONK, and more.

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
│  1. Initialize Drift client for user                           │
│  2. Deposit USDC as collateral (or use existing)               │
│  3. Open perp position (SOL-PERP, 5x long)                     │
│  4. Return position details                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Plugin Structure (Day 1)

### Files to Create:

```
src/plugins/plugin-drift/
├── src/
│   ├── index.ts                    # Plugin export
│   ├── types.ts                    # TypeScript interfaces
│   ├── constants.ts                # Markets, config
│   ├── services/
│   │   └── drift.service.ts        # Core Drift integration
│   └── actions/
│       ├── drift-open-long.ts      # DRIFT_OPEN_LONG
│       ├── drift-open-short.ts     # DRIFT_OPEN_SHORT
│       ├── drift-close-position.ts # DRIFT_CLOSE_POSITION
│       ├── drift-get-positions.ts  # DRIFT_GET_POSITIONS
│       ├── drift-get-markets.ts    # DRIFT_GET_MARKETS
│       ├── drift-account-info.ts   # DRIFT_ACCOUNT_INFO
│       └── drift-deposit.ts        # DRIFT_DEPOSIT (collateral)
├── __tests__/
│   ├── drift.service.test.ts
│   └── actions.test.ts
├── package.json
├── tsconfig.json
└── build.ts
```

### Package.json:

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
    "@drift-labs/sdk": "^2.90.0",
    "@coral-xyz/anchor": "^0.29.0",
    "@solana/web3.js": "^1.95.0"
  }
}
```

---

## Phase 2: Types & Constants (Day 1)

### Types:

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

### Constants:

```typescript
// src/plugins/plugin-drift/src/constants.ts

export const DRIFT_PROGRAM_ID = 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH';

export const SERVICE_NAME = 'DRIFT_SERVICE';

// Market indices (mainnet)
export const MARKETS = {
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

export const MARKET_SYMBOLS = Object.keys(MARKETS);

export const CONFIG = {
  MAX_LEVERAGE: 20,
  DEFAULT_LEVERAGE: 1,
  DEFAULT_SLIPPAGE: 0.5,         // 0.5%
  MIN_COLLATERAL: 10,            // $10 minimum
  SUBACCOUNT_ID: 0,              // Default subaccount
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
```

---

## Phase 3: Drift Service (Days 1-2)

```typescript
// src/plugins/plugin-drift/src/services/drift.service.ts

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import {
  DriftClient,
  User,
  PerpMarkets,
  initialize,
  Wallet,
  BN,
  BASE_PRECISION,
  QUOTE_PRECISION,
  PositionDirection,
  OrderType,
  MarketType,
  getMarketOrderParams,
} from '@drift-labs/sdk';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SolanaTransactionManager } from '../../../../managers/solana-transaction-manager';
import { CONFIG, SERVICE_NAME, MARKETS } from '../constants';
import type {
  DriftPosition,
  DriftMarket,
  DriftAccountInfo,
  OpenPositionParams,
  ClosePositionParams,
  PositionResult,
} from '../types';

export class DriftService extends Service {
  static serviceType = SERVICE_NAME;
  capabilityDescription = 'Solana perpetual futures trading via Drift Protocol with up to 20x leverage';

  private connection: Connection | null = null;
  private clients: Map<string, DriftClient> = new Map();
  private solanaManager: SolanaTransactionManager;
  private isDevnet: boolean = true;

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

    const rpcUrl = this.isDevnet
      ? 'https://api.devnet.solana.com'
      : process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

    this.connection = new Connection(rpcUrl, 'confirmed');

    // Initialize Drift SDK
    const sdkConfig = initialize({ env: this.isDevnet ? 'devnet' : 'mainnet-beta' });

    logger.info(`[DRIFT_SERVICE] Initialized on ${this.isDevnet ? 'devnet' : 'mainnet'}`);
  }

  // ============================================================
  // CLIENT MANAGEMENT
  // ============================================================

  /**
   * Get or create Drift client for user
   * Uses user's Solana wallet from SolanaTransactionManager
   */
  private async getClientForUser(userId: string): Promise<DriftClient> {
    if (this.clients.has(userId)) {
      return this.clients.get(userId)!;
    }

    // Get user's Solana keypair from SolanaTransactionManager
    const walletInfo = await this.solanaManager.getWalletForUser(userId);
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

    // Initialize user account if needed
    const user = client.getUser();
    if (!user.exists()) {
      logger.info(`[DRIFT_SERVICE] Creating Drift account for user ${userId}`);
      await client.initializeUserAccount();
    }

    this.clients.set(userId, client);
    logger.info(`[DRIFT_SERVICE] Created Drift client for user ${userId}`);

    return client;
  }

  // ============================================================
  // POSITION OPERATIONS
  // ============================================================

  /**
   * Open a perpetual position
   */
  async openPosition(userId: string, params: OpenPositionParams): Promise<PositionResult> {
    try {
      const client = await this.getClientForUser(userId);
      const marketIndex = MARKETS[params.marketSymbol as keyof typeof MARKETS];

      if (marketIndex === undefined) {
        throw new Error(`Unknown market: ${params.marketSymbol}. Available: ${Object.keys(MARKETS).join(', ')}`);
      }

      const leverage = Math.min(params.leverage || CONFIG.DEFAULT_LEVERAGE, CONFIG.MAX_LEVERAGE);
      const direction = params.side === 'long' ? PositionDirection.LONG : PositionDirection.SHORT;

      // Convert USD size to base asset size
      const market = client.getPerpMarketAccount(marketIndex);
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

  /**
   * Close a perpetual position
   */
  async closePosition(userId: string, params: ClosePositionParams): Promise<PositionResult> {
    try {
      const client = await this.getClientForUser(userId);
      const marketIndex = MARKETS[params.marketSymbol as keyof typeof MARKETS];

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

  /**
   * Get single position
   */
  async getPosition(userId: string, marketSymbol: string): Promise<DriftPosition | null> {
    const client = await this.getClientForUser(userId);
    const marketIndex = MARKETS[marketSymbol as keyof typeof MARKETS];
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

  /**
   * Get all positions for user
   */
  async getPositions(userId: string): Promise<DriftPosition[]> {
    const client = await this.getClientForUser(userId);
    const user = client.getUser();
    const positions: DriftPosition[] = [];

    for (const [symbol, marketIndex] of Object.entries(MARKETS)) {
      const position = await this.getPosition(userId, symbol);
      if (position) {
        positions.push(position);
      }
    }

    return positions;
  }

  /**
   * Get account info
   */
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

  /**
   * Get available markets
   */
  async getMarkets(): Promise<DriftMarket[]> {
    const client = await this.getClientForUser('system');
    const markets: DriftMarket[] = [];

    for (const [symbol, marketIndex] of Object.entries(MARKETS)) {
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

  /**
   * Deposit USDC collateral to Drift account
   */
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

## Phase 4: Actions (Day 2)

### Open Long Action:

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
import { ACTION_NAMES, SERVICE_NAME, CONFIG, MARKET_SYMBOLS } from '../constants';

export const driftOpenLong: Action = {
  name: ACTION_NAMES.DRIFT_OPEN_LONG,
  similes: ['DRIFT_LONG', 'SOL_PERP_LONG', 'OPEN_DRIFT_LONG', 'SOLANA_LONG'],
  description: 'Open a leveraged long position on Drift Protocol (Solana perpetuals)',

  parameters: {
    symbol: {
      type: 'string',
      description: `Trading pair (e.g., SOL-PERP, BTC-PERP). Available: ${MARKET_SYMBOLS.slice(0, 10).join(', ')}...`,
      required: true,
    },
    size: {
      type: 'number',
      description: 'Position size in USD',
      required: true,
    },
    leverage: {
      type: 'number',
      description: `Leverage (1-${CONFIG.MAX_LEVERAGE}x, default: 1)`,
      required: false,
    },
  },

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

      // Extract params
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
      { name: '{{user}}', content: { text: 'open a 5x long on SOL' } },
      { name: '{{agent}}', content: { text: 'Opening position...', action: 'DRIFT_OPEN_LONG' } },
    ],
    [
      { name: '{{user}}', content: { text: 'long BTC with $100 at 3x' } },
      { name: '{{agent}}', content: { text: 'Opening position...', action: 'DRIFT_OPEN_LONG' } },
    ],
  ],
};

export default driftOpenLong;
```

### Plugin Index:

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

## Phase 5: Wallet Router Update (Day 2-3)

Update character to route based on wallet:

```typescript
// Add to src/character.ts system prompt:

**Perpetual Trading Router:**
- Check which wallet has funds FIRST
- Solana wallet has funds → Use DRIFT (DRIFT_OPEN_LONG, DRIFT_OPEN_SHORT)
- EVM wallet has funds → Use Hyperliquid (PERP_OPEN_LONG, PERP_OPEN_SHORT)
- Both have funds → Ask user which to use, or default to larger balance

**Drift Protocol (Solana):**
- Markets: SOL, BTC, ETH, DOGE, WIF, JUP, BONK, PYTH, ARB, OP, + 20 more
- Max leverage: 20x
- Uses USDC as collateral
- If user has SOL, swap to USDC first via Jupiter, then deposit to Drift

**Hyperliquid (EVM):**
- Markets: BTC, ETH, SOL, + others
- Max leverage: 25x
- Uses USDC as collateral
- Auto-bridges from other EVM chains
```

---

## Phase 6: Register Plugin (Day 3)

```typescript
// src/index.ts - Add drift plugin

import driftPlugin from './plugins/plugin-drift/src/index.ts';

// Add to projectAgent.plugins array:
plugins: [
  sqlPlugin,
  bootstrapPlugin,
  // ... other plugins
  hyperliquidPlugin,
  driftPlugin,  // NEW
  // ...
]
```

---

## Environment Variables

```bash
# .env additions

# Drift (optional - uses defaults)
DRIFT_DEVNET=true              # Use devnet for testing
```

---

## Dependencies

```bash
bun add @drift-labs/sdk @coral-xyz/anchor
```

---

## Testing

### Test Cases:

```typescript
// src/plugins/plugin-drift/__tests__/drift.service.test.ts

describe('DriftService', () => {
  it('opens a long position', async () => {
    const result = await service.openPosition(userId, {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 5,
    });
    expect(result.success).toBe(true);
    expect(result.position?.side).toBe('long');
  });

  it('closes a position', async () => {
    // Open then close
    await service.openPosition(userId, { ... });
    const result = await service.closePosition(userId, {
      marketSymbol: 'SOL-PERP',
      percentage: 100,
    });
    expect(result.success).toBe(true);
  });

  it('gets all positions', async () => {
    const positions = await service.getPositions(userId);
    expect(Array.isArray(positions)).toBe(true);
  });

  it('lists available markets', async () => {
    const markets = await service.getMarkets();
    expect(markets.length).toBeGreaterThan(0);
    expect(markets.find(m => m.symbol === 'SOL-PERP')).toBeDefined();
  });
});
```

---

## Estimated Timeline

| Phase | Task | Days |
|-------|------|------|
| 1 | Plugin structure + types | 0.5 |
| 2 | Drift service core | 1 |
| 3 | Actions (open/close/query) | 1 |
| 4 | Wallet router + character | 0.5 |
| 5 | Testing + integration | 0.5 |
| **Total** | | **3-3.5 days** |

---

## Success Criteria

- [ ] User with SOL can open perp positions via Drift
- [ ] All 30+ Drift markets accessible
- [ ] Leverage up to 20x working
- [ ] Position queries return accurate data
- [ ] Wallet router correctly chooses Drift vs Hyperliquid
- [ ] Works on devnet and mainnet

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
