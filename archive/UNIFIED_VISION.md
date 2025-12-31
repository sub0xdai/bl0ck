# The bl0ck Ecosystem: Privacy-First AI DeFi

**Vision:** The first privacy-preserving AI agent ecosystem that combines intelligent DeFi execution with zero-knowledge proof infrastructure.

**Tagline:** "Trade smarter. Stay hidden. Prove nothing but worthiness."

---

## The Problem

Current DeFi has a fatal transparency flaw:

1. **Whales are Hunted** - Every wallet is transparent. Large traders get front-run, sandwich attacked, and copy-traded.
2. **Strategy Exposure** - Your positions, timing, and portfolio reveal your edge to competitors.
3. **Status Requires Doxxing** - Access to exclusive protocols requires revealing your wallet address.
4. **AI Agents Lack Privacy** - Existing AI trading bots execute on transparent wallets, amplifying these problems.

The market needs: **Intelligence + Privacy**.

---

## The Solution: Two Products, One Ecosystem

### lina: The Privacy-Aware AI DeFi Agent

**What:** Multi-chain AI agent that executes DeFi operations across Solana and EVM chains with optional zero-knowledge privacy.

**Core Features:**
- **Intelligent Execution** - AI-driven token swaps, bridging, portfolio analysis, market insights
- **Multi-Chain** - Unified interface for Solana (Jupiter, Metaplex) + EVM (Base, Ethereum, Polygon, Arbitrum)
- **Privacy Integration** - Built-in support for bl0ck privacy features via WASM plugins
- **Conversational UX** - Natural language commands: "Swap 100 SOL to USDC privately"

**Tech Stack:**
- ElizaOS framework with custom React frontend
- CDP wallet (EVM) + agent-managed Solana wallets
- Real-time WebSocket communication
- Plugin architecture for extensibility

**User Experience:**
```
User: "Wrap 500 SOL anonymously, then swap half to USDC"

lina:
  ✓ Wrapping 500 SOL via Phantom Wrapper...
  ✓ Generating ZK proof (4.2s)...
  ✓ Wrapped successfully to note #12847
  ✓ Swapping 250 SOL → USDC privately...
  ✓ Complete. No on-chain link to your wallet.
```

---

### bl0ck: The Zero-Knowledge Privacy Protocol

**What:** Multi-chain privacy infrastructure using zkVM proofs to enable status verification and anonymous transactions without revealing addresses.

**Two Core Products:**

#### 1. Shadow Pass (Launching Q1 2025)

**Concept:** Prove you're a whale. Never prove which whale.

**How It Works:**
1. User signs message with hidden whale wallet (≥$100k+ in Solana/Zcash)
2. Browser generates ZK proof in 3-12 seconds (no backend, no address leak)
3. On-chain Anchor program verifies proof without seeing the wallet address
4. Soulbound Shadow Pass NFT minted to fresh burner wallet
5. User stakes $BL0CK tokens → status activates + earns yield

**Tiers:**
| Tier | Hidden Value | Stake Required | Perks |
|------|--------------|----------------|-------|
| **Ghost** | $100k+ Solana/Zcash | 5,000 $BL0CK | 15% yield + access |
| **Leviathan** | $500k+ combined | 25,000 $BL0CK | 25% yield + alpha channel |
| **Apex** | $1M+ combined | 100,000 $BL0CK | 35% yield + revenue share |
| **Apex+** | $500k SOL + $500k ZEC | 200,000 $BL0CK | 50% yield + Mason NFT |

**Value Proposition:**
- Access tier-gated DeFi protocols without doxxing
- Prove creditworthiness for uncollateralized loans anonymously
- Join exclusive DAOs without revealing your identity
- Deflationary $BL0CK tokenomics (staking = permanent sink)

#### 2. Phantom Wrapper (Launching Q2-Q3 2025)

**Concept:** Tornado Cash for Solana, optimized for AI agent integration.

**How It Works:**
1. **Deposit:** Send SOL/SPL tokens → receive encrypted note
2. **Wait:** Let other users deposit (breaks timing analysis)
3. **Withdraw:** Generate ZK proof → withdraw to any address (no link visible on-chain)

