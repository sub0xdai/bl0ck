# Known Issues - Lina AI Agent

## Active Issues

*No critical issues at this time.*

---

## Resolved Issues

### 1. Chat Creation Fails - Title Generation Error (2025-11-27)

**Status**: ✅ Fixed

**Fix**: Enabled OpenRouter plugin which handles `ModelType.TEXT_SMALL` for title generation.

**Commit**: `6292b04 - Enable OpenRouter plugin for chat title generation`

**Requires**: `OPENROUTER_API_KEY` in `.env`

---

### 2. CDP Key Format Errors (2025-11-28)

**Status**: ✅ Fixed

**Symptoms**:
- CDP API key format failing during wallet operations
- Wallet secret hex format incompatible with SDK

**Fix**:
- SEC1→PKCS8 format conversion for CDP API keys
- Hex→PKCS8 DER conversion for legacy wallet secrets

**Commit**: `ec7b892 - Fix wallet auth flow and CDP key handling`

---

### 3. Transaction Constructor TypeScript Errors (2025-11-27)

**Status**: ✅ Fixed

**Fix**: Updated Solana Transaction instantiation to set properties directly instead of using deprecated constructor parameters.

**Commit**: `25c711a - Fix Transaction constructor to use proper API`

---

### 4. Frontend Loading Issues (2025-11-27)

**Status**: ✅ Fixed

**Fix**: Rebuilt frontend with `bun run build:frontend`, ensured dist/frontend/index.html exists.

---

### 5. Web3 Wallet Auth Flow (2025-11-28)

**Status**: ✅ Working

**Details**:
- Wallet-first auth with SIWE (EVM) and SIWS (Solana) signatures
- Auth state machine: `loading → none/expired → authenticated`
- LoginScreen as full-page auth gate
- User ID derived deterministically from wallet address

**Commits**: `0e206bc`, `ec7b892`
