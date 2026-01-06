# Lina Development Summary

> **IMPORTANT:** This file must not exceed 150 lines. Each edit is a REWRITE, not an append.

---

## Summary

**Session: Jan 6, 2026 (latest)**

19. **ATR-Based Risk Management** - Proper trade management with R:R sizing
    - ATR-based stop-loss: `SL = entry ± (ATR × multiplier)`
    - Position sizing based on risk: 2% account per trade
    - Minimum 1:3 R:R ratio required for trade entry
    - Dynamic break-even: SL moves to entry at 50% profit
    - New files: `atr-risk.ts`, `atr-position-sizing.service.ts`
    - Database: Added `position_metadata` JSONB column

18. **Chinese (zh-CN) i18n** - Full internationalization with `react-i18next`

17. **Technical Indicators** - RSI/MACD visible in chat updates

16. **OpenBB Integration** - Dockerized Python API for technical analysis

---

## Current State

| Component | Status |
|-----------|--------|
| Automation System | Live (v1.0.9) |
| **ATR Risk Management** | **Implemented (opt-in)** |
| OpenBB Service | Dockerized (Port 8000) |
| Technical Analysis | RSI/MACD/ATR |
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
│   ├── SignalsService
│   │   └── OpenBBService ──HTTP──► openbb:8000
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
│   ├── atr-risk.ts              # NEW: ATR types
│   └── risk.ts                  # RiskAssessment + atrSizing
├── services/
│   ├── openbb.service.ts        # getATR(), calculateATRLocally()
│   ├── atr-position-sizing.service.ts  # NEW: R:R sizing logic
│   ├── risk-manager.service.ts  # ATR integration
│   ├── position-monitor.service.ts  # Break-even, price stops
│   └── strategy-loop.service.ts # ATR metadata storage
└── state/
    └── automation-state.store.ts  # position_metadata column
```

---

## ATR Risk Management Config

```typescript
{
  useAtrSizing: true,           // Enable ATR-based sizing
  atrPeriod: 14,                // ATR calculation period
  atrStopMultiplier: 2.0,       // SL = entry ± (ATR × 2)
  riskPerTradePct: 2.0,         // Risk 2% of account per trade
  minRewardRiskRatio: 3.0,      // Only take 1:3+ R:R trades
  breakEvenTriggerRatio: 0.5,   // Move SL to BE at 50% to target
}
```

**Key Formulas:**
```
SL_distance = ATR × multiplier
TP_distance = SL_distance × R:R
Position_size = (account × risk%) / SL_distance%
```

---

## All Fixes Applied

| Issue | Fix |
|-------|-----|
| No risk management | ATR-based SL/TP with R:R sizing |
| Static stop-loss | Dynamic break-even at 50% profit |
| No position sizing | Size = risk_amount / stop_distance |
| No i18n support | react-i18next (en + zh-CN) |
| Technicals hidden | RSI/MACD/ATR in chat |

---

## Next Steps

- [x] **Implement ATR-based risk management**
- [x] **Dynamic break-even stops**
- [x] **R:R position sizing**
- [ ] Nail down trading strategy specifics
- [ ] Write tests for ATR sizing
- [ ] Telegram/Discord notifications

---

## Debugging

**ATR Sizing Check:**
1. Enable: `config.useAtrSizing = true`
2. Check logs for: `[RISK_MANAGER] ATR sizing for SOL-PERP`
3. Verify: `SL=$X, TP=$Y, R:R=3`

**Break-Even Check:**
1. Position reaches 50% of target
2. Log: `[POSITION_MONITOR] Break-even triggered`
3. Chat: "Stop moved to break-even @ $X"

**Database Check:**
```sql
SELECT position_metadata FROM lina_automation.automation_states;
```