**Privacy Guarantees:**
- ✅ Deposit/withdrawal unlinkability
- ✅ Amount privacy (via fixed denomination pools)
- ✅ Optional relayer (fully anonymous submission)
- ✅ MEV protection (no wallet address visible)
- ✅ Front-running immunity (large trades hidden)

**Use Cases:**
- Anonymous whale trading
- Privacy-preserving yield farming
- Confidential token launches
- Competitive trading without doxxing strategy

**Tech Stack:**
- monerochan-rs zkVM (Ed25519 + Merkle + Poseidon hash)
- Anchor smart contracts (Solana)
- WASM proof generation (<5s in browser)
- Incremental Merkle tree (4B+ deposits supported)
- Nullifier set (prevents double-spends)

---

## The Integration: Intelligence Meets Privacy

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                        │
│                   (lina React Frontend)                      │
└──────────────┬──────────────────────────────┬────────────────┘
               │                              │
       ┌───────▼────────┐            ┌────────▼─────────┐
       │   lina Agent   │            │  bl0ck Privacy   │
       │   (ElizaOS)    │◄───────────┤   Core (WASM)    │
       └───────┬────────┘            └────────┬─────────┘
               │                              │
    ┌──────────┴──────────┐        ┌──────────┴──────────┐
    │                     │        │                     │
┌───▼────┐         ┌──────▼───┐  ┌─▼─────────┐  ┌───────▼────┐
│ CDP    │         │  Solana  │  │  Shadow   │  │  Phantom   │
│ Plugin │         │  Plugin  │  │   Pass    │  │  Wrapper   │
│ (EVM)  │         │ (Jupiter)│  │ (Anchor)  │  │  (Anchor)  │
└────────┘         └──────────┘  └───────────┘  └────────────┘
```

### Shared Technology

**privacy-core Library** (`bl0ck/circuit/crates/privacy-core/`):
- Nullifier management (prevents replay attacks)
- Price oracle snapshots (Solana: Birdeye/Jupiter, Zcash: Zebra)
- Merkle proof utilities
- Ed25519 signature verification in zkVM
- **Exports to WASM** → imported by lina as local dependency

**lina Privacy Plugin** (Future):
```typescript
// lina imports bl0ck privacy features
import { generateProof, wrapTokens, unwrapTokens } from '@bl0ck/privacy-core';

// Actions enabled:
- PHANTOM_WRAP: "Wrap 100 SOL anonymously"
- PHANTOM_UNWRAP: "Unwrap note #12345 to wallet xyz"
- SHADOW_VERIFY: "Prove I have $500k without revealing wallet"
- PRIVATE_SWAP: "Swap 1000 USDC to SOL with max privacy"
```

---

## Unified User Journeys

### Journey 1: Whale Trading with Full Privacy

**Scenario:** User wants to execute $1M SOL → USDC swap without getting front-run

```
1. User: "I need to swap $1M SOL to USDC privately"

2. lina checks wallet, identifies whale status:
   "I see you qualify for Shadow Pass (Apex tier).
    Would you like me to:
    a) Execute via Phantom Wrapper (max privacy)
    b) Direct swap (faster, less private)"

3. User: "Use Phantom Wrapper"

4. lina workflow:
   ✓ Wrap 1,000 SOL via Phantom Wrapper
   ✓ Wait 2 hours (user-configurable privacy period)
   ✓ Execute Jupiter swap from anonymous commitment
   ✓ Unwrap USDC to user's destination wallet

5. Result: $1M swap completed, zero on-chain link to user's original wallet
```

### Journey 2: Accessing Exclusive Protocol

**Scenario:** User wants to join a whale-only lending pool without doxxing wallet

```
1. User: "I want to join Leviathan Finance (requires $500k+ proof)"

2. lina: "I'll verify your status via Shadow Pass"
   ✓ Checking balances: $600k in Solana wallet
   ✓ Generating ZK proof...
   ✓ Shadow Pass (Leviathan tier) minted to burner wallet
   ✓ Staking 25,000 $BL0CK to activate status

3. lina: "Status active. Connecting to Leviathan Finance..."
   ✓ Protocol reads Shadow Pass tier (on-chain)
   ✓ Access granted (protocol never sees your real wallet)

