# Wallet Persistence Fix - Summary

**Date:** 2025-12-05
**Issue:** Solana wallets lost on every container rebuild
**Status:** FIXED (pending server deployment)

---

## What Was Wrong

### The Bug
Every time the Podman container was rebuilt (`git pull + podman build + podman run`), the `/app/data/solana-wallets.json` file inside the container was reset to whatever state existed in the git commit. Any wallets created after the last commit were permanently lost.

### Why It Happened
1. **No persistent volume mount** - The container's `/app/data/` directory was ephemeral
2. **Wallet file committed to git** - `data/solana-wallets.json` was tracked in git (security risk)
3. **No backup system** - No automated backups of wallet data

### Impact
- **User `9fbf4828-00ed-4f25-b216-0fb37a9b734d`** lost access to wallet address `2msJT4xcHGa1UUzG8Dg2Jc3oEJ86QhC99WZR4xpZmQrw`
- **0.2 SOL (~$40)** now inaccessible
- Wallet created after commit `72acb31` → not in git → destroyed on next deploy

---

## What Was Fixed

### 1. Added Persistent Volume Mount
**File:** `/home/m0xu/1-projects/bl0ck/lina/Containerfile`
```dockerfile
# Create data directory for wallet storage
RUN mkdir -p /app/data && chmod 755 /app/data
```

**Deployment command updated:**
```bash
# OLD (DESTROYS WALLETS)
podman run -d --name lina --env-file .env -p 3000:3000 lina:latest

# NEW (PRESERVES WALLETS)
podman run -d --name lina --env-file .env -v /var/lib/lina-data:/app/data:rw -p 3000:3000 lina:latest
```

**Key change:** `-v /var/lib/lina-data:/app/data:rw` mounts host directory into container. Wallet data now persists across rebuilds.

### 2. Removed Wallet File from Git
**File:** `/home/m0xu/1-projects/bl0ck/lina/.gitignore`
```gitignore
# Wallet storage (encrypted but should NEVER be in git)
# CRITICAL: Wallets must persist via Docker/Podman volumes, NOT git commits
data/
```

**Security:** Even though wallets are AES-256-GCM encrypted, private key material should never be in git history.

### 3. Updated Deployment Docs
**File:** `/home/m0xu/1-projects/bl0ck/lina/docs/DEPLOYMENT_STATUS.md`
- Added Step 0: Create persistent storage directory
- Updated all deployment commands to include volume mount
- Added troubleshooting section for lost wallets
- Added backup command to quick reference

### 4. Created Safe Deployment Script
**File:** `/home/m0xu/1-projects/bl0ck/lina/scripts/deploy-with-persistence.sh`
- Automated deployment with all safety checks
- Creates persistent directory if missing
- Backs up wallet file before deploy
- Verifies volume mount after deploy
- Confirms wallet file accessible inside container

---

## Recovery Plan

### Immediate Actions (Run on Server)

**1. Create persistent storage directory:**
```bash
ssh root@170.64.236.178 "mkdir -p /var/lib/lina-data && chmod 755 /var/lib/lina-data"
```

**2. Check if lost wallet still exists in running container:**
```bash
ssh root@170.64.236.178 "podman exec lina cat /app/data/solana-wallets.json | jq '.wallets | keys'"
```

If output shows 5 wallets including `"9fbf4828-00ed-4f25-b216-0fb37a9b734d"`, the wallet is recoverable!

**3. If wallet exists, extract it immediately:**
```bash
ssh root@170.64.236.178 "podman cp lina:/app/data/solana-wallets.json /var/lib/lina-data/solana-wallets.json"
```

**4. If wallet doesn't exist, upload local copy (contains all 5 wallets):**
```bash
scp /home/m0xu/1-projects/bl0ck/lina/data/solana-wallets.json \
    root@170.64.236.178:/var/lib/lina-data/solana-wallets.json
```

