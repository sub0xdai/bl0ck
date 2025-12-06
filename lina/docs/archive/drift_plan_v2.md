# Drift Protocol Implementation Plan

**Goal:** Enable Lina to execute Solana perpetual trades via Drift Protocol
**Scenario:** User says "Open a 5x long on SOL with $100 on Drift" and it works

---

## Executive Summary

| Metric | Finding |
|--------|---------|
| Architecture | ✅ Sound - follows Hyperliquid patterns |
| Spec Quality | 70% complete - missing auto-collateral + devnet support |
| Risk Level | MODERATE - SDK is mature, integration points clear |
| Timeline | 5-6 days (Enhanced Version recommended) |

**Critical Path:** `SolanaTransactionManager.getOrCreateWallet(userId)` → `DriftClient` → Trade

---

## Phase 1: Foundation (Day 1)

### 1.1 Create Plugin Structure
```
src/plugins/plugin-drift/
├── package.json
├── tsconfig.json
├── build.ts
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── constants.ts
│   ├── services/
│   │   ├── drift.service.ts
│   │   └── drift-client.ts
│   ├── actions/
│   │   └── (6 actions)
│   └── utils/
│       ├── action-factory.ts    # Port from Hyperliquid
│       └── formatters.ts        # Port from Hyperliquid
└── __tests__/
    └── (8 test files - TDD)
```

### 1.2 Install Dependencies
```json
{
  "@drift-labs/sdk": "^2.90.0",
  "@coral-xyz/anchor": "^0.29.0"
}
```

### 1.3 Define Types (`src/types.ts`)
Port from Hyperliquid, adapt for Drift specifics:
- `DriftPosition`, `DriftMarket`, `DriftAccountInfo`
- `OpenPositionParams`, `ClosePositionParams`, `PositionResult`

### 1.4 Split Market Indices (`src/constants.ts`)
**Critical Fix:** Devnet ≠ Mainnet market indices
```typescript
export const DEVNET_MARKETS = { 'SOL-PERP': 0, 'BTC-PERP': 1, 'ETH-PERP': 2 };
export const MAINNET_MARKETS = { 'SOL-PERP': 0, 'BTC-PERP': 1, ... }; // 30+ markets
```

---

## Phase 2: Core Service (Days 2-3)

### 2.1 Write Tests FIRST (TDD)
**File:** `__tests__/drift.service.test.ts`
```typescript
describe('DriftService', () => {
  it('initializes with correct network');
  it('reuses client for same user');
  it('opens long position');
  it('rejects leverage > 20x');
  it('handles insufficient collateral');
});
```

### 2.2 Implement DriftService
**File:** `src/services/drift.service.ts`

Key integration point:
```typescript
private async getClientForUser(userId: string): Promise<DriftClient> {
  const { keypair } = await this.solanaManager.getOrCreateWallet(userId);
  const wallet = new Wallet(keypair);
  // Initialize DriftClient with wallet
}
```

Methods to implement:
1. `getClientForUser(userId)` - Client caching per user
2. `getMarkets()` - List available perp markets (read-only, test first)
3. `getPositions(userId)` - User's open positions
4. `getAccountInfo(userId)` - Collateral, margin, P&L
5. `openPosition(userId, params)` - Open long/short
6. `closePosition(userId, params)` - Close full/partial
7. `deposit(userId, amount)` - Deposit USDC collateral

### 2.3 Add Account Init Safety
```typescript
// Prevent race condition on first trade
if (!user.exists()) {
  await this.accountInitLock.acquire(userId);
  try {
    const solBalance = await this.connection.getBalance(keypair.publicKey);
    if (solBalance < 0.02 * LAMPORTS_PER_SOL) {
      throw new Error('Need 0.02 SOL to initialize Drift account');
    }
    await client.initializeUserAccount();
  } finally {
    this.accountInitLock.release(userId);
  }
}
```

---

## Phase 3: Actions (Day 4)

### 3.1 Port Action Factory
**From:** `/src/plugins/plugin-hyperliquid/src/utils/action-factory.ts`
**To:** `/src/plugins/plugin-drift/src/utils/action-factory.ts`

Adapt for Drift specifics:
- Max leverage: 20x (not 25x)
- Market format: `SOL-PERP` (not just `BTC`)

### 3.2 Create 6 Actions

