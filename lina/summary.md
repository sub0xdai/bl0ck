# Lina Development Summary

> **IMPORTANT:** This file must not exceed 150 lines. Each edit is a REWRITE, not an append.

---

## Summary

**Session: Jan 3, 2026 (latest)**

13. **Fixed Trade Rejection Bug** - Trades were rejected due to position size < minimum
    - Root cause: $11.82 collateral × 5% maxPositionPct × 50% scaling = $0.30 < $2.00
    - Fix: MIN_POSITION_USD $2.00 → $1.30, maxPositionPct 5% → 25%
    - New math: $11.82 × 25% × 50% = $1.48 > $1.30 (PASSES)

**Session: Jan 2, 2026**

12. Added Drift Balance Header Badge (collateral + PnL in header)
9-11. Fixed messaging (direct bus emit), news signal (TAVILY), volume signal (CoinGecko)
8. Fixed BN Truncation - baseAssetAmount was 0 → now works
5-7. Fixed QUOTE_PRECISION, thresholds, validation logging

**Session: Jan 1, 2026**

1-4. Fixed perps display, min sizes, UI, signals thresholds

---

## Current State

| Component | Status |
|-----------|--------|
| Automation System | Live (v1.0.6) |
| SignalsService | Working (55% confidence with volume) |
| RiskManager | MIN_POSITION_USD = $1.30, maxPositionPct = 25% |
| Trade Sizing | $1.48+ with $12 collateral |
| Drift UI | **Complete** (Perps tab + header badge) |
| Trade Execution | **Ready for first trade** |

---

## Architecture

```
StrategyLoop (5min cycles)
    ├── SignalsService → LONG/SHORT/NEUTRAL
    ├── RiskManager → check min $1.30, max 25% position
    └── DriftService → submit to Drift

Size calculation (with $12 collateral):
$12 × 25% = $3.00 max → × 50% confidence = $1.50 → submit
```

---

## All Fixes Applied

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| $64k trades | QUOTE_PRECISION not divided | ÷ 1e6 in getAccountInfo |
| baseAssetAmount = 0 | BN truncates decimals | × 1e6 before BN |
| MIN_COLLATERAL | $1 too high | → $0.01 |
| MIN_POSITION_USD | $2.00 rejected small trades | → $1.30 |
| maxPositionPct | 5% too small for low collateral | → 25% |
| Confidence threshold | 60% impossible | → 20% |
| NEUTRAL signals | Trend threshold 5% | → 2% |

---

## Key Files

```
plugin-strategy-core/src/
├── services/risk-manager.ts     # MIN_POSITION_USD = $1.30
├── types/automation-config.ts   # maxPositionPct = 25%
└── types/signals.ts             # Confidence 20%, trend 2%

plugin-drift/src/services/drift.service.ts
├── Line 384: sizeInMicroUsd = size * 1e6
├── Line 385: baseAssetAmount calculation
└── Line 742: QUOTE_PRECISION division
```

---

## Next Steps

- [x] Fix QUOTE_PRECISION (1e6 scaling)
- [x] Fix all minimum thresholds
- [x] Fix BN truncation (baseAssetAmount = 0)
- [x] Fix messaging (direct bus emit)
- [x] Fix news/volume signals (TAVILY + CoinGecko)
- [x] Display Drift balance in UI
- [x] Fix trade rejection (MIN $1.30, maxPositionPct 25%)
- [ ] **Confirm first automated trade on Drift**
- [ ] Define trade rules (entry/exit criteria)
- [ ] Telegram/Discord notifications

---

## Debugging

Expected successful trade flow:
```
[STRATEGY_LOOP] Cycle 1 for user... | mode: LIVE | enabled: true
[SIGNALS] SOL-PERP: LONG (confidence: 27.0%) from 3 sources
[RISK_MANAGER] Trade approved for SOL-PERP: $1.48 @ 3x (exposure: 0.0%)
[DRIFT_SERVICE] === openPosition START === long SOL-PERP $1.48
[DRIFT_SERVICE] Submitted order tx: <signature>
[STRATEGY_LOOP] SOL-PERP: LONG executed - $1.48 | tx: <sig>...
```

If still failing, check for:
- "suggestedSize $X.XX < $1.30 minimum" → Need more collateral or higher confidence
- "Simulation failed" → Drift SDK issue
- "Insufficient SOL" → Need gas for tx
