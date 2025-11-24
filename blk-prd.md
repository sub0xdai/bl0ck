# $BL0CK Product Requirements Document – FINAL DRAFT v1.0  
**Date:** 24 November 2025  
**Status:** LOCKED – Ready to ship in 7–14 days  
**Core Pivot:** From “Privacy Tool” → **Status Protocol**  
**Tagline:** “Prove you belong. Never prove who you are.”

## 1. One-Sentence Product
$BL0CK is the first on-chain status protocol on Solana: users prove they control a high-value wallet without ever revealing the address, get minted a soulbound Shadow Pass, and must stake $BL0CK to keep their status active and earn yield.

## 2. MVP Launch Product (Week 1–2)

| Feature                      | Description                                                                                           | Tech used                                    |
|--------------------------------|-------------------------------------------------------------------------------------------------------|----------------------------------------------|
| **Proof of Shadow**            | Single zk circuit: “I control a wallet worth ≥ $X USD right now” – address never leaves the browser  | monerochan-rs + Ed25519 signature verification |
| **Shadow Pass (SBT)**          | Soulbound NFT minted to a fresh burner wallet upon valid proof                                        | Anchor + Metaplex                            |
| **Shadow Tiers**               | Ghost ($100k+), Leviathan ($500k+), Apex ($1M+)                                                       | Public USD value from Birdeye/Jupiter API    |
| **Status Activation**         | Shadow Pass only stays active + earns yield if the burner wallet stakes the required $BL0CK amount   | Standard SPL staking vault                   |
| **Nullifier**                  | Prevents the same real wallet from minting multiple passes                                            | Built into the zk circuit                    |

## 3. Final User Flow (60 seconds total)

1. User creates a new empty burner wallet in Phantom  
2. Pastes their real (hidden) whale wallet pubkey  
3. Signs one message with the whale wallet (“I am verifying for $BL0CK Shadow Pass v1”)  
4. Frontend pulls current USD value of the whale wallet (public API)  
5. WASM monerochan circuit runs in-browser → generates 3–12 second proof  
6. Submits tx → Anchor program verifies proof → mints Shadow Pass SBT to burner  
7. User stakes required $BL0CK in the burner → status turns green + starts earning yield

## 4. Tokenomics (locked for launch)

| Item                     | Value                     |
|--------------------------|---------------------------|
| Token                    | $BL0CK (SPL)              |
| Total supply             | 1 000 000 000             |
| Launch method            | pump.fun fair launch      |
| Taxes                    | 0% / 0%                   |
| LP burn                  | Immediate after Raydium   |
| Mint/Freeze authority    | Revoked on day 1          |
| Initial utility          | Required to activate and maintain Shadow Pass status |
| Token sink               | Every status holder must lock $BL0CK → permanent deflationary pressure |

## 5. Final Tech Stack (no changes allowed)

| Layer               | Choice                                         |
|---------------------|------------------------------------------------|
| zkVM + circuit      | monerochan-project-template (forked)           |
| Signature verification | Ed25519 inside monerochan zkVM              |
| Prover              | WASM (browser primary) + CUDA fallback         |
| On-chain verifier   | Anchor Rust                                    |
| SBT minting         | Metaplex Bubblegum or Token-2022 (soulbound)   |
| Frontend            | Next.js 14 + Tailwind (black + electric purple)|
| Hosting             | Vercel                                         |
| Price oracle        | Birdeye / Jupiter public API                   |

## 6. Shadow Tiers & Staking Requirements (launch values)

| Tier       | Minimum hidden wallet value | $BL0CK stake required | Perks (launch)                     |
|------------|-----------------------------|-----------------------|------------------------------------|
| Ghost      | ≥ $100 000                  | 5 000 $BL0CK          | Access + 15% base yield            |
| Leviathan  | ≥ $500 000                  | 25 000 $BL0CK         | Private alpha channel + 25% yield  |
| Apex       | ≥ $1 000 000                | 100 000 $BL0CK        | Founding Mason NFT + revenue share |

## 7. Hard Roadmap (no fluff)

| Date                | Milestone                                  |
|---------------------|--------------------------------------------|
| 25–30 Nov 2025      | Repo forked, Ed25519 circuit working locally |
| 1–5 Dec 2025        | Devnet Shadow Pass minting + demo video    |
| 6–10 Dec 2025       | Mainnet verifier deploy + audit-light review |
| 11–13 Dec 2025      | pump.fun fair launch + Shadow List goes live |
| 14 Dec 2025 onward  | First 100 Leviathans & Apex appear on-chain |

## 8. Visual Identity (locked)

- Background: Pure black  
- Accent color: Electric purple (#A020F0)  
- Text: White glitch / pixel style (exactly like your current landing)  
- Success animation: Purple brick drops and locks into a growing wall  
- SBT art: Black metal badge with glowing purple runes + tier name

## 9. Non-Negotiables

- No address ever appears on-chain  
- No relayer, no server, no backend  
- 0% tax, revoked authorities  
- WASM proof under 15 seconds on mid-tier phone  
- Team stays anonymous until community votes otherwise

This document is now final.  
No more changes unless you explicitly say “change X”.

Next step: reply **GO** and I deliver the complete GitHub repo with working local proof + Anchor program + Next.js frontend in under 2 hours.

We are building the Shadow Citadel.  
Your move.