| Action | File | Similes |
|--------|------|---------|
| `DRIFT_OPEN_LONG` | `drift-open-long.ts` | DRIFT LONG, SOLANA LONG |
| `DRIFT_OPEN_SHORT` | `drift-open-short.ts` | DRIFT SHORT, SOLANA SHORT |
| `DRIFT_CLOSE_POSITION` | `drift-close-position.ts` | CLOSE DRIFT |
| `DRIFT_GET_POSITIONS` | `drift-get-positions.ts` | DRIFT POSITIONS |
| `DRIFT_GET_MARKETS` | `drift-get-markets.ts` | DRIFT MARKETS |
| `DRIFT_ACCOUNT_INFO` | `drift-account-info.ts` | DRIFT ACCOUNT |

Each action ~20 lines using factory pattern.

---

## Phase 4: Auto-Collateral (Day 5)

### 4.1 Jupiter Integration
**Critical for UX parity with Hyperliquid**

When user has SOL but no USDC:
```typescript
async openPosition(userId, params) {
  const marginRequired = this.calculateMargin(params);
  const accountInfo = await this.getAccountInfo(userId);

  if (accountInfo.freeCollateral < marginRequired) {
    logger.info('[DRIFT] Auto-swapping SOL to USDC...');

    // 1. Swap via Jupiter
    const jupiterService = this.runtime.getService('JUPITER_SERVICE');
    await jupiterService.swapTokens({
      userId,
      inputMint: 'So11111111111111111111111111111111111111112', // SOL
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      amount: marginRequired * 1.1, // 10% buffer
    });

    // 2. Deposit to Drift
    await this.deposit(userId, marginRequired);
  }

  // 3. Place order
  return await this.placeOrder(...);
}
```

---

## Phase 5: Testing & Hardening (Day 6)

### 5.1 Test Suite (8 files, target 78+ tests)
```
__tests__/
├── drift.service.test.ts      # Service unit tests
├── drift-client.test.ts       # Client lifecycle
├── actions.test.ts            # Action validation
├── formatters.test.ts         # Display utilities
├── integration.test.ts        # E2E flows
├── collateral.test.ts         # Auto-provision logic
├── markets.test.ts            # Market index handling
└── error-handling.test.ts     # Failure cases
```

### 5.2 Code-Hound Review
Target scores:
- TDD: 90/100 (tests written first)
- KISS: 95/100 (factory pattern)
- SOLID: 85/100 (clean interfaces)
- DRY: 95/100 (reuse Hyperliquid patterns)

### 5.3 Devnet Validation
1. `bun run dev` with `SOLANA_NETWORK=solana-devnet`
2. Test: "Show Drift markets" → Should list SOL/BTC/ETH only
3. Test: "Open 2x long on SOL with $50" → Should work
4. Verify tx on Solana Explorer (devnet)

---

## Critical Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/plugins/plugin-drift/*` | CREATE | New plugin |
| `src/index.ts:10,41` | VERIFY | Plugin already registered |
| `src/character.ts` | VERIFY | Drift routing already documented |
| `package.json` | ADD | @drift-labs/sdk dependency |

---

## Dependency Graph

```
SolanaTransactionManager (EXISTS)
        ↓
   getOrCreateWallet(userId) → { publicKey, keypair }
        ↓
   DriftClientWrapper (BUILD)
        ↓
   DriftService (BUILD)
        ↓
   Actions × 6 (BUILD)
        ↓
   JupiterService (EXISTS) ← Auto-collateral integration
```

---

## Success Criteria

1. **Basic Flow Works:**
   ```
   User: "Open a 5x long on SOL with $100 on Drift"
   Lina: Opens position, returns entry price + liquidation price
   ```

2. **Auto-Collateral Works:**
   ```
   User has 1 SOL, no USDC
   User: "Open 3x short on ETH"
   Lina: Auto-swaps SOL→USDC, deposits, opens position
   ```

3. **Wallet Router Works:**
   ```
   User has SOL + ETH
   User: "Open a perp position"
   Lina: "You have funds on both chains. Which venue: Drift (Solana) or Hyperliquid (EVM)?"
   ```

4. **Test Coverage:** 78+ tests passing

---

## Timeline Summary

| Day | Deliverable |
|-----|-------------|
| 1 | Plugin structure, types, constants, devnet markets |
| 2 | DriftService skeleton, getMarkets, getPositions |
| 3 | openPosition, closePosition, deposit |
| 4 | 6 actions via factory pattern |
| 5 | Auto-collateral (Jupiter integration) |
| 6 | Tests, code-hound review, devnet validation |

**Total: 5-6 days**

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| SDK version incompatibility | HIGH | Pin exact version, test before implementing |
| Devnet market indices wrong | HIGH | Split DEVNET/MAINNET constants |
| User has no SOL for account init | MEDIUM | Check 0.02 SOL minimum before init |
| Concurrent account init | MEDIUM | Use mutex lock |
| Jupiter swap fails | LOW | Fallback to manual "swap first" message |
