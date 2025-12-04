# IMMEDIATE ACTION CHECKLIST - Wallet Recovery

**Incident:** Solana wallet data lost on container rebuilds
**Affected User:** `9fbf4828-00ed-4f25-b216-0fb37a9b734d` (0.2 SOL at risk)
**Status:** Code fixed, server deployment pending

---

## Phase 1: Stop Further Damage (COMPLETE)

- [x] Identify root cause (no persistent volume mount)
- [x] Add `data/` to `.gitignore` to prevent future commits
- [x] Update `Containerfile` to create `/app/data` directory
- [x] Update deployment docs with volume mount instructions
- [x] Create safe deployment script with automated checks
- [x] Document recovery procedure

**Result:** No further deployments will destroy wallet data (if volume mount used).

---

## Phase 2: Verify Recovery Possible (RUN NOW)

Before doing anything else, check if the lost wallet can be recovered:

```bash
cd /home/m0xu/1-projects/bl0ck/lina
./scripts/verify-wallet-recovery.sh
```

This script will tell you:
1. If lost wallet exists in local file (it does - verified)
2. If lost wallet still exists in production container (unknown - need to check)
3. If persistent storage directory exists (probably not)
4. The exact recovery commands to run

**Time required:** 30 seconds

---

## Phase 3: Emergency Recovery (RUN IMMEDIATELY IF WALLET IN PRODUCTION)

If `verify-wallet-recovery.sh` reports the wallet EXISTS in production container:

### URGENT: Extract Wallet Before Next Deploy

```bash
# 1. Extract wallet file from running container
ssh root@170.64.236.178 "podman cp lina:/app/data/solana-wallets.json /root/solana-wallets-emergency-backup.json"

# 2. Create persistent directory
ssh root@170.64.236.178 "mkdir -p /var/lib/lina-data && chmod 755 /var/lib/lina-data"

# 3. Copy to persistent storage
ssh root@170.64.236.178 "cp /root/solana-wallets-emergency-backup.json /var/lib/lina-data/solana-wallets.json"

# 4. Verify
ssh root@170.64.236.178 "cat /var/lib/lina-data/solana-wallets.json | jq '.wallets | keys'"
# Should show 5 wallets including "9fbf4828-00ed-4f25-b216-0fb37a9b734d"
```

**Time required:** 2 minutes

**CRITICAL:** Do this BEFORE any git push or container rebuild!

---

## Phase 4: Upload Local Wallet File (IF WALLET NOT IN PRODUCTION)

If `verify-wallet-recovery.sh` reports the wallet DOES NOT exist in production:

```bash
# 1. Create persistent directory
ssh root@170.64.236.178 "mkdir -p /var/lib/lina-data && chmod 755 /var/lib/lina-data"

# 2. Upload local wallet file (contains all 5 wallets including lost one)
scp /home/m0xu/1-projects/bl0ck/lina/data/solana-wallets.json \
    root@170.64.236.178:/var/lib/lina-data/solana-wallets.json

# 3. Verify
ssh root@170.64.236.178 "cat /var/lib/lina-data/solana-wallets.json | jq '.wallets | keys'"
# Should show 5 wallets including "9fbf4828-00ed-4f25-b216-0fb37a9b734d"
```

**Time required:** 1 minute

---

## Phase 5: Deploy with Persistent Volume

Once wallet file is in `/var/lib/lina-data/` on the server:

```bash
cd /home/m0xu/1-projects/bl0ck/lina

# Use the safe deployment script
./scripts/deploy-with-persistence.sh
```

This script will:
1. Verify persistent directory exists
2. Backup current wallet file
3. Pull latest code
4. Build new container
5. Deploy with volume mount: `-v /var/lib/lina-data:/app/data:rw`
6. Verify wallet file accessible inside container

**Time required:** 10-15 minutes (build takes 5-10 minutes)

---

## Phase 6: Verify Recovery Successful

After deployment completes:

```bash
# 1. Check container is running
ssh root@170.64.236.178 "podman ps | grep lina"

# 2. Verify wallet count
ssh root@170.64.236.178 "podman exec lina cat /app/data/solana-wallets.json | jq '.wallets | keys | length'"
# Should show: 5

# 3. Verify lost wallet exists
ssh root@170.64.236.178 "podman exec lina cat /app/data/solana-wallets.json | jq '.wallets[\"9fbf4828-00ed-4f25-b216-0fb37a9b734d\"]'"
# Should show the wallet object with encrypted seed phrase

# 4. Test with API call (or have user log in)
# User should see address: 2msJT4xcHGa1UUzG8Dg2Jc3oEJ86QhC99WZR4xpZmQrw
# Balance should show: 0.2 SOL
```

