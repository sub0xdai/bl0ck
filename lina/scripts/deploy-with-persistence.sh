#!/bin/bash
# Lina Deployment Script with Persistent Wallet Storage
# CRITICAL: This script ensures wallet data survives container rebuilds

set -e  # Exit on any error

SERVER="root@170.64.236.178"
REMOTE_PATH="/root/bl0ck/lina"
DATA_DIR="/var/lib/lina-data"

echo "========================================="
echo "Lina Deployment with Persistent Storage"
echo "========================================="
echo ""

# Step 1: Verify persistent storage directory exists
echo "[1/6] Verifying persistent storage directory..."
ssh "$SERVER" "
  if [ ! -d '$DATA_DIR' ]; then
    echo 'Creating persistent data directory: $DATA_DIR'
    mkdir -p '$DATA_DIR'
    chmod 755 '$DATA_DIR'
  else
    echo 'Persistent data directory exists: $DATA_DIR'
  fi
"

# Step 2: Backup current wallet file (if exists)
echo ""
echo "[2/6] Backing up current wallet data..."
ssh "$SERVER" "
  if [ -f '$DATA_DIR/solana-wallets.json' ]; then
    BACKUP_FILE=\"/root/wallet-backup-\$(date +%Y%m%d-%H%M%S).json\"
    cp '$DATA_DIR/solana-wallets.json' \"\$BACKUP_FILE\"
    echo \"Backup created: \$BACKUP_FILE\"
  else
    echo 'No existing wallet file to backup'
  fi
"

# Step 3: Pull latest code
echo ""
echo "[3/6] Pulling latest code from git..."
ssh "$SERVER" "cd '$REMOTE_PATH' && git pull"

# Step 4: Build new container image
echo ""
echo "[4/6] Building container image (this takes 5-10 minutes)..."
ssh "$SERVER" "cd '$REMOTE_PATH' && podman build -t lina:latest -f Containerfile ."

# Step 5: Stop old container and start new one WITH VOLUME MOUNT
echo ""
echo "[5/6] Deploying new container with persistent volume..."
ssh "$SERVER" "
  # Stop and remove old container
  podman stop lina 2>/dev/null || true
  podman rm lina 2>/dev/null || true

  # Start new container with volume mount
  podman run -d \
    --name lina \
    --env-file '$REMOTE_PATH/.env' \
    -v '$DATA_DIR:/app/data:rw' \
    -p 3000:3000 \
    --restart unless-stopped \
    lina:latest

  echo 'Container started with persistent volume'
"

# Step 6: Verify deployment
echo ""
echo "[6/6] Verifying deployment..."
sleep 5  # Give container time to start

ssh "$SERVER" "
  echo 'Container status:'
  podman ps | grep lina || echo 'ERROR: Container not running!'

  echo ''
  echo 'Checking health endpoint...'
  curl -f http://localhost:3000/healthz || echo 'WARNING: Health check failed'

  echo ''
  echo 'Wallet file status:'
  if podman exec lina test -f /app/data/solana-wallets.json; then
    WALLET_COUNT=\$(podman exec lina cat /app/data/solana-wallets.json | grep -o '\"userId\"' | wc -l)
    echo \"Wallet file exists with \$WALLET_COUNT wallets\"
  else
    echo 'WARNING: Wallet file not found inside container'
  fi
"

echo ""
echo "========================================="
echo "Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Test frontend: https://app.lina4rmdabl0ck.xyz"
echo "2. Check logs: ssh $SERVER 'podman logs -f lina'"
echo "3. Verify wallets persisted across deploys"
echo "========================================="
