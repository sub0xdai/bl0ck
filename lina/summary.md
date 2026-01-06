# Lina Development Summary

> **IMPORTANT:** This file must not exceed 150 lines. Each edit is a REWRITE, not an append.

---

## Summary

**Session: Jan 6, 2026 (latest)**

20. **Varied Position Updates** - Dynamic chat messages with ATR status
    - Replaced repetitive position messages with varied phrasing
    - Shows target progress: "35% to target", "BE trigger soon"
    - Break-even status: "BE locked @ $132.65"
    - Contextual openings: "grinding", "working", "locked in", "under pressure"

19. **ATR-Based Risk Management** - Proper trade management
    - ATR-based stop-loss: `SL = entry ± (ATR × multiplier)`
    - Position sizing: 2% account risk per trade, 1:3 R:R minimum
    - Dynamic break-even: SL moves to entry at 50% profit
    - Database persistence via `position_metadata` JSONB column

18. **Reasoning Loop** - "Chain of Thought" on trade entry
    - `formatTradeReasoning()` explains WHY entering a trade
    - Exposes RSI, MACD, Trend, News in `thought` metadata field

---

## Current State

| Component | Status |
|-----------|--------|
| Automation System | Live (v1.0.9) |
| ATR Risk Management | Implemented (opt-in) |
| Position Updates | Varied + ATR status |
| i18n Support | English + Chinese |
| Trade Execution | First trade completed |

---

## Architecture

```
Docker Compose Network
├── lina (Node.js/TypeScript)
│   ├── StrategyLoop
│   │   └── RiskManager ──► ATR Position Sizing
│   ├── PositionMonitor
│   │   └── Break-Even Trigger
│   ├── SignalsService ──► OpenBBService ──HTTP──► openbb:8000
│   └── Frontend (React + i18n)
└── openbb (Python/FastAPI)
    └── REST API (RSI, MACD, ATR)
```

---

## Key Files

```
lina/src/plugins/plugin-strategy-core/
├── types/
│   ├── automation-config.ts     # Config + PositionMetadata
│   └── atr-risk.ts              # ATR types
├── services/
│   ├── openbb.service.ts        # getATR(), calculateATRLocally()
│   ├── atr-position-sizing.service.ts  # R:R sizing logic
│   ├── risk-manager.service.ts  # ATR integration
│   ├── position-monitor.service.ts  # Break-even, price stops
│   └── strategy-loop.service.ts # ATR metadata, market context
├── utils/
│   └── market-update-formatter.ts  # Varied position messages
└── state/
    └── automation-state.store.ts   # position_metadata column
```

---

## Position Update Examples

**Small profit:**
```
SOL long grinding: +$0.23 (+4.2%). 35% to target. $138.36 (+4.3% from entry).
```

**Approaching break-even:**
```
SOL long working: +$0.45 (+5.8%). 45% to target - BE trigger soon. $139.12.
```

**Break-even locked:**
```
SOL long locked in: +$0.67 (+8.2%). BE locked @ $132.65. $143.50. RSI 68 warm.
```

---

## ATR Config

```typescript
{
  useAtrSizing: true,           // Enable
  atrPeriod: 14,                // ATR period
  atrStopMultiplier: 2.0,       // SL = entry ± (ATR × 2)
  riskPerTradePct: 2.0,         // 2% risk per trade
  minRewardRiskRatio: 3.0,      // 1:3 minimum R:R
  breakEvenTriggerRatio: 0.5,   // BE at 50% profit
}
```

---

## All Fixes Applied

| Issue | Fix |
|-------|-----|
| Repetitive messages | Varied phrasing based on PnL state |
| No risk management | ATR-based SL/TP with R:R sizing |
| Static stop-loss | Dynamic break-even at 50% profit |
| No i18n | react-i18next (en + zh-CN) |

---

## Next Steps

- [x] ATR-based risk management
- [x] Varied position updates
- [ ] Nail down trading strategy specifics
- [ ] Telegram/Discord notifications

---

## Debugging

**Position Update Check:**
1. Open position via automation
2. Wait for 5-min cycle
3. Verify varied phrasing (not same message twice)
4. If ATR enabled: verify "X% to target" shown

**Break-Even Check:**
1. Position reaches 50% of target
2. Log: `[POSITION_MONITOR] Break-even triggered`
3. Chat: "BE locked @ $X"
