# Drift Plugin Validation & Hardening Plan

## Executive Summary

**Plugin**: Drift Protocol (Solana Perpetuals)
**Status**: Structure complete, testing incomplete (est. 60% done)
**Risk Level**: HIGH - No execution tests, never run on testnet
**Location**: `/home/m0xu/1-projects/bl0ck/lina/src/plugins/plugin-drift/`

## Current Implementation Status

### Architecture (Complete ✓)

**Service Layer**:
- `drift.service.ts` - Core trading logic
- Integrates with SolanaTransactionManager for wallets
- 30+ markets (SOL, BTC, ETH, WIF, JUP, BONK, etc.)
- Up to 20x leverage
- Market + limit orders

**Action Layer** (6 actions):
- `DRIFT_OPEN_LONG` / `DRIFT_OPEN_SHORT` - Factory-generated
- `DRIFT_CLOSE_POSITION` - Close positions
- `DRIFT_GET_POSITIONS` - View positions
- `DRIFT_GET_MARKETS` - List markets
- `DRIFT_ACCOUNT_INFO` - Account summary

**Utilities**:
- `action-factory.ts` - DRY pattern for actions
- `formatters.ts` - Display formatting
- `constants.ts` - Markets, config, error messages
- `types.ts` - TypeScript interfaces

### Test Coverage (Incomplete ⚠️)

**Existing Tests**:
- `drift.service.test.ts` (150 LOC visible)
- Validation tests only:
  - ✓ Minimum collateral validation
  - ✓ Maximum leverage validation
  - ✓ Invalid symbol validation
  - ✓ Limit price validation

**Missing Tests** (CRITICAL GAPS):
- ❌ No execution tests (`openPosition`, `closePosition`)
- ❌ No SDK integration tests
- ❌ No wallet signing tests
- ❌ No end-to-end flow tests
- ❌ No action layer tests
- ❌ No utility tests
- ❌ No integration tests
- ❌ No testnet validation

### Plugin Registration (Complete ✓)

- Registered in `src/index.ts` ✓
- Character routing configured ✓
- Environment uses Solana config (no Drift-specific vars)

---

## Critical Gaps Analysis

### Gap 1: No Execution Tests (P0 - BLOCKER)

**Impact**: Could fail on first real trade, potential fund loss
**Risk**: HIGH

**Missing Coverage**:
```typescript
// NO TESTS FOR THESE:
- service.openPosition(userId, params)
- service.closePosition(userId, params)
- service.getPositions(userId)
- service.getMarkets()
- service.getAccountInfo(userId)
- service.deposit(userId, amount)
```

**Why Critical**: These are the actual trading operations. Validation tests don't prove SDK integration works.

---

### Gap 2: No SDK Integration Tests (P0 - BLOCKER)

**Impact**: Unknown if Drift SDK actually works
**Risk**: HIGH

**Missing Validation**:
- Can we connect to Drift on devnet?
- Does SDK initialize correctly?
- Do market fetches work?
- Does wallet signing work?
- Are response structures as expected?

**Why Critical**: DriftService imports `@drift-labs/sdk` but never tested against real SDK.

---

### Gap 3: No Testnet Validation (P0 - BLOCKER)

**Impact**: Plugin never executed real trades
**Risk**: VERY HIGH

**Never Tested**:
- Opening a position on devnet
- Closing a position on devnet
- Real transaction signing
- Real margin calculations
- Real error scenarios

**Why Critical**: All testing is mocked. Plugin might completely fail in production.

---

### Gap 4: Action Layer Not Tested (P1 - HIGH)

**Impact**: Parameter extraction, error handling might fail
**Risk**: MEDIUM

**Missing**:
- No tests for 6 actions
- No tests for `extractUserId()`, `extractActionParams()`
- No tests for formatters
- No tests for factory pattern

**Why Important**: Actions are user-facing. Errors here = bad UX.

---

## Validation & Hardening Plan

