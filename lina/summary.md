# Lina Development Summary

> **IMPORTANT:** This file must not exceed 150 lines. Each edit is a REWRITE, not an append.

---

## Summary

**Session: Dec 31, 2025**

1. **SHORT positions bug: RESOLVED** - Fixed hallucinated tx hashes
2. **Automation Phase 1: COMPLETE** - Types, state persistence, safety utilities
3. **Automation Phase 2: COMPLETE** - SignalsService, RiskManager, StrategyLoop enhanced

---

## Completed Today

### Automation Phase 2: Core Services

**New Services Created:**
- `openbb.service.ts` - OpenBB REST API integration (OHLCV, RSI, MACD, news)
- `signals.service.ts` - Multi-source signal aggregation (trend + news + volume)
- `risk-manager.service.ts` - Exposure tracking, position sizing, circuit breaker

**StrategyLoop Enhanced:**
- Integrates SignalsService and RiskManager
- Supports dry-run mode for testing
- Per-user automation with database persistence
- Handles position flips (close before reverse)

**Tests:** 75 passing tests (16 new RiskManager tests)

---

## Current State

| Component | Status |
|-----------|--------|
| Drift LONG/SHORT | Working |
| Hyperliquid perps | Working |
| Automation Phase 1 | Complete |
| Automation Phase 2 | Complete |
| MIN_COLLATERAL | $1 (testing) |

---

## Architecture (plugin-strategy-core)

```
StrategyLoop (orchestrates every 5 minutes)
    ├── SignalsService
    │   ├── OpenBB (technicals: RSI, MACD) [optional]
    │   ├── CoinGecko (price trends)
    │   ├── CoinDesk/WebSearch (news sentiment)
    │   └── DeFiLlama (TVL/volume)
    │
    ├── RiskManager
    │   ├── Exposure tracking
    │   ├── Position sizing (% equity, scaled by confidence)
    │   ├── CircuitBreaker (mutex-protected)
    │   └── TradeCooldown (per-asset)
    │
    └── DriftService (execution)
```

---

## Next Steps

**Phase 3: Execution + Safety**
- [ ] Wire up real execution path testing
- [ ] Add slippage protection
- [ ] Position monitoring loop

**Phase 4: User Controls**
- [ ] Enable/disable automation actions
- [ ] Status reporting action
- [ ] Config update action

---

## Signal Weights

| Source | Weight | Provider |
|--------|--------|----------|
| Trend | 50% | OpenBB RSI/MACD or CoinGecko 7d |
| News | 30% | CoinDesk/WebSearch sentiment |
| Volume | 20% | DeFiLlama TVL changes |

**Signal threshold:** Confidence ≥ 0.6 for non-neutral signal

---

## Safety Defaults

```typescript
{
  maxPositionPct: 5,        // 5% of equity per position
  maxExposurePct: 25,       // 25% total exposure
  maxLeverage: 3,           // Conservative cap
  circuitBreakerPct: 10,    // 10% drawdown stops trading
  cooldownMinutes: 5,       // 5min between trades on same asset
  allowShorts: false,       // Longs only by default
}
```

---

## OpenBB Integration

Requires OpenBB Platform running locally:
```bash
docker run -it --rm -p 6900:6900 openbb-platform:latest
# OR
pip install openbb && openbb-api --port 6900
```

Falls back to CoinGecko if OpenBB unavailable.

---

## Debug Logging (can be removed)
- `drift.service.ts:109-120` - Service startup
- `drift.service.ts:391-408` - Order params
- `action-factory.ts:101-115` - Validate function

---

## Known Issues
- Railway `tasks` table errors (ElizaOS DB schema) - doesn't affect Drift