**5. Redeploy with persistent volume:**
```bash
ssh root@170.64.236.178 "
  cd /root/bl0ck/lina
  git pull
  podman build -t lina:latest -f Containerfile .
  podman stop lina && podman rm lina
  podman run -d --name lina --env-file .env -v /var/lib/lina-data:/app/data:rw -p 3000:3000 --restart unless-stopped lina:latest
"
```

**6. Verify wallet restored:**
```bash
ssh root@170.64.236.178 "podman exec lina cat /app/data/solana-wallets.json | jq '.wallets | keys'"
# Should show 5 wallets including "9fbf4828-00ed-4f25-b216-0fb37a9b734d"
```

---

## Wallet Recovery Details

### Lost Wallet Info
```json
{
  "userId": "9fbf4828-00ed-4f25-b216-0fb37a9b734d",
  "encryptedSeedPhrase": "3s/0T73HH65RQ1gFkXJAZZhrKl7xJm8QYFXKx7OnDsYGFjC0tRtOBGlBU6MDg1to5eKrL60TrFyRb7t0P16Wl5m8RQctHl8ol4xveAY/64CqSjlhC9LSZ7FM/wk=",
  "network": "solana",
  "createdAt": 1764500088175
}
```

- **User ID:** `9fbf4828-00ed-4f25-b216-0fb37a9b734d`
- **Expected Address:** `2msJT4xcHGa1UUzG8Dg2Jc3oEJ86QhC99WZR4xpZmQrw`
- **Balance:** 0.2 SOL (~$40 USD)
- **Created:** 2025-12-05 (after commit `72acb31`)

### Encryption Details
- **Algorithm:** AES-256-GCM
- **Key Source:** `SOLANA_WALLET_SECRET` environment variable
- **Format:** Base64(IV[12 bytes] + encrypted_data + auth_tag[16 bytes])

### Recovery Requirements
1. **Same encryption key** - Production `SOLANA_WALLET_SECRET` must match local
2. **Same userId** - User must log in with ID `9fbf4828-00ed-4f25-b216-0fb37a9b734d`
3. **Wallet file deployed** - Local `solana-wallets.json` must be on production server

When these conditions are met, the wallet manager will:
1. Load encrypted wallet from storage
2. Decrypt with `SOLANA_WALLET_SECRET`
3. Restore Keypair from secret key
4. Derive address → should match `2msJT4xcHGa1UUzG8Dg2Jc3oEJ86QhC99WZR4xpZmQrw`
5. User can access their 0.2 SOL

---

## Prevention Measures

### 1. Always Use Volume Mount
**Never run container without persistent volume:**
```bash
-v /var/lib/lina-data:/app/data:rw
```

### 2. Automated Backups
**Set up daily backup cron job on server:**
```bash
ssh root@170.64.236.178 "
  cat > /root/backup-lina-wallets.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/root/lina-backups
mkdir -p \$BACKUP_DIR
DATE=\$(date +%Y%m%d-%H%M%S)
cp /var/lib/lina-data/solana-wallets.json \$BACKUP_DIR/solana-wallets-\$DATE.json
# Keep last 30 days
find \$BACKUP_DIR -name 'solana-wallets-*.json' -mtime +30 -delete
EOF

  chmod +x /root/backup-lina-wallets.sh
  (crontab -l 2>/dev/null; echo '0 2 * * * /root/backup-lina-wallets.sh') | crontab -
"
```

### 3. Use Safe Deployment Script
**Always deploy via:**
```bash
cd /home/m0xu/1-projects/bl0ck/lina
./scripts/deploy-with-persistence.sh
```

This script handles:
- Volume directory creation
- Pre-deploy backup
- Volume mount verification
- Post-deploy wallet check

### 4. Monitor Wallet Count
**Add to health check script:**
```bash
EXPECTED_WALLETS=5
ACTUAL_WALLETS=$(podman exec lina cat /app/data/solana-wallets.json | grep -o '"userId"' | wc -l)

if [ "$ACTUAL_WALLETS" -lt "$EXPECTED_WALLETS" ]; then
  echo "WARNING: Wallet count dropped from $EXPECTED_WALLETS to $ACTUAL_WALLETS"
  # Alert via email/Slack
fi
```