### Phase 1: Unit Tests (P0) - 6 hours

**Goal**: 80% test coverage matching Hyperliquid quality

#### Task 1.1: Service Execution Tests (3 hours)

**File**: `__tests__/drift.service.test.ts` (expand existing)

**Tests to Add**:

```typescript
describe('openPosition', () => {
  it('should open long position with market order', async () => {
    // Mock DriftClient.placePerpOrder
    // Call service.openPosition(userId, { symbol: 'SOL-PERP', side: 'long', size: 100, leverage: 5 })
    // Assert: placePerpOrder called with correct params
    // Assert: result.success === true
    // Assert: result.position contains expected data
  });

  it('should open short position with limit order', async () => {
    // Test limit order path
    // Verify limitPrice used correctly
  });

  it('should calculate leverage correctly', async () => {
    // Test margin calculations
  });

  it('should fail with insufficient collateral', async () => {
    // Mock SDK to throw insufficient funds error
    // Assert: result.success === false
    // Assert: result.error contains clear message
  });

  it('should convert USD size to base asset correctly', async () => {
    // Test BN math for position sizing
  });
});

describe('closePosition', () => {
  it('should close 100% of position', async () => {
    // Mock existing position
    // Call closePosition with 100%
    // Verify reduce-only order placed
  });

  it('should close 50% of position', async () => {
    // Test partial closes
  });

  it('should fail if no position exists', async () => {
    // Test error when trying to close non-existent position
  });
});

describe('getPositions', () => {
  it('should return all open positions', async () => {
    // Mock 3 positions
    // Verify all returned with correct data
  });

  it('should return empty array if no positions', async () => {
    // Test empty state
  });

  it('should calculate P&L correctly', async () => {
    // Test unrealizedPnl calculation
  });
});

describe('getMarkets', () => {
  it('should return all available markets', async () => {
    // Mock Drift markets
    // Verify SOL-PERP, BTC-PERP, ETH-PERP included
  });

  it('should handle devnet missing markets gracefully', async () => {
    // Some markets may not exist on devnet
  });
});

describe('getAccountInfo', () => {
  it('should return account summary', async () => {
    // Test collateral, free collateral, leverage, etc.
  });
});
```

**Success Criteria**:
- 25+ new test cases
- All service methods tested
- Error paths covered
- Mocked SDK responses realistic

---

#### Task 1.2: Action Layer Tests (2 hours)

**File**: `__tests__/actions.test.ts` (create new)

**Tests to Add**:

```typescript
describe('driftOpenLong', () => {
  it('should call service.openPosition with correct params', async () => {
    // Mock runtime with DriftService
    // Create mock message with user command
    // Call driftOpenLong.handler
    // Verify service.openPosition called
  });

  it('should format response correctly', async () => {
    // Test callback text formatting
  });

  it('should handle errors gracefully', async () => {
    // Mock service failure
    // Verify error message clear
  });
});

// Repeat for all 6 actions:
// - driftOpenLong
// - driftOpenShort
// - driftClosePosition
// - driftGetPositions
// - driftGetMarkets
// - driftAccountInfo
```

**Success Criteria**:
- All 6 actions tested
- Parameter extraction tested
- Error handling tested
- Mirrors Hyperliquid's `actions.test.ts` quality

---

#### Task 1.3: Utility Tests (1 hour)

**Files**:
- `__tests__/formatters.test.ts` (create new)
- `__tests__/action-factory.test.ts` (create new)

**Tests for Formatters**:
```typescript
describe('formatPositionsList', () => {
  it('should format empty positions list', () => {
    expect(formatPositionsList([])).toContain('No open positions');
  });

  it('should format single position', () => {
    const formatted = formatPositionsList([mockPosition]);
    expect(formatted).toContain('SOL-PERP');
    expect(formatted).toContain('LONG');
  });

  it('should show P&L with correct sign', () => {
    // Test +$50 vs -$50 formatting
  });
});

// Test all formatter functions:
// - formatPositionsList
// - formatMarketsList
// - formatAccountInfo
// - formatPosition (if exists)
```

