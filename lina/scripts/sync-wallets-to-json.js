/**
 * Sync wallets from Postgres to local JSON file
 * Run this on the server to fix container DNS issues
 *
 * Usage:
 *   WALLET_DB_URL="..." SOLANA_WALLET_SECRET="..." bun run scripts/sync-wallets-to-json.js
 *
 * Or from .env:
 *   source .env && bun run scripts/sync-wallets-to-json.js
 */

const { Pool } = require('pg');
const { writeFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');

const pool = new Pool({ connectionString: process.env.WALLET_DB_URL });

async function main() {
    console.log('Syncing wallets from Postgres to local JSON...\n');

    try {
        const { rows } = await pool.query(
            'SELECT user_id, encrypted_seed_phrase, network, EXTRACT(EPOCH FROM created_at) * 1000 as created_at FROM solana_wallets'
        );
        console.log(`Found ${rows.length} wallets in database\n`);

        // Build wallets object matching WalletStorageFile format
        const wallets = {};
        for (const row of rows) {
            wallets[row.user_id] = {
                userId: row.user_id,
                encryptedSeedPhrase: row.encrypted_seed_phrase,
                network: row.network,
                createdAt: parseInt(row.created_at) || Date.now(),
            };
            console.log(`  ${row.user_id} -> ${row.network}`);
        }

        // Ensure data directory exists
        const dataDir = join(process.cwd(), 'data');
        if (!existsSync(dataDir)) {
            mkdirSync(dataDir, { recursive: true });
        }

        // Write to JSON file
        const filePath = join(dataDir, 'solana-wallets.json');
        writeFileSync(filePath, JSON.stringify({ wallets }, null, 2));

        console.log(`\n✓ Synced ${rows.length} wallets to ${filePath}`);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    } finally {
        pool.end();
    }
}

main();
