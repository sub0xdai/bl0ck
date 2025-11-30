# Lina Autonomous Trading Roadmap

## Goal
Enable Lina to actively trade tokens and search for opportunities across multiple venues.

## Trading Capabilities

| Venue | Type | Status | Plugin |
|-------|------|--------|--------|
| **Solana (Jupiter)** | Spot swaps | ✅ Exists | `plugin-jupiter` |
| **Base/EVM (Uniswap)** | Spot swaps | ✅ Exists | `plugin-cdp` |
| **Hyperliquid** | Perps (leverage) | ✅ Complete | `plugin-hyperliquid` |

---

## Existing Spot Trading (Already Built)

### Solana - Jupiter DEX
- **Action**: `SOLANA_SWAP`
- **Tokens**: SOL, USDC, USDT, BONK, WIF, JUP
- **Features**: Slippage control, route optimization

### EVM - Uniswap/0x
- **Action**: `USER_WALLET_SWAP`
- **Chains**: Base, Ethereum, Polygon, Arbitrum, Optimism
- **Features**: Multi-DEX fallback, percentage swaps

---

## Hyperliquid Perpetuals (Completed)

### Plugin Structure
```
src/plugins/plugin-hyperliquid/
├── src/
│   ├── index.ts
│   ├── services/hyperliquid.service.ts
│   ├── utils/
│   │   ├── action-factory.ts
│   │   └── formatters.ts
│   └── actions/
│       ├── perp-open-long.ts
│       ├── perp-open-short.ts
│       ├── perp-close-position.ts
│       ├── perp-get-positions.ts
│       ├── perp-get-markets.ts
│       └── perp-account-info.ts
├── __tests__/
│   ├── hyperliquid.service.test.ts
│   ├── actions.test.ts
│   └── integration.test.ts (78 passing tests)
├── package.json
└── build.ts
```

### Actions
| Action | Description |
|--------|-------------|
| `PERP_OPEN_LONG` | Open leveraged long position |
| `PERP_OPEN_SHORT` | Open leveraged short position |
| `PERP_CLOSE_POSITION` | Close existing position |
| `PERP_GET_POSITIONS` | List positions with P&L |
| `PERP_GET_MARKETS` | List available markets |
| `PERP_ACCOUNT_INFO` | Account balance/margin |

### Environment
```bash
HYPERLIQUID_PRIVATE_KEY="0x..."
HYPERLIQUID_TESTNET="true"
```

### Features
- Market + Limit orders
- Leverage 1-25x (default 1x for safety)
- Partial position closing
- Real-time P&L tracking
- Liquidation price warnings
- Comprehensive test coverage (78 tests)

---

## Market Intelligence (Already Built)

| Source | Data | Plugin |
|--------|------|--------|
| **Nansen MCP** | Smart money flows, whale tracking | `plugin-mcp` |
| **CoinGecko** | Prices, trending tokens | `plugin-coingecko` |
| **DeFiLlama** | TVL, yield rates | `plugin-defillama` |
| **Birdeye** | Solana analytics | `plugin-analytics` |

---

## Implementation Phases

### Phase 1: Hyperliquid Plugin (✅ Complete)
- [x] Create plugin scaffold
- [x] Implement SDK service wrapper
- [x] Build perp trading actions (6 actions)
- [x] Register and test on testnet
- [x] 78 passing tests
- [x] Code-hound reviews (4 phases)
- [x] Character.ts integration
- [x] Documentation complete

### Phase 2: Strategy Engine (Future)
- [ ] Opportunity scanner (trending + smart money)
- [ ] Arbitrage detector (cross-DEX spreads)
- [ ] Signal generation with confidence scores

### Phase 3: Autonomous Execution (Future)
- [ ] Background scheduler (cron jobs)
- [ ] Risk manager (position limits, stop-loss)
- [ ] Position tracking database

---

## Trading Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    MARKET INTELLIGENCE                        │
│  Nansen (flows) + CoinGecko (trends) + DeFiLlama (yields)    │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    STRATEGY ENGINE                            │
│  Evaluate signals → Generate trade decisions                  │
└──────────────────────────┬───────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   SOLANA     │  │   BASE/EVM   │  │  HYPERLIQUID │
│   Jupiter    │  │   Uniswap    │  │    Perps     │
│  Spot Swaps  │  │  Spot Swaps  │  │  Long/Short  │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## Completed Files

| File | Status |
|------|--------|
| `src/plugins/plugin-hyperliquid/*` | ✅ Complete (20 files) |
| `src/index.ts` | ✅ Plugin registered |
| `.env.sample` | ✅ HYPERLIQUID_* vars documented |
| `src/character.ts` | ✅ Perpetuals Trading Protocol added |

## Future Work

| File | Purpose |
|------|---------|
| `src/managers/strategy-engine.ts` | Signal evaluation (Phase 2) |
| `src/managers/trading-scheduler.ts` | Background jobs (Phase 3) |

---

## Pending: x402 Configuration

```bash
X402_RECEIVING_WALLET="0xc285f922116959db9eaf9f07729fabb7370a5b36"
X402_SOLANA_RECEIVING_WALLET="u4nJrPcuABnthzfm3CPZ9G4FA3bcoa5XXa2B5kkvHC8"
```
