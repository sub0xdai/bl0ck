# Deployment Status - bl0ck Ecosystem

**Last Updated:** December 5, 2025
**Server:** 170.64.236.178 (DigitalOcean, Ubuntu 24.04)
**Domain:** lina4rmdabl0ck.xyz

## Current State

| Component | Status | URL | Notes |
|-----------|--------|-----|-------|
| **Landing Page** | `BLOCKED` | https://lina4rmdabl0ck.xyz | Files uploaded - needs Cloudflare cache purge |
| **Lina Backend** | `BLOCKED` | https://app.lina4rmdabl0ck.xyz | Needs container deployment (see below) |
| **SSL** | `DONE` | - | Let's Encrypt + Cloudflare Full (Strict) |
| **Nginx** | `DONE` | - | Config correct, both server blocks working |
| **DNS** | `DONE` | - | A records for @, www, app all pointing to server |

## Server Specs (Required Minimum)

```
RAM: 4GB (builds hang with less)
Disk: 80GB SSD (35GB fills up with node_modules + containers)
Swap: 1GB at /swapfile (configured)
OS: Ubuntu 24.04 (kernel 6.17)
```

## CRITICAL: Bun Runtime Issue

**Bun 1.2.x/1.3.x crashes on Ubuntu 24.04 with kernel 6.17** due to a libuv compatibility issue:

```
panic(main thread): unsupported uv function: uv_version_string
Crashed while loading native module: bigint-buffer
```

**Root Cause:** The `bigint-buffer` native module (dependency of Solana libs) calls `uv_version_string` which Bun doesn't support on newer Linux kernels.

**Solution: Run Lina in a Podman container** using the official Bun Debian image which has an older, compatible kernel environment.

## Deployment Method: Podman Container

### CRITICAL: Persistent Wallet Storage

**Solana wallet data MUST persist across container rebuilds.**

**Before deploying:**
1. Create persistent data directory on server: `/var/lib/lina-data/`
2. ALWAYS mount volume when running container: `-v /var/lib/lina-data:/app/data:rw`
3. NEVER commit `data/` directory to git (now in `.gitignore`)

**Failure to use persistent volume = USER FUNDS LOST on every deploy.**

### Step 0: Create Persistent Storage (REQUIRED FIRST)

```bash
ssh root@170.64.236.178

# Create persistent data directory
mkdir -p /var/lib/lina-data
chmod 755 /var/lib/lina-data

# If wallet file exists, copy to persistent storage
if [ -f /root/bl0ck/lina/data/solana-wallets.json ]; then
  cp /root/bl0ck/lina/data/solana-wallets.json /var/lib/lina-data/
fi
```

### Step 1: Build Container on Server

```bash
ssh root@170.64.236.178

cd /root/bl0ck/lina

# Ensure Containerfile exists (sync from repo if needed)
# Build the container
podman build -t lina:latest -f Containerfile .

# This takes ~5-10 minutes
```

### Step 2: Run Container with Persistent Volume

```bash
# Stop any existing container
podman stop lina 2>/dev/null
podman rm lina 2>/dev/null

# Run with VOLUME MOUNT for wallet persistence
podman run -d \
  --name lina \
  --env-file /root/bl0ck/lina/.env \
  -v /var/lib/lina-data:/app/data:rw \
  -p 3000:3000 \
  --restart unless-stopped \
  lina:latest

# Verify
podman logs -f lina
curl http://localhost:3000/healthz
```

**CRITICAL:** The `-v /var/lib/lina-data:/app/data:rw` flag is REQUIRED. Without it, wallet data is lost on every container restart.

### Step 3: Auto-start on Boot

```bash
# Generate systemd service with volume mount
podman generate systemd --name lina --files --new

# Verify the service file includes volume mount
cat container-lina.service | grep "/var/lib/lina-data"

# Install service
mv container-lina.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable container-lina.service
```

## Containerfile Reference

Located at `/root/bl0ck/lina/Containerfile`:

```dockerfile
FROM docker.io/oven/bun:1.2.21-debian

WORKDIR /app

COPY package.json bun.lock* ./
COPY src/packages/*/package.json src/packages/
COPY src/plugins/*/package.json src/plugins/

RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Create data directory for wallet storage (volume-mounted)
RUN mkdir -p /app/data && chmod 755 /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/healthz || exit 1

CMD ["bun", "run", "start"]
```

## File Locations

| What | Server Path | Local Path |
|------|-------------|------------|
| Lina code | `/root/bl0ck/lina/` | `bl0ck/lina/` |
| **Wallet storage** | **`/var/lib/lina-data/`** | **NOT in git** |
| Landing page | `/var/www/bl0ck/` | `bl0ck/frontend/out/` |
| Nginx config | `/etc/nginx/sites-available/bl0ck` | - |
| Lina .env | `/root/bl0ck/lina/.env` | `bl0ck/lina/.env` |
| Containerfile | `/root/bl0ck/lina/Containerfile` | `bl0ck/lina/Containerfile` |

