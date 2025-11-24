//! Common types for Shadow Pass protocol

use serde::{Deserialize, Serialize};

/// Shadow Pass tier levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Tier {
    /// No tier (< $100K)
    None = 0,
    /// Ghost tier (≥ $100K)
    Ghost = 1,
    /// Leviathan tier (≥ $500K)
    Leviathan = 2,
    /// Apex tier (≥ $1M)
    Apex = 3,
    /// Apex+ tier (multi-chain bonus)
    ApexPlus = 4,
}

impl Tier {
    /// Get minimum USD value required for tier
    pub fn minimum_value(&self) -> u64 {
        match self {
            Tier::None => 0,
            Tier::Ghost => 100_000_000_000, // $100K with 6 decimals
            Tier::Leviathan => 500_000_000_000, // $500K
            Tier::Apex => 1_000_000_000_000, // $1M
            Tier::ApexPlus => 1_500_000_000_000, // $1.5M combined
        }
    }

    /// Get $BL0CK staking requirement
    pub fn stake_requirement(&self) -> u64 {
        match self {
            Tier::None => 0,
            Tier::Ghost => 5_000,
            Tier::Leviathan => 25_000,
            Tier::Apex => 100_000,
            Tier::ApexPlus => 200_000,
        }
    }

    /// Determine tier from USD value
    pub fn from_usd_value(value_usd: u64) -> Self {
        if value_usd >= Tier::ApexPlus.minimum_value() {
            Tier::ApexPlus
        } else if value_usd >= Tier::Apex.minimum_value() {
            Tier::Apex
        } else if value_usd >= Tier::Leviathan.minimum_value() {
            Tier::Leviathan
        } else if value_usd >= Tier::Ghost.minimum_value() {
            Tier::Ghost
        } else {
            Tier::None
        }
    }
}

/// Public outputs from proof generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofOutput {
    /// Tier achieved
    pub tier: Tier,
    /// Nullifier (prevents duplicate minting)
    pub nullifier: [u8; 32],
    /// Snapshot timestamp
    pub timestamp: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tier_from_value() {
        assert_eq!(Tier::from_usd_value(50_000_000_000), Tier::None);
        assert_eq!(Tier::from_usd_value(150_000_000_000), Tier::Ghost);
        assert_eq!(Tier::from_usd_value(600_000_000_000), Tier::Leviathan);
        assert_eq!(Tier::from_usd_value(1_200_000_000_000), Tier::Apex);
        assert_eq!(Tier::from_usd_value(2_000_000_000_000), Tier::ApexPlus);
    }

    #[test]
    fn test_stake_requirements() {
        assert_eq!(Tier::Ghost.stake_requirement(), 5_000);
        assert_eq!(Tier::Leviathan.stake_requirement(), 25_000);
        assert_eq!(Tier::Apex.stake_requirement(), 100_000);
        assert_eq!(Tier::ApexPlus.stake_requirement(), 200_000);
    }
}
