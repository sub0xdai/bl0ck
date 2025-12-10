# Drift Withdraw & PnL Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add USDC withdrawal from Drift to Lina wallet and realized PnL tracking to the Drift plugin.

**Architecture:** Two new features: (1) `withdraw` action mirrors existing `deposit` action but moves funds OUT of Drift, (2) PnL tracking extends `DriftAccountInfo` type and service to expose `settledPerpPnl` from SDK's user account.

**Tech Stack:** TypeScript, Drift SDK (`@drift-labs/sdk`), ElizaOS action pattern, Bun test runner

---

## Task 1: Add WithdrawResult Type

**Files:**
- Modify: `src/plugins/plugin-drift/src/types.ts:88-101`

**Step 1: Write the type definition**

Add after `DepositResult` interface (line 93):

```typescript
/**
 * Result of a withdrawal operation
 */
export interface WithdrawResult {
  success: boolean;
  txSignature?: string;
  amount?: number;
  newFreeCollateral?: number;
  error?: string;
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd src/plugins/plugin-drift && bun run build`
Expected: Build succeeds with no type errors

**Step 3: Commit**

```bash
git add src/plugins/plugin-drift/src/types.ts
git commit -m "feat(drift): add WithdrawResult type"
```

---

## Task 2: Add DRIFT_WITHDRAW Action Name

**Files:**
- Modify: `src/plugins/plugin-drift/src/constants.ts:103-111`

**Step 1: Add action name constant**

Add to `ACTION_NAMES` object (after `DRIFT_DEPOSIT`):

```typescript
  DRIFT_WITHDRAW: 'DRIFT_WITHDRAW',
```

**Step 2: Verify TypeScript compiles**

Run: `cd src/plugins/plugin-drift && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/plugins/plugin-drift/src/constants.ts
git commit -m "feat(drift): add DRIFT_WITHDRAW action name"
```

---

## Task 3: Add formatWithdrawResult Formatter

**Files:**
- Modify: `src/plugins/plugin-drift/src/utils/formatters.ts`
- Test: `src/plugins/plugin-drift/__tests__/formatters.test.ts`

**Step 1: Write the failing test**

Add to `formatters.test.ts`:

```typescript
describe('formatWithdrawResult', () => {
  it('should format successful withdrawal', () => {
    const result = formatWithdrawResult(100, 500, 'txSig123');
    expect(result).toContain('USDC Withdrawn from Drift');
    expect(result).toContain('$100.00');
    expect(result).toContain('$500.00');
    expect(result).toContain('txSig123');
  });

  it('should format withdrawal without tx signature', () => {
    const result = formatWithdrawResult(50, 200);
    expect(result).toContain('$50.00');
    expect(result).toContain('$200.00');
    expect(result).not.toContain('Transaction:');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd src/plugins/plugin-drift && bun test formatters.test.ts`
Expected: FAIL - formatWithdrawResult is not defined

**Step 3: Write minimal implementation**

Add to `formatters.ts` after `formatDepositResult`:

