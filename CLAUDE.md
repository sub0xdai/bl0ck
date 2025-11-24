# CLAUDE.md

**$BL0CK Shadow Pass Protocol** – Multi-chain zero-knowledge status system. Prove wallet wealth across Solana + Zcash without revealing addresses. Soulbound NFT + $BL0CK staking = active status + yield.

**Core:** "Prove you belong across ALL chains. Never prove who you are."

**Status:** Multi-chain integration (90-day timeline) | Launch: Feb 2026

## Repository

```
bl0ck/
├── blk-prd.md               # Original PRD (Solana-only)
├── circuit/                 # Solana Ed25519 proof system (monerochan-rs)
├── zcash-prover/            # Zcash holdings proof system (monerochan-rs)
├── frontend/                # Next.js unified UI (both chains)
├── contracts/               # Anchor multi-chain verifier
└── archive/                 # Deprecated protocol docs
```

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

**Frontend:** `cd frontend && npm run dev`

**Solana Circuit:**
```bash
cd circuit
cargo build --release
cargo test
cd script && cargo run --release -- --execute  # Test locally
```

**Zcash Prover:**
```bash
cd zcash-prover
cargo build --release
cargo test -p lib
```

**Shared Privacy Library:**
```bash
cd circuit/crates/privacy-core
cargo test
```

**Anchor (TODO):**
```bash
cd contracts
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

**circuit/**: Solana Ed25519 proof system (replace fibonacci with wallet verification) | **zcash-prover/**: Zcash holdings proof (already implemented, extract patterns) | **circuit/crates/privacy-core**: Shared nullifier, snapshot, Merkle utilities | **contracts/**: Anchor program (multi-chain verifier + SBT minting + staking) | **frontend/**: Next.js UI (unified wallet connection for both chains) | **archive/**: Deprecated DeFi protocol docs

## References

`blk-prd.md` (original Solana-only PRD) | `frontend/CLAUDE.md` (landing page architecture) | `archive/` (deprecated wrapper token concepts)
