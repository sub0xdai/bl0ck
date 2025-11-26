//! Price snapshot for frozen oracle data
//!
//! Prevents users from gaming the system by waiting for favorable price moments.
//! All proofs reference frozen state at time of proof request.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Price snapshot metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotMetadata {
    /// Unix timestamp when snapshot was taken
    pub timestamp: u64,
    /// Block height (chain-specific)
    pub block_height: u64,
    /// Hash of price data (commitment)
    pub price_hash: [u8; 32],
}

/// Frozen price data for wallet valuation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceSnapshot {
    /// Metadata
    pub metadata: SnapshotMetadata,
    /// SOL price in USD (6 decimals)
    pub sol_price_usd: u64,
    /// Token prices in USD (pubkey -> price with 6 decimals)
    pub token_prices: HashMap<String, u64>,
}

impl PriceSnapshot {
    /// Validate snapshot freshness
    /// Returns true if snapshot is within max_age_sec
    pub fn validate_freshness(&self, current_timestamp: u64, max_age_sec: u64) -> bool {
        let age = current_timestamp.saturating_sub(self.metadata.timestamp);
        age <= max_age_sec
    }

    /// Compute USD value of wallet holdings
    pub fn compute_wallet_value(
        &self,
        sol_balance: u64,
        token_balances: &HashMap<String, u64>,
    ) -> u64 {
        let mut total_usd = 0u64;

        // Add SOL value (assuming sol_balance in lamports, 9 decimals)
        // sol_price_usd has 6 decimals
        total_usd += (sol_balance as u128 * self.sol_price_usd as u128 / 1_000_000_000) as u64;

        // Add token values
        for (token_pubkey, balance) in token_balances {
            if let Some(&price) = self.token_prices.get(token_pubkey) {
                // Assuming token balance with 6-9 decimals (varies by token)
                // Simplified: assuming 6 decimals for all tokens
                total_usd += (balance * price) / 1_000_000;
            }
        }

        total_usd
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snapshot_freshness() {
        let snapshot = PriceSnapshot {
            metadata: SnapshotMetadata {
                timestamp: 1000,
                block_height: 100,
                price_hash: [0u8; 32],
            },
            sol_price_usd: 100_000_000, // $100
            token_prices: HashMap::new(),
        };

        // Within 5 minutes (300s)
        assert!(snapshot.validate_freshness(1200, 300));

        // Older than 5 minutes
        assert!(!snapshot.validate_freshness(1400, 300));
    }

    #[test]
    fn test_wallet_value_computation() {
        let mut token_prices = HashMap::new();
        token_prices.insert("TOKEN1".to_string(), 2_000_000); // $2

        let snapshot = PriceSnapshot {
            metadata: SnapshotMetadata {
                timestamp: 1000,
                block_height: 100,
                price_hash: [0u8; 32],
            },
            sol_price_usd: 100_000_000, // $100
            token_prices,
        };

        // 1 SOL (1_000_000_000 lamports) = $100
        // 10 TOKEN1 (10_000_000 with 6 decimals) = $20
        // Total = $120
        let mut token_balances = HashMap::new();
        token_balances.insert("TOKEN1".to_string(), 10_000_000);

        let value = snapshot.compute_wallet_value(1_000_000_000, &token_balances);
        assert_eq!(value, 120_000_000); // $120 with 6 decimals
    }
}