**Tests for Action Factory**:
```typescript
describe('createOpenPositionAction', () => {
  it('should create long action with correct config', () => {
    const action = createOpenPositionAction({ side: 'long', ... });
    expect(action.name).toBe('DRIFT_OPEN_LONG');
    expect(action.similes).toContain('DRIFT_LONG');
  });

  it('should create short action with correct config', () => {
    // Test short action generation
  });
});

describe('extractUserId', () => {
  it('should extract userId from message', () => {
    // Test userId extraction
  });
});

describe('extractActionParams', () => {
  it('should parse position parameters', () => {
    // Test param parsing
  });
});
```

**Success Criteria**:
- All formatters tested
- All factory functions tested
- Edge cases covered

---

### Phase 2: Integration Tests (P0) - 4 hours

**Goal**: Validate real SDK integration on Solana devnet

#### Task 2.1: SDK Connection Test (1 hour)

**File**: `__tests__/integration.test.ts` (create new)

**Test**:
```typescript
describe('Drift SDK Integration (devnet)', () => {
  it('should initialize DriftClient on devnet', async () => {
    const service = new DriftService(mockRuntime);
    await service.initialize();
    // Verify connection established
    // Verify devnet mode active
  });

  it('should subscribe to Drift markets', async () => {
    // Test SDK subscription works
    // Verify no connection errors
  });
});
```

**Setup Required**:
- Solana devnet RPC access
- Test wallet keypair
- No USDC needed (read-only)

**Success Criteria**:
- SDK initializes without errors
- Connection to devnet succeeds
- Can unsubscribe cleanly

---

#### Task 2.2: Market Data Test (1 hour)

**Test**:
```typescript
describe('Market Data', () => {
  it('should fetch devnet markets', async () => {
    const markets = await service.getMarkets();
    expect(markets.length).toBeGreaterThan(0);
    expect(markets.find(m => m.symbol === 'SOL-PERP')).toBeDefined();
  });

  it('should get oracle prices', async () => {
    // Test price fetching works
  });

  it('should match expected market structure', async () => {
    const market = markets[0];
    expect(market).toHaveProperty('symbol');
    expect(market).toHaveProperty('price');
    expect(market).toHaveProperty('fundingRate');
  });
});
```

**Success Criteria**:
- Markets fetch successfully
- Data structure matches TypeScript types
- SOL-PERP exists on devnet

---

#### Task 2.3: Account Test (1 hour)

**Test**:
```typescript
describe('Account Management', () => {
  it('should create Drift account if not exists', async () => {
    // Test initializeUserAccount()
  });

  it('should fetch account info', async () => {
    const accountInfo = await service.getAccountInfo(testUserId);
    expect(accountInfo).toHaveProperty('collateral');
    expect(accountInfo).toHaveProperty('freeCollateral');
  });
});
```

**Success Criteria**:
- Account creation works
- Account info fetches correctly
- Empty account returns valid data

---

#### Task 2.4: Full Trade Cycle (1 hour - OPTIONAL)

**Test**:
```typescript
describe('Trade Execution (optional)', () => {
  // SKIP if no test USDC available
  it.skip('should open micro position', async () => {
    // Requires test USDC on devnet
    // Open 0.01 SOL worth position
    // Verify transaction succeeds
  });

  it.skip('should close position', async () => {
    // Close the test position
    // Verify closure succeeds
  });
});
```

**Setup Required**:
- Test wallet with SOL (airdrop)
- Test USDC (swap SOL → USDC on Jupiter devnet)
- Deposit USDC to Drift account

**Success Criteria** (if executed):
- Full open → close cycle succeeds
- Transaction hashes valid
- P&L calculated correctly

**Note**: Can skip if no test funds. Read-only tests in 2.1-2.3 are sufficient for initial validation.