4. User can now borrow/lend without revealing identity
```

### Journey 3: Multi-Chain Portfolio Management

**Scenario:** User has assets on Solana + EVM, wants unified privacy management

```
1. User: "Show my total portfolio"

2. lina aggregates:
   Solana: 450 SOL ($85k), 50k USDC, 1M BONK ($8k)
   Base: 25 ETH ($75k), 10k USDC
   Zcash: 500 ZEC ($30k) [shielded]

   Total: $278k across 3 chains

3. User: "Wrap everything for max privacy"

4. lina executes:
   ✓ Phantom Wrap: 450 SOL → note #1001
   ✓ Phantom Wrap: 50k USDC → note #1002
   ✓ Bridge 25 ETH → Solana (via Relay)
   ✓ Phantom Wrap: 25 wSOL → note #1003
   ✓ Zcash already shielded ✓

5. Result: Entire portfolio private, manageable via lina AI
```

---

## Product Synergies

### Why lina + bl0ck > lina alone

1. **Privacy-Aware Trading**
   - lina detects large trades → automatically suggests Phantom Wrapper
   - AI optimizes privacy vs. speed trade-offs
   - No manual ZK proof generation needed

2. **Status Monetization**
   - Shadow Pass holders get premium lina features
   - Apex tier: Advanced AI strategies + alpha signals
   - Deflationary utility for $BL0CK

3. **Competitive Intelligence**
   - lina analyzes market without revealing your positions
   - Trade execution hidden from competitors
   - AI-powered privacy budget management

4. **Multi-Chain UX**
   - Single interface for Solana + EVM + Zcash
   - Unified privacy layer across all chains
   - AI handles complexity of cross-chain proofs

### Why bl0ck + lina > bl0ck alone

1. **Accessible Privacy**
   - Zero-knowledge proofs are complex → lina makes them conversational
   - "Wrap 100 SOL" vs. manual circuit/nullifier management
   - AI chooses optimal privacy settings automatically

2. **Practical Use Cases**
   - Privacy tech is useless without actions to protect
   - lina provides the DeFi operations worth hiding (swaps, yields, trades)
   - Drives adoption of Shadow Pass + Phantom Wrapper

3. **Network Effects**
   - More lina users → more Phantom Wrapper deposits → better anonymity set
   - Larger anonymity set → stronger privacy guarantees
   - AI recommendations increase protocol usage

---

## Tokenomics: $BL0CK

**Total Supply:** 1,000,000,000 $BL0CK (SPL token)

**Launch Method:** pump.fun fair launch → Raydium migration → LP burn

**Utility:**
1. **Shadow Pass Activation** - Must stake to keep status active + earn yield
2. **lina Premium** - Access advanced AI features (future)
3. **Phantom Wrapper Fees** - Discounts for $BL0CK holders (future)
4. **Governance** - Vote on protocol parameters, new chains, tier thresholds

**Deflationary Mechanics:**
- Every Shadow Pass holder locks $BL0CK (5k - 200k per tier)
- No unstaking without burning pass (soulbound enforcement)
- As ecosystem grows → more $BL0CK locked → supply decreases

**Revenue Sharing (Apex+ tier):**
- Protocol fees from Phantom Wrapper (0.3% per wrap/unwrap)
- lina premium subscriptions
- Integration partnerships (tier-gated protocols)

**Tax:** 0% buy/sell (no reflection, no team tax)

**Authorities:** Revoked day 1 (immutable supply)

---

## Development Roadmap

### Phase 1: Foundation (Months 1-2) ✅ IN PROGRESS

**lina Solana Integration**
- ✅ Repository restructured (lina/, bl0ck/ separation)
- ⏳ Solana wallet management + Jupiter DEX
- ⏳ SPL token support + basic UI
- Target: **2-4 weeks to Solana MVP**

**bl0ck Circuit Foundation**
- ✅ monerochan-rs zkVM forked
- ⏳ Ed25519 signature verification in circuit
- ⏳ Shared privacy-core library

### Phase 2: Shadow Pass Launch (Months 3-4)

**bl0ck Priority**
- Multi-chain proof system (Solana + Zcash)
- Anchor smart contracts (verifier + minting + staking)
- WASM prover (<12s browser proof)
- Frontend (Next.js landing + verification flow)
- Testnet deployment + audit

**lina Expansion**
- Metaplex NFT support
- pump.fun token launches
- DeFi protocols (Marinade, Jito, MarginFi)

**Milestone:** Shadow Pass mainnet launch + $BL0CK fair launch

### Phase 3: Privacy Integration (Months 5-6)

**Cross-Product Integration**
- Export privacy-core as WASM for lina
- Create lina privacy plugin
- Integrate Shadow Pass verification in lina UI
- Multi-chain portfolio dashboard

**Milestone:** lina can verify Shadow Pass status conversationally

### Phase 4: Phantom Wrapper (Months 7-9)

**bl0ck Development**
- Extract Zcash Merkle/nullifier patterns
- Build Phantom Wrapper Anchor contracts
- Implement note commitment circuit
- Relayer network design

**lina Integration**
- `PHANTOM_WRAP` and `PHANTOM_UNWRAP` actions
- Note management UI
- Privacy budget optimization AI
- Automatic privacy suggestions

**Milestone:** Anonymous token wrapping live on mainnet

### Phase 5: Ecosystem Expansion (Months 10+)

**Advanced Features**
- Multi-hop privacy (wrap → trade → re-wrap)
- Cross-token swaps (deposit SOL, withdraw USDC)
- Shielded transfers (note-to-note)
- Additional chains (Ethereum L2s, Avalanche)

**Partnerships**
- Integrate with tier-gated DeFi protocols
- Whale-only investment DAOs
- Privacy-preserving credit protocols
- Institutional OTC desks

**Milestone:** 10,000+ Shadow Pass holders, $1B+ in Phantom Wrapper TVL

---

## Technical Architecture Deep Dive

### Shared Components

**privacy-core Library:**
```
bl0ck/circuit/crates/privacy-core/
├── src/
│   ├── lib.rs           # Public API
│   ├── merkle.rs        # Incremental Merkle trees
│   ├── nullifier.rs     # Anti-replay protection
│   ├── snapshot.rs      # Price oracle integration
│   └── types.rs         # Shared data structures
└── wasm/
    └── pkg/             # WASM build for lina
