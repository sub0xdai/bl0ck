# Jupiter Perps Integration - Solana Perpetuals

**Goal:** Enable Lina to trade perpetuals on Solana via Jupiter Perps, leveraging our existing Jupiter integration for swaps.

**Advantage:** We already use `@jup-ag/api` for swaps - Jupiter Perps uses the same ecosystem.

---

## Why Jupiter Perps?

| Feature | Jupiter Perps | Drift |
|---------|---------------|-------|
| Integration | **Easier** - same Jupiter ecosystem | Separate SDK |
| Markets | ~10 (BTC, ETH, SOL + majors) | 30+ |
| Max Leverage | **100x** | 20x |
| Liquidity | Growing fast | Highest |
| Age | New (2024) | 2+ years |
| SDK | `@jup-ag/perps-sdk` | `@drift-labs/sdk` |
| Oracle | Pyth + Chainlink | Pyth |

**Jupiter Perps Markets:**
- SOL-PERP
- BTC-PERP
- ETH-PERP
- (More being added regularly)

**Best for:** Simple integration, high leverage, major assets only.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      EXISTING JUPITER SWAP                      │
│                    (plugin-jupiter already works)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Extend
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     JUPITER PERPS EXTENSION                     │
│  - Same wallet management                                       │
│  - Same RPC connection                                          │
│  - Add perps-specific methods                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Extend Existing Jupiter Plugin (Day 1)

Since we already have `plugin-jupiter`, we can extend it rather than create a new plugin.

### Option A: Extend plugin-jupiter (Recommended)

```
src/plugins/plugin-jupiter/
├── src/
│   ├── index.ts                    # Add perps exports
│   ├── services/
│   │   ├── jupiter.service.ts      # Existing swap service
│   │   └── jupiter-perps.service.ts # NEW: Perps service
│   └── actions/
│       ├── jupiter-swap.ts         # Existing
│       ├── jupiter-perp-long.ts    # NEW
│       ├── jupiter-perp-short.ts   # NEW
│       ├── jupiter-perp-close.ts   # NEW
│       └── jupiter-perp-positions.ts # NEW
```

### Option B: New plugin-jupiter-perps (If cleaner separation needed)

```
src/plugins/plugin-jupiter-perps/
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── constants.ts
│   ├── services/
│   │   └── perps.service.ts
│   └── actions/
│       ├── open-long.ts
│       ├── open-short.ts
│       ├── close-position.ts
│       └── get-positions.ts
```

**Recommendation: Option A** - Extend existing plugin for cohesion.

---

## Phase 2: Types & Constants

```typescript
// src/plugins/plugin-jupiter/src/types/perps.ts

export interface JupiterPerpPosition {
  marketSymbol: string;           // 'SOL-PERP', 'BTC-PERP'
  side: 'long' | 'short';
  size: string;                   // Position size in base asset
  collateral: string;             // USDC collateral
  entryPrice: string;
  markPrice: string;
  liquidationPrice: string;
  unrealizedPnl: string;
  unrealizedPnlPercent: string;
  leverage: number;
  margin: string;
}

export interface JupiterPerpMarket {
  symbol: string;                 // 'SOL-PERP'
  baseAsset: string;              // 'SOL'
  price: string;
  priceChange24h: string;
  volume24h: string;
  openInterest: string;
  fundingRate: string;
  nextFundingTime: number;
  maxLeverage: number;            // Up to 100x
}

export interface OpenPerpParams {
  market: string;                 // 'SOL', 'BTC', 'ETH'
  side: 'long' | 'short';
  collateral: number;             // USDC amount
  leverage: number;               // 1-100
  orderType?: 'market' | 'limit';
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface ClosePerpParams {
  market: string;
  percentage?: number;            // 1-100, default 100
}

export interface PerpResult {
  success: boolean;
  position?: JupiterPerpPosition;
  txSignature?: string;
  error?: string;
}
```

