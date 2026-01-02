# Lina Development Summary

> **IMPORTANT:** This file must not exceed 150 lines. Each edit is a REWRITE, not an append.

---

## Summary

**Session: Jan 2, 2026 (latest)**

9. **Fixed Messaging** - StrategyLoop can now post to chat
   - Replaced HTTP loopback with direct `internalMessageBus.emit()`
   - No auth token needed - bypasses HTTP entirely
   - Exported `internalMessageBus` from `@elizaos/server`

10. **Fixed News Signal** - Service lookup mismatch
    - Changed `'WEB_SEARCH'` → `'TAVILY'` in signals.service.ts
    - News signal now works (or enable OpenBB for full macro data)

11. **Fixed Volume Signal** - Replaced broken DeFiLlama TVL with CoinGecko
    - Added `getTokenVolume()` to CoinGeckoService
    - Returns 24h volume + price momentum for any token
    - Works for SOL, BTC, ETH, memecoins (universal coverage)

**Session: Jan 2, 2026 (earlier)**

8. Fixed BN Truncation - baseAssetAmount was 0 → now 1,520,565 ✓
5-7. Fixed QUOTE_PRECISION, thresholds, validation logging

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
- [x] Fix messaging (direct bus emit)
- [x] Fix news signal (TAVILY lookup)
- [x] Fix volume signal (CoinGecko 24h volume)
- [ ] **Confirm first automated trade on Drift**
- [ ] Enable OpenBB for macro signals (optional)
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