---

### Phase 3: Manual Testnet Validation (P0) - 2 hours

**Goal**: Human-in-loop testing on devnet

#### Task 3.1: Setup (30 min)

**Steps**:
1. Ensure SOLANA_NETWORK=solana-devnet in .env
2. Start lina server: `bun run dev`
3. Open frontend
4. Verify Drift actions available

**Checklist**:
- [ ] Server starts without errors
- [ ] Drift plugin loaded
- [ ] Actions appear in UI

---

#### Task 3.2: Read Operations (30 min)

**Scenarios**:

| Command | Expected | Pass/Fail |
|---------|----------|-----------|
| "Show Drift markets" | Lists 10+ markets including SOL-PERP | ⬜ |
| "What's my Drift account" | Shows account info (likely empty) | ⬜ |
| "Show my Drift positions" | "No open positions" | ⬜ |

**Checklist**:
- [ ] Markets fetch correctly
- [ ] Account info displays
- [ ] Empty positions handled gracefully

---

#### Task 3.3: Write Operations (1 hour - OPTIONAL)

**Prerequisites**: Test USDC on Drift devnet account

**Scenarios**:

| Command | Expected | Pass/Fail |
|---------|----------|-----------|
| "Open 2x long on SOL with $20" | Position opens, shows liq price | ⬜ |
| "Show my Drift positions" | Position listed with P&L | ⬜ |
| "Close 50% of SOL position" | Half closed, P&L realized | ⬜ |
| "Close all SOL positions" | Position fully closed | ⬜ |

**Checklist**:
- [ ] Position opens successfully
- [ ] Transaction hash displayed
- [ ] Position shows in UI
- [ ] Partial close works
- [ ] Full close works
- [ ] P&L calculated correctly

**If No Test USDC**: Skip write tests, rely on unit/integration tests.

---

### Phase 4: Error Handling & Edge Cases (P1) - 2 hours

**Goal**: Ensure robustness under failure scenarios

#### Task 4.1: Network Errors (30 min)

**Tests to Add**:
```typescript
describe('Network Resilience', () => {
  it('should handle RPC timeout', async () => {
    // Mock RPC timeout
    // Verify graceful error message
  });

  it('should handle SDK connection failure', async () => {
    // Mock SDK connection error
    // Verify retry or clear error
  });
});
```

---

#### Task 4.2: Boundary Conditions (30 min)

**Tests**:
```typescript
describe('Boundary Conditions', () => {
  it('should reject size below minimum', async () => {
    // Test $5 position (min is $10)
  });

  it('should reject leverage above 20x', async () => {
    // Test 25x leverage
  });

  it('should handle dust amounts', async () => {
    // Test $0.01 position
  });

  it('should handle very large positions', async () => {
    // Test $1M position
  });
});
```

---

#### Task 4.3: User Errors (1 hour)

**Manual Testing**:

| Scenario | Command | Expected Error |
|----------|---------|----------------|
| Invalid symbol | "Open long on FAKE-PERP" | "Unknown market: FAKE-PERP. Available: SOL-PERP, BTC-PERP..." |
| No funds | "Open $1000 position" (balance: $10) | "Insufficient collateral. Available: $10, required: $1000" |
| Bad leverage | "Open 30x long" | "Invalid leverage. Max: 20x" |
| Missing price | "Open limit long" (no price) | "Limit orders require limitPrice parameter" |

**Checklist**:
- [ ] All errors have clear, actionable messages
- [ ] Errors suggest corrections
- [ ] No stack traces shown to users

---

### Phase 5: Production Readiness (P1) - 2 hours

**Goal**: Polish before mainnet launch

#### Task 5.1: Environment Configuration (30 min)