```typescript
// src/plugins/plugin-jupiter/src/constants/perps.ts

export const JUPITER_PERPS_PROGRAM_ID = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu';

export const PERP_MARKETS = {
  'SOL-PERP': {
    symbol: 'SOL-PERP',
    baseAsset: 'SOL',
    pythPriceFeed: 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG',
    maxLeverage: 100,
  },
  'BTC-PERP': {
    symbol: 'BTC-PERP',
    baseAsset: 'BTC',
    pythPriceFeed: 'GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU',
    maxLeverage: 100,
  },
  'ETH-PERP': {
    symbol: 'ETH-PERP',
    baseAsset: 'ETH',
    pythPriceFeed: 'JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB',
    maxLeverage: 100,
  },
} as const;

export const MARKET_SYMBOLS = Object.keys(PERP_MARKETS);

export const PERPS_CONFIG = {
  MAX_LEVERAGE: 100,
  DEFAULT_LEVERAGE: 1,
  MIN_COLLATERAL: 10,            // $10 minimum
  DEFAULT_SLIPPAGE_BPS: 50,      // 0.5%
  COLLATERAL_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
};

export const PERPS_ACTION_NAMES = {
  JUP_PERP_LONG: 'JUP_PERP_LONG',
  JUP_PERP_SHORT: 'JUP_PERP_SHORT',
  JUP_PERP_CLOSE: 'JUP_PERP_CLOSE',
  JUP_PERP_POSITIONS: 'JUP_PERP_POSITIONS',
  JUP_PERP_MARKETS: 'JUP_PERP_MARKETS',
};
```

---

## Phase 3: Jupiter Perps Service (Day 1-2)

