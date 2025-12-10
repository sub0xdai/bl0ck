# DRIFT_CLOSE_ALL_POSITIONS Action Implementation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `DRIFT_CLOSE_ALL_POSITIONS` action that fetches all open positions and closes each one sequentially.

**Architecture:** New action calls `service.getPositions()` to get open positions, then iterates and calls `service.closePosition()` for each. Returns aggregate results.

**Tech Stack:** TypeScript, Drift SDK, ElizaOS action pattern, Bun test runner

---

## Context

**Problem:** When user says "close my positions" or "close all positions" without specifying a market symbol, the existing `DRIFT_CLOSE_POSITION` action fails because `marketSymbol` is required. The agent verbally says it will check positions but doesn't actually execute the follow-up action.

**Solution:** Create `DRIFT_CLOSE_ALL_POSITIONS` action that:
1. Fetches all open positions via `getPositions()`
2. Iterates through each position
3. Closes each position via `closePosition()`
4. Returns aggregate success/failure results

**Reference Files:**
- Existing close action: `src/plugins/plugin-drift/src/actions/drift-close-position.ts`
- Get positions action: `src/plugins/plugin-drift/src/actions/drift-get-positions.ts`
- Service methods: `src/plugins/plugin-drift/src/services/drift.service.ts` (lines 500-584 for getPositions, closePosition)
- Types: `src/plugins/plugin-drift/src/types.ts`
- Constants: `src/plugins/plugin-drift/src/constants.ts`

---

## Task 1: Add CloseAllResult Type

**Files:**
- Modify: `src/plugins/plugin-drift/src/types.ts`

**Step 1: Add type after WithdrawResult**

```typescript
/**
 * Result of closing all positions
 */
export interface CloseAllResult {
  success: boolean;
  closedCount: number;
  failedCount: number;
  results: Array<{
    marketSymbol: string;
    success: boolean;
    txSignature?: string;
    error?: string;
  }>;
  error?: string;
}
```

**Step 2: Verify build**

```bash
cd src/plugins/plugin-drift && bun run build
```

**Step 3: Commit**

```bash
git add src/plugins/plugin-drift/src/types.ts
git commit -m "feat(drift): add CloseAllResult type"
```

---

## Task 2: Add DRIFT_CLOSE_ALL_POSITIONS Action Name

**Files:**
- Modify: `src/plugins/plugin-drift/src/constants.ts`

**Step 1: Add to ACTION_NAMES object**

```typescript
DRIFT_CLOSE_ALL_POSITIONS: 'DRIFT_CLOSE_ALL_POSITIONS',
```

**Step 2: Verify build**

```bash
cd src/plugins/plugin-drift && bun run build
```

**Step 3: Commit**

```bash
git add src/plugins/plugin-drift/src/constants.ts
git commit -m "feat(drift): add DRIFT_CLOSE_ALL_POSITIONS action name"
```

---

## Task 3: Add formatCloseAllResult Formatter

**Files:**
- Modify: `src/plugins/plugin-drift/src/utils/formatters.ts`
- Test: `src/plugins/plugin-drift/__tests__/formatters.test.ts`

**Step 1: Write failing test**

```typescript
describe('Formatters - formatCloseAllResult', () => {
  it('should format successful close all', () => {
    const result = formatCloseAllResult({
      success: true,
      closedCount: 2,
      failedCount: 0,
      results: [
        { marketSymbol: 'SOL-PERP', success: true, txSignature: 'tx1' },
        { marketSymbol: 'BTC-PERP', success: true, txSignature: 'tx2' },
      ],
    });
    expect(result).toContain('Closed 2 positions');
    expect(result).toContain('SOL-PERP');
    expect(result).toContain('BTC-PERP');
  });

  it('should format partial failure', () => {
    const result = formatCloseAllResult({
      success: false,
      closedCount: 1,
      failedCount: 1,
      results: [
        { marketSymbol: 'SOL-PERP', success: true, txSignature: 'tx1' },
        { marketSymbol: 'BTC-PERP', success: false, error: 'Insufficient margin' },
      ],
    });
    expect(result).toContain('Closed 1');
    expect(result).toContain('Failed 1');
    expect(result).toContain('Insufficient margin');
  });

  it('should format no positions', () => {
    const result = formatCloseAllResult({
      success: true,
      closedCount: 0,
      failedCount: 0,
      results: [],
    });
    expect(result).toContain('No open positions');
  });
});
```

