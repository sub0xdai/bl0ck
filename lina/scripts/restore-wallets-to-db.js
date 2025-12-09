#!/usr/bin/env node
/**
 * Restore wallets from JSON backup to PostgreSQL
 * Usage: WALLET_DB_URL="..." node scripts/restore-wallets-to-db.js
 */

import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;

async function main() {
  const walletDbUrl = process.env.WALLET_DB_URL;
  if (!walletDbUrl) {
    console.error('ERROR: Set WALLET_DB_URL environment variable');
    process.exit(1);
  }

  // Read JSON backup
  const jsonPath = './data/solana-wallets.json';
  if (!fs.existsSync(jsonPath)) {
    console.error('ERROR: Backup file not found:', jsonPath);
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const wallets = Object.values(backup.wallets);
  console.log(`Found ${wallets.length} wallets in backup`);

  // Connect to database
  const pool = new Pool({ connectionString: walletDbUrl, max: 1 });
  const client = await pool.connect();

  try {
    // Ensure schema and table exist
    await client.query(`CREATE SCHEMA IF NOT EXISTS lina_wallets`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS lina_wallets.solana_wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL UNIQUE,
        encrypted_seed_phrase TEXT NOT NULL,
        network TEXT NOT NULL DEFAULT 'solana',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    let restored = 0;
    let skipped = 0;

    for (const wallet of wallets) {
      try {
        const result = await client.query(`
          INSERT INTO lina_wallets.solana_wallets (user_id, encrypted_seed_phrase, network, created_at, updated_at)
          VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), NOW())
          ON CONFLICT (user_id) DO NOTHING
          RETURNING user_id
        `, [wallet.userId, wallet.encryptedSeedPhrase, wallet.network, wallet.createdAt]);

        if (result.rows.length > 0) {
          restored++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`Failed to restore wallet ${wallet.userId}:`, err.message);
      }
    }

    console.log(`\nRestored: ${restored} wallets`);
    console.log(`Skipped (already exist): ${skipped} wallets`);

    // Verify
    const count = await client.query('SELECT COUNT(*) FROM lina_wallets.solana_wallets');
    console.log(`\nTotal wallets in database: ${count.rows[0].count}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
