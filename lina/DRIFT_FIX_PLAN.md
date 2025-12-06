# Drift Trading Fix + API Optimization Plan

## Executive Summary

Three critical issues preventing Drift trades from executing:
1. **Wrong balance checks** - Code checks Drift account balance instead of wallet balance
2. **5-minute cache blocks balance updates** - Users don't see deposits until cache expires
3. **30-60 second API latency** - Blocking startup from CoinGecko/DeFiLlama/Nansen

---

## Issue 1: Drift SDK Trade Flow (CRITICAL)

### Root Cause
The `openPosition()` flow is fundamentally broken:

```
CURRENT (BROKEN):
1. ensureCollateral() → checks Drift account free collateral
2. If shortfall → swap SOL→USDC (lands in WALLET, not Drift)
3. deposit() → checks Drift account USDC balance (WRONG!)
4. Fails: "Insufficient USDC balance"

CORRECT FLOW:
1. Check WALLET USDC token account balance
2. If insufficient → swap SOL→USDC in wallet
3. deposit() → transfer USDC from WALLET to Drift account
4. Now Drift has collateral → open position
```

### Files to Modify

**`src/plugins/plugin-drift/src/services/drift.service.ts`**

| Function | Line | Issue | Fix |
|----------|------|-------|-----|
| `deposit()` | 439-449 | Checks `user.getSpotPosition(0)` (Drift balance) | Check wallet USDC token account via `getTokenAccountBalance()` |
| `ensureCollateral()` | 480-488 | Checks `getFreeCollateral()` (Drift balance) | Check wallet USDC balance first |
| `openPosition()` | 216-219 | Calls both ensureCollateral AND deposit | Merge into single collateral flow |

### Implementation Steps

1. **Add wallet balance helper** (~20 lines):
```typescript
private async getWalletUsdcBalance(userId: string): Promise<number> {
  const walletInfo = await this.solanaManager.getOrCreateWallet(userId);
  const usdcAta = getAssociatedTokenAddressSync(
    new PublicKey(MINTS.USDC),
    walletInfo.keypair.publicKey
  );
  const balance = await this.connection!.getTokenAccountBalance(usdcAta);
  return Number(balance.value.amount) / 1_000_000;
}
```

2. **Fix `ensureCollateral()`** - Check wallet USDC first, then swap if needed

3. **Fix `deposit()`** - Check wallet balance, not Drift position

4. **Fix `openPosition()`** - Correct order:
   - Validate params
   - Get DriftClient (init account if needed)
   - Check wallet USDC → swap if needed
   - Deposit USDC from wallet to Drift
   - Open position

---

## Issue 2: Wallet Balance Not Refreshing

### Root Cause
- **5-minute cache TTL** in `solana-transaction-manager.ts` line 85
- **No real-time subscriptions** - Solana RPC `onAccountChange()` not used
- **No auto-refresh after deposits** - Only manual sync button works

### Files to Modify

**`src/managers/solana-transaction-manager.ts`**
- Line 85: `CACHE_TTL = 300 * 1000` → reduce to 30-60 seconds
- Add `onAccountChange()` subscription for balance updates

**`src/packages/server/src/api/wallet/index.ts`**
- Add WebSocket push for balance changes

**`src/frontend/contexts/AgentWalletContext.tsx`**
- Add periodic polling (every 15-30 seconds) when balance is low/zero

### Implementation Steps

1. **Reduce cache TTL** - 5 min → 60 seconds (line 85)
2. **Add balance subscription** - Use `connection.onAccountChange()`
3. **Add frontend polling** - Auto-refresh every 30s when awaiting deposit

---

## Issue 3: API Latency (Nansen, CoinGecko, DeFiLlama)

### Root Causes

| Service | Issue | Impact |
|---------|-------|--------|
| **Nansen MCP** | `maxRetries: 20` | 30+ seconds on first error |
| **CoinGecko** | `loadCoinsIndex()` blocks startup | 15+ seconds |
| **DeFiLlama** | `loadIndex()` + `loadYieldsPools()` block startup | 20+ seconds |

### Files to Modify

**`src/character.ts`** (Nansen)
- Line 25: `maxRetries: 20` → `maxRetries: 3`

**`src/plugins/plugin-coingecko/src/services/coingecko.service.ts`**
- Move `loadCoinsIndex()` from `initialize()` to lazy (first use)
- Reduce timeout from 15s to 10s

**`src/plugins/plugin-defillama/src/services/defillama.service.ts`**
- Move `loadIndex()` and `loadYieldsPools()` to lazy loading
- Add early return if indices not needed

### Implementation Steps

1. **Reduce Nansen retries** - 20 → 3 (instant win)
2. **Lazy load CoinGecko index** - Don't block startup
3. **Lazy load DeFiLlama indices** - Don't block startup
4. **Add Pro API key docs** - COINGECKO_API_KEY for faster queries

---

## Priority Order (User Confirmed: Drift First)

### Phase 1: Fix Drift Trading (NOW)
| Task | Impact | Effort |
|------|--------|--------|
| Add `getWalletUsdcBalance()` helper | Required for fixes | 15 min |
| Fix `deposit()` - check wallet balance | Trades broken | 30 min |
| Fix `ensureCollateral()` - check wallet first | Trades broken | 30 min |
| Fix `openPosition()` - correct order | Trades broken | 30 min |
| Update tests | Ensure 260 still GREEN | 30 min |

### Phase 2: API Latency (After Drift Works)
| Task | Impact | Effort |
|------|--------|--------|
| Reduce Nansen maxRetries 20→3 | 30s → 5s | 5 min |
| Lazy load CoinGecko index | 15s faster | 30 min |
| Lazy load DeFiLlama indices | 20s faster | 30 min |
| Reduce wallet cache TTL 5m→60s | Faster refresh | 5 min |

---

## Test Plan

1. **Drift trade flow**:
   - Open position with 0 USDC in Drift, but SOL in wallet
   - Verify auto-swap executes
   - Verify deposit transfers USDC from wallet to Drift
   - Verify position opens successfully

2. **Balance refresh**:
   - Send SOL to CDP wallet address
   - Verify balance updates within 60 seconds (not 5 minutes)

3. **API latency**:
   - Measure startup time before/after changes
   - Target: < 10 seconds total startup

---

## Critical Files Summary

```
src/plugins/plugin-drift/src/services/drift.service.ts  # Main fixes
src/managers/solana-transaction-manager.ts              # Cache TTL
src/character.ts                                        # Nansen retries
src/plugins/plugin-coingecko/src/services/coingecko.service.ts  # Lazy load
src/plugins/plugin-defillama/src/services/defillama.service.ts  # Lazy load
```