**Step 2: Run test to verify failure**

```bash
cd src/plugins/plugin-drift && bun test formatters.test.ts -t "formatCloseAllResult"
```

**Step 3: Implement formatter**

```typescript
import type { CloseAllResult } from '../types';

/**
 * Format close all positions result for display
 */
export function formatCloseAllResult(result: CloseAllResult): string {
  if (result.results.length === 0) {
    return '**No open positions to close**';
  }

  let text = '';

  if (result.closedCount > 0 && result.failedCount === 0) {
    text += `**Closed ${result.closedCount} position${result.closedCount > 1 ? 's' : ''}**\n\n`;
  } else if (result.closedCount > 0 && result.failedCount > 0) {
    text += `**Closed ${result.closedCount}, Failed ${result.failedCount}**\n\n`;
  } else if (result.failedCount > 0) {
    text += `**Failed to close ${result.failedCount} position${result.failedCount > 1 ? 's' : ''}**\n\n`;
  }

  for (const r of result.results) {
    const icon = r.success ? '✅' : '❌';
    text += `${icon} **${r.marketSymbol}**`;
    if (r.success && r.txSignature) {
      text += ` - \`${r.txSignature}\``;
    } else if (!r.success && r.error) {
      text += ` - ${r.error}`;
    }
    text += '\n';
  }

  return text.trim();
}
```

**Step 4: Add import to formatters.ts**

```typescript
import type { ..., CloseAllResult } from '../types';
```

**Step 5: Run test to verify pass**

```bash
cd src/plugins/plugin-drift && bun test formatters.test.ts -t "formatCloseAllResult"
```

**Step 6: Commit**

```bash
git add src/plugins/plugin-drift/src/utils/formatters.ts src/plugins/plugin-drift/__tests__/formatters.test.ts
git commit -m "feat(drift): add formatCloseAllResult formatter"
```

---

## Task 4: Add closeAllPositions Method to DriftService

**Files:**
- Modify: `src/plugins/plugin-drift/src/services/drift.service.ts`
- Test: `src/plugins/plugin-drift/__tests__/drift.service.test.ts`

**Step 1: Write failing test**

```typescript
describe('DriftService - closeAllPositions', () => {
  let service: DriftService;

  beforeEach(async () => {
    // Reset mocks
    mockClosePosition.mockClear();
    mockGetUser.mockClear();

    const mockRuntime = {
      getSetting: (key: string) => {
        if (key === 'SOLANA_NETWORK') return 'devnet';
        return undefined;
      },
      getService: () => null,
    };

    service = new DriftService(mockRuntime as any);
    await (service as any).initialize();
  });

  it('should close all positions successfully', async () => {
    // Mock: user has 2 open positions
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({
        authority: new MockPublicKey('mockAuth'),
        subAccountId: 0,
        spotPositions: [],
        settledPerpPnl: new MockBN(0),
        cumulativePerpFunding: new MockBN(0),
      }),
      getPerpPosition: (idx: number) => ({
        baseAssetAmount: idx === 0 ? new MockBN(100000000) : new MockBN(50000000),
        quoteAssetAmount: new MockBN(-67000000000),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: idx,
      }),
      getFreeCollateral: () => new MockBN(100000000),
      getTotalCollateral: () => new MockBN(200000000),
      getTotalAssetValue: () => new MockBN(200000000),
      getUnrealizedPNL: () => new MockBN(5000000),
      getLeverage: () => 20000,
      isSubscribed: true,
      subscribe: mock(() => Promise.resolve(true)),
      fetchAccounts: mock(() => Promise.resolve()),
    }));

    const result = await service.closeAllPositions('user-123');

    expect(result.success).toBe(true);
    expect(result.closedCount).toBeGreaterThan(0);
  });

  it('should handle no open positions', async () => {
    // Mock: user has no positions
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({
        authority: new MockPublicKey('mockAuth'),
        subAccountId: 0,
        spotPositions: [],
        settledPerpPnl: new MockBN(0),
        cumulativePerpFunding: new MockBN(0),
      }),
      getPerpPosition: () => ({
        baseAssetAmount: new MockBN(0), // No position
        quoteAssetAmount: new MockBN(0),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: 0,
      }),
      getFreeCollateral: () => new MockBN(100000000),
      getTotalCollateral: () => new MockBN(100000000),
      getTotalAssetValue: () => new MockBN(0),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 0,
      isSubscribed: true,
      subscribe: mock(() => Promise.resolve(true)),
      fetchAccounts: mock(() => Promise.resolve()),
    }));

    const result = await service.closeAllPositions('user-123');

    expect(result.success).toBe(true);
    expect(result.closedCount).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify failure**

