# bl0ck Ecosystem - Deployment Guide

Deploy the bl0ck monorepo to Railway.

## Architecture

```
Railway Project: lina
├── bl0ck service      → /lina      → app.lina4rmdabl0ck.xyz (AI Agent)
└── lina-landing       → /frontend  → lina4rmdabl0ck.xyz (Landing Page)
```

---

## Service 1: Lina AI Agent

**Root Directory:** `lina`
**Framework:** Bun + ElizaOS
**Port:** 3000

### Configuration

| Setting | Value |
|---------|-------|
| Root Directory | `lina` |
| Build Command | (auto-detected) |
| Start Command | (auto-detected) |

### Environment Variables

Copy from `lina/.env`:

```
JWT_SECRET=...
OPENAI_API_KEY=...
OPENROUTER_API_KEY=...
WALLET_DB_URL=...
SOLANA_WALLET_SECRET=...
SOLANA_NETWORK=solana-devnet
VITE_WALLETCONNECT_PROJECT_ID=...
VITE_CDP_PROJECT_ID=...
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
CDP_WALLET_SECRET=...
ALCHEMY_API_KEY=...
HELIUS_API_KEY=...
COINGECKO_API_KEY=...
TAVILY_API_KEY=...
```

### Domain

- Railway domain: `bl0ck-production.up.railway.app`
- Custom domain: `app.lina4rmdabl0ck.xyz`

---

## Service 2: Landing Page

**Root Directory:** `frontend`
**Framework:** Next.js 16
**Port:** Dynamic (Railway's PORT)

### Configuration

| Setting | Value |
|---------|-------|
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Start Command | `npx next start -p ${PORT:-3000}` |

### Environment Variables

None required (static site).

### Domain

- Railway domain: `lina-landing-production.up.railway.app`
- Custom domain: `lina4rmdabl0ck.xyz`

---

## DNS Configuration (Cloudflare)

| Type | Name | Value |
|------|------|-------|
| CNAME | app | `z6ulba4j.up.railway.app` |
| CNAME | @ | `<lina-landing-railway-domain>` |
| CNAME | www | `<lina-landing-railway-domain>` |

**Note:** For root domain (@), Cloudflare requires "CNAME flattening" which happens automatically when proxied.

---

## Deployment Workflow

### Deploy Changes

```bash
git push origin master
```

Both services auto-deploy from the same repo. Railway watches:
- `lina/**` → rebuilds bl0ck service
- `frontend/**` → rebuilds lina-landing service

### Rollback

1. Railway Dashboard → Service → Deployments
2. Click on previous successful deployment
3. Click "Redeploy"

### Logs

```bash
# Via Railway CLI
railway logs -s bl0ck
railway logs -s lina-landing

# Or use Railway Dashboard → Logs tab
```

---

## Initial Setup (One-Time)

### 1. Create Railway Account
- Go to [railway.app](https://railway.app)
- Sign up with GitHub OAuth
- Free tier: $5 credit, then $1/month

### 2. Create Project
- New Project → Deploy from GitHub repo
- Select `sub0xdai/bl0ck`

### 3. Add Lina Service
- Root Directory: `lina`
- Add all environment variables
- Generate domain or add custom domain

### 4. Add Landing Page Service
- "+ Create" → GitHub Repo → same repo
- Root Directory: `frontend`
- Build Command: `npm run build`
- Start Command: `npx next start -p ${PORT:-3000}`
- Add custom domain

### 5. Configure DNS
- Update Cloudflare CNAME records to point to Railway domains
- Delete old A records pointing to droplet

---

## Troubleshooting

### Build Fails
- Check logs in Railway Dashboard
- Verify root directory is correct
- For frontend: ensure build command is set

### Port Issues
- Lina uses port 3000 (hardcoded)
- Frontend must use `${PORT:-3000}` for Railway compatibility

### Domain Not Working
- Verify CNAME record in Cloudflare
- Check Railway Dashboard shows domain as verified
- Try disabling Cloudflare proxy (orange cloud → gray) temporarily

### Service Crashed
- Check logs for error messages
- Verify all environment variables are set
- Check memory usage (free tier has 0.5GB limit)

---

## Cost

| Tier | Price | Resources |
|------|-------|-----------|
| Free | $0 + $5 credit | 0.5GB RAM, 1 vCPU |
| Hobby | $5/month | 8GB RAM, 8 vCPU |

Two services on free tier should work if traffic is low. Upgrade to Hobby if you hit memory limits.

---

## Migration from Droplet

After Railway is working:

1. Keep droplet running 1 week as backup
2. Verify wallet persistence (WALLET_DB_URL is external Postgres)
3. Test all functionality
4. Update all DNS to Railway
5. Destroy droplet → save $12/month
