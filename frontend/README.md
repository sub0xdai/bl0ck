# BL0CK Landing Page

Interactive landing page for the BL0CK ecosystem featuring a dynamic 3D particle animation built with Three.js.

## Overview

This Next.js 16 landing page showcases the bl0ck privacy-first DeFi ecosystem with:
- Interactive "bl0ck" particle animation (12,000 particles)
- Navigation to lina AI agent
- Links to project resources

## Getting Started

### Development

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result.

Note: The frontend runs on port 3001 to avoid conflicts with lina (which runs on port 3000).

### Production Build

```bash
npm run build
npm run start
```

## Navigation

The navbar includes:
- **GitHub** - Link to the bl0ck repository (opens in new tab)
- **Launch Lina** - Opens the lina AI agent interface

## Environment Variables

Create a `.env.local` file based on `.env.example`:

```bash
# Lina AI Agent URL
NEXT_PUBLIC_LINA_URL=http://localhost:3000  # Development
# NEXT_PUBLIC_LINA_URL=https://lina.yourdomain.com  # Production
```

### Environment Variable Configuration

- `NEXT_PUBLIC_LINA_URL` - URL for the lina AI agent
  - Defaults to `http://localhost:3000` in development
  - Set to your production lina URL when deploying

## Project Structure

```
app/
  layout.tsx       # Root layout with metadata
  page.tsx         # Main page (Navbar + ParticleAnimation)
  globals.css      # Global styles

components/
  navbar.tsx                  # Navigation bar with GitHub + Lina links
  v0-particle-animation.tsx   # Three.js particle system
```

## Technology Stack

- **Next.js 16** with App Router (React 19)
- **TypeScript** with strict mode
- **Tailwind CSS v4**
- **Three.js** for 3D particle rendering

## Particle Animation

The landing page features an interactive particle system:
- 12,000 particles forming "bl0ck" text
- Mouse interaction effects (hover, drag to rotate)
- Touch support for mobile
- Auto-scatter effect on page load

## Deployment

### Environment Variables for Production

When deploying, set the `NEXT_PUBLIC_LINA_URL` environment variable to your production lina URL:

```bash
NEXT_PUBLIC_LINA_URL=https://lina.yourdomain.com
```

### Vercel Deployment

The easiest way to deploy is via [Vercel](https://vercel.com/new):

1. Push to GitHub
2. Import project to Vercel
3. Set `NEXT_PUBLIC_LINA_URL` in environment variables
4. Deploy

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Three.js Documentation](https://threejs.org/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs)

## Links

- [GitHub Repository](https://github.com/sub0xdai/bl0ck)
- [lina AI Agent](../lina/README.md)
- [bl0ck Protocol](../bl0ck/README.md)
# deployed
# Wed Dec  3 09:44:47 PM AEDT 2025
