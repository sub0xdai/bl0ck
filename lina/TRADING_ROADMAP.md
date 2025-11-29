# Lina Autonomous Trading Roadmap

## Goal
Enable Lina to actively trade tokens and search for opportunities across multiple venues.

## Trading Capabilities

| Venue | Type | Status | Plugin |
|-------|------|--------|--------|
| **Solana (Jupiter)** | Spot swaps | ✅ Exists | `plugin-jupiter` |
| **Base/EVM (Uniswap)** | Spot swaps | ✅ Exists | `plugin-cdp` |
| **Hyperliquid** | Perps (leverage) | 🔨 Build | `plugin-hyperliquid` |

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

## New: Hyperliquid Perps (To Build)

### Plugin Structure
```
src/plugins/plugin-hyperliquid/
├── src/
│   ├── index.ts
│   ├── services/hyperliquid.service.ts
│   └── actions/
│       ├── perp-open-position.ts
│       ├── perp-close-position.ts
│       ├── perp-get-positions.ts
│       ├── perp-get-markets.ts
│       └── perp-account-info.ts
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

### Phase 1: Hyperliquid Plugin (Current)
- [ ] Create plugin scaffold
- [ ] Implement SDK service wrapper
- [ ] Build perp trading actions
- [ ] Register and test on testnet

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

## Files to Create

| File | Purpose |
|------|---------|
| `src/plugins/plugin-hyperliquid/*` | Perp trading plugin |
| `src/managers/strategy-engine.ts` | Signal evaluation (Phase 2) |
| `src/managers/trading-scheduler.ts` | Background jobs (Phase 3) |

## Files to Modify

| File | Change |
|------|--------|
| `src/index.ts` | Register hyperliquid plugin |
| `.env` | Add HYPERLIQUID_PRIVATE_KEY |
| `src/character.ts` | Add trading personality traits |

---

## Pending: x402 Configuration

```bash
X402_RECEIVING_WALLET="0xc285f922116959db9eaf9f07729fabb7370a5b36"
X402_SOLANA_RECEIVING_WALLET="u4nJrPcuABnthzfm3CPZ9G4FA3bcoa5XXa2B5kkvHC8"
```
