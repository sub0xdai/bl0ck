#!/bin/bash
# Restart lina container (image built by GitHub Actions)

podman stop lina 2>/dev/null || true
podman rm lina 2>/dev/null || true

podman run -d \
  --name lina \
  --env-file /root/bl0ck/lina/.env \
  -p 3000:3000 \
  --restart unless-stopped \
  lina:latest

echo "Container restarted:"
podman ps --filter name=lina
