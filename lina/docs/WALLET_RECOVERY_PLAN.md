# Solana Wallet Recovery Plan

**Date:** 2025-12-05
**Severity:** CRITICAL - User funds at risk
**Status:** In Progress

---

## Incident Summary

### What Happened
1. User created Solana wallet in Lina agent (wallet ID: `9fbf4828-00ed-4f25-b216-0fb37a9b734d`)
2. User sent 0.2 SOL to address `2msJT4xcHGa1UUzG8Dg2Jc3oEJ86QhC99WZR4xpZmQrw`
3. Developer pushed commits → triggered manual container rebuild on DigitalOcean
4. Container rebuild destroyed ephemeral `/app/data/` directory
5. Wallet file reset to commit `72acb31` state (4 wallets) - lost 5th wallet
6. User's private key is now inaccessible

### Root Cause
- **Container has NO persistent volume mount** for `/app/data/`
- `data/solana-wallets.json` is committed to git (last state from commit `72acb31`)
- Container build copies git state → any wallets created after commit are lost on rebuild
- Deployment command: `git pull + podman build + podman run` (no volume mount)

### Data Loss Scope
- **Local repository**: Contains 5 wallets (including lost wallet `9fbf4828...`)
- **Git commit `72acb31`**: Contains 4 wallets (missing the 5th)
- **Production server**: Unknown (likely has 4 wallets from last deployment)
- **Lost wallet**: `9fbf4828-00ed-4f25-b216-0fb37a9b734d` with 0.2 SOL

---

## Recovery Steps

### Step 1: Verify Current Production State

**Goal:** Check if production server still has the lost wallet (before another rebuild destroys it).

```bash
# SSH to server and check running container's wallet file
ssh root@170.64.236.178 "podman exec lina cat /app/data/solana-wallets.json | jq '.wallets | keys'"

# If container is stopped, check if backup exists
ssh root@170.64.236.178 "ls -lah /root/bl0ck/lina/data/"
```

**Possible Outcomes:**
- **Best case:** Container still has 5 wallets (lost wallet recoverable via podman cp)
- **Worst case:** Container already rebuilt with 4 wallets (lost wallet only exists locally)

### Step 2: Attempt Wallet Recovery

#### Option A: If Wallet Still Exists on Server
```bash
# Copy wallet file from running container to server host
ssh root@170.64.236.178 "podman cp lina:/app/data/solana-wallets.json /root/solana-wallets-backup.json"

# Download backup to local machine
scp root@170.64.236.178:/root/solana-wallets-backup.json /home/m0xu/1-projects/bl0ck/lina/data/solana-wallets-RECOVERY.json

# Verify wallet 9fbf4828... exists in backup
jq '.wallets | keys' /home/m0xu/1-projects/bl0ck/lina/data/solana-wallets-RECOVERY.json
```

#### Option B: If Wallet Only Exists Locally
**The encrypted wallet data exists in local git working directory:**

**File:** `/home/m0xu/1-projects/bl0ck/lina/data/solana-wallets.json`
**Lost Wallet:**
```json
{
  "userId": "9fbf4828-00ed-4f25-b216-0fb37a9b734d",
  "encryptedSeedPhrase": "3s/0T73HH65RQ1gFkXJAZZhrKl7xJm8QYFXKx7OnDsYGFjC0tRtOBGlBU6MDg1to5eKrL60TrFyRb7t0P16Wl5m8RQctHl8ol4xveAY/64CqSjlhC9LSZ7FM/wk=",
  "network": "solana",
  "createdAt": 1764500088175
}
```

**To recover this wallet:**
1. Ensure `SOLANA_WALLET_SECRET` env var matches production (same encryption key required)
2. Deploy updated wallet file to production server with persistent volume (see Step 3)
3. User's wallet will be restored with same address

### Step 3: Fix Persistent Storage (REQUIRED)

**Add Podman volume mount to persist wallet data across rebuilds.**