**Updates to `.env.sample`**:
```bash
# =============================================================================
# DRIFT PROTOCOL (SOLANA PERPETUALS)
# =============================================================================

# Drift network selection
# Options: "devnet", "mainnet-beta"
# Default: devnet (safe for testing)
# IMPORTANT: Test thoroughly on devnet before using mainnet
DRIFT_NETWORK="devnet"

# Optional: Custom Drift RPC endpoint
# DRIFT_RPC_URL="https://your-custom-drift-rpc.com"
```

**Validation**:
- [ ] DRIFT_NETWORK env var added
- [ ] Service reads DRIFT_NETWORK correctly
- [ ] Defaults to devnet if not set

---

#### Task 5.2: Risk Warnings (30 min)

**Add to Character.ts**:
```typescript
**Drift Protocol Warnings:**
- Leverage >10x: "High risk - liquidation price close to entry. Sure?"
- First trade: "This is your first Drift trade. Start small to test."
- Large position: "Position >$1000 - verify you have sufficient margin."
```

**Implementation**:
- Update `drift.service.ts` to return warnings
- Display warnings in action responses
- Require confirmation for high-risk trades

**Checklist**:
- [ ] High leverage warning implemented
- [ ] Liquidation price always shown
- [ ] Large position warning added

---

#### Task 5.3: Documentation (1 hour)

**Files to Create**:

1. **`docs/DRIFT_USER_GUIDE.md`** (30 min)
   - What is Drift
   - Supported markets
   - How to trade
   - Leverage explained
   - Risk warnings
   - Troubleshooting

2. **`docs/DRIFT_DEVELOPER_GUIDE.md`** (30 min)
   - Plugin architecture
   - SDK integration
   - Testing guide
   - Deployment checklist

**Checklist**:
- [ ] User guide complete
- [ ] Developer guide complete
- [ ] Troubleshooting section added
- [ ] Examples for all actions

---

## Testing Roadmap

### Critical Path (Must Complete Before Mainnet)

| Phase | Tasks | Effort | Dependencies | Blocker |
|-------|-------|--------|--------------|---------|
| **Phase 1** | Unit Tests | 6h | None | P0 - Must validate logic |
| **Phase 2** | Integration Tests | 4h | Phase 1 | P0 - Must validate SDK |
| **Phase 3** | Manual Testing | 2h | Phase 2 | P0 - Must validate E2E |
| **Phase 4** | Error Handling | 2h | Phase 1 | P1 - Important for UX |
| **Phase 5** | Production Ready | 2h | Phases 1-4 | P1 - Polish before launch |

**Total Effort**: 16 hours (~2 days for one developer)

### Quick Win Path (Minimum Viable Validation)

For fastest validation (if time-constrained):

**Day 1 (4 hours)**:
1. Phase 2, Task 2.1-2.2: SDK connection + market data (2h) → Validates SDK works
2. Phase 1, Task 1.1: Core service tests (2h) → Validates business logic

**Day 2 (2 hours)**:
3. Phase 3, Task 3.1-3.2: Manual read operations (1h) → Validates E2E
4. Phase 5, Task 5.2: Risk warnings (1h) → Production safety

**Total**: 6 hours minimum to validate core functionality

---

## Test Coverage Targets

| Component | Current | Target | Gap |
|-----------|---------|--------|-----|
| **Service** | ~10% | 80% | +70% |
| **Actions** | 0% | 90% | +90% |
| **Utilities** | 0% | 85% | +85% |
| **Integration** | 0% | SDK validated | +100% |
| **Overall** | **~5%** | **80%** | **+75%** |

**Comparison to Hyperliquid**: Target matches Hyperliquid's 80% coverage

---

## Success Criteria

### Must Have (Blocking)
- [ ] 80%+ test coverage
- [ ] All service methods tested
- [ ] SDK connection validated on devnet
- [ ] Markets fetch successfully
- [ ] Manual testing complete (read ops minimum)

### Should Have (Important)
- [ ] All 6 actions tested
- [ ] Error handling tested
- [ ] At least 1 full trade cycle on devnet (manual or auto)
- [ ] Risk warnings implemented