```bash
cd src/plugins/plugin-drift && bun test drift.service.test.ts -t "closeAllPositions"
```

**Step 3: Implement method**

Add to `drift.service.ts` after `closePosition` method:

```typescript
/**
 * Close all open positions
 * @param userId User identifier
 * @returns CloseAllResult with aggregate results
 */
async closeAllPositions(userId: string): Promise<CloseAllResult> {
  try {
    // Get all open positions
    const positions = await this.getPositions(userId);

    if (positions.length === 0) {
      return {
        success: true,
        closedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    const results: CloseAllResult['results'] = [];
    let closedCount = 0;
    let failedCount = 0;

    // Close each position
    for (const position of positions) {
      try {
        const closeResult = await this.closePosition(userId, {
          marketSymbol: position.marketSymbol,
          percentage: 100,
        });

        if (closeResult.success) {
          closedCount++;
          results.push({
            marketSymbol: position.marketSymbol,
            success: true,
            txSignature: closeResult.txSignature,
          });
        } else {
          failedCount++;
          results.push({
            marketSymbol: position.marketSymbol,
            success: false,
            error: closeResult.error,
          });
        }
      } catch (error) {
        failedCount++;
        results.push({
          marketSymbol: position.marketSymbol,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info(`[DRIFT_SERVICE] Closed ${closedCount}/${positions.length} positions for user ${userId}`);

    return {
      success: failedCount === 0,
      closedCount,
      failedCount,
      results,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[DRIFT_SERVICE] Failed to close all positions: ${errorMsg}`);
    return {
      success: false,
      closedCount: 0,
      failedCount: 0,
      results: [],
      error: errorMsg,
    };
  }
}
```

**Step 4: Add CloseAllResult import**

```typescript
import type {
  ...,
  CloseAllResult,
} from '../types';
```

**Step 5: Run test to verify pass**

```bash
cd src/plugins/plugin-drift && bun test drift.service.test.ts -t "closeAllPositions"
```

**Step 6: Commit**

```bash
git add src/plugins/plugin-drift/src/services/drift.service.ts src/plugins/plugin-drift/__tests__/drift.service.test.ts
git commit -m "feat(drift): add closeAllPositions method to DriftService"
```

---

## Task 5: Create drift-close-all-positions Action

**Files:**
- Create: `src/plugins/plugin-drift/src/actions/drift-close-all-positions.ts`

**Step 1: Create action file**

```typescript
/**
 * DRIFT_CLOSE_ALL_POSITIONS Action
 *
 * Closes all open perpetual positions.
 */

import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  logger,
} from '@elizaos/core';
import { DriftService } from '../services/drift.service';
import { ACTION_NAMES, SERVICE_NAME } from '../constants';
import { formatCloseAllResult } from '../utils/formatters';
import { extractUserId } from '../utils/action-factory';

