# Shadow Pass Contracts

Solana Anchor programs for multi-chain Shadow Pass verification.

## Structure

```
contracts/
├── programs/
│   └── shadow-pass/        # Main verification program
│       ├── src/
│       │   ├── lib.rs      # Anchor program entry
│       │   ├── instructions/
│       │   │   ├── verify_solana.rs    # Solana Ed25519 proof verification
│       │   │   ├── verify_zcash.rs     # Zcash holdings proof verification
│       │   │   ├── mint_pass.rs        # Shadow Pass SBT minting
│       │   │   └── stake.rs            # $BL0CK staking for activation
│       │   └── state/
│       │       ├── shadow_pass.rs      # SBT account structure
│       │       └── nullifier_set.rs    # Nullifier storage
│       └── Cargo.toml
├── tests/
└── Anchor.toml
```

## Development

```bash
# Initialize Anchor project (when ready)
anchor init

# Build
anchor build

# Test on localnet
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## Key Instructions

### 1. `verify_solana_proof`
- Verifies monerochan-rs proof of Ed25519 signature
- Extracts tier from public inputs
- Checks nullifier not already used
- Returns Solana tier

### 2. `verify_zcash_proof`
- Verifies monerochan-rs proof of Zcash note ownership
- Extracts USD value from public inputs
- Returns Zcash tier

### 3. `mint_shadow_pass`
- Combines Solana + Zcash tiers
- Calculates final tier with multi-chain bonuses
- Mints soulbound NFT to burner wallet
- Stores nullifier on-chain

### 4. `stake_for_activation`
- Checks user owns Shadow Pass
- Validates $BL0CK stake amount meets tier requirement
- Transfers tokens to vault
- Activates status + starts yield accrual

### 5. `unstake`
- Deactivates status
- Stops yield accrual
- Returns staked $BL0CK to user

## Multi-Chain Tier Calculation

```rust
pub fn calculate_combined_tier(solana_tier: Tier, zcash_tier: Option<Tier>) -> Tier {
    match (solana_tier, zcash_tier) {
        (Tier::Ghost, Some(Tier::Ghost)) => Tier::Leviathan,
        (Tier::Leviathan, Some(Tier::Ghost)) => Tier::Apex,
        (Tier::Ghost, Some(Tier::Leviathan)) => Tier::Apex,
        (Tier::Leviathan, Some(Tier::Leviathan)) => Tier::ApexPlus,
        (Tier::Apex, Some(_)) => Tier::ApexPlus,
        (tier, None) => tier,
        _ => solana_tier,
    }
}
```

## Security Considerations

1. **Nullifier Uniqueness**: Ensure same wallet can't mint multiple passes
2. **Proof Verification**: Correctly verify monerochan groth16 proofs
3. **Soulbound Enforcement**: Shadow Pass truly non-transferable
4. **Stake Requirements**: Validate tier-appropriate $BL0CK amounts
5. **Cross-Chain Consistency**: Prevent exploits from mismatched tier claims