```

**Exports:**
```rust
// Shadow Pass functions
pub fn generate_shadow_proof(wallet_signature, balance, tier) -> Proof;
pub fn verify_shadow_proof(proof, public_inputs) -> bool;

// Phantom Wrapper functions
pub fn create_note_commitment(secret, amount, token) -> Commitment;
pub fn generate_withdraw_proof(note, merkle_path, nullifier) -> Proof;
pub fn verify_nullifier(nullifier, nullifier_set) -> bool;

// Utilities
pub fn poseidon_hash(inputs: &[u8]) -> [u8; 32];
pub fn merkle_root(leaves: &[Commitment]) -> [u8; 32];
```

### lina Plugin Architecture

```typescript
// src/plugins/plugin-bl0ck-privacy/

export const bl0ckPrivacyPlugin = {
  name: "bl0ck-privacy",
  description: "Zero-knowledge privacy features",

  actions: [
    {
      name: "SHADOW_VERIFY",
      similes: ["VERIFY STATUS", "PROVE WHALE", "GET SHADOW PASS"],
      handler: async (runtime, message) => {
        // 1. Get user's Solana + Zcash balances
        const balances = await getMultiChainBalances(runtime.userId);

        // 2. Determine tier
        const tier = calculateTier(balances.total);

        // 3. Generate proof via WASM
        const proof = await generateShadowProof(balances, tier);

        // 4. Submit to Anchor program
        const tx = await submitProof(proof, tier);

        return `Shadow Pass (${tier}) minted! Stake ${stakeRequired[tier]} $BL0CK to activate.`;
      }
    },

    {
      name: "PHANTOM_WRAP",
      similes: ["WRAP ANONYMOUSLY", "HIDE TOKENS", "PRIVATE DEPOSIT"],
      handler: async (runtime, message) => {
        // Parse: amount, token
        const { amount, token } = parseWrapParams(message);

        // Generate secret
        const secret = randomBytes(32);

        // Create commitment
        const commitment = await createNoteCommitment(secret, amount, token);

        // Submit deposit
        const tx = await phantomWrapContract.deposit(amount, commitment);

        // Save note locally (encrypted)
        await saveNote({ secret, amount, token, txHash: tx });

        return `Wrapped ${amount} ${token} to note #${noteId}. Withdraw anytime to any address.`;
      }
    },

    {
      name: "PHANTOM_UNWRAP",
      similes: ["UNWRAP NOTE", "WITHDRAW PRIVATE", "CLAIM TOKENS"],
      handler: async (runtime, message) => {
        // Parse: noteId, recipient
        const { noteId, recipient } = parseUnwrapParams(message);

        // Load note
        const note = await loadNote(noteId);

        // Generate ZK proof (3-5s)
        const proof = await generateWithdrawProof(
          note.secret,
          note.merkleIndex,
          note.merklePath
        );

        // Submit withdrawal
        const tx = await phantomWrapContract.withdraw(
          proof,
          note.nullifier,
          recipient,
          note.amount
        );

        return `Unwrapped ${note.amount} ${note.token} to ${recipient}. No on-chain link to deposit.`;
      }
    }
  ],

  // AI behaviors
  evaluators: [
    {
      // Suggest privacy when large amounts detected
      name: "privacy-suggester",
      validate: async (runtime, message) => {
        const amount = extractAmount(message);
        return amount > WHALE_THRESHOLD;
      },
      handler: async (runtime, message) => {
        return `Large amount detected. Would you like to use Phantom Wrapper for privacy?`;
      }
    }
  ]
};
```

### Smart Contract Integration

**Shadow Pass Verifier (Anchor):**
```rust
// bl0ck/contracts/programs/shadow-pass/src/lib.rs