export const driftCloseAllPositions: Action = {
  name: ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS,
  similes: [
    'CLOSE ALL',
    'CLOSE ALL POSITIONS',
    'EXIT ALL',
    'EXIT ALL POSITIONS',
    'CLOSE MY POSITIONS',
    'CLOSE POSITIONS',
    'LIQUIDATE ALL',
    'FLATTEN',
    'FLATTEN ALL',
  ],
  description: 'Close all open perpetual positions on Drift Protocol',

  parameters: {},

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch (error) {
      logger.warn(
        `[${ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS}] Validation failed:`,
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    try {
      logger.info(`[${ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS}] Closing all positions`);

      const service = runtime.getService(SERVICE_NAME) as DriftService;

      if (!service) {
        throw new Error('Drift service not initialized');
      }

      const userId = await extractUserId(runtime, message);

      logger.info(`[${ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS}] Fetching and closing all positions for user ${userId}`);

      // Execute close all
      const result = await service.closeAllPositions(userId);

      const text = formatCloseAllResult(result);

      callback?.({ text, content: result });

      return {
        text,
        success: result.success,
        data: result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS}] Failed:`, errorMsg);

      const errorText = `Failed to close positions: ${errorMsg}`;

      callback?.({ text: errorText, content: null });

      return {
        text: errorText,
        success: false,
        error: errorMsg,
      };
    }
  },

  examples: [
    [
      {
        name: '{{user}}',
        content: { text: 'close all my positions' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Closing all your Drift positions...',
          action: ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'exit all positions on drift' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Closing all Drift positions...',
          action: ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'flatten my drift account' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Flattening your Drift account - closing all positions...',
          action: ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS,
        },
      },
    ],
  ],
};

export default driftCloseAllPositions;
```

**Step 2: Verify build**

```bash
cd src/plugins/plugin-drift && bun run build
```

**Step 3: Commit**

```bash
git add src/plugins/plugin-drift/src/actions/drift-close-all-positions.ts
git commit -m "feat(drift): add drift-close-all-positions action"
```

---

## Task 6: Register Action in Plugin

**Files:**
- Modify: `src/plugins/plugin-drift/src/index.ts`

**Step 1: Add import**

```typescript
import driftCloseAllPositions from './actions/drift-close-all-positions';
```

**Step 2: Add to actions array**

```typescript
actions: [
  driftOpenLong,
  driftOpenShort,
  driftClosePosition,
  driftCloseAllPositions,  // Add after driftClosePosition
  driftGetPositions,
  driftGetMarkets,
  driftAccountInfo,
  driftDeposit,
  driftWithdraw,
],
```

**Step 3: Verify build and tests**

```bash
cd src/plugins/plugin-drift && bun run build && bun test
```

**Step 4: Commit**

```bash
git add src/plugins/plugin-drift/src/index.ts
git commit -m "feat(drift): register close-all-positions action in plugin"
```

---

## Task 7: Final Integration Test

**Step 1: Run full test suite**

```bash
cd src/plugins/plugin-drift && bun test
```

**Step 2: Build entire project**

```bash
bun run build
```

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(drift): complete close-all-positions action

- Add DRIFT_CLOSE_ALL_POSITIONS action for closing all open positions
- Fetches positions, iterates and closes each sequentially
- Returns aggregate results with success/failure per position
- Handles edge case of no open positions gracefully"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add CloseAllResult type | types.ts |
| 2 | Add action name constant | constants.ts |
| 3 | Add formatCloseAllResult formatter | formatters.ts, formatters.test.ts |
| 4 | Add closeAllPositions service method | drift.service.ts, drift.service.test.ts |
| 5 | Create drift-close-all-positions action | drift-close-all-positions.ts (new) |
| 6 | Register action in plugin | index.ts |
| 7 | Integration test | - |

**Similes to trigger action:**
- "close all positions"
- "close my positions"
- "exit all"
- "flatten"
- "close positions in drift"

**Expected ~150 lines added**
