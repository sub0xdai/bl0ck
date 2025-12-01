# Solana → EVM Bridge Implementation

**Goal:** Enable Lina to automatically bridge SOL/SPL tokens from Solana to EVM chains, enabling unified liquidity access for Hyperliquid trades.

**Flow:** `SOL (Solana) → Bridge → USDC (EVM) → Hyperliquid Margin`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER REQUEST                            │
│              "Open a 2x long on BTC with my SOL"                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    UNIFIED BALANCE CHECK                        │
│  Check all chains: Solana + EVM (Base, Arb, etc.)              │
│  Result: 0.5 SOL ($80) on Solana, $0 on EVM                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ROUTE OPTIMIZER                             │
│  1. User wants Hyperliquid (needs USDC on Arbitrum)            │
│  2. Funds on Solana → need cross-chain bridge                  │
│  3. Calculate: SOL → Wormhole → USDC (Arb) → HL margin         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EXECUTION PIPELINE                            │
│  Step 1: Swap SOL → USDC on Solana (Jupiter)                   │
│  Step 2: Bridge USDC Solana → USDC Arbitrum (Wormhole)         │
│  Step 3: Deposit USDC to Hyperliquid margin                    │
│  Step 4: Open perp position                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Bridge Provider Integration (Days 1-2)

### Option A: Wormhole (Recommended)
- **Pros:** Most battle-tested, highest TVL, native USDC support
- **Cons:** Slower (~15 min), requires guardian attestation
- **SDK:** `@wormhole-foundation/sdk`

### Option B: deBridge
- **Pros:** Faster (~2-5 min), good UX
- **Cons:** Lower liquidity, newer
- **SDK:** `@debridge-finance/sdk`

### Option C: Mayan Swift
- **Pros:** Fast, good Solana support
- **Cons:** Smaller, less audited
- **SDK:** `@mayanfinance/swap-sdk`

### Recommended: Start with Wormhole for reliability

### Files to Create:

```
src/plugins/plugin-wormhole/
├── src/
│   ├── index.ts                 # Plugin export
│   ├── types.ts                 # TypeScript interfaces
│   ├── constants.ts             # Chain IDs, addresses
│   ├── services/
│   │   └── wormhole.service.ts  # Core bridge logic
│   └── actions/
│       ├── bridge-solana-to-evm.ts
│       ├── bridge-evm-to-solana.ts
│       └── bridge-quote.ts
├── __tests__/
│   └── wormhole.service.test.ts
├── package.json
├── tsconfig.json
└── build.ts
```

### Core Service Interface:

```typescript
// src/plugins/plugin-wormhole/src/types.ts

export interface BridgeQuote {
  sourceChain: 'solana' | EvmChainId;
  destChain: 'solana' | EvmChainId;
  sourceToken: string;      // mint address or EVM token
  destToken: string;
  inputAmount: string;      // in base units
  outputAmount: string;     // estimated output
  fee: string;              // bridge fee
  estimatedTime: number;    // seconds
  route: BridgeRoute;
}

export interface BridgeRoute {
  provider: 'wormhole' | 'debridge' | 'mayan';
  steps: BridgeStep[];
}

export interface BridgeStep {
  action: 'swap' | 'bridge' | 'unwrap';
  chain: string;
  fromToken: string;
  toToken: string;
  protocol: string;
}

export interface BridgeResult {
  success: boolean;
  sourceChain: string;
  destChain: string;
  sourceTxHash: string;
  destTxHash?: string;      // Available after finalization
  vaaId?: string;           // Wormhole VAA identifier
  status: 'pending' | 'confirming' | 'complete' | 'failed';
  amount: string;
  fee: string;
}
```

### Wormhole Service Implementation:

```typescript
// src/plugins/plugin-wormhole/src/services/wormhole.service.ts

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import {
  wormhole,
  signSendWait,
  Wormhole,
  Chain,
  TokenId
} from '@wormhole-foundation/sdk';
import solana from '@wormhole-foundation/sdk/solana';
import evm from '@wormhole-foundation/sdk/evm';

export class WormholeService extends Service {
  static serviceType = 'WORMHOLE_BRIDGE';

  private wh: Wormhole<'Mainnet' | 'Testnet'> | null = null;
  private isTestnet: boolean = true;

  static async start(runtime: IAgentRuntime): Promise<WormholeService> {
    const svc = new WormholeService(runtime);
    await svc.initialize();
    return svc;
  }

  async initialize(): Promise<void> {
    const network = this.isTestnet ? 'Testnet' : 'Mainnet';

    // Initialize Wormhole SDK with Solana + EVM platforms
    this.wh = await wormhole(network, [solana, evm]);

    logger.info(`[WORMHOLE] Initialized on ${network}`);
  }

  /**
   * Bridge tokens from Solana to EVM
   */
  async bridgeSolanaToEvm(params: {
    userId: string;
    sourceToken: string;      // SPL mint or 'native' for SOL
    destChain: 'Arbitrum' | 'Base' | 'Ethereum';
    destToken: string;        // EVM token address
    amount: string;           // In base units (lamports)
  }): Promise<BridgeResult> {
    // 1. Get user's Solana signer (from SolanaTransactionManager)
    // 2. Get user's EVM address (from CDP wallet)
    // 3. Create token transfer via Wormhole
    // 4. Sign and send on Solana
    // 5. Wait for VAA attestation
    // 6. Redeem on destination chain

    // Implementation details...
  }

  /**
   * Get bridge quote without executing
   */
  async getQuote(params: {
    sourceChain: 'Solana' | EvmChain;
    destChain: 'Solana' | EvmChain;
    token: string;
    amount: string;
  }): Promise<BridgeQuote> {
    // Calculate fees, estimate time, return quote
  }
}
```

---

## Phase 2: Route Optimizer (Days 2-3)

Create intelligent routing that finds the optimal path from user's funds to destination.

### Files to Create:

```
src/services/
└── route-optimizer/
    ├── index.ts
    ├── types.ts
    └── optimizer.ts
```

### Route Optimizer Interface:

```typescript
// src/services/route-optimizer/types.ts

export interface RouteRequest {
  userId: string;
  targetChain: string;           // Where funds need to end up
  targetToken: string;           // What token is needed
  targetAmount: string;          // How much is needed
  maxSlippage?: number;          // Default 1%
  preferredBridge?: string;      // Optional preference
}

export interface OptimalRoute {
  totalSteps: number;
  estimatedTime: number;         // seconds
  estimatedFees: string;         // in USD
  steps: RouteStep[];
  inputRequired: {
    chain: string;
    token: string;
    amount: string;
  };
}

export interface RouteStep {
  stepNumber: number;
  action: 'swap' | 'bridge' | 'deposit';
  chain: string;
  protocol: string;              // 'jupiter', 'wormhole', 'hyperliquid'
  fromToken: string;
  toToken: string;
  estimatedOutput: string;
  estimatedFee: string;
}
```

### Optimizer Logic:

```typescript
// src/services/route-optimizer/optimizer.ts

export class RouteOptimizer {

  /**
   * Find optimal route from user's available funds to target
   */
  async findOptimalRoute(request: RouteRequest): Promise<OptimalRoute | null> {
    // 1. Get user's balances across all chains
    const balances = await this.getAllBalances(request.userId);

    // 2. Check if target already satisfied
    const targetBalance = balances.find(b =>
      b.chain === request.targetChain &&
      b.token === request.targetToken
    );
    if (targetBalance && BigInt(targetBalance.amount) >= BigInt(request.targetAmount)) {
      return { totalSteps: 0, steps: [], ... }; // No routing needed
    }

    // 3. Find all possible source funds
    const availableFunds = balances.filter(b => parseFloat(b.usdValue) > 0);

    // 4. For each source, calculate route cost
    const routes: OptimalRoute[] = [];
    for (const source of availableFunds) {
      const route = await this.calculateRoute(source, request);
      if (route) routes.push(route);
    }

    // 5. Return cheapest/fastest route
    return routes.sort((a, b) =>
      parseFloat(a.estimatedFees) - parseFloat(b.estimatedFees)
    )[0] || null;
  }

  private async calculateRoute(
    source: Balance,
    target: RouteRequest
  ): Promise<OptimalRoute | null> {
    const steps: RouteStep[] = [];

    // Case 1: Same chain, different token → just swap
    if (source.chain === target.targetChain) {
      steps.push({
        action: 'swap',
        chain: source.chain,
        protocol: source.chain === 'solana' ? 'jupiter' : 'uniswap',
        fromToken: source.token,
        toToken: target.targetToken,
        ...
      });
    }

    // Case 2: Solana → EVM
    else if (source.chain === 'solana' && isEvmChain(target.targetChain)) {
      // Step 1: Swap to USDC on Solana (if not already USDC)
      if (source.token !== 'USDC') {
        steps.push({
          action: 'swap',
          chain: 'solana',
          protocol: 'jupiter',
          fromToken: source.token,
          toToken: 'USDC',
          ...
        });
      }

      // Step 2: Bridge USDC to EVM
      steps.push({
        action: 'bridge',
        chain: 'solana',
        protocol: 'wormhole',
        fromToken: 'USDC',
        toToken: 'USDC',
        destChain: target.targetChain,
        ...
      });

      // Step 3: Swap on EVM if needed
      if (target.targetToken !== 'USDC') {
        steps.push({
          action: 'swap',
          chain: target.targetChain,
          protocol: 'uniswap',
          fromToken: 'USDC',
          toToken: target.targetToken,
          ...
        });
      }
    }

    // Case 3: EVM → EVM (use Relay)
    else if (isEvmChain(source.chain) && isEvmChain(target.targetChain)) {
      steps.push({
        action: 'bridge',
        chain: source.chain,
        protocol: 'relay',
        fromToken: source.token,
        toToken: target.targetToken,
        destChain: target.targetChain,
        ...
      });
    }

    return { steps, ... };
  }
}
```

---

## Phase 3: Unified Execution Pipeline (Days 3-4)

### Create a pipeline executor that chains multiple steps:

```typescript
// src/services/execution-pipeline/index.ts

export class ExecutionPipeline {

  /**
   * Execute a multi-step route
   */
  async execute(
    userId: string,
    route: OptimalRoute,
    onProgress?: (step: number, status: string) => void
  ): Promise<PipelineResult> {
    const results: StepResult[] = [];

    for (const step of route.steps) {
      onProgress?.(step.stepNumber, `Executing ${step.action} on ${step.chain}...`);

      try {
        const result = await this.executeStep(userId, step, results);
        results.push(result);

        // Wait for confirmation before next step
        if (step.action === 'bridge') {
          await this.waitForBridgeConfirmation(result);
        }
      } catch (error) {
        return {
          success: false,
          completedSteps: results,
          failedStep: step,
          error: error.message,
        };
      }
    }

    return {
      success: true,
      completedSteps: results,
    };
  }

  private async executeStep(
    userId: string,
    step: RouteStep,
    previousResults: StepResult[]
  ): Promise<StepResult> {
    switch (step.action) {
      case 'swap':
        if (step.chain === 'solana') {
          return this.solanaSwap(userId, step);
        } else {
          return this.evmSwap(userId, step);
        }

      case 'bridge':
        if (step.protocol === 'wormhole') {
          return this.wormholeBridge(userId, step);
        } else if (step.protocol === 'relay') {
          return this.relayBridge(userId, step);
        }

      case 'deposit':
        return this.hyperliquidDeposit(userId, step);
    }
  }
}
```