```typescript
// src/plugins/plugin-jupiter/src/services/jupiter-perps.service.ts

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { SolanaTransactionManager } from '../../../../managers/solana-transaction-manager';
import {
  JUPITER_PERPS_PROGRAM_ID,
  PERP_MARKETS,
  PERPS_CONFIG,
} from '../constants/perps';
import type {
  JupiterPerpPosition,
  JupiterPerpMarket,
  OpenPerpParams,
  ClosePerpParams,
  PerpResult,
} from '../types/perps';

/**
 * Jupiter Perps Service
 *
 * Extends our Jupiter integration with perpetual futures trading.
 * Uses the same wallet infrastructure as Jupiter swaps.
 */
export class JupiterPerpsService extends Service {
  static serviceType = 'JUPITER_PERPS_SERVICE';
  capabilityDescription = 'Solana perpetual futures via Jupiter with up to 100x leverage';

  private connection: Connection | null = null;
  private solanaManager: SolanaTransactionManager;
  private baseUrl: string;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    this.solanaManager = SolanaTransactionManager.getInstance();
    // Jupiter Perps API
    this.baseUrl = 'https://perps-api.jup.ag';
  }

  static async start(runtime: IAgentRuntime): Promise<JupiterPerpsService> {
    const svc = new JupiterPerpsService(runtime);
    await svc.initialize();
    return svc;
  }

  async stop(): Promise<void> {
    logger.info('[JUPITER_PERPS] Stopping');
  }

  private async initialize(): Promise<void> {
    const network = this.solanaManager.getNetwork();
    const rpcUrl = network === 'solana-devnet'
      ? 'https://api.devnet.solana.com'
      : process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

    this.connection = new Connection(rpcUrl, 'confirmed');
    logger.info(`[JUPITER_PERPS] Initialized on ${network}`);
  }

  // ============================================================
  // POSITION OPERATIONS
  // ============================================================

  /**
   * Open a perpetual position via Jupiter Perps
   */
  async openPosition(userId: string, params: OpenPerpParams): Promise<PerpResult> {
    try {
      const marketKey = `${params.market.toUpperCase()}-PERP`;
      const marketInfo = PERP_MARKETS[marketKey as keyof typeof PERP_MARKETS];

      if (!marketInfo) {
        throw new Error(`Unknown market: ${params.market}. Available: ${MARKET_SYMBOLS.join(', ')}`);
      }

      const leverage = Math.min(params.leverage || PERPS_CONFIG.DEFAULT_LEVERAGE, PERPS_CONFIG.MAX_LEVERAGE);

      if (params.collateral < PERPS_CONFIG.MIN_COLLATERAL) {
        throw new Error(`Minimum collateral is $${PERPS_CONFIG.MIN_COLLATERAL}`);
      }

      // Get user's Solana wallet
      const walletInfo = await this.solanaManager.getWalletForUser(userId);
      const userPubkey = walletInfo.publicKey;

      // 1. Get position opening instruction from Jupiter API
      const response = await fetch(`${this.baseUrl}/v1/position/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: userPubkey,
          market: marketInfo.symbol,
          side: params.side,
          collateralAmount: params.collateral * 1_000_000, // USDC decimals
          leverage: leverage,
          orderType: params.orderType || 'market',
          limitPrice: params.limitPrice,
          slippageBps: PERPS_CONFIG.DEFAULT_SLIPPAGE_BPS,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get position instruction');
      }

      const { transaction: txBase64 } = await response.json();

      // 2. Deserialize, sign, and send transaction
      const txBuffer = Buffer.from(txBase64, 'base64');
      const transaction = Transaction.from(txBuffer);

      const keypair = walletInfo.keypair;
      transaction.sign(keypair);

      const txSignature = await this.connection!.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false }
      );

      await this.connection!.confirmTransaction(txSignature, 'confirmed');

      // 3. Fetch the new position
      const position = await this.getPosition(userId, params.market);

      logger.info(`[JUPITER_PERPS] Opened ${params.side} on ${marketKey} for user ${userId}`);

      return {
        success: true,
        position: position || undefined,
        txSignature,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[JUPITER_PERPS] Failed to open position: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Close a perpetual position
   */
  async closePosition(userId: string, params: ClosePerpParams): Promise<PerpResult> {
    try {
      const marketKey = `${params.market.toUpperCase()}-PERP`;
      const walletInfo = await this.solanaManager.getWalletForUser(userId);
      const userPubkey = walletInfo.publicKey;

      const percentage = params.percentage || 100;

      // Get close instruction from Jupiter API
      const response = await fetch(`${this.baseUrl}/v1/position/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: userPubkey,
          market: marketKey,
          closePercent: percentage,
          slippageBps: PERPS_CONFIG.DEFAULT_SLIPPAGE_BPS,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get close instruction');
      }

      const { transaction: txBase64 } = await response.json();

      const txBuffer = Buffer.from(txBase64, 'base64');
      const transaction = Transaction.from(txBuffer);

      const keypair = walletInfo.keypair;
      transaction.sign(keypair);

      const txSignature = await this.connection!.sendRawTransaction(
        transaction.serialize()
      );

      await this.connection!.confirmTransaction(txSignature, 'confirmed');

      logger.info(`[JUPITER_PERPS] Closed ${percentage}% of ${marketKey} for user ${userId}`);

      return { success: true, txSignature };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[JUPITER_PERPS] Failed to close position: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  // ============================================================
  // QUERIES
  // ============================================================

  /**
   * Get user's position in a specific market
   */
  async getPosition(userId: string, market: string): Promise<JupiterPerpPosition | null> {
    try {
      const walletInfo = await this.solanaManager.getWalletForUser(userId);
      const marketKey = `${market.toUpperCase()}-PERP`;

      const response = await fetch(
        `${this.baseUrl}/v1/position?owner=${walletInfo.publicKey}&market=${marketKey}`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (!data.position || data.position.size === '0') {
        return null;
      }

      return {
        marketSymbol: marketKey,
        side: parseFloat(data.position.size) > 0 ? 'long' : 'short',
        size: Math.abs(parseFloat(data.position.size)).toString(),
        collateral: data.position.collateral,
        entryPrice: data.position.entryPrice,
        markPrice: data.position.markPrice,
        liquidationPrice: data.position.liquidationPrice,
        unrealizedPnl: data.position.unrealizedPnl,
        unrealizedPnlPercent: data.position.unrealizedPnlPercent,
        leverage: data.position.leverage,
        margin: data.position.margin,
      };
    } catch (error) {
      logger.error(`[JUPITER_PERPS] Failed to get position: ${error}`);
      return null;
    }
  }

  /**
   * Get all positions for user
   */
  async getPositions(userId: string): Promise<JupiterPerpPosition[]> {
    const positions: JupiterPerpPosition[] = [];

    for (const market of Object.keys(PERP_MARKETS)) {
      const baseAsset = market.replace('-PERP', '');
      const position = await this.getPosition(userId, baseAsset);
      if (position) {
        positions.push(position);
      }
    }

    return positions;
  }

  /**
   * Get available markets
   */
  async getMarkets(): Promise<JupiterPerpMarket[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/markets`);
      const data = await response.json();

      return data.markets.map((m: any) => ({
        symbol: m.symbol,
        baseAsset: m.baseAsset,
        price: m.price,
        priceChange24h: m.priceChange24h,
        volume24h: m.volume24h,
        openInterest: m.openInterest,
        fundingRate: m.fundingRate,
        nextFundingTime: m.nextFundingTime,
        maxLeverage: PERPS_CONFIG.MAX_LEVERAGE,
      }));
    } catch (error) {
      logger.error(`[JUPITER_PERPS] Failed to get markets: ${error}`);
      // Return static data as fallback
      return Object.values(PERP_MARKETS).map(m => ({
        symbol: m.symbol,
        baseAsset: m.baseAsset,
        price: '0',
        priceChange24h: '0',
        volume24h: '0',
        openInterest: '0',
        fundingRate: '0',
        nextFundingTime: 0,
        maxLeverage: m.maxLeverage,
      }));
    }
  }

  /**
   * Get account summary
   */
  async getAccountSummary(userId: string): Promise<{
    totalCollateral: string;
    freeCollateral: string;
    totalPnl: string;
    positions: number;
  }> {
    const positions = await this.getPositions(userId);

    const totalCollateral = positions.reduce(
      (sum, p) => sum + parseFloat(p.collateral), 0
    );
    const totalPnl = positions.reduce(
      (sum, p) => sum + parseFloat(p.unrealizedPnl), 0
    );

    return {
      totalCollateral: totalCollateral.toFixed(2),
      freeCollateral: '0', // Would need additional API call
      totalPnl: totalPnl.toFixed(2),
      positions: positions.length,
    };
  }
}
```

---

## Phase 4: Actions (Day 2)

### Open Long Action:

```typescript
// src/plugins/plugin-jupiter/src/actions/jupiter-perp-long.ts

