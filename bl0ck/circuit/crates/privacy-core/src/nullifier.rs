//! Nullifier management for Sybil prevention
//!
//! Prevents the same wallet from minting multiple Shadow Passes.
//! Nullifier = BLAKE2b(wallet_pubkey || domain_separator)

use blake2::{Blake2b512, Digest};
use serde::{Deserialize, Serialize};

/// Domain separator for Shadow Pass nullifiers
pub const SHADOW_PASS_DOMAIN: &[u8] = b"SHADOW_PASS_V1_NULLIFIER";

/// 32-byte nullifier derived from wallet public key
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Nullifier([u8; 32]);

impl Nullifier {
    /// Compute nullifier from wallet public key
    pub fn from_pubkey(pubkey: &[u8; 32]) -> Self {
        let mut hasher = Blake2b512::new();
        hasher.update(pubkey);
        hasher.update(SHADOW_PASS_DOMAIN);
        let hash = hasher.finalize();

        let mut nullifier = [0u8; 32];
        nullifier.copy_from_slice(&hash[..32]);
        Nullifier(nullifier)
    }

    /// Get raw bytes
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

/// Nullifier set for exclusion proofs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NullifierSet {
    /// Merkle root of spent nullifiers
    pub root: [u8; 32],
}

impl NullifierSet {
    /// Create empty nullifier set
    pub fn new() -> Self {
        Self { root: [0u8; 32] }
    }

    /// TODO: Implement Merkle exclusion proof
    /// Proves nullifier NOT in spent set via predecessor/successor gap
    pub fn prove_exclusion(&self, _nullifier: Nullifier) -> bool {
        // Placeholder: In production, verify Merkle path shows nullifier absent
        true
    }
}

impl Default for NullifierSet {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nullifier_generation() {
        let pubkey = [1u8; 32];
        let nullifier1 = Nullifier::from_pubkey(&pubkey);
        let nullifier2 = Nullifier::from_pubkey(&pubkey);

        // Same pubkey produces same nullifier
        assert_eq!(nullifier1, nullifier2);

        // Different pubkey produces different nullifier
        let pubkey2 = [2u8; 32];
        let nullifier3 = Nullifier::from_pubkey(&pubkey2);
        assert_ne!(nullifier1, nullifier3);
    }
}