## Installed Software

- **Bun 1.2.21** - `/root/.bun/bin/bun` (symlinked to `/usr/local/bin/bun`)
- **Podman 5.4.2** - Container runtime (rootless capable)
- **Node.js 20.x** - For tsx fallback
- **PM2 6.0.14** - Process manager (not used with containers)
- **Nginx 1.28.0** - Reverse proxy
- **Certbot** - SSL certificate management

## Nginx Config

```nginx
# Landing Page
server {
    server_name lina4rmdabl0ck.xyz www.lina4rmdabl0ck.xyz;
    root /var/www/bl0ck;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/lina4rmdabl0ck.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lina4rmdabl0ck.xyz/privkey.pem;
}

# Lina API (proxies to container on port 3000)
server {
    server_name app.lina4rmdabl0ck.xyz;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;  # WebSocket keep-alive
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/lina4rmdabl0ck.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lina4rmdabl0ck.xyz/privkey.pem;
}
```

## Environment Variables

Required in `/root/bl0ck/lina/.env`:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | User authentication |
| `OPENROUTER_API_KEY` | LLM provider |
| `HELIUS_API_KEY` | Solana RPC |
| `CDP_API_KEY_ID` | Coinbase wallet |
| `CDP_API_KEY_SECRET` | Coinbase wallet |
| `CDP_WALLET_SECRET` | Coinbase wallet |
| `VITE_WALLETCONNECT_PROJECT_ID` | Wallet connection |
| `SOLANA_WALLET_SECRET` | Agent Solana wallet encryption key |

See `.env.sample` for complete list.

## Quick Commands

```bash
# Check container status
ssh root@170.64.236.178 "podman ps -a"

# View container logs
ssh root@170.64.236.178 "podman logs -f lina"

# Restart container
ssh root@170.64.236.178 "podman restart lina"

# Rebuild and redeploy (WITH PERSISTENT VOLUME)
ssh root@170.64.236.178 "cd /root/bl0ck/lina && git pull && podman build -t lina:latest -f Containerfile . && podman stop lina && podman rm lina && podman run -d --name lina --env-file .env -v /var/lib/lina-data:/app/data:rw -p 3000:3000 --restart unless-stopped lina:latest"

# Check disk space
ssh root@170.64.236.178 "df -h /"

# Clean up old container images
ssh root@170.64.236.178 "podman system prune -af"

# Test API
ssh root@170.64.236.178 "curl http://localhost:3000/healthz"

# Backup wallet data
ssh root@170.64.236.178 "cp /var/lib/lina-data/solana-wallets.json /root/wallet-backup-$(date +%Y%m%d).json"
```

## Troubleshooting

### Container won't start
```bash
podman logs lina
# Check for missing env vars or port conflicts
```

### Disk full
```bash
# Clean up podman cache
podman system prune -af --volumes

# Remove old images
podman rmi $(podman images -q --filter "dangling=true")

# Check what's using space
du -sh /var/lib/containers /root/.bun
```

### 502 Bad Gateway
```bash
# Container not running
podman ps  # Should show lina container

# Check if port 3000 is listening
ss -tlnp | grep 3000

# Restart container
podman restart lina
```

### Bun crashes with libuv error
This is why we use containers. If you see:
```
panic: unsupported uv function: uv_version_string
```
You're running Bun directly on the host. Use the container instead.

### Landing page shows nginx default
Cloudflare is caching the old page. Purge cache:
1. Cloudflare Dashboard > Caching > Configuration > Purge Everything
2. Or wait for TTL to expire

### Wallets lost after deploy
**SYMPTOM:** User's wallet address changes after container rebuild.

**CAUSE:** Volume mount missing. Container runs without `-v /var/lib/lina-data:/app/data:rw`.

**FIX:**
1. Stop container: `podman stop lina && podman rm lina`
2. Restore wallet backup: `cp /root/wallet-backup-*.json /var/lib/lina-data/solana-wallets.json`
3. Run with volume mount (see Step 2 above)

**PREVENTION:** ALWAYS use volume mount. Never run without it.

## GitHub Actions CI/CD

Workflow at `.github/workflows/deploy.yml` - add these secrets to repo:
- `SERVER_HOST`: 170.64.236.178
- `SERVER_USER`: root
- `SERVER_SSH_KEY`: (private key)

## Next Steps

1. [ ] Resize droplet to 80GB disk
2. [ ] Create persistent data directory: `/var/lib/lina-data/`
3. [ ] Build Lina container on server
4. [ ] Run container with volume mount
5. [ ] Set up systemd auto-start
6. [ ] Purge Cloudflare cache
7. [ ] Verify both sites work
8. [ ] Set up GitHub Actions secrets for auto-deploy
9. [ ] Configure automated wallet backups (cron job)