#### Create Volume on Server
```bash
ssh root@170.64.236.178 "
  # Create persistent data directory on host
  mkdir -p /var/lib/lina-data

  # Set permissions
  chmod 755 /var/lib/lina-data

  # Copy current wallet file to persistent storage (if exists)
  if [ -f /root/bl0ck/lina/data/solana-wallets.json ]; then
    cp /root/bl0ck/lina/data/solana-wallets.json /var/lib/lina-data/
  fi
"
```

#### Update Deployment Command
**OLD (DANGEROUS):**
```bash
podman run -d --name lina --env-file .env -p 3000:3000 --restart unless-stopped lina:latest
```

**NEW (SAFE):**
```bash
podman run -d \
  --name lina \
  --env-file /root/bl0ck/lina/.env \
  -p 3000:3000 \
  -v /var/lib/lina-data:/app/data:rw \
  --restart unless-stopped \
  lina:latest
```

**Key change:** `-v /var/lib/lina-data:/app/data:rw` mounts host directory into container.

#### Update Deployment Docs
Update `docs/DEPLOYMENT_STATUS.md` line 200:
```bash
# OLD - DESTROYS WALLETS
ssh root@170.64.236.178 "cd /root/bl0ck/lina && git pull && podman build -t lina:latest -f Containerfile . && podman stop lina && podman rm lina && podman run -d --name lina --env-file .env -p 3000:3000 --restart unless-stopped lina:latest"

# NEW - PRESERVES WALLETS
ssh root@170.64.236.178 "cd /root/bl0ck/lina && git pull && podman build -t lina:latest -f Containerfile . && podman stop lina && podman rm lina && podman run -d --name lina --env-file .env -v /var/lib/lina-data:/app/data:rw -p 3000:3000 --restart unless-stopped lina:latest"
```

### Step 4: Restore Lost Wallet to Production

**After volume mount is configured:**

```bash
# Upload current local wallet file (contains all 5 wallets)
scp /home/m0xu/1-projects/bl0ck/lina/data/solana-wallets.json \
    root@170.64.236.178:/var/lib/lina-data/solana-wallets.json

# Restart container to pick up restored wallets
ssh root@170.64.236.178 "podman restart lina"

# Verify wallet restored
ssh root@170.64.236.178 "podman exec lina cat /app/data/solana-wallets.json | jq '.wallets | keys'"
# Should show 5 wallets including "9fbf4828-00ed-4f25-b216-0fb37a9b734d"
```

### Step 5: Verify User's Funds Accessible

**Test with API call or frontend:**
1. User logs in with same userId: `9fbf4828-00ed-4f25-b216-0fb37a9b734d`
2. Agent calls `getOrCreateWallet(userId)` → loads encrypted wallet from storage
3. Decrypts with `SOLANA_WALLET_SECRET` → restores Keypair
4. Derives address → should match `2msJT4xcHGa1UUzG8Dg2Jc3oEJ86QhC99WZR4xpZmQrw`
5. Check balance with Helius API → should show 0.2 SOL

---

## Prevention Measures

### 1. Add `data/` to `.gitignore` (REQUIRED)

**Current state:** `data/solana-wallets.json` is committed to git (security risk + causes this bug).

**Action:**
```bash
# Add to .gitignore
echo "" >> .gitignore
echo "# Wallet storage (encrypted but should not be in git)" >> .gitignore
echo "data/" >> .gitignore

# Remove from git history
git rm --cached data/solana-wallets.json
git commit -m "fix(security): Remove wallet storage from git tracking"
```

**Why:** Even though wallets are encrypted, private key material should NEVER be in git. With persistent volume, file only exists on server.

### 2. Update Containerfile to Create Data Directory

**Add to Containerfile:**
```dockerfile
# Create data directory for wallet storage (will be volume-mounted)
RUN mkdir -p /app/data && chmod 755 /app/data
```

### 3. Add Volume to Systemd Service

