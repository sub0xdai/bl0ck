# Known Issues - Lina AI Agent

## Active Issues

### 1. Chat Creation Fails - Title Generation Error (2025-11-27)

**Status**: 🔴 Critical - Blocks new chat creation

**Symptoms**:
- Frontend shows: "Failed to create chat. Please try again."
- User can send message "whats my sol balance?" but chat fails to create
- Backend error: `[TITLE GENERATION] Error generating title: Not Found`

**Root Cause**:
Title generation service is calling a non-existent LLM endpoint. The system is configured to use DeepSeek via `OPENAI_API_KEY` but the title generation logic is trying to use OpenRouter endpoint which returns HTTP 404.

**Server Logs**:
```
Info  [TITLE GENERATION] Generating title from user message: "whats my sol balance?"
Error [TITLE GENERATION] Error generating title: Not Found
```

**Impact**:
- Cannot create new chat channels
- Existing channels may work if already created
- Prevents users from starting conversations

**Workaround**:
None currently available. Title generation must succeed for channel creation.

**Fix Required**:
1. Update title generation service to use the configured LLM provider (DeepSeek/OpenAI)
2. Add fallback title generation (e.g., "Chat - {timestamp}" or first 50 chars of message)
3. Make title generation optional/async so channel can be created first

**Files Involved**:
- `src/packages/server/` - Title generation service
- Backend LLM configuration

**Related Errors**:
- `OPENROUTER_API_KEY is not set` - Expected, using DeepSeek instead
- CDP errors - Expected in dev mode

---

## Resolved Issues

### 1. Transaction Constructor TypeScript Errors (2025-11-27)
**Status**: ✅ Fixed

**Fix**: Updated Solana Transaction instantiation to set properties directly instead of using deprecated constructor parameters.

**Commit**: `25c711a - Fix Transaction constructor to use proper API`

---

### 2. Frontend Loading Issues (2025-11-27)
**Status**: ✅ Fixed

**Fix**: Rebuilt frontend with `bun run build:frontend`, ensured dist/frontend/index.html exists.

**Details**: Frontend was not built after code changes, causing 404 errors.

---

### 3. Authentication Flow (2025-11-27)
**Status**: ✅ Working

**Details**:
- Dev mode authentication works correctly
- Auto-generates dev user ID
- Backend auth successful
- User entity creation working