**Time required:** 2 minutes

---

## Phase 7: Prevent Future Incidents

### A. Remove Wallet File from Git History

```bash
cd /home/m0xu/1-projects/bl0ck/lina

# Remove file from git tracking (already in .gitignore)
git rm --cached data/solana-wallets.json

# Commit the removal
git commit -m "fix(security): Remove wallet storage from git tracking

- Add data/ to .gitignore
- Wallets now persist via Podman volume mount
- Prevents wallet loss on container rebuilds
- See docs/WALLET_PERSISTENCE_FIX.md for details"

# Push to remove from remote
git push origin master
```

**Time required:** 1 minute

### B. Set Up Automated Backups

```bash
# Create backup script on server
ssh root@170.64.236.178 "cat > /root/backup-lina-wallets.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/root/lina-backups
mkdir -p \$BACKUP_DIR
DATE=\$(date +%Y%m%d-%H%M%S)
cp /var/lib/lina-data/solana-wallets.json \$BACKUP_DIR/solana-wallets-\$DATE.json
# Keep last 30 days
find \$BACKUP_DIR -name 'solana-wallets-*.json' -mtime +30 -delete
echo \"Backup created: \$BACKUP_DIR/solana-wallets-\$DATE.json\"
EOF
"

# Make executable
ssh root@170.64.236.178 "chmod +x /root/backup-lina-wallets.sh"

# Test backup script
ssh root@170.64.236.178 "/root/backup-lina-wallets.sh"

# Add to crontab (daily at 2 AM)
ssh root@170.64.236.178 "(crontab -l 2>/dev/null; echo '0 2 * * * /root/backup-lina-wallets.sh') | crontab -"

# Verify cron job added
ssh root@170.64.236.178 "crontab -l | grep backup-lina-wallets"
```

**Time required:** 3 minutes

### C. Test Persistence

```bash
# Get current wallet IDs
ssh root@170.64.236.178 "podman exec lina cat /app/data/solana-wallets.json | jq '.wallets | keys'"

# Restart container
ssh root@170.64.236.178 "podman restart lina"

# Wait 10 seconds
sleep 10

# Verify wallets unchanged
ssh root@170.64.236.178 "podman exec lina cat /app/data/solana-wallets.json | jq '.wallets | keys'"

# Should be identical
```

**Time required:** 1 minute

---

## Summary Checklist

### Must Do NOW (Before Next Deploy)
- [ ] Run `./scripts/verify-wallet-recovery.sh`
- [ ] If wallet in production: Extract with `podman cp`
- [ ] If wallet not in production: Upload local file
- [ ] Verify wallet file in `/var/lib/lina-data/`

### Must Do During Next Deploy
- [ ] Run `./scripts/deploy-with-persistence.sh` (not manual commands)
- [ ] Verify volume mount: `-v /var/lib/lina-data:/app/data:rw`
- [ ] Check container logs for errors
- [ ] Verify wallet count after deploy

### Must Do After Deploy
- [ ] Verify lost wallet accessible via API
- [ ] Have user test login and balance check
- [ ] Remove `data/solana-wallets.json` from git
- [ ] Set up automated backups (cron job)
- [ ] Test persistence across container restart

### Nice to Have (This Week)
- [ ] Update systemd service with volume mount
- [ ] Add wallet count monitoring
- [ ] Document recovery procedure for team
- [ ] Consider cloud backup (S3, Vault)

---

## Files Reference

| File | Purpose |
|------|---------|
| `docs/WALLET_RECOVERY_PLAN.md` | Detailed recovery procedure |
| `docs/WALLET_PERSISTENCE_FIX.md` | Summary of fix and testing |
| `docs/DEPLOYMENT_STATUS.md` | Updated deployment instructions |
| `scripts/verify-wallet-recovery.sh` | Check recovery status |
| `scripts/deploy-with-persistence.sh` | Safe deployment automation |
| `.gitignore` | Added `data/` to prevent commits |
| `Containerfile` | Added `/app/data` directory creation |

---

## Questions or Issues?

If anything goes wrong during recovery:

1. **DO NOT panic** - The encrypted wallet data exists locally
2. **DO NOT deploy** until wallet file is in persistent storage
3. **Check logs:** `ssh root@170.64.236.178 "podman logs lina"`
4. **Verify encryption key:** `SOLANA_WALLET_SECRET` must match local
5. **Ask for help** if needed - include error messages

**Most important:** The wallet private key is encrypted in `/home/m0xu/1-projects/bl0ck/lina/data/solana-wallets.json`. As long as this file exists and you have the correct `SOLANA_WALLET_SECRET`, the wallet can be recovered.
