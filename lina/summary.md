# Lina Development Summary

> **IMPORTANT:** This file must not exceed 150 lines. Each edit is a REWRITE, not an append.

---

## Summary

**Session: Jan 6, 2026 (latest)**

19. **Lina Reasoning Loop** - "Chain of Thought" Communication
    - Implemented `formatTradeReasoning` in `market-update-formatter.ts`
    - Synthesizes RSI, MACD, Trend, News, and Risk data into a structured narrative
    - Exposed reasoning in chat message metadata (`thought` field)
    - "I see X because Y" instead of just "Buying X"

18. **Chinese (zh-CN) i18n** - Full internationalization
    - Added `react-i18next` + `i18next-browser-languagedetector`
    - Translated: Login, MainApp, Chat, Sidebar, Settings

17. **Technical Indicators** - RSI/MACD visible in chat updates

---

## Current State

| Component | Status |
|-----------|--------|
| Automation System | Live (v1.0.9) |
| **Reasoning Engine** | **Live (Chat Metadata)** |
| OpenBB Service | Dockerized (Port 8000) |
| i18n Support | English + Chinese |
| Trade Execution | Automated + Reasoning |

---

## Architecture

```
Docker Compose Network
├── lina (Node.js/TypeScript)
│   ├── StrategyLoop
│   │   ├── RiskManager
│   │   └── ReasoningEngine (New)
│   ├── SignalsService
│   │   └── OpenBBService ──HTTP──► openbb:8000
│   └── Frontend (React + i18n)
└── openbb (Python/FastAPI)
    └── REST API (RSI, MACD)
```

---

## Key Files

```
lina/src/plugins/plugin-strategy-core/
├── services/
│   ├── strategy-loop.service.ts # Invokes reasoning
│   ├── openbb.service.ts        # Data source
│   └── signals.service.ts       # Signal aggregation
├── utils/
│   └── market-update-formatter.ts # formatTradeReasoning()
└── state/
    └── automation-state.store.ts
```

---

## All Fixes Applied

| Issue | Fix |
|-------|-----|
| 1-dimensional comms | Added "Chain of Thought" reasoning |
| Opaque decisions | Exposed RSI/Risk/News data in chat |
| No i18n support | react-i18next (en + zh-CN) |
| Technicals hidden | RSI/MACD in chat |

---

## Next Steps

- [x] **Implement Reasoning Loop**
- [ ] **ATR-Based Risk Management** (Planned)
  - [ ] Dynamic Break-Even
  - [ ] R:R Position Sizing
- [ ] Telegram/Discord notifications
- [ ] Refine strategy specific parameters

---

## Reasoning Output Example

**User sees:**
"Going long on SOL with $500 at 2x - signals look favorable."

**Metadata (UI can expand):**
"Reasoning: RSI is 45 (neutral); MACD showing bullish momentum; 7d trend is up 5.2%; news sentiment is positive; risk checks passed (size: $500, leverage: 2x)."

---

## Debugging

**Reasoning Check:**
1. Wait for automated trade
2. Check `new_message` event payload
3. Verify `thought` field contains structured text
4. Verify text matches `formatTradeReasoning` format