# Lina Development Summary

> **IMPORTANT:** This file must not exceed 150 lines. Each edit is a REWRITE, not an append.

---

## Summary

**SHORT positions bug: RESOLVED** (Dec 31, 2025)

Drift SHORT positions were returning hallucinated transaction hashes while LONG worked fine. Root cause: missing messageExample in character.ts for SHORT actions.

---

## Resolution

### Root Cause
- `character.ts` had a messageExample for LONG but not SHORT
- ElizaOS uses messageExamples to guide LLM action routing
- LLM knew how to route LONG → `DRIFT_OPEN_LONG`
- LLM didn't know how to route SHORT → hallucinated response

### Fixes Applied
1. **Added SHORT messageExample** to `character.ts` (commit `5874b8c`)
2. **Lowered MIN_COLLATERAL** to $1 for testing (commit `6cc9d17`)

### Verification
- SHORT tx confirmed on Solscan: `Jx4nVADtPkvf2NGEMaP8tXBzKNAGedmce6QaLz2D885q...`
- Drift V2 Program execution: SUCCESS, Finalized

---

## Current State

Both LONG and SHORT positions working correctly on Drift Protocol (Solana mainnet).

### Debug Logging (can be removed)
- `drift.service.ts:109-120` - Service startup logging
- `drift.service.ts:391-408` - Order params debug
- `drift.service.ts:427-437` - Position data debug
- `action-factory.ts:101-115` - Validate function logging

---

## Known Issues (Unrelated)
- Railway showing `tasks` table query errors (ElizaOS DB schema issue)
- These don't affect Drift functionality

---

## Notes

- MIN_COLLATERAL currently $1 (testing) - consider raising to $10 for production
- messageExamples in character.ts are critical for action routing
- Both Drift and Hyperliquid have overlapping similes - messageExamples disambiguate