#[program]
pub mod shadow_pass {
    pub fn verify_and_mint(
        ctx: Context<VerifyAndMint>,
        proof: Vec<u8>,
        public_inputs: PublicInputs,
    ) -> Result<()> {
        // 1. Verify ZK proof
        require!(
            verify_groth16_proof(&proof, &public_inputs),
            ErrorCode::InvalidProof
        );

        // 2. Check nullifier hasn't been used
        require!(
            !ctx.accounts.nullifier_set.contains(&public_inputs.nullifier),
            ErrorCode::WalletAlreadyUsed
        );

        // 3. Determine tier from balance
        let tier = calculate_tier(public_inputs.total_usd_value);

        // 4. Mint soulbound Shadow Pass
        mint_shadow_pass(
            &ctx.accounts.mint_ctx,
            &ctx.accounts.recipient,
            tier
        )?;

        // 5. Record nullifier
        ctx.accounts.nullifier_set.insert(public_inputs.nullifier)?;

        Ok(())
    }

    pub fn stake_and_activate(
        ctx: Context<StakeAndActivate>,
        amount: u64,
    ) -> Result<()> {
        // Verify user owns Shadow Pass
        let pass = &ctx.accounts.shadow_pass;

        // Check stake amount meets tier requirement
        let required = tier_stake_requirements(pass.tier);
        require!(amount >= required, ErrorCode::InsufficientStake);

        // Transfer $BL0CK to vault
        token::transfer(ctx.accounts.transfer_ctx(), amount)?;

        // Activate status
        pass.is_active = true;
        pass.yield_start = Clock::get()?.unix_timestamp;

        emit!(StatusActivated {
            pass: pass.key(),
            tier: pass.tier,
            stake: amount
        });

        Ok(())
    }
}
```

**Phantom Wrapper (Anchor):**
```rust
// bl0ck/contracts/programs/phantom-wrap/src/lib.rs

