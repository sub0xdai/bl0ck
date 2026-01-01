# Lina Development Summary

> **IMPORTANT:** This file must not exceed 150 lines. Each edit is a REWRITE, not an append.

---

## Summary

**Session: Jan 1, 2026 (evening)**

4. **Fixed Signals Always NEUTRAL** - 94 cycles ran, all returned 0% confidence
   - Root cause: News/volume signals return 0. Trend (weight 50%) max = 50% confidence. Threshold was 60%.
   - Fixed: Lowered SIGNAL_CONFIDENCE_THRESHOLD from 60% to 20%
   - Fixed: Lowered TREND_THRESHOLD_PCT from 5% to 2% (more sensitive)
   - Added raw signal logging: `[SIGNALS] SOL-PERP raw: trend=0.54, news=0.00, volume=0.00`

**Session: Jan 1, 2026 (earlier)**

1. **Fixed Perps Wallet Display** - Mark prices showing $0.00
2. **Fixed Autotrading Min Size** - Lowered from $1 to $0.10
3. **UI Cleanup** - Inline editing for automation modal

---

## Current State

| Component | Status |
|-----------|--------|
| Drift LONG/SHORT | Working |
| Automation System | Live (v1.0.3) |
| SignalsService | Trend working, news/volume returning 0 |
| REST API Control | Toggle + Config + channelId |
| UI Automation Modal | Inline editing |
| Tests | 175 passing |

---

## Architecture

```
StrategyLoop (5min cycles)
    ├── SignalsService (CoinGecko trend only - news/volume broken)
    ├── RiskManager (exposure, sizing, circuit breaker, cooldown)
    ├── PositionMonitor (SL/TP/hold time - 30s checks)
    ├── ExecutionCoordinator (per-asset mutex locks)
    └── DriftService (slippage-protected execution)

Logging:
    [STRATEGY_LOOP] Cycle X for user... | mode: LIVE | enabled: true
    [SIGNALS] SOL-PERP raw: trend=0.54(w:0.50), news=0.00(w:0.30), volume=0.00(w:0.20)
    [SIGNALS] SOL-PERP: LONG (confidence: 27%) from 3 sources
    [RISK_MANAGER] Trade approved/rejected
```

---

## Signal Thresholds

| Setting | Original | Current | Notes |
|---------|----------|---------|-------|
| SIGNAL_CONFIDENCE_THRESHOLD | 60% | 20% | With only trend working (50% weight), 60% was impossible |
| TREND_THRESHOLD_PCT | 5% | 2% | More sensitive to price changes |

**Current formula:** `trend_value × 0.5 = confidence` (news/volume contribute 0)

---

## Configuration

```typescript
{
  enabled, assets, allowShorts,
  maxPositionPct, maxExposurePct, maxLeverage,
  circuitBreakerPct, cooldownMinutes, maxSlippageBps,
  stopLossPct?, takeProfitPct?, maxHoldMinutes?,
  channelId?
}
```

**Minimum requirements:**
- Trade size ≥ $0.10
- Signal confidence ≥ 20%

---

## Key Files

```
plugin-strategy-core/src/
├── services/strategy-loop.service.ts  # console.log for Railway
├── services/signals.service.ts        # Raw value logging
├── types/signals.ts                   # Threshold constants
└── services/risk-manager.service.ts   # $0.10 minimum
```

---

## Next Steps

- [x] Fix perps wallet display
- [x] Fix autotrading min size
- [x] Fix signals always NEUTRAL
- [ ] Fix news/volume signal sources
- [ ] Test live trade execution end-to-end
- [ ] Telegram/Discord notifications

---

## Debugging

Check Railway logs for:
```
[SIGNALS] SOL-PERP raw: trend=X.XX    # Should be non-zero
[SIGNALS] SOL-PERP: LONG/SHORT        # Not NEUTRAL
[RISK_MANAGER] approved/rejected
```

If NEUTRAL with 0%:
1. CoinGecko API might be failing (check for errors)
2. SOL price flat (< 2% weekly move)
