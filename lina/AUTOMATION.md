# Lina Automated Trading

> Automated perpetual futures trading system using Drift Protocol on Solana.

---

## Strategy Overview

| Aspect | Approach |
|--------|----------|
| **Style** | Trend following + Event-driven |
| **Timeframes** | Macro (daily/weekly) for direction, intraday for entry |
| **Execution** | Full auto within risk limits |
| **Cadence** | Continuous polling every 1-5 minutes |

---

## Signal Sources

### Asset-Specific Weighting

Different asset types respond to different signals. Weights are configurable.

| Asset Type | Trend | News/Events | Volume/OI | Social |
|------------|-------|-------------|-----------|--------|
| **Majors** (BTC, ETH, SOL) | 40% | 30% | 20% | 10% |
| **Memecoins** (WIF, BONK) | 20% | 15% | 25% | 40% |
| **DeFi** (JUP, JTO) | 30% | 25% | 30% | 15% |

### Data Sources

| Signal | Source | Status |
|--------|--------|--------|
| Trend/Technicals | OpenBB API | Explore |
| News/Events | CoinDesk, OpenBB | Partial |
| Volume/OI | Drift API, CoinGecko | Exists |
| Social momentum | LunarCrush, Santiment, OpenBB | Explore |
| On-chain flows | Nansen MCP | Exists |

---

## Risk Management

All limits are **% of account equity** and **user configurable**.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxPositionPct` | 5% | Max single position size |
| `maxExposurePct` | 25% | Max total exposure across all positions |
| `intervalMinutes` | 5 | Signal evaluation frequency |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    STRATEGY LOOP                        │
│              (orchestrates every N minutes)             │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌───────────────┐ ┌───────────┐ ┌───────────────┐
│ SIGNALS SVC   │ │   RISK    │ │  EXECUTION    │
│               │ │  MANAGER  │ │   ENGINE      │
│ - Aggregate   │ │           │ │               │
│   data        │ │ - Position│ │ - Drift SDK   │
│ - Weighted    │ │   sizing  │ │ - Order mgmt  │
│   scoring     │ │ - Limits  │ │ - Monitoring  │
└───────────────┘ └───────────┘ └───────────────┘
        │                              │
        ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│                   DATA PROVIDERS                        │
│  CoinGecko │ CoinDesk │ Nansen │ OpenBB │ Drift API    │
└─────────────────────────────────────────────────────────┘
```

---

## Components

### 1. SignalsService
`plugin-strategy-core/src/services/signals.service.ts`

- Aggregate multiple data sources
- Generate weighted signal scores per asset
- Return: `{ signal: 'long' | 'short' | 'hold', confidence: 0-1, asset: string }`

### 2. RiskManager
`plugin-strategy-core/src/services/risk.service.ts`

- Track current exposure across positions
- Calculate position sizes: `equity * maxPositionPct / 100`
- Enforce limits before execution
- Query Drift for current positions and account equity

### 3. ExecutionEngine
`plugin-strategy-core/src/services/execution.service.ts`

- Translate signals into Drift orders via existing `DriftService`
- Manage open positions (monitor P&L, close on signal reversal)
- Handle errors gracefully with retries

### 4. StrategyLoop
`plugin-strategy-core/src/services/strategy-loop.ts` (enhance existing)

- Orchestrate cycle: fetch signals → check risk → execute
- Configurable interval
- Comprehensive logging

### 5. OpenBB Plugin (new)
`plugin-openbb/`

- Explore OpenBB API for consolidated data access
- Technical indicators (RSI, MACD, MA crosses)
- News aggregation
- Crypto price data

---

## Configuration

```typescript
interface AutomationConfig {
  enabled: boolean;
  intervalMinutes: number;      // 1-5, default 5
  maxPositionPct: number;       // default 5
  maxExposurePct: number;       // default 25
  assets: string[];             // ['SOL-PERP', 'BTC-PERP', ...]
  assetWeights: Record<string, {
    trend: number;
    news: number;
    volume: number;
    social: number;
  }>;
}
```

Stored in environment or runtime settings.

---

## Implementation Phases

### Phase 1: Foundation
- [x] Clean up root directory
- [x] Create AUTOMATION.md
- [ ] Enhance StrategyLoop skeleton
- [ ] Add RiskManager with % equity logic
- [ ] User config system

### Phase 2: Signal Generation
- [ ] Explore OpenBB API integration
- [ ] Implement trend indicators
- [ ] Integrate existing data sources

### Phase 3: Execution
- [ ] ExecutionEngine with Drift integration
- [ ] Position monitoring and exit logic
- [ ] Error handling and retries

### Phase 4: Tuning
- [ ] Signal weight presets per asset class
- [ ] Paper trading mode for testing
- [ ] Performance logging and metrics

---

## References

- [OpenBB API Docs](https://docs.openbb.co/python/basic_usage/query_parameters)
- [Drift Protocol](https://www.drift.trade/)
- Existing plugins: `plugin-drift`, `plugin-coingecko`, `plugin-web-search`, `plugin-defillama`
