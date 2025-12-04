#!/bin/bash
# Wallet Recovery Verification Script
# Run this BEFORE deploying to check if lost wallet can be recovered

set -e

SERVER="root@170.64.236.178"
LOST_WALLET_ID="9fbf4828-00ed-4f25-b216-0fb37a9b734d"

echo "========================================="
echo "Wallet Recovery Verification"
echo "========================================="
echo ""
echo "Checking for lost wallet: $LOST_WALLET_ID"
echo "Expected address: 2msJT4xcHGa1UUzG8Dg2Jc3oEJ86QhC99WZR4xpZmQrw"
echo ""

# Check 1: Local file has the wallet
echo "[1/4] Checking local wallet file..."
if [ ! -f "data/solana-wallets.json" ]; then
  echo "❌ ERROR: Local wallet file not found: data/solana-wallets.json"
  exit 1
fi

if grep -q "$LOST_WALLET_ID" data/solana-wallets.json; then
  echo "✅ Lost wallet exists in local file"
  LOCAL_WALLET_COUNT=$(grep -o '"userId"' data/solana-wallets.json | wc -l)
  echo "   Total wallets in local file: $LOCAL_WALLET_COUNT"
else
  echo "❌ ERROR: Lost wallet NOT in local file"
  exit 1
fi

# Check 2: Verify container is running
echo ""
echo "[2/4] Checking production container status..."
CONTAINER_STATUS=$(ssh "$SERVER" "podman ps -q --filter name=lina" 2>/dev/null || echo "")
if [ -z "$CONTAINER_STATUS" ]; then
  echo "⚠️  WARNING: Container not running on production"
  echo "   Lost wallet can only be recovered from local file"
  RECOVERY_SOURCE="local"
else
  echo "✅ Container is running"

  # Check 3: Check if wallet exists in running container
  echo ""
  echo "[3/4] Checking production container wallet file..."
  if ssh "$SERVER" "podman exec lina test -f /app/data/solana-wallets.json" 2>/dev/null; then
    echo "✅ Wallet file exists in container"

    PROD_HAS_WALLET=$(ssh "$SERVER" "podman exec lina cat /app/data/solana-wallets.json | grep -c '$LOST_WALLET_ID'" || echo "0")
    if [ "$PROD_HAS_WALLET" -gt 0 ]; then
      echo "✅ Lost wallet EXISTS in production container!"
      echo "   URGENT: Extract wallet file NOW before next deploy"
      RECOVERY_SOURCE="production"
      PROD_WALLET_COUNT=$(ssh "$SERVER" "podman exec lina cat /app/data/solana-wallets.json | grep -o '\"userId\"' | wc -l")
      echo "   Total wallets in production: $PROD_WALLET_COUNT"
    else
      echo "❌ Lost wallet NOT in production container"
      echo "   Recovery must use local file"
      RECOVERY_SOURCE="local"
    fi
  else
    echo "⚠️  WARNING: Wallet file not found in container"
    RECOVERY_SOURCE="local"
  fi
fi

# Check 4: Verify persistent directory exists
echo ""
echo "[4/4] Checking persistent storage directory..."
if ssh "$SERVER" "test -d /var/lib/lina-data" 2>/dev/null; then
  echo "✅ Persistent directory exists: /var/lib/lina-data"

  if ssh "$SERVER" "test -f /var/lib/lina-data/solana-wallets.json" 2>/dev/null; then
    echo "✅ Wallet file exists in persistent storage"
    PERSIST_WALLET_COUNT=$(ssh "$SERVER" "cat /var/lib/lina-data/solana-wallets.json | grep -o '\"userId\"' | wc -l")
    echo "   Total wallets: $PERSIST_WALLET_COUNT"
  else
    echo "⚠️  Wallet file not in persistent storage yet"
  fi
else
  echo "❌ Persistent directory does NOT exist"
  echo "   Will be created during deployment"
fi

# Summary and recommendations
echo ""
echo "========================================="
echo "RECOVERY PLAN"
echo "========================================="
echo ""

if [ "$RECOVERY_SOURCE" = "production" ]; then
  echo "🎯 Recovery Strategy: Extract from Production Container"
  echo ""
  echo "The lost wallet STILL EXISTS in the running container!"
  echo ""
  echo "URGENT ACTIONS (run NOW before next deploy):"
  echo ""
  echo "1. Extract wallet file from container:"
  echo "   ssh $SERVER 'podman cp lina:/app/data/solana-wallets.json /var/lib/lina-data/solana-wallets.json'"
  echo ""
  echo "2. Create backup:"
  echo "   ssh $SERVER 'cp /var/lib/lina-data/solana-wallets.json /root/wallet-backup-\$(date +%Y%m%d-%H%M%S).json'"
  echo ""
  echo "3. Deploy with persistent volume:"
  echo "   ./scripts/deploy-with-persistence.sh"
  echo ""
  echo "4. Verify wallet restored:"
  echo "   ssh $SERVER 'podman exec lina cat /app/data/solana-wallets.json | jq \".wallets[\\\"$LOST_WALLET_ID\\\"]\"'"
  echo ""
  echo "⚠️  DO NOT deploy without extracting the wallet file first!"

elif [ "$RECOVERY_SOURCE" = "local" ]; then
  echo "🎯 Recovery Strategy: Upload from Local File"
  echo ""
  echo "The lost wallet only exists in your local file."
  echo ""
  echo "RECOVERY ACTIONS:"
  echo ""
  echo "1. Create persistent directory:"
  echo "   ssh $SERVER 'mkdir -p /var/lib/lina-data && chmod 755 /var/lib/lina-data'"
  echo ""
  echo "2. Upload local wallet file:"
  echo "   scp data/solana-wallets.json $SERVER:/var/lib/lina-data/"
  echo ""
  echo "3. Create backup:"
  echo "   ssh $SERVER 'cp /var/lib/lina-data/solana-wallets.json /root/wallet-backup-\$(date +%Y%m%d-%H%M%S).json'"
  echo ""
  echo "4. Deploy with persistent volume:"
  echo "   ./scripts/deploy-with-persistence.sh"
  echo ""
  echo "5. Verify wallet restored:"
  echo "   ssh $SERVER 'podman exec lina cat /app/data/solana-wallets.json | jq \".wallets[\\\"$LOST_WALLET_ID\\\"]\"'"
fi

echo ""
echo "========================================="
echo "CRITICAL REQUIREMENTS"
echo "========================================="
echo ""
echo "✓ Persistent volume mount: -v /var/lib/lina-data:/app/data:rw"
echo "✓ Same encryption key: SOLANA_WALLET_SECRET must match"
echo "✓ Wallet file deployed: $LOCAL_WALLET_COUNT wallets including lost one"
echo ""
echo "After recovery, user can access their funds with:"
echo "- User ID: $LOST_WALLET_ID"
echo "- Address: 2msJT4xcHGa1UUzG8Dg2Jc3oEJ86QhC99WZR4xpZmQrw"
echo "- Balance: 0.2 SOL (~\$40 USD)"
echo ""