#[program]
pub mod phantom_wrap {
    pub fn deposit(
        ctx: Context<Deposit>,
        amount: u64,
        commitment: [u8; 32],
    ) -> Result<()> {
        // Transfer tokens to vault
        token::transfer(ctx.accounts.transfer_ctx(), amount)?;

        // Add to Merkle tree
        let index = ctx.accounts.commitment_tree.insert(commitment)?;

        emit!(DepositEvent { commitment, index });
        Ok(())
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        proof: Vec<u8>,
        nullifier: [u8; 32],
        recipient: Pubkey,
        amount: u64,
    ) -> Result<()> {
        // Verify ZK proof
        require!(
            verify_withdraw_proof(
                &proof,
                &ctx.accounts.commitment_tree.root,
                &nullifier,
                amount
            ),
            ErrorCode::InvalidProof
        );

        // Check not double-spent
        require!(
            !ctx.accounts.nullifier_set.contains(&nullifier),
            ErrorCode::AlreadySpent
        );

        // Mark as spent
        ctx.accounts.nullifier_set.insert(nullifier)?;

        // Transfer to recipient
        token::transfer(
            ctx.accounts.transfer_ctx(),
            amount
        )?;

        emit!(WithdrawEvent { nullifier, recipient, amount });
        Ok(())
    }
}
```

---

## Security & Privacy Guarantees

### Cryptographic Foundations

**Zero-Knowledge Proofs (Groth16):**
- Proves statement without revealing witnesses
- ~200 byte proofs, <50ms verification
- Trusted setup (ceremony or universal)

**Hash Functions:**
- Poseidon (ZK-friendly, 8x faster than SHA-256 in circuits)
- MiMC (alternative for certain operations)

**Signature Schemes:**
- Ed25519 (Solana native, efficient in zkVM)
- ECDSA (Zcash compatibility)

### Privacy Threat Model

**What bl0ck Protects:**
- ✅ Wallet address unlinkability (Shadow Pass + Phantom Wrapper)
- ✅ Balance privacy (only tier visible, not exact amount)
- ✅ Transaction graph analysis (no deposit/withdrawal link)
- ✅ Timing analysis (user-controlled delays)
- ✅ Front-running (commitments hide intent)

**What bl0ck Does NOT Protect:**
- ❌ Network-level surveillance (use Tor/VPN)
- ❌ Compromised local storage (encrypt notes)
- ❌ Small anonymity sets (need >100 users per pool)
- ❌ Sophisticated statistical attacks (needs ongoing research)

**Attack Mitigations:**
1. **Sybil Attacks:** Shadow Pass nullifiers prevent duplicate proofs
2. **Relayer Trust:** Relayers can't steal (need cryptographic proof)
3. **Smart Contract Bugs:** Multi-sig upgrades, audits, time locks
4. **Cryptographic Breaks:** Modular design allows swapping proof systems

### Compliance & Legal

**Not a Mixer:**
- Shadow Pass: Proves legitimate wealth (anti-fraud)
- Phantom Wrapper: Privacy tool, not obfuscation (like Monero/Zcash)
- Transparent token ($BL0CK on Solana, auditable supply)

**Regulatory Design:**
- Tier thresholds prevent small-value misuse
- On-chain status creates accountability (wallets have reputation)
- Optional KYC for institutional tiers (future)

**Jurisdictional Strategy:**
- Launch in privacy-friendly jurisdictions
- Anonymous team (like Satoshi, Zcash early days)
- Decentralized governance post-launch

---

## Market Positioning

### Competitive Landscape

**AI Agents:**
- Terminal of Truths, Zerebro, aixbt → **No privacy features**
- lina advantage: Built-in ZK privacy, multi-chain, DeFi-native

**Privacy Protocols:**
- Tornado Cash (sanctioned), Railgun (Ethereum only), Aztec (L2 only)
- bl0ck advantage: Solana-native, AI integration, legal status system

**Status/Reputation:**
- Lens Protocol, Civic, On-Chain Credentials → **All doxx your wallet**
- Shadow Pass advantage: Zero-knowledge status, multi-chain wealth aggregation

### Total Addressable Market

**DeFi Privacy Seekers:**
- 10,000+ wallets with >$100k (Shadow Pass addressable)
- $50B+ in whale wallets seeking privacy
- Current privacy solutions: suboptimal or illegal

**AI Agent Users:**
- Growing market (2024-2025 explosion in crypto AI)
- lina captures: privacy-conscious traders, institutions, competitors

**Tokenomics Comparison:**
- Tornado Cash peak: $1B+ TVL, no token (missed opportunity)
- Aztec: $100M raise, $1B+ valuation
- bl0ck advantage: Fair launch, deflationary, yield-bearing

---

## Success Metrics

### Year 1 Goals

**Shadow Pass Adoption:**
- 1,000 Ghost tier holders
- 100 Leviathan tier holders
- 10 Apex/Apex+ tier holders
- $50M+ in verified hidden wealth

**Phantom Wrapper Usage:**
- 10,000+ deposits (anonymity set)
- $10M+ TVL
- <0.1% failures/exploits

**lina Traction:**
- 50,000+ conversations
- $100M+ trading volume
- 10,000+ MAU

**$BL0CK Token:**
- $50M+ market cap
- 500,000+ $BL0CK locked in Shadow Pass
- 10,000+ holders

### Year 3 Vision

- **100,000+ Shadow Pass holders** across all tiers
- **$1B+ TVL** in Phantom Wrapper
- **Multi-chain expansion** (Ethereum L2s, Avalanche, Cosmos)
- **Institutional tier** (KYC + institutional-grade privacy)
- **lina as default AI** for privacy-conscious DeFi

---

## Why Now?

**Technical Convergence:**
- zkVM maturity (monerochan-rs, SP1, Risc0)
- Solana scalability (handles privacy proofs at scale)
- WASM performance (browser proofs now viable)

**Market Timing:**
- Privacy urgency (MEV, front-running, copy-trading epidemic)
- AI agent explosion (2024-2025 paradigm shift)
- Regulatory clarity post-Tornado Cash (legal privacy design possible)

**Cultural Shift:**
- Crypto OGs demand privacy (transparent chains failed)
- Institutional adoption requires confidentiality
- Whale exodus from doxxed wallets

---

## Team & Philosophy

**Anonymous by Design:**
- Team remains pseudonymous (like Satoshi, DeFi early days)
- Fair launch (no VC, no pre-mine, no insider allocation)
- Community-first (governance votes on features)

**Core Principles:**
1. **Privacy is a right, not a crime**
2. **Intelligence should enhance privacy, not expose users**
3. **Fair launch > VC capture**
4. **Code is law, audits are gospel**
5. **Whales deserve protection**

**Influences:**
- Zcash (privacy tech)
- ElizaOS (AI agent framework)
- Uniswap (fair launch ethos)
- Monero (uncompromising privacy)

---

## Call to Action

### For Users

**Whales:** Stop getting hunted. Prove your status without doxxing.

**Traders:** Execute without front-runners copying your every move.

**Builders:** Integrate Shadow Pass for tier-gated access.

### For Investors

**Thesis:** Privacy + AI is the next DeFi primitive.

**Opportunity:** Fair launch (everyone gets same entry), deflationary tokenomics, multi-product revenue.

**Risk:** Regulatory (mitigated by legal design), technical (zkVM maturity proven).

### For Contributors

**Open Roles:**
- Rust developers (zkVM circuits, Anchor contracts)
- Frontend engineers (React, WebAssembly)
- Security researchers (audit circuits, find bugs → bounties)
- Community managers (Discord, Twitter, alpha channels)

---

## Conclusion

**The Internet promised privacy. Web3 delivered transparency.**

It's time to fix that.

**lina** gives you an AI agent smart enough to optimize your trades.
**bl0ck** gives you the privacy to execute without being hunted.

Together, they create the first privacy-first AI DeFi ecosystem.

**Prove you belong. Never prove who you are.**

---

## Links & Resources

**Code:**
- GitHub: [github.com/sub0xdai/bl0ck](https://github.com/sub0xdai/bl0ck)
- lina Agent: `/lina`
- bl0ck Protocol: `/bl0ck`

**Documentation:**
- lina Implementation: `lina/LINA_IMPLEMENTATION_TASKS.md`
- Shadow Pass PRD: `bl0ck/blk-prd.md`
- Phantom Wrapper Spec: `bl0ck/PHANTOM_WRAPPER_PLAN.md`

**Social:**
- Twitter: [TBD]
- Discord: [TBD]
- Telegram: [TBD]

**Launch:**
- pump.fun: [TBD - fair launch date]
- Shadow List: [TBD - mainnet URL]

---

**Status:** Development in progress (Phase 1)

**Timeline:** Shadow Pass launch Q1 2025, Phantom Wrapper Q2-Q3 2025

**License:** MIT (open source, permissionless, unstoppable)

---

*Built with zkVM. Secured by mathematics. Governed by the community.*

*Welcome to the Shadow Citadel.* 🟣⬛