---

## Testing the Fix

### Test 1: Wallet Survives Container Restart
```bash
# Get initial wallet count
ssh root@170.64.236.178 "podman exec lina cat /app/data/solana-wallets.json | jq '.wallets | keys | length'"

# Restart container
ssh root@170.64.236.178 "podman restart lina"

# Verify count unchanged
ssh root@170.64.236.178 "podman exec lina cat /app/data/solana-wallets.json | jq '.wallets | keys | length'"
```

### Test 2: Wallet Survives Full Rebuild
```bash
# Get initial wallet IDs
ssh root@170.64.236.178 "podman exec lina cat /app/data/solana-wallets.json | jq '.wallets | keys'"

# Full rebuild (git pull + build + run)
cd /home/m0xu/1-projects/bl0ck/lina
./scripts/deploy-with-persistence.sh

# Verify same wallet IDs
ssh root@170.64.236.178 "podman exec lina cat /app/data/solana-wallets.json | jq '.wallets | keys'"
```

### Test 3: New Wallet Persists Across Deploy
```bash
# Create test wallet via frontend
# Note the userId and address

# Deploy new version
./scripts/deploy-with-persistence.sh

# Verify test wallet still exists
ssh root@170.64.236.178 "podman exec lina cat /app/data/solana-wallets.json | jq '.wallets[\"TEST_USER_ID\"]'"
```

---

## Files Changed

| File | Change | Purpose |
|------|--------|---------|
| `.gitignore` | Added `data/` | Remove wallet storage from git |
| `Containerfile` | Added `RUN mkdir -p /app/data` | Create volume mount point |
| `docs/DEPLOYMENT_STATUS.md` | Updated all commands | Add volume mount to deploys |
| `docs/WALLET_RECOVERY_PLAN.md` | New file | Detailed recovery procedure |
| `docs/WALLET_PERSISTENCE_FIX.md` | New file (this) | Summary of fix |
| `scripts/deploy-with-persistence.sh` | New file | Safe deployment automation |

---

## Next Steps

### Immediate (Before Next Deploy)
1. [ ] SSH to production server
2. [ ] Check if lost wallet still exists in running container
3. [ ] If yes: Extract wallet file to persistent storage
4. [ ] If no: Upload local wallet file (contains all 5 wallets)
5. [ ] Create `/var/lib/lina-data/` directory
6. [ ] Run `deploy-with-persistence.sh` script
7. [ ] Verify all 5 wallets accessible

### Short-term (This Week)
1. [ ] Remove `data/solana-wallets.json` from git history
2. [ ] Set up automated daily backups (cron job)
3. [ ] Test wallet persistence across multiple deploys
4. [ ] Update systemd service with volume mount
5. [ ] Document recovery procedure for team

### Long-term (Next Sprint)
1. [ ] Consider moving to encrypted cloud storage (S3, Vault)
2. [ ] Add wallet count monitoring/alerts
3. [ ] Implement wallet recovery UI for users
4. [ ] Add multi-sig or backup recovery keys

---

## Contact Info

**For wallet recovery assistance:**
- Check logs: `ssh root@170.64.236.178 "podman logs lina"`
- Verify wallet file: `ssh root@170.64.236.178 "ls -lh /var/lib/lina-data/"`
- Test decryption: Ensure production `SOLANA_WALLET_SECRET` matches local

**Files to reference:**
- Recovery plan: `/home/m0xu/1-projects/bl0ck/lina/docs/WALLET_RECOVERY_PLAN.md`
- Deployment status: `/home/m0xu/1-projects/bl0ck/lina/docs/DEPLOYMENT_STATUS.md`
- Local wallet backup: `/home/m0xu/1-projects/bl0ck/lina/data/solana-wallets.json`
