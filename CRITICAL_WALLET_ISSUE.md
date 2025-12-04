# CRITICAL WALLET ISSUE - Solana Wallet Loss Incident

**Date:** December 4, 2025
**Status:** PARTIALLY RESOLVED - Prevention in place, recovery uncertain

---

## Summary

User lost access to 0.2 SOL (~$40 USD) due to wallet data not being persisted across container restarts.

**Lost wallet address:** `2msJT4xcHGa1UUzG8Dg2Jc3oEJ86QhC99WZR4xpZmQrw`
**Current (new) wallet address:** `6zB7FcWMi1cgHu3Xz1V1KiWywK1NSKzgarwzLi1srCoB`

---

## Root Cause Analysis

### 1. No Persistent Volume
The Podman container was running WITHOUT a volume mount for `/app/data`. Each container rebuild (triggered by GitHub Actions on push to master) would reset the `data/` directory to whatever was committed in git.

**Container was running:**
```bash
podman run -d --name lina --env-file /root/bl0ck/lina/.env -p 3000:3000 --restart unless-stopped lina:latest
```

**Should have been:**
```bash
podman run -d --name lina --env-file /root/bl0ck/lina/.env -p 3000:3000 -v /var/lib/lina-data:/app/data:rw --restart unless-stopped lina:latest
```

### 2. Wallet Created After Last Git Commit
The wallet file `data/solana-wallets.json` was committed to git with 5 wallets. The user's wallet was created in the running container AFTER this commit and was never persisted.

### 3. Network Switch Bug (Secondary Issue)
Code in `solana-transaction-manager.ts` had a bug:
```typescript
// BUG: This would create NEW wallet when switching networks
if (storedWallet && storedWallet.network === this.network) {
```

When switching from devnet to mainnet, a new wallet was generated instead of reusing the same keypair.

---

## Timeline

1. User creates wallet on lina - address `2msJT4xcHGa1UUzG8Dg2Jc3oEJ86QhC99WZR4xpZmQrw`
2. User sends 0.2 SOL to this address
3. Code changes pushed to master → GitHub Action triggers
4. Container rebuilt → `data/` reset to git state → Wallet LOST
5. User now has new wallet address `6zB7FcWMi1cgHu3Xz1V1KiWywK1NSKzgarwzLi1srCoB`

---

## Fixes Implemented

### 1. Persistent Volume Added
Server now runs container with:
```bash
-v /var/lib/lina-data:/app/data:rw
```

Restart scripts updated:
- `/root/bl0ck/lina/scripts/restart-container.sh`
- `/root/scripts/restart-container.sh`

### 2. Network Switch Bug Fixed
Changed in `src/managers/solana-transaction-manager.ts`:
```typescript
// OLD (buggy):
if (storedWallet && storedWallet.network === this.network) {

// NEW (fixed):
if (storedWallet) {
```
Solana keypairs are network-independent - same address works on devnet and mainnet.

### 3. Deposits Disabled
Added maintenance warning to UI in `src/frontend/components/dashboard/cdp-wallet-card/index.tsx`:
- Fund button disabled
- Address copy disabled
- Yellow warning banner displayed

### 4. Wallet File in .gitignore
Added `data/` to `.gitignore` to prevent sensitive data from being committed.

---

## Current Server State

**Wallets in persistent storage:**
```
/var/lib/lina-data/solana-wallets.json
```

**UserIds in file:**
- 32ea7bae-82d1-45b2-a474-478b3a9f3f2c
- 5b9d75ce-b068-4518-91cd-bd89f5c12df0 (NEW - current user)
- 932cbead-5578-00a0-b0ff-7e727f465ef2
- 9fbf4828-00ed-4f25-b216-0fb37a9b734d
- a3f7b409-d5af-4e8b-ae5c-f178c8c4a31f
- a3f7b409d5afde8b6e5cf178c8c4a31f

---

## Recovery Status

### Checked Locations
1. `/var/lib/lina-data/solana-wallets.json` - Does NOT contain lost wallet
2. `/root/bl0ck/lina/data/solana-wallets.json` - Does NOT contain lost wallet
3. Git history - Does NOT contain lost wallet
4. Podman overlay filesystems - Found old containers with max 5 wallets, none with lost wallet

### Conclusion
The wallet with address `2msJT4xcHGa1UUzG8Dg2Jc3oEJ86QhC99WZR4xpZmQrw` was:
1. Created in a container
2. Never committed to git
3. Lost when container was rebuilt
4. **NOT RECOVERABLE** without the original encrypted seed phrase

---

## Prevention Measures

### Immediate
- [x] Add persistent volume mount
- [x] Update restart scripts
- [x] Disable deposits in UI
- [x] Fix network switch bug

### Recommended
- [ ] Set up automated backups of wallet file
- [ ] Add monitoring/alerts for wallet file changes
- [ ] Consider external backup to S3/cloud storage
- [ ] Never commit wallet file to git (use .gitignore)
- [ ] Document recovery procedures

---

## Lessons Learned

1. **Always use persistent volumes** for stateful data in containers
2. **Never rely on git commits** to preserve user-generated data
3. **Test container rebuilds** before pushing to production
4. **Backup wallet files** before any deployment
5. **Encrypt wallet data** (already implemented with AES-256-GCM)

---

## Contact

For questions about this incident, contact the development team.
