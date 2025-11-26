# Phantom Wrapper: Anonymous Token Wrapping for Solana

## Overview

**Phantom Wrapper** is a planned privacy feature for the bl0ck ecosystem that enables anonymous token deposits and withdrawals on Solana. Users can wrap SOL/SPL tokens into private commitments and later unwrap them without revealing the connection between deposit and withdrawal.

**Status:** Future feature (Month 6-8 of roadmap)
**Prerequisites:** lina Phase 1 + bl0ck privacy-core foundation
**Timeline:** 8-12 weeks implementation after prerequisites complete

## Use Cases

### For lina AI Agent Users

1. **Anonymous Trading**
   - Wrap large positions before executing trades
   - Prevent front-running by hiding wallet size
   - Trade without revealing your strategy to competitors

2. **Whale Privacy**
   - Access whale-only pools without doxxing address
   - Prove balance without revealing which wallet

3. **Token Launch Privacy**
   - Participate in launches anonymously
   - Prevent snipers from targeting known whales

4. **Competition Privacy**
   - Compete in trading competitions without revealing wallet
   - Prove PnL without doxxing holdings

## Architecture

### High-Level Flow

```
1. DEPOSIT (Public → Private)
   User: Send 100 SOL to phantom-wrap contract
   Contract: Add commitment to Merkle tree
   User receives: Private note (secret + commitment)

2. WITHDRAW (Private → Public)
   User: Generate ZK proof of note ownership
   Contract: Verify proof + check nullifier
   Contract: Release tokens to recipient address
```

### Key Components

```
bl0ck/
├── circuit/crates/phantom-wrap/       # zkVM circuit for note proofs
│   ├── src/lib.rs                     # Note commitment logic
│   └── wasm/                          # Browser proof generation
├── contracts/programs/phantom-wrap/   # Anchor smart contract
│   ├── src/lib.rs                     # deposit() + withdraw()
│   └── accounts/                      # Merkle tree + nullifier set
└── zcash-prover/                      # Reference implementation
    └── crates/lib/src/proof.rs        # Merkle + nullifier patterns
```

## Technical Design

### Note Commitment Structure

```rust
pub struct NoteCommitment {
    secret: [u8; 32],      // User's random secret
    amount: u64,           // Token amount
    token_mint: Pubkey,    // SPL token address (SOL = native)
}

impl NoteCommitment {
    pub fn commitment(&self) -> [u8; 32] {
        // Pedersen commitment: C = hash(secret, amount, token)
        poseidon_hash(&[self.secret, &self.amount.to_le_bytes(), &self.token_mint.to_bytes()])
    }

    pub fn nullifier(&self, tree_index: u64) -> [u8; 32] {
        // Prevents double-spend: N = hash(secret, index)
        poseidon_hash(&[self.secret, &tree_index.to_le_bytes()])
    }
}
```

### Smart Contract Instructions

#### deposit()

```rust
pub fn deposit(
    ctx: Context<Deposit>,
    amount: u64,
    commitment: [u8; 32],
) -> Result<()> {
    // 1. Transfer tokens from user to vault
    token::transfer(ctx.accounts.transfer_ctx(), amount)?;

    // 2. Add commitment to Merkle tree
    let tree_index = ctx.accounts.commitment_tree.insert(commitment)?;

    // 3. Emit event (user tracks their note index)
    emit!(DepositEvent {
        commitment,
        tree_index,
        token_mint: ctx.accounts.token_mint.key()
    });

    Ok(())
}
```

#### withdraw()

```rust
pub fn withdraw(
    ctx: Context<Withdraw>,
    proof: Vec<u8>,           // ZK proof of note ownership
    nullifier: [u8; 32],      // Prevents double-spend
    recipient: Pubkey,        // Destination address
    amount: u64,              // Amount to withdraw
    token_mint: Pubkey,       // Token type
) -> Result<()> {
    // 1. Verify ZK proof
    // Proof asserts: "I know secret S such that:
    //   - commitment = hash(S, amount, token)
    //   - nullifier = hash(S, tree_index)
    //   - commitment exists in Merkle tree at tree_index"
    require!(
        verify_groth16_proof(&proof, &ctx.accounts.commitment_tree.root, &nullifier, amount),
        ErrorCode::InvalidProof
    );

    // 2. Check nullifier not already spent
    require!(
        !ctx.accounts.nullifier_set.contains(&nullifier),
        ErrorCode::AlreadySpent
    );

    // 3. Mark nullifier as spent (prevent double-withdraw)
    ctx.accounts.nullifier_set.insert(nullifier)?;

    // 4. Transfer tokens to recipient
    token::transfer(ctx.accounts.transfer_ctx(), amount)?;

    emit!(WithdrawEvent { nullifier, recipient, amount });
    Ok(())
}
```

