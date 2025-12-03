# Deployment Guide

This guide covers deploying the bl0ck ecosystem. **Recommended approach: single VPS** (DigitalOcean Droplet) hosting both sites.

| Component | URL Example | Notes |
|-----------|-------------|-------|
| Landing Page | `bl0ck.xyz` | Static files via Nginx |
| Lina AI Agent | `app.bl0ck.xyz` | Bun + Socket.IO via Nginx reverse proxy |

**Deployment Options:**
1. **[Single VPS (Recommended)](#digitalocean-droplet-deployment-recommended)** - Both sites on one Droplet
2. **[Hybrid](#hybrid-architecture)** - Vercel (landing) + Railway/VPS (Lina)
3. **[Docker](#docker-deployment-self-hosted)** - Container deployment

---

## Architecture Overview

### Why Lina Can't Run on Vercel

Lina is a **stateful, long-running server application** that requires:

| Requirement | What Lina Needs | Vercel Provides | Compatible? |
|-------------|-----------------|-----------------|-------------|
| WebSocket | Persistent Socket.IO connections | Serverless (max 300s timeout) | No |
| Process Model | Long-running Bun server | Ephemeral, stateless functions | No |
| Agent State | In-memory agent runtime | No persistent memory | No |
| Database | PGlite (filesystem-based) | Read-only filesystem | No |
| Build Tool | Bun 1.2.21 | Node.js only | No |

### What CAN Run on Vercel

- **Static sites** (Next.js, React, etc.)
- **Serverless API routes** (stateless, short-lived)
- The **bl0ck landing page** (`bl0ck/frontend/`)

### Hybrid Architecture

```
                    ┌─────────────────┐
                    │   User Browser  │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │     Vercel      │           │     Railway     │
    │  (Landing Page) │           │  (Lina Agent)   │
    │   bl0ck.xyz     │  ──────►  │  app.bl0ck.xyz  │
    │                 │  "Launch" │                 │
    │  Static Next.js │   link    │  Bun + ElizaOS  │
    └─────────────────┘           │  + Socket.IO    │
                                  │  + PGlite       │
                                  └─────────────────┘
```

---

## Railway Deployment (Lina)

Railway is the recommended platform for Lina because it supports:
- Native Bun runtime
- Persistent WebSocket connections
- Long-running processes
- Writable filesystem (for PGlite)
- Easy GitHub integration

### Prerequisites

1. [Railway account](https://railway.app/) (free tier available)
2. GitHub repo with the `lina/` directory
3. Environment variables ready (see below)

### Step-by-Step Setup

#### 1. Create New Project

```bash
# Option A: Via Railway CLI
npm install -g @railway/cli
railway login
railway init
```

Or via dashboard: **New Project → Deploy from GitHub repo**

#### 2. Configure Root Directory

In Railway project settings:
- **Root Directory**: `lina`
- **Build Command**: `bun install && bun run build`
- **Start Command**: `bun run start`

#### 3. Set Runtime

Railway auto-detects Bun from `package.json`:
```json
{
  "packageManager": "bun@1.2.21"
}
```

If not detected, set in **Settings → Build**:
- **Builder**: Nixpacks
- Add `bun` to nixpacks.toml or use Dockerfile

#### 4. Add Environment Variables

In **Variables** tab, add all required variables:

**Required (Core):**
```
JWT_SECRET=<openssl rand -base64 32>
OPENAI_API_KEY=sk-proj-...
# OR
OPENROUTER_API_KEY=sk-or-v1-...
```

**Required (Wallet):**
```
VITE_WALLETCONNECT_PROJECT_ID=<from cloud.walletconnect.com>
ALCHEMY_API_KEY=<from dashboard.alchemy.com>
```

**Required (CDP Agent Wallets):**
```
CDP_API_KEY_ID=<from CDP console>
CDP_API_KEY_SECRET=<from CDP console>
CDP_WALLET_SECRET=<openssl rand -hex 32>
```

See [Environment Variables Reference](#environment-variables-reference) for full list.

#### 5. Deploy

```bash
railway up
```

Or push to GitHub - Railway auto-deploys on push.

#### 6. Add Custom Domain

In **Settings → Networking → Public Networking**:
1. Enable public networking
2. Add custom domain: `app.yourdomain.xyz`
3. Add CNAME record in DNS provider

---

## Vercel Deployment (Landing Page)

The bl0ck landing page is a static Next.js site.

### Prerequisites

1. [Vercel account](https://vercel.com/)
2. GitHub repo access

### Step-by-Step Setup

#### 1. Import Project

In Vercel dashboard: **Add New → Project → Import Git Repository**

#### 2. Configure Build

- **Framework Preset**: Next.js
- **Root Directory**: `frontend` (the bl0ck landing page, not lina)
- **Build Command**: `npm run build` (auto-detected)
- **Output Directory**: `.next` (auto-detected)

#### 3. Environment Variables

Add if the landing page needs any:
```
NEXT_PUBLIC_LINA_URL=https://app.yourdomain.xyz
```

#### 4. Deploy

Click **Deploy** - Vercel handles the rest.

#### 5. Add Custom Domain

In **Settings → Domains**:
1. Add: `yourdomain.xyz`
2. Vercel provides DNS instructions

---

## DNS Configuration

Example for `bl0ck.xyz`:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | Vercel IP (from dashboard) | 300 |
| CNAME | www | cname.vercel-dns.com | 300 |
| CNAME | app | your-project.up.railway.app | 300 |

Result:
- `bl0ck.xyz` → Vercel (landing page)
- `www.bl0ck.xyz` → Vercel (landing page)
- `app.bl0ck.xyz` → Railway (Lina agent)

---

## Environment Variables Reference

### Core (Required)

| Variable | Description | Generate |
|----------|-------------|----------|
| `JWT_SECRET` | User authentication | `openssl rand -base64 32` |
| `OPENAI_API_KEY` | OpenAI API key | [platform.openai.com](https://platform.openai.com) |
| `OPENROUTER_API_KEY` | OpenRouter API key (alternative to OpenAI) | [openrouter.ai](https://openrouter.ai) |

### Wallet Auth (Required)

| Variable | Description | Get From |
|----------|-------------|----------|
| `VITE_WALLETCONNECT_PROJECT_ID` | Frontend wallet connection | [cloud.walletconnect.com](https://cloud.walletconnect.com) |
| `ALCHEMY_API_KEY` | Blockchain data | [dashboard.alchemy.com](https://dashboard.alchemy.com) |

### CDP Agent Wallets (Required for trading)

| Variable | Description | Generate |
|----------|-------------|----------|
| `CDP_API_KEY_ID` | CDP API key ID | [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com) |
| `CDP_API_KEY_SECRET` | CDP API key secret | CDP console |
| `CDP_WALLET_SECRET` | Wallet encryption | `openssl rand -hex 32` |
| `VITE_CDP_PROJECT_ID` | CDP project ID | CDP console |

### Blockchain RPC (Optional - uses defaults)

| Variable | Description |
|----------|-------------|
| `HELIUS_API_KEY` | Solana RPC (faster than public) |
| `BASE_RPC_URL` | Custom Base RPC |
| `ETHEREUM_RPC_URL` | Custom Ethereum RPC |
| `POLYGON_RPC_URL` | Custom Polygon RPC |
| `ARBITRUM_RPC_URL` | Custom Arbitrum RPC |
| `OPTIMISM_RPC_URL` | Custom Optimism RPC |

### Solana (Required for Solana features)

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLANA_NETWORK` | `solana` (mainnet) or `solana-devnet` | `solana-devnet` |
| `HELIUS_API_KEY` | Solana RPC API key | Public RPC |

### Hyperliquid Perps (Optional)

| Variable | Description |
|----------|-------------|
| `HYPERLIQUID_PRIVATE_KEY` | Trading wallet private key (0x...) |
| `HYPERLIQUID_TESTNET` | `true` for testnet, `false` for mainnet |

### Plugin API Keys (Optional)

| Variable | Description | Get From |
|----------|-------------|----------|
| `TAVILY_API_KEY` | Web search | [tavily.com](https://tavily.com) |
| `COINGECKO_API_KEY` | Token prices | [coingecko.com/api](https://www.coingecko.com/en/api) |
| `COINDESK_API_KEY` | Crypto news | [developer.coindesk.com](https://developer.coindesk.com) |
| `ETHERSCAN_API_KEY` | TX verification | [etherscan.io/apis](https://etherscan.io/apis) |
| `NANSEN_API_KEY` | Blockchain analytics | [nansen.ai](https://www.nansen.ai) |

### Server (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVER_PORT` | HTTP port | `3000` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `NODE_ENV` | Environment | `development` |
| `POSTGRES_URL` | External PostgreSQL URL | Uses PGlite |

---

## Troubleshooting

### Railway: Build Fails

**Bun not detected:**
```bash
# Create nixpacks.toml in lina/ root
[phases.setup]
nixPkgs = ["bun"]
```

**Out of memory:**
- Upgrade Railway plan or optimize build
- Try: `NODE_OPTIONS="--max-old-space-size=4096"`

### Railway: WebSocket Not Connecting

1. Check public networking is enabled
2. Verify CORS settings in server
3. Check frontend uses correct `app.yourdomain.xyz` URL

### Railway: Database Issues

PGlite stores data in `.eliza/.elizadb`. This persists across deploys on Railway's persistent filesystem.

For production, consider external PostgreSQL:
```
POSTGRES_URL=postgres://user:pass@host:5432/lina
```

### Vercel: Landing Page Not Loading

1. Check root directory is set to `frontend`
2. Verify build command succeeded in logs
3. Check for missing environment variables

### CORS Errors

If landing page can't reach Lina API:

1. Verify Lina has CORS headers for landing page origin
2. Check `X402_PUBLIC_URL` matches actual domain
3. Ensure HTTPS on both domains

---

## Alternative Platforms

If Railway doesn't fit your needs:

| Platform | Pros | Cons |
|----------|------|------|
| **Render** | Docker support, WebSocket, free tier | Slower cold starts |
| **Fly.io** | Edge deployment, persistent VMs | More complex setup |
| **DigitalOcean App Platform** | Simple, predictable pricing | Less automation |
| **Self-hosted VPS** | Full control | Manual maintenance |

### Docker Deployment (Self-hosted)

Create `Dockerfile` in `lina/`:

```dockerfile
FROM oven/bun:1.2.21

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

EXPOSE 3000

CMD ["bun", "run", "start"]
```

Run:
```bash
docker build -t lina .
docker run -p 3000:3000 --env-file .env lina
```

---

## DigitalOcean Droplet Deployment (Recommended)

Deploy both the landing page AND Lina on a single VPS - simpler, cheaper, and no external dependencies.

### CRITICAL: Bun Kernel Bug

**Bun crashes on Ubuntu 24.04 kernel 6.17** due to a libuv compatibility issue:

```
panic(main thread): unsupported uv function: uv_version_string
Crashed while loading native module: bigint-buffer
```

The `bigint-buffer` native module (Solana dependency) calls a libuv function Bun doesn't support on newer kernels.

**Solution:** Run Lina in a **Podman container** using `docker.io/oven/bun:1.2.21-debian` which has a compatible environment.

```
                    ┌─────────────────┐
                    │   Cloudflare    │
                    │   (SSL + CDN)   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │     Nginx       │
                    │   (port 443)    │
                    └────────┬────────┘
                             │
           ┌─────────────────┴─────────────────┐
           │                                   │
  ┌────────▼────────┐               ┌─────────▼─────────┐
  │  lina4rmdabl0ck │               │ app.lina4rmdabl0ck│
  │  Landing Page   │               │   Lina Backend    │
  │  /var/www/bl0ck │               │  podman:3000      │
  └─────────────────┘               └───────────────────┘
```

### Recommended Specs

| Spec | Minimum | Recommended |
|------|---------|-------------|
| RAM | 4GB | 4GB+ |
| CPU | 1 vCPU | 2 vCPU |
| Storage | 80GB | 80GB+ |
| OS | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| Swap | 1GB | 1GB |

### Quick Deploy (From Local Machine)

**This is the recommended approach - build locally, transfer image:**

```bash
cd /path/to/bl0ck/lina

# Build container locally
podman build -t lina:latest -f Containerfile .

# Save and transfer
podman save lina:latest | gzip > lina-image.tar.gz
scp lina-image.tar.gz root@your-server:/root/

# Deploy on server
ssh root@your-server "
  gunzip -c /root/lina-image.tar.gz | podman load
  rm /root/lina-image.tar.gz
  podman stop lina 2>/dev/null
  podman rm lina 2>/dev/null
  podman run -d --name lina --env-file /root/bl0ck/lina/.env -p 3000:3000 --restart unless-stopped lina:latest
"

# Cleanup local
rm lina-image.tar.gz
```

### Server Setup (One-Time)

#### 1. SSH into Droplet

```bash
ssh root@your-droplet-ip
```

#### 2. Install Podman (Container Runtime)

```bash
apt update && apt install -y podman curl git
```

#### 3. Clone Repo and Create .env

```bash
git clone https://github.com/your-username/bl0ck.git /root/bl0ck
cd /root/bl0ck/lina
cp .env.sample .env
nano .env  # Fill in your API keys
```

#### 4. Setup Swap (Prevents OOM during builds)

```bash
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
```

#### 5. Enable Container Auto-Start

After first container run, generate systemd service:

```bash
cd /root
podman generate systemd --name lina --files --new
mv container-lina.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable container-lina.service
```

#### 8. Setup Nginx for Both Sites

Install Nginx and Certbot:

```bash
apt install -y nginx certbot python3-certbot-nginx
```

##### Landing Page Config

Build the landing page and copy to web root:

```bash
# Build landing page (assuming Next.js static export)
cd /root/bl0ck/frontend
npm install && npm run build

# Copy static files to web root
mkdir -p /var/www/bl0ck
cp -r out/* /var/www/bl0ck/
# Or for Next.js without static export, use PM2 to run it
```

Create Nginx config for landing page:

```bash
nano /etc/nginx/sites-available/bl0ck-landing
```

```nginx
server {
    listen 80;
    server_name yourdomain.xyz www.yourdomain.xyz;

    root /var/www/bl0ck;
    index index.html;

    # Static file caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

##### Lina App Config

```bash
nano /etc/nginx/sites-available/bl0ck-lina
```

```nginx
server {
    listen 80;
    server_name app.yourdomain.xyz;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeout (important for Socket.IO)
        proxy_read_timeout 86400;
    }
}
```

##### Enable Both Sites

```bash
# Remove default site
rm /etc/nginx/sites-enabled/default

# Enable both configs
ln -s /etc/nginx/sites-available/bl0ck-landing /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/bl0ck-lina /etc/nginx/sites-enabled/

# Test and reload
nginx -t
systemctl restart nginx
```

#### 9. Add SSL with Let's Encrypt

Get certificates for both domains:

```bash
certbot --nginx -d yourdomain.xyz -d www.yourdomain.xyz -d app.yourdomain.xyz
```

Certbot auto-configures Nginx for HTTPS and sets up auto-renewal.

#### 10. DNS Setup

Point both domains to your Droplet:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | your-droplet-ip | 300 |
| A | www | your-droplet-ip | 300 |
| A | app | your-droplet-ip | 300 |

### Updating Lina

```bash
cd /root/bl0ck/lina
git pull
bun install
bun run build
pm2 restart lina
```

### Auto-Updates (Optional)

Create `/root/update-lina.sh`:
```bash
#!/bin/bash
cd /root/bl0ck/lina
git pull
bun install
bun run build
pm2 restart lina
```

Add cron job:
```bash
chmod +x /root/update-lina.sh
crontab -e
# Add: 0 4 * * * /root/update-lina.sh >> /var/log/lina-update.log 2>&1
```

### Firewall Setup

```bash
ufw allow 22      # SSH
ufw allow 80      # HTTP
ufw allow 443     # HTTPS
ufw enable
```

### Monitoring

```bash
# View logs
pm2 logs lina --lines 100

# Monitor resources
htop

# Check disk
df -h

# Check Nginx access logs
tail -f /var/log/nginx/access.log
```
