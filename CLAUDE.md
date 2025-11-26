# bl0ck Ecosystem - Monorepo

**Vision:** Privacy-first DeFi ecosystem combining AI trading with zkVM privacy tech

This monorepo contains two main products:
1. **lina** - AI DeFi agent with Solana + EVM support
2. **bl0ck** - Multi-chain zero-knowledge privacy protocol (Shadow Pass + Phantom Wrapper)

**Core Principle:** "Prove you belong. Never prove who you are."

## Repository Structure

```
bl0ck/ (monorepo root)
├── frontend/                # Landing page for entire ecosystem
├── lina/                    # AI DeFi Agent (ElizaOS + Solana + EVM)
│   ├── src/                 # Agent source code
│   ├── package.json         # Bun workspace
│   └── LINA_IMPLEMENTATION_TASKS.md
└── bl0ck/                   # Privacy Protocol (zkVM + Anchor)
    ├── circuit/             # Solana Ed25519 proof system (monerochan-rs)
    ├── zcash-prover/        # Zcash holdings proof system
    ├── contracts/           # Anchor programs (Shadow Pass + Phantom Wrapper)
    ├── archive/             # Deprecated docs
    ├── blk-prd.md           # Original Shadow Pass PRD
    └── PHANTOM_WRAPPER_PLAN.md  # Anonymous wrapping spec
```

## Product Overview

### lina (AI DeFi Agent)
**Status:** Phase 1 in progress (Solana integration)
**Timeline:** 2-4 weeks to Solana MVP
**Stack:** Bun + ElizaOS + React + CDP wallet + Socket.IO

**Current Features:**
- EVM chains: Base, Ethereum, Polygon, Arbitrum, Optimism
- DEX swaps, cross-chain bridging, NFT operations
- Market data, DeFi analytics, crypto news

**In Progress:**
- Solana support (Jupiter swaps, wallet management, SPL tokens)
- See `lina/LINA_IMPLEMENTATION_TASKS.md` for detailed roadmap

### bl0ck (Privacy Protocol)
**Status:** Design phase (10-15% complete)
**Timeline:** 90-day roadmap (flexible)
**Stack:** monerochan-rs zkVM + Anchor + Rust + Next.js

**Components:**

**Shadow Pass** - Multi-chain status system:
- Prove wallet wealth across Solana + Zcash without revealing addresses
- Soulbound NFT + $BL0CK staking = active status + yield
- Multi-chain tier bonuses (Ghost, Leviathan, Apex, Apex+)

**Phantom Wrapper** (Future) - Anonymous token wrapping:
- Wrap SOL/SPL tokens into private commitments
- Unwrap to any address without linkability
- See `bl0ck/PHANTOM_WRAPPER_PLAN.md` for full spec

## Core Flow (Multi-Chain)

**Solana Chain:**
1. Connect Phantom → 2. Sign verification message → 3. Fetch USD value (Birdeye/Jupiter) → 4. WASM Ed25519 proof (3-12s)

**Zcash Chain (Optional Bonus):**
5. Upload viewing key OR connect Zcash wallet → 6. Query Zebra for holdings → 7. WASM Zcash proof (8-15s)

**On-Chain:**
8. Submit both proofs to Anchor → 9. Verify + calculate combined tier → 10. Mint soulbound Shadow Pass → 11. Stake $BL0CK → status active + yield

**Privacy:** Addresses never on-chain. No backend. Browser-only proofs. Nullifier prevents duplicates. Multi-chain tier bonuses.

## Tech Stack (Multi-Chain)