```typescript
/**
 * Format withdrawal result for display
 */
export function formatWithdrawResult(amount: number, newFreeCollateral: number, txSignature?: string): string {
  let text = `**USDC Withdrawn from Drift**\n\n`;
  text += `**Amount:** ${formatUsd(amount)}\n`;
  text += `**Remaining Free Collateral:** ${formatUsd(newFreeCollateral)}\n\n`;

  if (txSignature) {
    text += `Transaction: \`${txSignature}\``;
  }

  return text;
}
```

**Step 4: Run test to verify it passes**

Run: `cd src/plugins/plugin-drift && bun test formatters.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/plugins/plugin-drift/src/utils/formatters.ts src/plugins/plugin-drift/__tests__/formatters.test.ts
git commit -m "feat(drift): add formatWithdrawResult formatter"
```

---

## Task 4: Add withdraw Method to DriftService

**Files:**
- Modify: `src/plugins/plugin-drift/src/services/drift.service.ts`
- Test: `src/plugins/plugin-drift/__tests__/drift.service.test.ts`

**Step 1: Write the failing test**

Add to `drift.service.test.ts` in a new describe block:

```typescript
describe('withdraw', () => {
  it('should withdraw USDC successfully', async () => {
    // Mock sufficient free collateral
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({
        authority: new MockPublicKey('mockAuth'),
        subAccountId: 0,
        spotPositions: [],
      }),
      getFreeCollateral: () => new MockBN(100_000_000), // $100 free
      getTotalCollateral: () => new MockBN(150_000_000),
      getTotalAssetValue: () => new MockBN(50_000_000),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 10000,
      isSubscribed: true,
      subscribe: mock(() => Promise.resolve(true)),
      fetchAccounts: mock(() => Promise.resolve()),
    }));

    const result = await service.withdraw('test-user', 50);

    expect(result.success).toBe(true);
    expect(result.amount).toBe(50);
    expect(result.txSignature).toBeDefined();
  });

  it('should reject withdrawal exceeding free collateral', async () => {
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({
        authority: new MockPublicKey('mockAuth'),
        subAccountId: 0,
        spotPositions: [],
      }),
      getFreeCollateral: () => new MockBN(30_000_000), // $30 free
      getTotalCollateral: () => new MockBN(100_000_000),
      getTotalAssetValue: () => new MockBN(70_000_000),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 50000,
      isSubscribed: true,
      subscribe: mock(() => Promise.resolve(true)),
      fetchAccounts: mock(() => Promise.resolve()),
    }));

    const result = await service.withdraw('test-user', 50);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient free collateral');
  });

  it('should reject withdrawal below minimum', async () => {
    const result = await service.withdraw('test-user', 5);

    expect(result.success).toBe(false);
    expect(result.error).toContain('minimum');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd src/plugins/plugin-drift && bun test drift.service.test.ts -t "withdraw"`
Expected: FAIL - withdraw is not a function

**Step 3: Write minimal implementation**

Add to `drift.service.ts` after the `deposit` method (~line 684):

```typescript
/**
 * Withdraw USDC from Drift to user's wallet
 * @param userId User identifier
 * @param amount Amount in USD to withdraw
 * @returns WithdrawResult with success status and tx signature
 */
async withdraw(userId: string, amount: number): Promise<WithdrawResult> {
  // Validate minimum amount
  if (amount < CONFIG.MIN_COLLATERAL) {
    return {
      success: false,
      error: `Withdrawal amount must be at least $${CONFIG.MIN_COLLATERAL} (minimum)`,
    };
  }

  try {
    const client = await this.getClientForUser(userId);
    const user = await this.getValidatedUser(client);

    // Check free collateral
    const freeCollateral = Number(user.getFreeCollateral().toString()) / 1_000_000;

    if (amount > freeCollateral) {
      return {
        success: false,
        error: `Insufficient free collateral. Requested: $${amount.toFixed(2)}, Available: $${freeCollateral.toFixed(2)}`,
      };
    }

    // Get user's USDC ATA for withdrawal destination
    const walletInfo = await this.solanaManager.getOrCreateWallet(userId);
    const usdcAta = getAssociatedTokenAddressSync(
      new PublicKey(MINTS.USDC),
      walletInfo.keypair.publicKey
    );

    // Withdraw USDC from Drift to wallet (amount in base units - 6 decimals)
    // marketIndex 0 = USDC spot market
    const withdrawAmount = new BN(amount * 1_000_000);
    const txSig = await withRetry(() => client.withdraw(withdrawAmount, 0, usdcAta));

    await withRetry(() => this.connection!.confirmTransaction(txSig, 'confirmed'));

    // Get updated free collateral
    await user.fetchAccounts();
    const newFreeCollateral = Number(user.getFreeCollateral().toString()) / 1_000_000;

    logger.info(`[DRIFT_SERVICE] Withdrew $${amount} USDC from Drift to wallet for user ${userId}`);

    return {
      success: true,
      txSignature: txSig,
      amount,
      newFreeCollateral,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[DRIFT_SERVICE] Failed to withdraw: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
    };
  }
}
```

**Step 4: Add WithdrawResult import**

Update the imports at top of `drift.service.ts`:

```typescript
import type {
  DriftPosition,
  DriftMarket,
  DriftAccountInfo,
  OpenPositionParams,
  ClosePositionParams,
  PositionResult,
  DepositResult,
  WithdrawResult,  // Add this
  ValidationResult,
  PositionSide,
} from '../types';
```

**Step 5: Run test to verify it passes**

Run: `cd src/plugins/plugin-drift && bun test drift.service.test.ts -t "withdraw"`
Expected: PASS

**Step 6: Commit**

```bash
git add src/plugins/plugin-drift/src/services/drift.service.ts src/plugins/plugin-drift/__tests__/drift.service.test.ts
git commit -m "feat(drift): add withdraw method to DriftService"
```

---

## Task 5: Create drift-withdraw Action

**Files:**
- Create: `src/plugins/plugin-drift/src/actions/drift-withdraw.ts`

**Step 1: Create the action file**

```typescript
/**
 * DRIFT_WITHDRAW Action
 *
 * Withdraws USDC collateral from Drift Protocol to user's wallet.
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
import { formatWithdrawResult } from '../utils/formatters';
import { extractUserId, extractActionParams } from '../utils/action-factory';

export const driftWithdraw: Action = {
  name: ACTION_NAMES.DRIFT_WITHDRAW,
  similes: ['WITHDRAW', 'WITHDRAW USDC', 'DRIFT WITHDRAW', 'REMOVE COLLATERAL', 'WITHDRAW FROM DRIFT'],
  description: 'Withdraw USDC collateral from Drift Protocol to your wallet',

  parameters: {
    amount: {
      type: 'number',
      description: 'Amount of USDC to withdraw (minimum: $10)',
      required: true,
    },
  },

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch (error) {
      logger.warn(
        `[${ACTION_NAMES.DRIFT_WITHDRAW}] Validation failed:`,
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
      logger.info(`[${ACTION_NAMES.DRIFT_WITHDRAW}] Processing withdrawal`);

      const service = runtime.getService(SERVICE_NAME) as DriftService;

      if (!service) {
        throw new Error('Drift service not initialized');
      }

      const userId = await extractUserId(runtime, message);
      const params = await extractActionParams(runtime, message);

      const amount = params?.amount ? Number(params.amount) : undefined;

      // Validate required parameters
      if (!amount || amount <= 0) {
        throw new Error('Amount is required and must be positive');
      }

      logger.info(`[${ACTION_NAMES.DRIFT_WITHDRAW}] Withdrawing $${amount} USDC`);

      // Execute withdrawal
      const result = await service.withdraw(userId, amount);

      if (!result.success) {
        throw new Error(result.error || 'Failed to withdraw');
      }

      const text = formatWithdrawResult(amount, result.newFreeCollateral || 0, result.txSignature);

      callback?.({ text, content: result });

      return {
        text,
        success: true,
        data: result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${ACTION_NAMES.DRIFT_WITHDRAW}] Failed:`, errorMsg);

      const errorText = `Failed to withdraw: ${errorMsg}`;

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
        content: { text: 'withdraw $500 USDC from Drift' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Withdrawing $500 USDC from your Drift account...',
          action: ACTION_NAMES.DRIFT_WITHDRAW,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'remove $100 collateral from Drift' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Withdrawing $100 collateral from Drift...',
          action: ACTION_NAMES.DRIFT_WITHDRAW,
        },
      },
    ],
  ],
};

export default driftWithdraw;
```

**Step 2: Verify TypeScript compiles**

Run: `cd src/plugins/plugin-drift && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/plugins/plugin-drift/src/actions/drift-withdraw.ts
git commit -m "feat(drift): add drift-withdraw action"
```

---

## Task 6: Register withdraw Action in Plugin

**Files:**
- Modify: `src/plugins/plugin-drift/src/index.ts`

**Step 1: Add import**

Add after other action imports (line 16):

```typescript
import driftWithdraw from './actions/drift-withdraw';
```

**Step 2: Add to actions array**

Add `driftWithdraw` to the actions array (after `driftDeposit`):

```typescript
  actions: [
    driftOpenLong,
    driftOpenShort,
    driftClosePosition,
    driftGetPositions,
    driftGetMarkets,
    driftAccountInfo,
    driftDeposit,
    driftWithdraw,  // Add this
  ],
```

**Step 3: Verify build succeeds**

Run: `cd src/plugins/plugin-drift && bun run build`
Expected: Build succeeds

**Step 4: Run all plugin tests**

Run: `cd src/plugins/plugin-drift && bun test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/plugins/plugin-drift/src/index.ts
git commit -m "feat(drift): register withdraw action in plugin"
```

---

## Task 7: Extend DriftAccountInfo with Realized PnL

**Files:**
- Modify: `src/plugins/plugin-drift/src/types.ts:43-52`

**Step 1: Add realizedPnl field**

Update `DriftAccountInfo` interface:

```typescript
/**
 * User's Drift account information
 */
export interface DriftAccountInfo {
  authority: string;              // User's Solana pubkey
  subAccountId: number;
  collateral: string;             // Total collateral (USDC)
  freeCollateral: string;         // Available for new positions
  totalPositionValue: string;
  unrealizedPnl: string;
  settledPnl: string;             // Add: Realized/settled PnL
  cumulativeFunding: string;      // Add: Cumulative funding payments
  marginRatio: string;            // Current margin ratio
  leverage: number;               // Account-level leverage
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd src/plugins/plugin-drift && bun run build`
Expected: Build fails - getAccountInfo needs to provide new fields

**Step 3: Commit type change**

```bash
git add src/plugins/plugin-drift/src/types.ts
git commit -m "feat(drift): extend DriftAccountInfo with settled PnL fields"
```

---

## Task 8: Update getAccountInfo to Include Settled PnL

**Files:**
- Modify: `src/plugins/plugin-drift/src/services/drift.service.ts`

**Step 1: Update getAccountInfo method**

Replace the existing `getAccountInfo` method (~line 585-607):

```typescript
async getAccountInfo(userId: string): Promise<DriftAccountInfo> {
  const client = await this.getClientForUser(userId);
  const user = await this.getValidatedUser(client);
  const userAccount = user.getUserAccount();

  // Calculate margin ratio (collateral / position value * 100)
  const totalCollateral = user.getTotalCollateral();
  const totalPositionValue = user.getTotalAssetValue();
  const marginRatio = totalPositionValue.gt(new BN(0))
    ? Number(totalCollateral.mul(new BN(10000)).div(totalPositionValue)) / 100
    : 100; // 100% if no positions

  // Extract settled PnL and funding from user account
  // These are stored in the account and updated on settlement
  const settledPnl = userAccount.settledPerpPnl || new BN(0);
  const cumulativeFunding = userAccount.cumulativePerpFunding || new BN(0);

  return {
    authority: userAccount.authority.toBase58(),
    subAccountId: userAccount.subAccountId,
    collateral: totalCollateral.toString(),
    freeCollateral: user.getFreeCollateral().toString(),
    totalPositionValue: totalPositionValue.toString(),
    unrealizedPnl: user.getUnrealizedPNL().toString(),
    settledPnl: settledPnl.toString(),
    cumulativeFunding: cumulativeFunding.toString(),
    marginRatio: marginRatio.toFixed(2),
    leverage: user.getLeverage() / 10000,
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd src/plugins/plugin-drift && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/plugins/plugin-drift/src/services/drift.service.ts
git commit -m "feat(drift): include settled PnL in getAccountInfo"
```

---

## Task 9: Update formatAccountInfo for PnL Display

**Files:**
- Modify: `src/plugins/plugin-drift/src/utils/formatters.ts`
- Test: `src/plugins/plugin-drift/__tests__/formatters.test.ts`

**Step 1: Write the failing test**

Update existing `formatAccountInfo` test or add new one:

```typescript
describe('formatAccountInfo with PnL', () => {
  it('should display settled PnL and funding', () => {
    const info: DriftAccountInfo = {
      authority: 'mockAuth123',
      subAccountId: 0,
      collateral: '100000000',        // $100
      freeCollateral: '50000000',     // $50
      totalPositionValue: '150000000', // $150
      unrealizedPnl: '5000000',       // +$5
      settledPnl: '25000000',         // +$25 realized
      cumulativeFunding: '-2000000',  // -$2 funding paid
      marginRatio: '66.67',
      leverage: 1.5,
    };

    const result = formatAccountInfo(info);

    expect(result).toContain('Settled PnL');
    expect(result).toContain('+$25.00');
    expect(result).toContain('Cumulative Funding');
    expect(result).toContain('-$2.00');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd src/plugins/plugin-drift && bun test formatters.test.ts -t "PnL"`
Expected: FAIL - missing PnL display

**Step 3: Update formatAccountInfo**

Update in `formatters.ts`:

```typescript
/**
 * Format account info for display
 */
export function formatAccountInfo(info: DriftAccountInfo): string {
  let text = `**Drift Account**\n\n`;
  text += `**Authority:** \`${info.authority}\`\n`;
  text += `**Subaccount ID:** ${info.subAccountId}\n\n`;

  // Collateral section
  text += `**Collateral:** ${formatUsd(parseFloat(info.collateral) / 1_000_000)}\n`;
  text += `**Free Collateral:** ${formatUsd(parseFloat(info.freeCollateral) / 1_000_000)}\n`;
  text += `**Position Value:** ${formatUsd(parseFloat(info.totalPositionValue) / 1_000_000)}\n\n`;

  // PnL section
  text += `**Unrealized PnL:** ${formatPnl((parseFloat(info.unrealizedPnl) / 1_000_000).toString())}\n`;
  text += `**Settled PnL:** ${formatPnl((parseFloat(info.settledPnl) / 1_000_000).toString())}\n`;
  text += `**Cumulative Funding:** ${formatPnl((parseFloat(info.cumulativeFunding) / 1_000_000).toString())}\n\n`;

  // Risk metrics
  text += `**Leverage:** ${info.leverage.toFixed(2)}x\n`;
  text += `**Margin Ratio:** ${info.marginRatio}%`;

  return text;
}
```

**Step 4: Run test to verify it passes**

Run: `cd src/plugins/plugin-drift && bun test formatters.test.ts -t "PnL"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/plugins/plugin-drift/src/utils/formatters.ts src/plugins/plugin-drift/__tests__/formatters.test.ts
git commit -m "feat(drift): display settled PnL and funding in account info"
```

---

## Task 10: Update Test Mocks for New Fields

**Files:**
- Modify: `src/plugins/plugin-drift/__tests__/drift.service.test.ts`
- Modify: `src/plugins/plugin-drift/__tests__/collateral.test.ts`

**Step 1: Update mockGetUser in both test files**

Add to `getUserAccount` mock return:

```typescript
getUserAccount: () => ({
  authority: new MockPublicKey('mockAuth'),
  subAccountId: 0,
  spotPositions: [],
  settledPerpPnl: new MockBN(25_000_000),      // Add: $25 settled
  cumulativePerpFunding: new MockBN(-2_000_000), // Add: -$2 funding
}),
```

**Step 2: Run all tests**

Run: `cd src/plugins/plugin-drift && bun test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/plugins/plugin-drift/__tests__/drift.service.test.ts src/plugins/plugin-drift/__tests__/collateral.test.ts
git commit -m "test(drift): update mocks for settled PnL fields"
```

---

## Task 11: Final Integration Test

**Files:**
- Test all actions work together

**Step 1: Run full test suite**

Run: `cd src/plugins/plugin-drift && bun test`
Expected: All tests pass (should be 260+ tests)

**Step 2: Build the plugin**

Run: `cd src/plugins/plugin-drift && bun run build`
Expected: Build succeeds with no errors

**Step 3: Build entire project**

Run: `bun run build`
Expected: Full project builds successfully

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(drift): complete withdraw action and PnL tracking

- Add DRIFT_WITHDRAW action to move USDC from Drift to wallet
- Add settledPnl and cumulativeFunding to DriftAccountInfo
- Update formatAccountInfo to display PnL breakdown
- All tests passing (260+)"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Add WithdrawResult type | types.ts |
| 2 | Add DRIFT_WITHDRAW action name | constants.ts |
| 3 | Add formatWithdrawResult formatter | formatters.ts, formatters.test.ts |
| 4 | Add withdraw method to service | drift.service.ts, drift.service.test.ts |
| 5 | Create drift-withdraw action | drift-withdraw.ts (new) |
| 6 | Register action in plugin | index.ts |
| 7 | Extend DriftAccountInfo with PnL | types.ts |
| 8 | Update getAccountInfo for PnL | drift.service.ts |
| 9 | Update formatAccountInfo | formatters.ts, formatters.test.ts |
| 10 | Update test mocks | *.test.ts |
| 11 | Integration test | - |

**Total estimated changes:** ~200 lines added, ~20 lines modified