### zkVM Circuit (monerochan-rs)

**Private Inputs:**
- `secret`: User's random 32-byte secret
- `tree_index`: Position in commitment tree
- `merkle_path`: Proof path from leaf to root

**Public Inputs:**
- `merkle_root`: Current tree root (on-chain)
- `nullifier`: Derived from secret + index
- `amount`: Withdrawal amount
- `token_mint`: Token type

**Circuit Logic:**
```rust
// 1. Recompute commitment from secret
let commitment = poseidon_hash(&[secret, amount, token_mint]);

// 2. Verify Merkle path (commitment is in tree)
assert!(verify_merkle_path(commitment, tree_index, merkle_path, merkle_root));

// 3. Derive nullifier (prevents double-spend)
let computed_nullifier = poseidon_hash(&[secret, tree_index]);
assert_eq!(computed_nullifier, nullifier);

// 4. Output public signals
commit_public(merkle_root);
commit_public(nullifier);
commit_public(amount);
```

### State Accounts

**CommitmentTree** (on-chain Merkle tree)
- Stores commitments as leaves
- 32-level sparse Merkle tree
- Supports ~4 billion deposits
- Uses incremental Merkle updates

**NullifierSet** (spent commitments)
- Hash map of used nullifiers
- Prevents double-withdrawals
- Indexed by nullifier hash

**TokenVault** (per SPL token)
- Holds deposited tokens
- Separate vault per token type
- Native SOL vault for wrapped SOL

## Privacy Guarantees

### What is Hidden

✅ **Link between deposit and withdrawal**
- Deposit from wallet A, withdraw to wallet B
- No on-chain connection visible

✅ **Depositor identity** (with relayer)
- Submit deposit via relayer service
- Contract never sees your wallet address

✅ **Withdrawal timing**
- Wait arbitrary time between deposit and withdrawal
- No timestamp linkability

### What is Visible

❌ **Deposit amount** (unless fixed denominations)
- Amount is part of commitment
- Solution: Use fixed pools (1 SOL, 10 SOL, 100 SOL)

❌ **Token type**
- Separate vaults per token
- Solution: Future cross-token privacy

❌ **Transaction fee payer** (unless relayer)
- Solana fee must be paid by some address
- Solution: Use relayer subsidy for full anonymity

## Implementation Phases

### Phase 1: Extract Zcash Patterns (2-3 weeks)

**Goal:** Understand existing zkVM infrastructure

**Tasks:**
- Study `zcash-prover/crates/lib/src/proof.rs` for Merkle + nullifier patterns
- Extract note commitment logic from Sapling/Orchard
- Adapt Merkle sharding for Solana constraints
- Port nullifier exclusion proofs to Anchor

**Deliverable:** Design doc with adapted patterns

### Phase 2: Build Smart Contracts (3-4 weeks)

**Goal:** Anchor program for deposit/withdraw

**Tasks:**
- Create `phantom-wrap` Anchor program
- Implement `deposit()` instruction
- Implement `withdraw()` instruction with proof verification
- Build CommitmentTree account (incremental Merkle)
- Build NullifierSet account (hash map)
- Add per-token vaults (SOL + SPL tokens)
- Write Anchor tests (devnet)

**Deliverable:** Deployed contract on devnet

### Phase 3: zkVM Circuit (2-3 weeks)

**Goal:** Browser proof generation

**Tasks:**
- Replace fibonacci circuit with note commitment proof
- Implement Merkle path verification in zkVM
- Implement nullifier derivation
- Add Poseidon hash (efficient in ZK)
- Compile to WASM (< 5s proof time)
- Test proof generation in Node.js

**Deliverable:** WASM prover library

### Phase 4: lina Integration (1-2 weeks)

**Goal:** AI agent can wrap/unwrap tokens

**Tasks:**
- Create `plugin-phantom-wrap` in lina
- Implement `PHANTOM_WRAP` action
- Implement `PHANTOM_UNWRAP` action
- Add UI for note management (track deposits)
- Add relayer support (optional for privacy)
- Frontend: "Wrap 100 SOL anonymously"

