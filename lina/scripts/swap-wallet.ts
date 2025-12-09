#!/usr/bin/env bun
/**
 * Swap a user's wallet to a different one
 * Usage: railway run bun scripts/swap-wallet.ts <target-wallet-address> <your-current-userId>
 *
 * Example: railway run bun scripts/swap-wallet.ts 5YSzxR5UPwYWwVKmwm1ejumjKWRs3kuwJTUbUBXdE138 5b9d75ce-b068-4518-91cd-bd89f5c12df0
 */

import { Keypair } from '@solana/web3.js';
import { createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function decrypt(base64Data: string, keyHex: string): Uint8Array {
  const key = Buffer.from(keyHex, 'hex');
  const buf = Buffer.from(base64Data, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return new Uint8Array(Buffer.concat([decipher.update(encrypted), decipher.final()]));
}

async function main() {
  const targetAddress = process.argv[2] || '5YSzxR5UPwYWwVKmwm1ejumjKWRs3kuwJTUbUBXdE138';
  const currentUserId = process.argv[3] || '5b9d75ce-b068-4518-91cd-bd89f5c12df0';

  const secret = process.env.SOLANA_WALLET_SECRET;
  const dbUrl = process.env.WALLET_DB_URL;

  if (!secret || !dbUrl) {
    console.error('Missing SOLANA_WALLET_SECRET or WALLET_DB_URL');
    process.exit(1);
  }

  console.log(`Target wallet: ${targetAddress}`);
  console.log(`Current userId: ${currentUserId}\n`);

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: dbUrl, max: 1 });

  try {
    // Find the wallet with target address
    const allWallets = await pool.query('SELECT user_id, encrypted_seed_phrase FROM lina_wallets.solana_wallets');

    let targetRow: { user_id: string; encrypted_seed_phrase: string } | null = null;
    let currentRow: { user_id: string; encrypted_seed_phrase: string } | null = null;

    for (const row of allWallets.rows) {
      try {
        const decrypted = decrypt(row.encrypted_seed_phrase, secret);
        const keypair = Keypair.fromSecretKey(decrypted);
        const address = keypair.publicKey.toBase58();

        if (address === targetAddress) {
          targetRow = row;
          console.log(`✅ Found target wallet: ${address}`);
          console.log(`   Current owner userId: ${row.user_id}`);
        }

        if (row.user_id === currentUserId) {
          currentRow = row;
          console.log(`📍 Your current wallet: ${address}`);
          console.log(`   userId: ${row.user_id}`);
        }
      } catch (e) {
        // Skip decrypt errors
      }
    }

    if (!targetRow) {
      console.error('\n❌ Target wallet not found in database!');
      process.exit(1);
    }

    if (targetRow.user_id === currentUserId) {
      console.log('\n✅ You already own this wallet! No swap needed.');
      process.exit(0);
    }

    console.log('\n--- PERFORMING SWAP ---');

    // Delete the target's old userId row (we'll reassign the seed to current user)
    await pool.query('DELETE FROM lina_wallets.solana_wallets WHERE user_id = $1', [targetRow.user_id]);
    console.log(`Deleted old row for userId: ${targetRow.user_id}`);

    if (currentRow) {
      // Update current user's row with target's encrypted seed
      await pool.query(
        'UPDATE lina_wallets.solana_wallets SET encrypted_seed_phrase = $1, updated_at = NOW() WHERE user_id = $2',
        [targetRow.encrypted_seed_phrase, currentUserId]
      );
      console.log(`Updated your wallet to use: ${targetAddress}`);
    } else {
      // Insert new row for current user with target's seed
      await pool.query(
        'INSERT INTO lina_wallets.solana_wallets (user_id, encrypted_seed_phrase, network) VALUES ($1, $2, $3)',
        [currentUserId, targetRow.encrypted_seed_phrase, 'solana']
      );
      console.log(`Created wallet row for you with: ${targetAddress}`);
    }

    console.log('\n✅ SWAP COMPLETE!');
    console.log(`Your userId ${currentUserId.substring(0, 8)}... now owns wallet ${targetAddress}`);
    console.log('\nRefresh the app to see your wallet.');

  } finally {
    await pool.end();
  }
}

main().catch(console.error);
