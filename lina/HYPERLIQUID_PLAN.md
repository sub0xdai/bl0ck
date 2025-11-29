# Hyperliquid Perpetuals Plugin Implementation Plan

## Overview

Implement `plugin-hyperliquid` to enable Lina to trade perpetual futures with leverage on Hyperliquid DEX. This fills the gap between existing spot trading (Jupiter/Solana, Uniswap/EVM) and leveraged trading.

---

## Project Context (from commit history analysis)

**Recent Activity:**
- 77 integration tests passing, build optimized (63MB → ~30MB)
- Jupiter/Solana plugin recently completed (excellent reference)
- Plugin development guide (638 lines) documents patterns
- Web3 wallet auth migration (SIWE/SIWS)

**Current Trading Stack:**
- Solana spot: `plugin-jupiter` (SOLANA_SWAP)
- EVM spot: `plugin-cdp` (USER_WALLET_SWAP)
- Cross-chain: `plugin-relay` (bridging)
- **Missing: Perpetuals/leverage** → Hyperliquid

---

## Plugin Structure

```
src/plugins/plugin-hyperliquid/
├── package.json
├── build.ts
├── tsconfig.json
├── __tests__/
│   ├── hyperliquid.service.test.ts
│   ├── perp-open-position.test.ts
│   ├── perp-close-position.test.ts
│   └── perp-get-positions.test.ts
└── src/
    ├── index.ts
    ├── types.ts
    ├── constants.ts
    ├── services/
    │   └── hyperliquid.service.ts
    └── actions/
        ├── perp-open-long.ts
        ├── perp-open-short.ts
        ├── perp-close-position.ts
        ├── perp-get-positions.ts
        ├── perp-get-markets.ts
        └── perp-account-info.ts
```

---

## Actions Specification

| Action | Description | Parameters |
|--------|-------------|------------|
| `PERP_OPEN_LONG` | Open leveraged long | symbol, size, leverage (1-25x), orderType (market/limit), limitPrice? |
| `PERP_OPEN_SHORT` | Open leveraged short | symbol, size, leverage (1-25x), orderType (market/limit), limitPrice? |
| `PERP_CLOSE_POSITION` | Close position (full/partial) | symbol, percentage (default 100%), orderType (market/limit), limitPrice? |
| `PERP_GET_POSITIONS` | List positions with P&L | none |
| `PERP_GET_MARKETS` | List available markets | none |
| `PERP_ACCOUNT_INFO` | Account balance/margin | none |

**Leverage Constraints:**
- Default: 1x (safest)
- Maximum: 25x (hard cap)
- Double confirmation required for >5x

---

## Service Layer Design

**HyperliquidService** extends `Service` from `@elizaos/core`:

```typescript
class HyperliquidService extends Service {
  // Wallet management (encrypted, per-user)
  async getOrCreateWallet(userId: string): Promise<HyperliquidWallet>

  // Trading operations
  async openPosition(params: OpenPositionParams): Promise<PositionResult>
  async closePosition(params: ClosePositionParams): Promise<CloseResult>

  // Read operations
  async getPositions(userId: string): Promise<Position[]>
  async getMarkets(): Promise<Market[]>
  async getAccountInfo(userId: string): Promise<AccountInfo>
}
```

**Wallet Encryption Pattern** (from SolanaTransactionManager):
- AES-256-GCM encryption
- Key derived from HYPERLIQUID_PRIVATE_KEY + userId
- Memory-only during service lifecycle

---

## Environment Variables

```bash
# Required
HYPERLIQUID_PRIVATE_KEY="0x..."

# Optional (defaults to testnet for safety)
HYPERLIQUID_TESTNET="true"
```

---

## Dependencies

**Primary SDK:** `hyperliquid` v1.7.7 (official) - **CONFIRMED**

---

## User Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SDK | Official `hyperliquid` v1.7.7 | Direct from source, official support |
| Max Leverage | 25x | Moderate risk cap - allows advanced strategies |
| Order Types | Market + Limit | Complete trading capability |
| TDD Review | Each phase | Code-hound reviews after each day's work |

---

## TDD Implementation Strategy (Red-Green-Refactor)

### Phase 1: Test Infrastructure (RED)
1. Write failing tests for HyperliquidService
   - Wallet creation/encryption
   - Position opening (long/short)
   - Position closing
   - Read operations (positions, markets, account)

2. Write failing tests for each action
   - Parameter validation
   - Pre-flight checks (balance, margin)
   - Error handling

### Phase 2: Implementation (GREEN)
1. Service layer - make tests pass
2. Actions - make tests pass
3. Integration tests with testnet

### Phase 3: Refactor
1. Extract common patterns
2. Optimize error handling
3. Add edge cases

---

## Files to Modify

| File | Change |
|------|--------|
| `src/index.ts` | Import and register hyperliquidPlugin |
| `.env.sample` | Add HYPERLIQUID_* variables |
| `src/character.ts` | Add leverage risk warnings, perps examples |
| `TRADING_ROADMAP.md` | Update Phase 1 checklist |

---

## Critical Files to Read Before Implementation

1. `src/plugins/plugin-jupiter/src/actions/jupiter-swap.ts` - Action pattern
2. `src/plugins/plugin-jupiter/src/services/jupiter.service.ts` - Service pattern
3. `src/managers/solana-transaction-manager.ts` - Wallet encryption
4. `src/plugins/plugin-jupiter/utils/build-utils.ts` - Build system
5. `docs/PLUGIN_DEVELOPMENT.md` - Comprehensive guide

---

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Leverage exposure | HIGH | Default 1x, double-confirm >5x, show liquidation price |
| SDK maturity | HIGH | Start simple, fallback to alternative SDK |
| Private key handling | HIGH | AES-256-GCM encryption, memory-only |
| API rate limits | MEDIUM | Exponential backoff |
| Liquidation risk | MEDIUM | Display warnings, margin checks |

---

## Character Updates

Add to `system` prompt:
- Leverage risk warnings
- Default to 1x leverage
- Double confirmation for >5x
- Always display liquidation prices
- Perps-specific pre-flight checks

---

## Implementation Phases (with Code-Hound Reviews)

### Phase 1: Scaffold + Service Tests (TDD RED)
- [ ] Create plugin scaffold (package.json, build.ts, tsconfig.json)
- [ ] Write HyperliquidService tests (wallet, positions, markets)
- [ ] Write action tests (validation, execution, limit orders)
- [ ] **CODE-HOUND REVIEW #1** - Verify test coverage, SOLID principles

### Phase 2: Service Implementation (TDD GREEN)
- [ ] Implement HyperliquidService (make tests pass)
- [ ] Wallet encryption/management
- [ ] SDK integration (market + limit orders)
- [ ] **CODE-HOUND REVIEW #2** - Verify SRP, DRY, error handling

### Phase 3: Actions Implementation (TDD GREEN)
- [ ] Implement 6 actions (make tests pass)
- [ ] Add limit order support to position actions
- [ ] Register plugin in src/index.ts
- [ ] **CODE-HOUND REVIEW #3** - Verify action patterns, edge cases

### Phase 4: Integration + Character
- [ ] Integration tests with testnet
- [ ] Update character.ts with perps guidance (25x cap, limit orders)
- [ ] Update .env.sample
- [ ] **CODE-HOUND REVIEW #4** - End-to-end test coverage

### Phase 5: Validation + Final Review
- [ ] End-to-end testnet validation
- [ ] Update TRADING_ROADMAP.md
- [ ] **CODE-HOUND FINAL REVIEW** - Full plugin audit (TDD, KISS, SOLID, DRY)