**Deliverable:** lina can execute phantom wraps end-to-end

## Security Considerations

### Cryptographic Assumptions

- **Hash function:** Poseidon (ZK-friendly)
- **Proof system:** Groth16 (via monerochan-rs)
- **Merkle tree:** Sparse Merkle tree (efficient updates)

### Attack Vectors

**Double-Spend Prevention:**
- Nullifier set enforced on-chain
- Each note can only be spent once

**Front-Running Protection:**
- Commitments hide note details
- Front-runner can't extract value without secret

**Denial of Service:**
- Gas limits prevent spam
- Merkle tree size capped at 2^32

**Relayer Trust:**
- Relayer sees deposit amount (use fixed denominations)
- Relayer cannot steal funds (cryptographic proof required)

### Auditing

- Circuit audit: Formal verification of zkVM logic
- Contract audit: Solana security review
- Merkle tree: Verify root updates correctly
- Nullifier set: Ensure no duplicates possible

## User Experience (lina)

### Deposit Flow

```
User: "Wrap 100 SOL anonymously"

lina:
  ✓ Generating secret...
  ✓ Creating commitment...
  ✓ Depositing to phantom-wrap contract...
  ✓ Deposit confirmed! Note saved securely.

  Your deposit: #12345 (100 SOL)
  Wait before withdrawing to maximize privacy.
```

### Withdrawal Flow

```
User: "Unwrap note #12345 to wallet xyz"

lina:
  ✓ Loading note #12345...
  ✓ Generating ZK proof (this may take 3-5 seconds)...
  ✓ Proof generated successfully
  ✓ Submitting withdrawal...
  ✓ Withdrawal complete! 100 SOL sent to xyz

  No on-chain link between deposit and withdrawal.
```

### Note Management

```
User: "Show my phantom notes"

lina:
  Your wrapped assets:

  #12345: 100 SOL (deposited 2 days ago)
  #12346: 50 USDC (deposited 1 week ago)
  #12347: 1000 BONK (deposited 3 hours ago)

  Total value: $10,234

  Commands:
  - "Unwrap note #12345 to [address]"
  - "Transfer note #12345 to [recipient]" (future)
```

## Future Enhancements

### Multi-Hop Privacy

- Wrap → Trade → Re-wrap in one transaction
- Never exit to public addresses

### Cross-Token Swaps

- Deposit SOL, withdraw USDC
- Full privacy on swap execution

### Shielded Transfers

- Transfer notes between users
- No on-chain footprint for transfers

### Fixed Denomination Pools

- 1 SOL, 10 SOL, 100 SOL pools
- Hide exact amounts (like Tornado Cash)

### Relayer Network

- Decentralized submission service
- Full anonymity (no wallet connection)

## Value Proposition

For lina users, Phantom Wrapper provides:

1. **Competitive Advantage**
   - Hide trading strategy from competitors
   - Prevent copy-traders from following your moves

2. **MEV Protection**
   - Large trades don't reveal whale wallet
   - Reduced sandwich attack surface

3. **Privacy-Preserving DeFi**
   - Access tier-gated protocols anonymously
   - Prove wealth without doxxing

4. **Regulatory Benefits**
   - Legitimate privacy for high-value users
   - No KYC for on-chain operations

## Timeline Integration

**Current Status:** Design phase

**Dependencies:**
- ✅ monerochan-rs zkVM (exists)
- ✅ zcash-prover patterns (reference implementation)
- ⏳ lina Phase 1 (Solana support) - **prerequisite**
- ⏳ bl0ck privacy-core library - **prerequisite**

**Roadmap:**
- **Now (Month 1-2):** Ship lina Solana MVP
- **Month 3-4:** Build bl0ck privacy-core + Shadow Pass
- **Month 5:** Design phantom wrap (extract Zcash patterns)
- **Month 6-7:** Implement contracts + circuits
- **Month 8:** Integrate with lina + devnet testing
- **Month 9+:** Mainnet launch after audit

## References

- **Tornado Cash:** Fixed-denomination privacy pools (Ethereum)
- **Zcash Sapling/Orchard:** Note commitment schemes
- **Aztec Connect:** L2 privacy on Ethereum
- **Light Protocol:** Solana ZK compression (different use case)

---

**Status:** This document is a design spec. Implementation begins after lina Phase 1 and bl0ck privacy-core are complete.

**Contact:** See main bl0ck repository for updates and development progress.
