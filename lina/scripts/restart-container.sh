#!/bin/bash
# Build and restart lina Podman container

set -e

cd /root/bl0ck/lina

echo "Pulling latest code..."
git pull origin master

echo "Stopping lina container..."
podman stop lina 2>/dev/null || true

echo "Removing lina container..."
podman rm lina 2>/dev/null || true

echo "Building new image..."
podman build --no-cache -t lina:latest .

echo "Starting lina container..."
podman run -d \
  --name lina \
  --env-file /root/bl0ck/lina/.env \
  -p 3000:3000 \
  --restart unless-stopped \
  lina:latest

echo "Done. Container status:"
podman ps --filter name=lina
