# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 16 landing page project featuring an interactive 3D particle animation system built with Three.js. The landing page showcases a dynamic "bl0ck" text rendered as 12,000 interactive particles with multiple visual effects.

## Development Commands

```bash
# Start development server on http://localhost:3000
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## Architecture

### Core Technologies
- **Next.js 16** with App Router (React 19)
- **TypeScript** with strict mode enabled
- **Tailwind CSS v4** with custom animations
- **Three.js** for 3D particle rendering
- **shadcn/ui** component system (New York style, with CSS variables)

### Project Structure

```
app/
  layout.tsx       # Root layout with Geist font configuration
  page.tsx         # Main landing page composing Navbar + ParticleAnimation
  globals.css      # Global Tailwind styles

components/
  navbar.tsx                  # Top navigation bar (backdrop blur effect)
  v0-particle-animation.tsx   # Three.js particle system (12k particles)
  ui/                         # shadcn/ui components (when added)

lib/
  utils.ts         # cn() utility for merging Tailwind classes
```

### Path Aliases
The project uses TypeScript path aliases configured in `tsconfig.json`:
- `@/*` maps to the project root
- Use `@/components`, `@/lib`, `@/app` etc. for imports

### Particle Animation System

The `v0-particle-animation.tsx` component is the centerpiece:

**Architecture:**
- Generates 12,000 particles forming a "bl0ck" text shape using signed distance functions (SDF)
- Uses refs to maintain Three.js scene state across renders
- Implements custom physics with velocity, attraction, repulsion, and damping
- Mouse interactions create dynamic effects via raycasting to a 3D plane

**Key Features:**
- **Base Effects:** Default scatter, Spark, Wave (ripple), Vortex (spiral)
- **Additional Effects:** Explode, Scatter, Implode, Spiral, Morph (toggleable)
- **Color Modes:** Default (white), Sapphire gradient, Gold gradient
- **Interactions:**
  - Mouse hover creates localized particle effects
  - Click-drag rotates the entire particle system
  - Touch support for mobile devices
  - Zoom controls (+/-)

**Performance Considerations:**
- Large particle count (12k) requires GPU-based rendering
- Uses `Float32Array` for efficient position/velocity/phase storage
- BufferGeometry with manual attribute updates for performance
- Animation loop uses `requestAnimationFrame`

### Styling System

**Tailwind CSS:**
- v4 configuration in `postcss.config.mjs`
- Base color: neutral with CSS variables
- Custom animations via `tailwindcss-animate`
- Backdrop blur effects for glassmorphic UI

**shadcn/ui:**
- Extensive Radix UI primitives installed (accordion, dialog, dropdown, etc.)
- Components styled with "New York" variant
- Form handling via react-hook-form + zod validation
- `cn()` utility in `lib/utils.ts` merges class names efficiently

### Font System
Uses Next.js font optimization with Geist Sans and Geist Mono, loaded via `next/font/google` with CSS variables.

## Code Patterns

### Component Structure
- Client components use `"use client"` directive (required for Three.js/hooks)
- Server components are the default (app router pages/layouts)
- Particle animation maintains complex state via useRef to prevent re-initialization

### State Management
- React refs for Three.js scene objects (avoid re-creating WebGL contexts)
- Multiple ref synchronization pattern:
  - State variables for React rendering
  - Refs for animation loop access (avoid closure staleness)
  - Example: `currentEffectRef.current` synced with `currentEffect` state

### Three.js Integration
- Initialize scene in `useEffect` with proper cleanup
- Store scene references in a single ref object
- Use inverse quaternion transforms for mouse-to-world coordinate mapping
- Separate animation loop from React render cycle

## Important Notes

- The particle animation component is resource-intensive; consider performance implications when adding features
- The "bl0ck" text shape is defined via signed distance functions (`dist()`, `e()`, `g()`, `circle()`) - modifying these changes the particle formation
- Mouse interaction uses raycasting to a fixed Z-plane; particles are in 3D space with small Z variation
- The project includes extensive Radix UI components but they're not yet utilized in the UI
- Vercel Analytics is integrated via `@vercel/analytics`