---

## Phase 4: Character & Action Updates (Day 4)

### Update Lina's character to use the new routing:

```typescript
// Add to src/character.ts system prompt:

**Cross-chain routing:**
- Before any trade, check ALL chains for available funds (Solana + EVM)
- Use ROUTE_OPTIMIZER to find the cheapest path to target
- Execute multi-step routes automatically (swap → bridge → trade)
- For Hyperliquid: Accept funds from ANY chain, auto-route to Arbitrum USDC

**Route execution:**
- Show user the planned route before executing (if multi-step)
- Execute each step sequentially, confirm completion
- If a step fails, report which step and why
```

### Create new actions:

```
src/plugins/plugin-wormhole/src/actions/
├── bridge-solana-to-evm.ts      # BRIDGE_SOL_TO_EVM action
├── bridge-evm-to-solana.ts      # BRIDGE_EVM_TO_SOL action
└── get-bridge-quote.ts          # BRIDGE_QUOTE action

src/actions/
└── auto-route-trade.ts          # AUTO_ROUTE_TRADE - orchestrates everything
```

---

## Phase 5: Testing & Hardening (Day 4-5)

### Test scenarios:

1. **SOL → Hyperliquid Long**
   - Start: 0.5 SOL on Solana
   - Route: SOL → USDC (Jupiter) → Bridge (Wormhole) → Deposit → Open Long

2. **USDC on Base → Hyperliquid**
   - Start: 100 USDC on Base
   - Route: Bridge (Relay) → Deposit → Open Long

3. **Mixed funds**
   - Start: 0.3 SOL + $50 USDC on Base
   - Route: Optimizer picks cheapest source

4. **Failure recovery**
   - Bridge times out → retry or refund
   - Swap fails → revert and report

### Test file:

```typescript
// src/__tests__/integration/cross-chain-routing.test.ts

describe('Cross-chain routing', () => {
  it('routes SOL to Hyperliquid via Wormhole', async () => {
    // Setup: User has 0.5 SOL
    // Action: Request $50 Hyperliquid long
    // Expect: 4-step route executed
  });

  it('picks cheapest route when multiple options', async () => {
    // Setup: User has SOL + USDC on Base
    // Action: Request $50 Hyperliquid long
    // Expect: Uses Base USDC (fewer steps)
  });
});
```

---

## Environment Variables

```bash
# .env additions

# Wormhole
WORMHOLE_RPC_URL=           # Optional, uses public by default
WORMHOLE_TESTNET=true       # Use testnet for development

# Or deBridge alternative
DEBRIDGE_API_KEY=           # If using deBridge instead
```

---

## Dependencies to Add

```json
// package.json additions
{
  "dependencies": {
    "@wormhole-foundation/sdk": "^0.10.0",
    "@wormhole-foundation/sdk-solana": "^0.10.0",
    "@wormhole-foundation/sdk-evm": "^0.10.0"
  }
}
```

---

## Estimated Timeline

| Phase | Task | Days |
|-------|------|------|
| 1 | Wormhole plugin + service | 1-2 |
| 2 | Route optimizer | 1 |
| 3 | Execution pipeline | 1 |
| 4 | Character + actions | 0.5 |
| 5 | Testing + hardening | 0.5-1 |
| **Total** | | **4-5 days** |

---

## Success Criteria

- [ ] User with only SOL can open Hyperliquid positions
- [ ] Route optimizer picks cheapest path automatically
- [ ] Multi-step execution handles failures gracefully
- [ ] Bridge status tracked and reported to user
- [ ] Works on both testnet and mainnet

---

## Future Enhancements

1. **Add more bridge providers** - deBridge, Mayan for redundancy
2. **Gas optimization** - batch transactions where possible
3. **MEV protection** - use private RPCs for large trades
4. **Route caching** - cache quotes for faster UX
5. **EVM → Solana** - reverse direction for completeness
