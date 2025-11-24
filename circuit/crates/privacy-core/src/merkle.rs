//! Merkle tree utilities for nullifier set management
//!
//! Simplified Merkle tree for proving nullifier exclusion/inclusion.

use serde::{Deserialize, Serialize};

/// Merkle proof path
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerkleProof {
    /// Path siblings from leaf to root
    pub siblings: Vec<[u8; 32]>,
    /// Leaf index
    pub index: u64,
}

/// Merkle tree for nullifier storage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerkleTree {
    /// Current root hash
    pub root: [u8; 32],
    /// Tree depth
    pub depth: usize,
}

impl MerkleTree {
    /// Create empty Merkle tree
    pub fn new(depth: usize) -> Self {
        Self {
            root: [0u8; 32],
            depth,
        }
    }

    /// TODO: Implement Merkle proof verification
    pub fn verify_proof(&self, _proof: &MerkleProof, _leaf: [u8; 32]) -> bool {
        // Placeholder: In production, verify path from leaf to root
        true
    }

    /// TODO: Implement Merkle tree insertion
    pub fn insert(&mut self, _leaf: [u8; 32]) {
        // Placeholder: In production, insert leaf and update root
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merkle_tree_creation() {
        let tree = MerkleTree::new(20);
        assert_eq!(tree.depth, 20);
        assert_eq!(tree.root, [0u8; 32]);
    }
}