### Nice to Have (Polish)
- [ ] 100% test coverage
- [ ] Automated E2E tests
- [ ] Performance benchmarks
- [ ] Load testing

---

## Risk Mitigation

### If Tests Fail

**Scenario**: Unit tests reveal bugs
- **Action**: Fix bugs before proceeding to integration tests
- **Timeline**: +2-4 hours per major bug

**Scenario**: SDK integration fails
- **Action**: Review SDK documentation, check version compatibility
- **Fallback**: Contact Drift support, check examples repo
- **Timeline**: +4-8 hours if major SDK issues

**Scenario**: Devnet unavailable
- **Action**: Use mocked tests only, defer integration tests
- **Risk**: Higher production risk without devnet validation
- **Mitigation**: Test on mainnet with dust amounts first

### Rollback Plan

If Drift plugin causes production issues:
1. Disable plugin in `src/index.ts` (comment out `driftPlugin`)
2. Restart server
3. Users can still use Hyperliquid for perps
4. Debug offline, redeploy when fixed

**Prevention**: Complete Phases 1-3 before mainnet launch

---

## Next Steps (Immediate)

1. **Run existing tests** (10 min)
   ```bash
   cd /home/m0xu/1-projects/bl0ck/lina/src/plugins/plugin-drift
   bun test
   ```
   - See current test state
   - Identify what's already passing

2. **Review test file** (20 min)
   - Read full `drift.service.test.ts`
   - Understand existing test structure
   - Plan what tests to add

3. **Start Phase 1, Task 1.1** (3 hours)
   - Add execution tests
   - Target: openPosition, closePosition tested

4. **Quick SDK validation** (1 hour)
   - Start Phase 2, Task 2.1
   - Validate SDK connection works
   - Get immediate feedback

**Today's Goal**: Validate SDK works (Phase 2.1) + Add core tests (Phase 1.1)

---

## Files Reference

**Core Implementation**:
- `/home/m0xu/1-projects/bl0ck/lina/src/plugins/plugin-drift/src/services/drift.service.ts`
- `/home/m0xu/1-projects/bl0ck/lina/src/plugins/plugin-drift/src/actions/drift-actions.ts`
- `/home/m0xu/1-projects/bl0ck/lina/src/plugins/plugin-drift/src/utils/action-factory.ts`
- `/home/m0xu/1-projects/bl0ck/lina/src/plugins/plugin-drift/src/utils/formatters.ts`

**Existing Tests**:
- `/home/m0xu/1-projects/bl0ck/lina/src/plugins/plugin-drift/src/__tests__/drift.service.test.ts`

**Tests to Create**:
- `/home/m0xu/1-projects/bl0ck/lina/src/plugins/plugin-drift/src/__tests__/actions.test.ts`
- `/home/m0xu/1-projects/bl0ck/lina/src/plugins/plugin-drift/src/__tests__/formatters.test.ts`
- `/home/m0xu/1-projects/bl0ck/lina/src/plugins/plugin-drift/src/__tests__/action-factory.test.ts`
- `/home/m0xu/1-projects/bl0ck/lina/src/plugins/plugin-drift/src/__tests__/integration.test.ts`

**Config**:
- `/home/m0xu/1-projects/bl0ck/lina/src/index.ts` (plugin registered line 10)
- `/home/m0xu/1-projects/bl0ck/lina/src/character.ts` (routing logic)
- `/home/m0xu/1-projects/bl0ck/lina/.env.sample` (needs DRIFT_NETWORK var)

**Documentation**:
- `/home/m0xu/1-projects/bl0ck/lina/DRIFT_PERPS_IMPLEMENTATION.md` (existing spec)

---

**Plan Created**: 2025-12-05
**Focus**: Drift Plugin Only
**Priority**: Get to 80% test coverage + devnet validation
**Timeline**: 16 hours (2 days) for complete validation