**Solana Circuit** (`circuit/`): monerochan-rs zkVM + Ed25519 signature verification | **Zcash Prover** (`zcash-prover/`): monerochan-rs + Sapling/Orchard note commitments | **Shared Library** (`circuit/crates/privacy-core`): Nullifier management, price snapshots, Merkle proofs | **Prover**: WASM (<15s per chain, <30s combined) + CUDA | **Smart Contracts**: Solana Anchor (multi-chain verifier + SBT minting + staking + nullifier storage) | **SBT**: Metaplex Bubblegum OR Token-2022 soulbound | **Frontend**: Next.js 14 + TS + Tailwind + Solana/Zcash wallet adapters | **Oracle**: Birdeye/Jupiter (Solana), Zebra (Zcash) | **Visual**: Black (#000000) + Purple (#A020F0) Solana + Gold (#FFD700) Zcash

## Shadow Tiers (Multi-Chain Bonuses)

| Tier | Solana Value | Zcash Bonus (Optional) | Combined | $BL0CK Stake | Yield |
|------|--------------|------------------------|----------|--------------|-------|
| Ghost | ≥$100k | - | $100k | 5,000 | 15% |
| Leviathan | ≥$500k | OR $100k SOL + $100k ZEC | $500k | 25,000 | 25% + alpha |
| Apex | ≥$1M | OR $500k SOL + $500k ZEC | $1M | 100,000 | 35% + rev share |
| Apex+ | - | $500k SOL + $500k ZEC | $1.5M+ | 200,000 | 50% + Mason NFT |

**Multi-chain advantage:** Combining Solana + Zcash unlocks higher tiers with lower per-chain thresholds. Soulbound. Status active only when staked. Deflationary sink.

## Tokenomics

$BL0CK (SPL) | 1B supply | pump.fun | 0% tax | Authorities revoked day 1 | LP burned

## Non-Negotiables

1. No addresses on-chain (both Solana & Zcash) | 2. No backend | 3. Fair launch | 4. WASM <15s per chain (<30s combined) | 5. Anonymous team | 6. Multi-chain proofs independent (Zcash optional)

## Development

**Frontend (Landing Page):**
```bash
cd frontend
npm run dev
```

**lina (AI Agent):**
```bash
cd lina
bun install
bun run dev  # Starts ElizaOS server + React frontend
```

See `lina/CLAUDE.md` for detailed lina development guide.

**bl0ck Privacy Protocol:**

**Solana Circuit:**
```bash
cd bl0ck/circuit
cargo build --release
cargo test
cd script && cargo run --release -- --execute  # Test locally
```

**Zcash Prover:**
```bash
cd bl0ck/zcash-prover
cargo build --release
cargo test -p lib
```

**Shared Privacy Library:**
```bash
cd bl0ck/circuit/crates/privacy-core
cargo test
```

**Anchor (TODO):**
```bash
cd bl0ck/contracts
anchor init shadow-pass && anchor build && anchor test
anchor deploy --provider.cluster devnet
```

## Security Critical

**Cross-Chain:** Nullifier prevents duplicates across both chains | Independent proof verification (Solana & Zcash) | **Solana:** Ed25519 signature verification, price oracle manipulation (Birdeye/Jupiter) | **Zcash:** Note commitment verification, Merkle path validation | **On-Chain:** Soulbound enforcement (Token-2022), multi-chain tier calculation integrity | **Performance:** WASM bundle optimization (<30s total proof time)

## Timeline (Multi-Chain - 90 Days)

| Phase | Days | Milestone |
|-------|------|-----------|
| 1 | 1 | ✅ Restructure repo (circuit/, zcash-prover/, frontend/) |
| 2 | 2-5 | Build shared privacy-core library |
| 3 | 6-30 | Implement both circuits (Solana Ed25519 + Zcash notes) |
| 4 | 31-50 | Build Anchor multi-chain verifier |
| 5 | 51-70 | Integrate frontend (2-chain flow) |
| 6 | 71-90 | Testing + audit + launch prep |
| **Launch** | **90+** | pump.fun + Multi-Chain Shadow List |

## Architecture

### lina (AI Agent)
See `lina/CLAUDE.md` for full architecture documentation.

**Plugin System:**
- EVM: CDP wallet integration (Base, Ethereum, Polygon, etc.)
- Solana: (In progress) Jupiter DEX, SPL tokens, wallet management
- DeFi: CoinGecko, DeFiLlama, Relay bridging
- Future: Privacy plugin using bl0ck WASM library

### bl0ck (Privacy Protocol)

**bl0ck/circuit/**: Solana Ed25519 proof system (monerochan-rs zkVM - replace fibonacci with wallet verification)

**bl0ck/zcash-prover/**: Zcash holdings proof (52 Rust files, Orchard/Sapling note commitments, Merkle sharding)

**bl0ck/circuit/crates/privacy-core**: Shared privacy library (nullifiers, snapshots, Merkle utilities)
- Exports to WASM for lina integration
- Used by both Solana circuit and Zcash prover

**bl0ck/contracts/**: Anchor programs
- Shadow Pass: Multi-chain verifier + soulbound NFT minting + $BL0CK staking
- Phantom Wrapper (Future): Anonymous token wrapping

**frontend/**: Next.js landing page for entire bl0ck ecosystem (lina + privacy protocol)

**bl0ck/archive/**: Deprecated DeFi protocol docs

## Technology Integration

**lina uses bl0ck privacy features via WASM:**
```
1. Build privacy-core as WASM in bl0ck/circuit/crates/privacy-core/wasm/
2. lina imports @bl0ck/privacy-core as local dependency
3. Optional privacy plugin in lina enables:
   - Nullifier anti-replay for trades
   - Anonymous balance proofs
   - Phantom wrapper integration
```

## References

**lina:** `lina/CLAUDE.md` (agent architecture), `lina/LINA_IMPLEMENTATION_TASKS.md` (Solana roadmap)

**bl0ck:** `bl0ck/blk-prd.md` (Shadow Pass PRD), `bl0ck/PHANTOM_WRAPPER_PLAN.md` (anonymous wrapping spec), `bl0ck/archive/` (deprecated wrapper concepts)

**Frontend:** `frontend/CLAUDE.md` (if exists - landing page architecture)
