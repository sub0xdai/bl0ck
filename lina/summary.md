# Lina Development Summary

> **IMPORTANT:** This file must not exceed 150 lines. Each edit is a REWRITE, not an append.

---

## Summary

**Session: Jan 2, 2026**

5. **Fixed QUOTE_PRECISION Bug** - Trade sizes were 1,000,000x too large
   - Root cause: `getAccountInfo` returned raw BN values (6 decimals), RiskManager parsed as USD
   - $2.57 collateral → interpreted as $2,570,000 → $64k trades attempted
   - Fixed: Divide by QUOTE_PRECISION (1e6) before returning

6. **Fixed Multiple Minimum Thresholds** - Three separate checks blocking $0.06 trades
   - RiskManager MIN_POSITION_USD: $0.10 → $0.05
   - RiskManager confidence threshold: 60% → 20%
   - DriftService MIN_COLLATERAL: $1.00 → $0.01

7. **Added Validation Logging** - Silent failures now logged
   - DriftService validation errors now logged before returning

**Session: Jan 1, 2026**

1. Fixed Perps Wallet Display - Mark prices showing $0.00
2. Fixed Autotrading Min Size - Lowered from $1 to $0.10
3. UI Cleanup - Inline editing for automation modal
4. Fixed Signals Always NEUTRAL - Lowered thresholds

---

## Current State

| Component | Status |
|-----------|--------|
| Drift LONG/SHORT | Manual working, auto pending test |
| Automation System | Live (v1.0.4) |
| SignalsService | Trend working (27-44% confidence) |
| Trade Sizing | Fixed ($0.06 for $2.57 collateral) |
| Trade Execution | Awaiting first live trade |

---

## Architecture

```
StrategyLoop (5min cycles)
    ├── SignalsService (CoinGecko trend only)
    ├── RiskManager (min $0.05, 20% confidence)
    ├── PositionMonitor (SL/TP/hold time)
    └── DriftService (min $0.01, validation logging)

Flow:
Signal (27%) → RiskManager approves $0.06 → DriftService opens position
```

---

## Minimum Thresholds (All Fixed)

| Location | Setting | Value |
|----------|---------|-------|
| signals.ts | SIGNAL_CONFIDENCE_THRESHOLD | 20% |
| signals.ts | TREND_THRESHOLD_PCT | 2% |
| risk-manager | MIN_POSITION_USD | $0.05 |
| risk-manager | MIN_CONFIDENCE | 20% |
| drift constants | MIN_COLLATERAL | $0.01 |

---

## Key Files

```
plugin-drift/src/
├── constants.ts              # MIN_COLLATERAL = $0.01
└── services/drift.service.ts # QUOTE_PRECISION fix, validation logging

plugin-strategy-core/src/
├── services/risk-manager.ts  # MIN_POSITION_USD = $0.05, confidence 20%
├── services/signals.service.ts
└── types/signals.ts          # Threshold constants
```

---

## Next Steps

- [x] Fix perps wallet display
- [x] Fix signals always NEUTRAL
- [x] Fix QUOTE_PRECISION (1e6 scaling)
- [x] Fix all minimum thresholds
- [ ] Confirm first automated trade executes
- [ ] Fix news/volume signal sources
- [ ] Telegram/Discord notifications

---

## Debugging

Check Railway logs for trade flow:
```
[SIGNALS] SOL-PERP: LONG (confidence: 27%)
[RISK_MANAGER] Trade approved for SOL-PERP: $0.06 @ 3x
[DRIFT_SERVICE] === openPosition START === long SOL-PERP $0.06
[DRIFT_SERVICE] [T+0ms] Getting client...
[DRIFT_SERVICE] Free collateral: $2.57, Required: $0.02
```

If validation fails:
```
[DRIFT_SERVICE] Validation failed: Size $X below minimum $0.01
```