import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type HandlerCallback,
  logger,
} from '@elizaos/core';
import { JupiterPerpsService } from '../services/jupiter-perps.service';
import { PERPS_ACTION_NAMES, PERPS_CONFIG, MARKET_SYMBOLS } from '../constants/perps';

export const jupiterPerpLong: Action = {
  name: PERPS_ACTION_NAMES.JUP_PERP_LONG,
  similes: ['JUP_LONG', 'JUPITER_LONG', 'SOL_LONG', 'SOLANA_PERP_LONG'],
  description: 'Open a leveraged long position on Jupiter Perps (Solana)',

  parameters: {
    market: {
      type: 'string',
      description: `Market to trade (SOL, BTC, ETH)`,
      required: true,
    },
    collateral: {
      type: 'number',
      description: 'Collateral in USDC',
      required: true,
    },
    leverage: {
      type: 'number',
      description: `Leverage (1-${PERPS_CONFIG.MAX_LEVERAGE}x, default: 1)`,
      required: false,
    },
  },

  validate: async (runtime: IAgentRuntime) => {
    try {
      const service = runtime.getService('JUPITER_PERPS_SERVICE') as JupiterPerpsService;
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
      const service = runtime.getService('JUPITER_PERPS_SERVICE') as JupiterPerpsService;
      const userId = message.entityId as string;

      const market = (options?.market as string)?.toUpperCase() || 'SOL';
      const collateral = options?.collateral as number;
      const leverage = Math.min(
        options?.leverage as number || PERPS_CONFIG.DEFAULT_LEVERAGE,
        PERPS_CONFIG.MAX_LEVERAGE
      );

      if (!collateral || collateral < PERPS_CONFIG.MIN_COLLATERAL) {
        throw new Error(`Collateral must be at least $${PERPS_CONFIG.MIN_COLLATERAL}`);
      }

      const result = await service.openPosition(userId, {
        market,
        side: 'long',
        collateral,
        leverage,
        orderType: 'market',
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      const pos = result.position!;
      const text = `Opened ${leverage}x long on ${market}-PERP @ $${parseFloat(pos.entryPrice).toFixed(2)}. ` +
        `Collateral: $${collateral}. Liq: $${parseFloat(pos.liquidationPrice).toFixed(2)}. ` +
        `Tx: ${result.txSignature}`;

      callback?.({ text, content: result });

      return { text, success: true, data: result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const text = `Failed to open Jupiter Perps long: ${errorMsg}`;
      callback?.({ text, content: null });
      return { text, success: false, error: errorMsg };
    }
  },

  examples: [
    [
      { name: '{{user}}', content: { text: 'long SOL with $50 at 10x' } },
      { name: '{{agent}}', content: { text: 'Opening position...', action: 'JUP_PERP_LONG' } },
    ],
    [
      { name: '{{user}}', content: { text: 'open a 5x long on BTC' } },
      { name: '{{agent}}', content: { text: 'Opening position...', action: 'JUP_PERP_LONG' } },
    ],
  ],
};

export default jupiterPerpLong;
```

### Open Short Action:

```typescript
// src/plugins/plugin-jupiter/src/actions/jupiter-perp-short.ts

import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type HandlerCallback,
} from '@elizaos/core';
import { JupiterPerpsService } from '../services/jupiter-perps.service';
import { PERPS_ACTION_NAMES, PERPS_CONFIG } from '../constants/perps';

export const jupiterPerpShort: Action = {
  name: PERPS_ACTION_NAMES.JUP_PERP_SHORT,
  similes: ['JUP_SHORT', 'JUPITER_SHORT', 'SOL_SHORT', 'SOLANA_PERP_SHORT'],
  description: 'Open a leveraged short position on Jupiter Perps (Solana)',

  parameters: {
    market: {
      type: 'string',
      description: 'Market to trade (SOL, BTC, ETH)',
      required: true,
    },
    collateral: {
      type: 'number',
      description: 'Collateral in USDC',
      required: true,
    },
    leverage: {
      type: 'number',
      description: `Leverage (1-${PERPS_CONFIG.MAX_LEVERAGE}x, default: 1)`,
      required: false,
    },
  },

  validate: async (runtime: IAgentRuntime) => {
    try {
      const service = runtime.getService('JUPITER_PERPS_SERVICE') as JupiterPerpsService;
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
      const service = runtime.getService('JUPITER_PERPS_SERVICE') as JupiterPerpsService;
      const userId = message.entityId as string;

      const market = (options?.market as string)?.toUpperCase() || 'SOL';
      const collateral = options?.collateral as number;
      const leverage = Math.min(
        options?.leverage as number || PERPS_CONFIG.DEFAULT_LEVERAGE,
        PERPS_CONFIG.MAX_LEVERAGE
      );

      const result = await service.openPosition(userId, {
        market,
        side: 'short',
        collateral,
        leverage,
        orderType: 'market',
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      const pos = result.position!;
      const text = `Opened ${leverage}x short on ${market}-PERP @ $${parseFloat(pos.entryPrice).toFixed(2)}. ` +
        `Collateral: $${collateral}. Liq: $${parseFloat(pos.liquidationPrice).toFixed(2)}. ` +
        `Tx: ${result.txSignature}`;

      callback?.({ text, content: result });

      return { text, success: true, data: result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const text = `Failed to open Jupiter Perps short: ${errorMsg}`;
      callback?.({ text, content: null });
      return { text, success: false, error: errorMsg };
    }
  },

  examples: [
    [
      { name: '{{user}}', content: { text: 'short SOL with $50 at 5x' } },
      { name: '{{agent}}', content: { text: 'Opening position...', action: 'JUP_PERP_SHORT' } },
    ],
  ],
};

export default jupiterPerpShort;
```

### Close Position Action:

```typescript
// src/plugins/plugin-jupiter/src/actions/jupiter-perp-close.ts

import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type HandlerCallback,
} from '@elizaos/core';
import { JupiterPerpsService } from '../services/jupiter-perps.service';
import { PERPS_ACTION_NAMES } from '../constants/perps';

export const jupiterPerpClose: Action = {
  name: PERPS_ACTION_NAMES.JUP_PERP_CLOSE,
  similes: ['JUP_CLOSE', 'CLOSE_JUPITER_PERP', 'CLOSE_SOL_PERP'],
  description: 'Close a position on Jupiter Perps',

  parameters: {
    market: {
      type: 'string',
      description: 'Market to close (SOL, BTC, ETH)',
      required: true,
    },
    percentage: {
      type: 'number',
      description: 'Percentage to close (1-100, default: 100)',
      required: false,
    },
  },

  validate: async (runtime: IAgentRuntime) => {
    try {
      const service = runtime.getService('JUPITER_PERPS_SERVICE') as JupiterPerpsService;
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
      const service = runtime.getService('JUPITER_PERPS_SERVICE') as JupiterPerpsService;
      const userId = message.entityId as string;

      const market = (options?.market as string)?.toUpperCase() || 'SOL';
      const percentage = options?.percentage as number || 100;

      const result = await service.closePosition(userId, { market, percentage });

      if (!result.success) {
        throw new Error(result.error);
      }

      const text = `Closed ${percentage}% of ${market}-PERP position. Tx: ${result.txSignature}`;
      callback?.({ text, content: result });

      return { text, success: true, data: result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const text = `Failed to close position: ${errorMsg}`;
      callback?.({ text, content: null });
      return { text, success: false, error: errorMsg };
    }
  },

  examples: [
    [
      { name: '{{user}}', content: { text: 'close my SOL position' } },
      { name: '{{agent}}', content: { text: 'Closing...', action: 'JUP_PERP_CLOSE' } },
    ],
    [
      { name: '{{user}}', content: { text: 'close 50% of my BTC short' } },
      { name: '{{agent}}', content: { text: 'Closing...', action: 'JUP_PERP_CLOSE' } },
    ],
  ],
};

export default jupiterPerpClose;
```

---

## Phase 5: Update Plugin Export (Day 2)

```typescript
// src/plugins/plugin-jupiter/src/index.ts

import type { Plugin } from '@elizaos/core';
import { JupiterService } from './services/jupiter.service';
import { JupiterPerpsService } from './services/jupiter-perps.service';

// Existing swap actions
import { jupiterSwap } from './actions/jupiter-swap';

// NEW: Perps actions
import { jupiterPerpLong } from './actions/jupiter-perp-long';
import { jupiterPerpShort } from './actions/jupiter-perp-short';
import { jupiterPerpClose } from './actions/jupiter-perp-close';
import { jupiterPerpPositions } from './actions/jupiter-perp-positions';

export const jupiterPlugin: Plugin = {
  name: 'jupiter',
  description: 'Jupiter DEX integration: swaps + perpetual futures (up to 100x leverage)',
  evaluators: [],
  providers: [],
  actions: [
    // Existing
    jupiterSwap,
    // NEW Perps
    jupiterPerpLong,
    jupiterPerpShort,
    jupiterPerpClose,
    jupiterPerpPositions,
  ],
  services: [
    JupiterService,      // Existing swaps
    JupiterPerpsService, // NEW perps
  ],
};

export default jupiterPlugin;
```

---

## Phase 6: Character Update

```typescript
// Add to src/character.ts system prompt:

**Perpetual Trading Router:**
- Solana wallet → Use Jupiter Perps (JUP_PERP_LONG, JUP_PERP_SHORT)
  - Markets: SOL, BTC, ETH
  - Max leverage: 100x (but recommend ≤20x)
- EVM wallet → Use Hyperliquid (PERP_OPEN_LONG, PERP_OPEN_SHORT)

**Jupiter Perps (Solana):**
- Simple: SOL, BTC, ETH markets only
- High leverage available (100x) but risky
- Same wallet as Jupiter swaps
- Collateral in USDC
```

---

## Comparison: Jupiter Perps vs Drift

| Aspect | Jupiter Perps | Drift |
|--------|---------------|-------|
| **Integration Effort** | **~2 days** (extend existing) | ~3.5 days (new plugin) |
| **Markets** | ~3-5 (majors only) | **30+** |
| **Max Leverage** | **100x** | 20x |
| **Existing Code** | **Leverage Jupiter plugin** | New SDK |
| **Liquidity** | Growing | **Highest** |
| **Complexity** | **Simple** | More features |
| **Risk** | Higher (newer) | **Battle-tested** |

---

## Dependencies

```bash
# Already have @jup-ag/api for swaps
# May need additional for perps (check if separate package)
bun add @jup-ag/perps-sdk  # If exists, otherwise use REST API
```

---

## Estimated Timeline

| Phase | Task | Days |
|-------|------|------|
| 1 | Types + Constants | 0.25 |
| 2 | JupiterPerpsService | 0.75 |
| 3 | Actions (long/short/close/positions) | 0.5 |
| 4 | Update plugin export + character | 0.25 |
| 5 | Testing | 0.25 |
| **Total** | | **~2 days** |

---

## Success Criteria

- [ ] User with SOL can open perp positions via Jupiter
- [ ] SOL, BTC, ETH markets working
- [ ] Leverage up to 100x (with warnings for high leverage)
- [ ] Close positions (full and partial)
- [ ] Same wallet used for swaps and perps
- [ ] Wallet router correctly chooses Jupiter vs Hyperliquid

---

## Recommendation

**Choose Jupiter Perps if:**
- You want the quickest integration (~2 days)
- You only need major markets (SOL, BTC, ETH)
- You want to leverage existing Jupiter code
- High leverage (100x) is important

**Choose Drift if:**
- You need more markets (30+)
- You want battle-tested infrastructure
- Cross-margin is important
- Willing to invest more time (~3.5 days)

**My recommendation:** Start with **Jupiter Perps** for faster MVP, add **Drift** later for more markets.
