#!/usr/bin/env bun
/**
 * Custom server start script that uses our custom UI
 */

// CRITICAL: Load .env FIRST before any module imports that use process.env
import 'dotenv/config';

import { AgentServer, loadCharacters } from '@elizaos/server';
import path from 'path';
import { fileURLToPath } from 'url';
import { Keypair } from '@solana/web3.js';
import { createDecipheriv } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Wallet fix: Ensure correct wallet is assigned to the right userId
const WALLET_FIXES: Record<string, string> = {
  // userId -> expected wallet address
  '5b9d75ce-b068-4518-91cd-bd89f5c12df0': '5YSzxR5UPwYWwVKmwm1ejumjKWRs3kuwJTUbUBXdE138',
};

function decryptWallet(base64Data: string, keyHex: string): Uint8Array {
  const key = Buffer.from(keyHex, 'hex');
  const buf = Buffer.from(base64Data, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(buf.length - 16);
  const encrypted = buf.subarray(12, buf.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return new Uint8Array(Buffer.concat([decipher.update(encrypted), decipher.final()]));
}

async function migrateWalletTableIfNeeded() {
  const walletDbUrl = process.env.WALLET_DB_URL;
  if (!walletDbUrl) return;

  try {
    const { Pool } = await import('pg');
    const fs = await import('fs');
    const pool = new Pool({ connectionString: walletDbUrl, max: 1 });
    const client = await pool.connect();

    try {
      // Check if old table exists in public schema
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'solana_wallets'
        )
      `);

      if (result.rows[0].exists) {
        console.log('[STARTUP] Migrating wallet table from public to lina_wallets schema...');
        await client.query(`CREATE SCHEMA IF NOT EXISTS lina_wallets`);
        await client.query(`ALTER TABLE public.solana_wallets SET SCHEMA lina_wallets`);
        console.log('[STARTUP] Wallet table migration complete');
      }

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

      // Restore from JSON backup if exists
      const jsonPath = './data/solana-wallets.json';
      if (fs.existsSync(jsonPath)) {
        const backup = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const wallets = Object.values(backup.wallets) as any[];
        console.log(`[STARTUP] Found ${wallets.length} wallets in JSON backup, restoring missing...`);

        let restored = 0;
        for (const wallet of wallets) {
          const res = await client.query(`
            INSERT INTO lina_wallets.solana_wallets (user_id, encrypted_seed_phrase, network, created_at, updated_at)
            VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), NOW())
            ON CONFLICT (user_id) DO NOTHING
            RETURNING user_id
          `, [wallet.userId, wallet.encryptedSeedPhrase, wallet.network, wallet.createdAt]);
          if (res.rows.length > 0) restored++;
        }
        console.log(`[STARTUP] Restored ${restored} wallets from backup`);
      }

    } finally {
      client.release();
      await pool.end();
    }
  } catch (error) {
    console.error('[STARTUP] Wallet migration error (non-fatal):', error);
  }
}

async function fixWalletAssignments() {
  const walletDbUrl = process.env.WALLET_DB_URL;
  const walletSecret = process.env.SOLANA_WALLET_SECRET;
  if (!walletDbUrl || !walletSecret) return;

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: walletDbUrl, max: 1 });
  const client = await pool.connect();

  try {
    for (const [targetUserId, expectedAddress] of Object.entries(WALLET_FIXES)) {
      // Check current wallet for this userId
      const currentResult = await client.query(
        'SELECT encrypted_seed_phrase FROM lina_wallets.solana_wallets WHERE user_id = $1',
        [targetUserId]
      );

      if (currentResult.rows.length > 0) {
        try {
          const decrypted = decryptWallet(currentResult.rows[0].encrypted_seed_phrase, walletSecret);
          const keypair = Keypair.fromSecretKey(decrypted);
          const currentAddress = keypair.publicKey.toBase58();

          if (currentAddress === expectedAddress) {
            console.log(`[WALLET_FIX] ✓ userId ${targetUserId.substring(0, 8)}... already has correct wallet`);
            continue;
          }
          console.log(`[WALLET_FIX] userId ${targetUserId.substring(0, 8)}... has wrong wallet: ${currentAddress.substring(0, 8)}...`);
        } catch (e) {
          console.log(`[WALLET_FIX] Could not decrypt current wallet for ${targetUserId.substring(0, 8)}...`);
        }
      }

      // Find the wallet with expected address
      const allWallets = await client.query('SELECT user_id, encrypted_seed_phrase FROM lina_wallets.solana_wallets');
      let foundSeed: string | null = null;
      let foundOldUserId: string | null = null;

      for (const row of allWallets.rows) {
        try {
          const decrypted = decryptWallet(row.encrypted_seed_phrase, walletSecret);
          const keypair = Keypair.fromSecretKey(decrypted);
          if (keypair.publicKey.toBase58() === expectedAddress) {
            foundSeed = row.encrypted_seed_phrase;
            foundOldUserId = row.user_id;
            break;
          }
        } catch (e) {
          // Skip decrypt errors
        }
      }

      if (!foundSeed) {
        console.log(`[WALLET_FIX] ✗ Could not find wallet ${expectedAddress.substring(0, 8)}... in database`);
        continue;
      }

      // Perform the swap
      await client.query('BEGIN');
      try {
        // Delete the old userId's row if different
        if (foundOldUserId && foundOldUserId !== targetUserId) {
          await client.query('DELETE FROM lina_wallets.solana_wallets WHERE user_id = $1', [foundOldUserId]);
        }

        // Upsert the correct wallet for target userId
        await client.query(`
          INSERT INTO lina_wallets.solana_wallets (user_id, encrypted_seed_phrase, network, updated_at)
          VALUES ($1, $2, 'solana', NOW())
          ON CONFLICT (user_id) DO UPDATE SET encrypted_seed_phrase = $2, updated_at = NOW()
        `, [targetUserId, foundSeed]);

        await client.query('COMMIT');
        console.log(`[WALLET_FIX] ✓ Fixed userId ${targetUserId.substring(0, 8)}... → wallet ${expectedAddress.substring(0, 8)}...`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } catch (error) {
    console.error('[WALLET_FIX] Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  // Migrate wallet table BEFORE ElizaOS starts (so it doesn't see it in public schema)
  await migrateWalletTableIfNeeded();

  // Fix any incorrect wallet assignments
  await fixWalletAssignments();

  const server = new AgentServer();

  // Debug: Log database configuration
  const postgresUrl = process.env.POSTGRES_URL;
  console.log(`[DEBUG] POSTGRES_URL set: ${postgresUrl ? 'YES (length: ' + postgresUrl.length + ')' : 'NO'}`);
  console.log(`[DEBUG] POSTGRES_URL starts with: ${postgresUrl ? postgresUrl.substring(0, 30) + '...' : 'N/A'}`);

  // Initialize server with custom client path
  await server.initialize({
    clientPath: path.resolve(__dirname, 'dist/frontend'), //  Point to OUR custom UI
    dataDir: process.env.PGLITE_DATA_DIR || path.resolve(__dirname, '.eliza/.elizadb'),
    postgresUrl: postgresUrl,
  });

  // Load characters from project
  const projectPath = path.resolve(__dirname, 'dist/index.js');
  console.log(`Loading project from: ${projectPath}`);
  
  const project = await import(projectPath);
  const projectModule = project.default || project;
  
  if (projectModule.agents && Array.isArray(projectModule.agents)) {
    const characters = projectModule.agents.map((agent: any) => agent.character);
    // Flatten plugin arrays from all agents
    const allPlugins = projectModule.agents.flatMap((agent: any) => agent.plugins || []);
    await server.startAgents(characters, allPlugins);
    console.log(` Started ${characters.length} agent(s)`);
  } else {
    throw new Error('No agents found in project');
  }

  // Start server
  const port = parseInt(process.env.SERVER_PORT || '3000');
  await server.start(port);

  console.log(`\n Server with custom UI running on http://localhost:${port}\n`);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