**If using systemd auto-start:**
```bash
ssh root@170.64.236.178 "
  # Regenerate systemd service with volume mount
  podman generate systemd --name lina --files --new

  # Edit service file to add volume
  sed -i 's|podman run|podman run -v /var/lib/lina-data:/app/data:rw|' container-lina.service

  # Install service
  mv container-lina.service /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable container-lina.service
"
```

### 4. Automated Backups

**Add cron job to backup wallet file:**
```bash
ssh root@170.64.236.178 "
  # Create backup script
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

  # Add to crontab (daily at 2 AM)
  (crontab -l 2>/dev/null; echo '0 2 * * * /root/backup-lina-wallets.sh') | crontab -
"
```

### 5. GitHub Actions Secret for Emergency Recovery

**Store encrypted wallet backup in GitHub Secrets:**
```bash
# Encrypt wallet file with GPG (use strong passphrase)
gpg --symmetric --cipher-algo AES256 data/solana-wallets.json

# Upload solana-wallets.json.gpg to GitHub Secrets as WALLET_BACKUP_GPG
# Store passphrase in password manager
```

**On recovery:**
```bash
# Download from GitHub Secrets, decrypt, restore
echo "$WALLET_BACKUP_GPG" | base64 -d > wallets.json.gpg
gpg --decrypt wallets.json.gpg > solana-wallets.json
```

---

## Checklist

**Immediate (Priority 1):**
- [ ] SSH to server, check if lost wallet still exists in running container
- [ ] If yes: `podman cp` wallet file to host for backup
- [ ] Create persistent volume directory: `/var/lib/lina-data/`
- [ ] Stop container, add volume mount, restart with persistence
- [ ] Upload local wallet file (5 wallets) to persistent volume
- [ ] Verify user's wallet restored and funds accessible

**Short-term (Priority 2):**
- [ ] Add `data/` to `.gitignore`
- [ ] Remove `data/solana-wallets.json` from git history
- [ ] Update Containerfile to create `/app/data` directory
- [ ] Update `docs/DEPLOYMENT_STATUS.md` with volume mount command
- [ ] Test full deployment cycle (build + run with volume)

**Long-term (Priority 3):**
- [ ] Set up automated daily backups of wallet file
- [ ] Store encrypted backup in GitHub Secrets
- [ ] Add volume mount to systemd service
- [ ] Document recovery procedure in `docs/`
- [ ] Consider alternative storage (encrypted S3, vault, etc.)

---

## Technical Details

### Wallet Encryption
- **Algorithm:** AES-256-GCM
- **Key Source:** `SOLANA_WALLET_SECRET` environment variable (32 bytes derived via SHA-256)
- **Format:** Base64(IV[12] + encrypted_data + auth_tag[16])
- **Location:** `/app/data/solana-wallets.json` inside container

### Wallet Derivation
- **Method:** Solana Keypair.generate() → 64-byte Ed25519 keypair
- **Storage:** Encrypted secret key (64 bytes) stored as `encryptedSeedPhrase`
- **Recovery:** Keypair.fromSecretKey(decrypted_seed) → derives same address

### Address Verification
To verify wallet `9fbf4828...` matches address `2msJT4xcHGa1UUzG8Dg2Jc3oEJ86QhC99WZR4xpZmQrw`:
1. Decrypt `encryptedSeedPhrase` using `SOLANA_WALLET_SECRET`
2. Create Keypair from decrypted seed
3. Call `keypair.publicKey.toBase58()` → should match user's address

---

## Contact

**User affected:** userId `9fbf4828-00ed-4f25-b216-0fb37a9b734d`
**Lost address:** `2msJT4xcHGa1UUzG8Dg2Jc3oEJ86QhC99WZR4xpZmQrw`
**Amount:** 0.2 SOL (~$40 USD at current price)

**Status:** Encrypted wallet data exists locally. Recovery possible if:
1. `SOLANA_WALLET_SECRET` matches production (same encryption key)
2. Local wallet file is deployed with persistent volume mount
