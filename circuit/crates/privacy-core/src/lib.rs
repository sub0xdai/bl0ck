//! Privacy Core Library
//!
//! Shared privacy patterns extracted from Zcash prover for multi-chain Shadow Pass protocol.
//! Used by both Solana (Ed25519) and Zcash (note commitment) proof systems.

pub mod nullifier;
pub mod snapshot;
pub mod merkle;
pub mod types;

pub use nullifier::{Nullifier, NullifierSet};
pub use snapshot::{PriceSnapshot, SnapshotMetadata};
pub use merkle::{MerkleProof, MerkleTree};
pub use types::{ProofOutput, Tier};
