# Current Issues - Lina Wallet System

**Date:** 2025-12-07 01:30 AEDT
**Status:** Production broken, wallets not displaying

---

## Issue 1: Container DNS Cannot Reach Supabase

**Error:**
```
Error with wallet: getaddrinfo ENOTFOUND
```

**Cause:** Container networking doesn't resolve `aws-1-ap-southeast-1.pooler.supabase.com`

**Fix:** Add DNS to container run command:
```bash
podman run -d --name lina --dns 8.8.8.8 ...
```

---

## Issue 2: CDP Key Format Error

**Error:**
```
Invalid key format - must be either PEM EC key or base64 Ed25519 key
```

**Cause:** `CDP_API_KEY_SECRET` in .env is not in correct format

**Fix:** Verify CDP credentials in `.env`:
- `CDP_API_KEY_ID` - should be the key ID
- `CDP_API_KEY_SECRET` - should be PEM format (multi-line with BEGIN/END markers)

---

## Issue 3: User ID Mismatch (Partially Fixed)

**Background:** Previous "fix" (commit 298ef7b) changed wallet lookup from `entityId` to `author_id`, orphaning existing wallets.

**Status:** Reverted in commit d3d2bd2. Code now uses entityId fallback again.

**Remaining Issue:** JSON wallet file may still have mismatched userIds from earlier debugging attempts.

---

## Issue 4: Volume Mount for Wallet Persistence

**Location:** `/var/lib/lina-data/solana-wallets.json`

**Container Mount:** `-v /var/lib/lina-data:/app/data:rw`

**Status:** Configured correctly, 28 wallets synced from Postgres.

---

## Quick Recovery Steps

### Step 1: Fix DNS
```bash
podman stop lina && podman rm lina
podman run -d --name lina --dns 8.8.8.8 -p 3000:3000 \
  --env-file /root/bl0ck/lina/.env \
  -v /var/lib/lina-data:/app/data:rw \
  ghcr.io/sub0xdai/lina:latest
```

### Step 2: Verify CDP Keys
Check `.env` has valid:
- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET` (PEM format)
- `CDP_WALLET_SECRET`

### Step 3: Re-sync Wallets (if needed)
```bash
cd /root/bl0ck/lina
WALLET_DB_URL="..." bun run scripts/sync-wallets-to-json.js
```

---

## User's Recovered Wallet

**Address:** `4JhFhux9jAAQyivYJGng4v31ZPABKkbFGCeFGR96BwXF`
**Balance:** 1.01 SOL (devnet)
**Private Key:** Provided to user for Phantom import

---

## Root Cause Analysis

1. **Initial Problem:** Swap failed due to userId mismatch in `getEntityUserId()`
2. **Bad Fix:** Removed entityId fallback, breaking existing wallets
3. **Cascade:** Hours spent debugging container DNS, volume mounts, JSON files
4. **Lesson:** Revert first, investigate later when production breaks

---

## Files Modified Today

- `src/plugins/plugin-jupiter/src/utils.ts` - Reverted
- `src/managers/solana-transaction-manager.ts` - Reverted
- `scripts/sync-wallets-to-json.js` - Added (sync DB to JSON)
- `scripts/recover-wallet.js` - Added (extract private key)
- `MY_FUCK_UP.md` - Documentation of wallet orphaning
- `CURRENT_ISSUES.md` - This file

---

## Tomorrow's Priority

1. Add `--dns 8.8.8.8` to container permanently (update deploy script)
2. Fix CDP key format in production .env
3. Test wallet creation for new users
4. Test swap functionality
5. Properly fix the userId mismatch without breaking existing wallets
