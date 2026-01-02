# Lina Development Summary

> **IMPORTANT:** This file must not exceed 150 lines. Each edit is a REWRITE, not an append.

---

## Summary

**Session: Jan 2, 2026 (continued)**

8. **Fixed BN Truncation Bug** - baseAssetAmount was 0
   - Root cause: `new BN(0.064)` truncates to 0 (BN only handles integers)
   - $0.064 → BN(0) → baseAssetAmount = 0 → "Simulation failed"
   - Fixed: Convert to micro-USD first: `$0.064 * 1e6 = 64000`
   - Now: sizeInMicroUsd: 64295, baseAssetAmount: 1520565 ✓

**Session: Jan 2, 2026 (earlier)**

5. Fixed QUOTE_PRECISION Bug - Trade sizes 1,000,000x too large
6. Fixed Multiple Minimum Thresholds - Three checks blocking $0.06 trades
7. Added Validation Logging - Silent failures now logged

**Session: Jan 1, 2026**

1-4. Fixed perps display, min sizes, UI, signals thresholds

---

## Current State

| Component | Status |
|-----------|--------|
| Automation System | Live (v1.0.5) |
| SignalsService | Working (27-44% confidence) |
| RiskManager | Approving trades |
| Trade Sizing | $0.06 (correct) |
| baseAssetAmount | 1,520,565 (non-zero!) |
| Trade Execution | **Awaiting Drift confirmation** |

---

## Architecture

```
StrategyLoop (5min cycles)
    ├── SignalsService → LONG 27%
    ├── RiskManager → approved $0.06 @ 3x
    └── DriftService → baseAssetAmount: 1520565 → submit to Drift

Size calculation:
$0.064 → 64000 micro-USD → × 1e9 / oracle / leverage → 1,520,565 base units
```

---

## All Fixes Applied

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| $64k trades | QUOTE_PRECISION not divided | ÷ 1e6 in getAccountInfo |
| baseAssetAmount = 0 | BN truncates decimals | × 1e6 before BN |
| MIN_COLLATERAL | $1 too high | → $0.01 |
| MIN_POSITION_USD | $0.10 too high | → $0.05 |
| Confidence threshold | 60% impossible | → 20% |
| NEUTRAL signals | Trend threshold 5% | → 2% |

---

## Key Files

```
plugin-drift/src/services/drift.service.ts
├── Line 383: sizeInMicroUsd = size * 1e6
├── Line 385: baseAssetAmount calculation
└── Line 742: QUOTE_PRECISION division

plugin-strategy-core/src/
├── services/risk-manager.ts  # MIN = $0.05, confidence 20%
└── types/signals.ts          # Thresholds
```

---

## Next Steps

- [x] Fix QUOTE_PRECISION (1e6 scaling)
- [x] Fix all minimum thresholds
- [x] Fix BN truncation (baseAssetAmount = 0)
- [ ] **Confirm first automated trade on Drift**
- [ ] Fix news/volume signal sources
- [ ] Telegram/Discord notifications

---

## Debugging

Expected successful trade flow:
```
[RISK_MANAGER] Trade approved for SOL-PERP: $0.06 @ 3x
[DRIFT_SERVICE] === openPosition START === long SOL-PERP $0.06
[DRIFT_SERVICE] sizeInMicroUsd: 64295, baseAssetAmount: 1520565
[DRIFT_SERVICE] Submitted order tx: <signature>
[STRATEGY_LOOP] SOL-PERP: LONG executed - $0.06 | tx: <sig>...
```

If still failing, check for:
- "Simulation failed" → Drift SDK issue
- "Insufficient SOL" → Need gas for tx
