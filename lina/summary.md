# Lina Development Summary

> **IMPORTANT:** This file must not exceed 150 lines. Each edit is a REWRITE, not an append.

---

## Summary

**Session: Jan 3, 2026 (latest)**

14. **Conversational Trading Updates** - Lina now communicates naturally about trading
    - New `formatMarketUpdate()` generates human-readable market analysis
    - Cycle messages: "Scanning markets... SOL looks bullish (55% confidence), up 8.5% this week"
    - Trade opens: "Going long on SOL with $5 at 3x - up 8.5% this week"
    - Holding updates: "Markets quiet. Holding SOL long position, currently +4%"
    - New `ActivePositionBadge` component shows live positions in header

13. **Fixed Trade Rejection Bug** - MIN_POSITION_USD $2.00 → $1.30, maxPositionPct 5% → 25%

**Session: Jan 2, 2026**

12. Added Drift Balance Header Badge
9-11. Fixed messaging, news signal (TAVILY), volume signal (CoinGecko)
8. Fixed BN Truncation - baseAssetAmount was 0

**Session: Jan 1, 2026**

1-7. Fixed perps display, thresholds, QUOTE_PRECISION, min sizes

---

## Current State

| Component | Status |
|-----------|--------|
| Automation System | Live (v1.0.7) |
| Conversational Updates | **NEW** - Natural language trade messages |
| ActivePositionBadge | **NEW** - Live positions in header |
| SignalsService | Working (55% confidence with volume) |
| RiskManager | MIN_POSITION_USD = $1.30, maxPositionPct = 25% |
| Trade Execution | **Ready for first trade** |

---

## Architecture

```
StrategyLoop (5min cycles)
    ├── SignalsService → LONG/SHORT/NEUTRAL + raw data
    ├── buildMarketContext() → positions + signals + account
    ├── formatMarketUpdate() → conversational message
    ├── RiskManager → check min $1.30, max 25% position
    └── DriftService → submit to Drift

Message flow:
1. Fetch signals from CoinGecko/OpenBB/Tavily
2. Build context (positions, collateral, PnL)
3. Format: "Scanning markets... SOL looks bullish, up 8.5% this week"
4. Send to chat via internalMessageBus
```

---

## Key Files

```
plugin-strategy-core/src/
├── utils/market-update-formatter.ts  # NEW: formatMarketUpdate()
├── services/strategy-loop.service.ts # buildMarketContext(), conversational msgs
├── services/risk-manager.ts          # MIN_POSITION_USD = $1.30
└── types/automation-config.ts        # maxPositionPct = 25%

frontend/components/drift/
├── DriftBalanceBadge.tsx             # Account collateral + PnL
└── ActivePositionBadge.tsx           # NEW: Live position badges

frontend/screens/MainApp.tsx          # Header with both badges
```

---

## Message Examples

| Scenario | Message |
|----------|---------|
| Market scan (bullish) | "Scanning markets... SOL looks bullish (55% confidence), up 8.5% this week." |
| Market scan (quiet) | "Scanning SOL... markets are quiet, no clear signals." |
| Holding position | "Markets quiet. Holding SOL long position, currently +4% (+$2.00)." |
| Trade open | "Going long on SOL with $5 at 3x - up 8.5% this week." |
| Trade close | "Closed SOL for +$2.30 - hit take-profit." |

---

## Next Steps

- [x] Fix QUOTE_PRECISION, thresholds, BN truncation
- [x] Fix messaging, news/volume signals
- [x] Display Drift balance in UI
- [x] Fix trade rejection (MIN $1.30, maxPositionPct 25%)
- [x] **Conversational trading updates**
- [x] **ActivePositionBadge in header**
- [ ] **Confirm first automated trade on Drift**
- [ ] Define trade rules (entry/exit criteria)
- [ ] Telegram/Discord notifications

---

## Debugging

Expected successful trade flow:
```
[STRATEGY_LOOP] Cycle 1 for user... | mode: LIVE | enabled: true
Chat: "Scanning markets... SOL looks bullish (55% confidence), up 8.5% this week."
[RISK_MANAGER] Trade approved for SOL-PERP: $1.48 @ 3x
Chat: "Going long on SOL with $1 at 3x - up 8.5% this week."
[DRIFT_SERVICE] Submitted order tx: <signature>
```

If still failing, check for:
- "suggestedSize $X.XX < $1.30 minimum" → Need more collateral or higher confidence
- "Simulation failed" → Drift SDK issue
- "Insufficient SOL" → Need gas for tx
