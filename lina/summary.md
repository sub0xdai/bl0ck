# Lina Development Summary

> **IMPORTANT:** This file must not exceed 150 lines. Each edit is a REWRITE, not an append.

---

## Summary

Investigating a critical bug where **Drift SHORT positions return fake/hallucinated transaction hashes** while LONG positions work correctly. Root cause identified: missing SHORT example in `character.ts` messageExamples.

---

## Current State

### Bug Details
- **Symptom:** SHORT orders return invalid 51-char tx hashes (Solana sigs are 88 chars)
- **LONG orders:** Work correctly with valid tx hashes (confirmed on-chain)
- **Root cause:** No messageExample for opening SHORT positions in character.ts

### Fix Applied
Added SHORT example to `character.ts` (lines 209-222):
```typescript
{
  name: '{{name1}}',
  content: { text: 'Short SOL-PERP $100 with 5x leverage' },
},
{
  name: 'Lina',
  content: { text: 'Opened SOL-PERP SHORT 5x @ $189.50. Liq: $227.40.\nTx: ...' },
},
```

### Debug Logging (still in place)
1. `drift.service.ts:109-120` - Service startup logging
2. `drift.service.ts:391-408` - Order params before SDK call
3. `drift.service.ts:427-437` - Position data after order
4. `action-factory.ts:101-115` - Validate function logging

### What We're Looking For in Logs
```
[DRIFT_SERVICE] === SERVICE START CALLED ===
[DRIFT_SERVICE] === SERVICE STARTED SUCCESSFULLY ===
[DRIFT_OPEN_SHORT] === VALIDATE CALLED ===
[DRIFT_SERVICE] === ORDER PARAMS DEBUG ===
```

---

## Next Tasks

1. **Deploy to Railway** - Push changes and redeploy
2. **Test SHORT order** - e.g., "short SOL-PERP $10"
3. **Verify logs** - Should now see DRIFT_OPEN_SHORT validate logs
4. **If still failing:** Check if Hyperliquid action conflict needs resolution
5. **Clean up debug logging** once issue is resolved

---

## Investigation Notes

### Why SHORT Failed (Hypothesis)
- ElizaOS uses messageExamples to guide LLM action routing
- character.ts had LONG example but NO SHORT example
- LLM knew how to route LONG → DRIFT_OPEN_LONG
- LLM didn't know how to route SHORT → hallucinated response

### Potential Backup Fix (if messageExample doesn't work)
Both Hyperliquid and Drift have overlapping similes:
- `['SHORT', 'SELL PERP', 'OPEN SHORT', 'GO SHORT', 'SHORT PERP']`
- Hyperliquid loads before Drift (src/index.ts lines 48-49)
- May need to make Drift similes more unique

---

## Files Modified

| File | Purpose |
|------|---------|
| `src/character.ts` | Added SHORT messageExample |
| `src/plugins/plugin-drift/src/services/drift.service.ts` | Debug logging |
| `src/plugins/plugin-drift/src/utils/action-factory.ts` | Validate logging |

---

## Known Issues (Unrelated)
- Railway showing `tasks` table query errors (ElizaOS DB schema issue)
- These don't affect Drift functionality
