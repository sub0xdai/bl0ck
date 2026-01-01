# Lina Development Summary

> **IMPORTANT:** This file must not exceed 150 lines. Each edit is a REWRITE, not an append.

---

## Summary

**Session: Jan 1, 2026 (continued)**

1. **Fixed Perps Wallet Display** - Mark prices showing $0.00 → now shows real prices
   - Root cause: Frontend double-divided already-normalized backend values
   - Fixed: formatMarkPrice, formatSize, formatPnl no longer divide
   - Ghost positions filtered (size < 0.0001)

2. **Fixed Autotrading Not Executing** - 68 cycles ran but no trades
   - Root cause: $2.54 collateral × 5% MAX_POSITION = $0.12 < $1 minimum
   - Fixed: Lowered minimum trade from $1 to $0.10
   - Added logging: All rejection reasons now visible in server logs

3. **UI Cleanup** - Automation modal improvements
   - Removed wonky spinner arrows
   - Added inline editing: click value → input field → Enter/Escape/blur
   - Dotted underline indicates clickable values

---

## Current State

| Component | Status |
|-----------|--------|
| Drift LONG/SHORT | Working |
| Automation System | Live (v1.0.2) |
| REST API Control | Toggle + Config + channelId |
| UI Automation Modal | Inline editing |
| Perps Wallet | Real prices displayed |
| Tests | 175 passing |

---

## Architecture

```
StrategyLoop (5min cycles)
    ├── SignalsService (CoinGecko/CoinDesk/DeFiLlama)
    ├── RiskManager (exposure, sizing, circuit breaker, cooldown)
    ├── PositionMonitor (SL/TP/hold time - 30s checks)
    ├── ExecutionCoordinator (per-asset mutex locks)
    ├── DriftService (slippage-protected execution)
    └── sendChatMessage() → POST /api/messaging/submit

Logging (new):
    [STRATEGY_LOOP] Cycle X for user... | mode: LIVE | enabled: true
    [SIGNALS] SOL-PERP: LONG (confidence: 65%) from 2 sources
    [RISK_MANAGER] Trade rejected for SOL-PERP: INSUFFICIENT_CONFIDENCE (50% < 60%)
    [RISK_MANAGER] Trade approved for SOL-PERP: $0.30 @ 3x
```

---

## Configuration

```typescript
{
  enabled, assets, allowShorts,
  maxPositionPct, maxExposurePct, maxLeverage,
  circuitBreakerPct, cooldownMinutes, maxSlippageBps,
  stopLossPct?, takeProfitPct?, maxHoldMinutes?,
  channelId? // for chat trading updates
}
```

**Minimum requirements for trading:**
- Collateral × maxPositionPct × confidence ≥ $0.10
- Signal confidence ≥ 60%
- Example: $3 collateral, 12% position, 70% confidence = $0.25 trade

---

## Key Files

```
plugin-strategy-core/src/services/
├── strategy-loop.service.ts  # Execution mode logging
├── risk-manager.service.ts   # Rejection logging, $0.10 minimum
└── position-monitor.service.ts

plugin-drift/src/services/
└── drift.service.ts          # Server-side dust filtering

frontend/components/
├── automation/automation-modal-content.tsx  # Inline editing
└── dashboard/cdp-wallet-card/DriftTab.tsx   # Fixed formatters
```

---

## Next Steps

- [x] UI button for automation
- [x] Automation modal with controls
- [x] REST API for toggle/config
- [x] Chat-first UX (hints, notices)
- [x] StrategyLoop sends trading updates to chat
- [x] Fix perps wallet display (mark prices)
- [x] Fix autotrading execution
- [ ] Test live trading end-to-end
- [ ] Telegram/Discord notifications

---

## Debugging Autotrading

Check server logs for:
```
[STRATEGY_LOOP] mode: LIVE    # Should NOT be DRY-RUN
[SIGNALS] confidence: X%      # Must be ≥60%
[RISK_MANAGER] rejected/approved
```

If no trades happen:
1. Check collateral (need enough for $0.10+ trade)
2. Check signal confidence (must be ≥60%)
3. Check cooldown (5 min between trades per asset)
4. Check exposure (must be < maxExposurePct)
