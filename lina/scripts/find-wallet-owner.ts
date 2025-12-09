#!/usr/bin/env bun
/**
 * Find which userId owns a specific wallet address
 * Usage: railway run bun scripts/find-wallet-owner.ts 5YSzxR5UPwYWwVKmwm1ejumjKWRs3kuwJTUbUBXdE138
 */

import { Keypair } from '@solana/web3.js';
import { createDecipheriv } from 'crypto';
import fs from 'fs';

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

  const secret = process.env.SOLANA_WALLET_SECRET;
  if (!secret) {
    console.error('SOLANA_WALLET_SECRET not set');
    process.exit(1);
  }

  console.log(`Looking for wallet: ${targetAddress}\n`);

  // Check JSON backup
  const jsonPath = './data/solana-wallets.json';
  if (fs.existsSync(jsonPath)) {
    const backup = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const wallets = Object.entries(backup.wallets) as [string, any][];

    console.log(`Checking ${wallets.length} wallets in JSON backup...`);

    for (const [userId, wallet] of wallets) {
      try {
        const decrypted = decrypt(wallet.encryptedSeedPhrase, secret);
        const keypair = Keypair.fromSecretKey(decrypted);
        const address = keypair.publicKey.toBase58();

        if (address === targetAddress) {
          console.log(`\n✅ FOUND IN JSON BACKUP!`);
          console.log(`   userId: ${userId}`);
          console.log(`   address: ${address}`);
          console.log(`\nTo fix: Update Railway DB to use this userId's wallet for your current session.`);
          return;
        }
      } catch (error: any) {
        // Skip decrypt errors
      }
    }
    console.log('Not found in JSON backup (may be using different encryption key)');
  }

  // Check database directly
  const dbUrl = process.env.WALLET_DB_URL;
  if (dbUrl) {
    console.log('\nChecking Railway database...');
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: dbUrl, max: 1 });

    try {
      const result = await pool.query('SELECT user_id, encrypted_seed_phrase FROM lina_wallets.solana_wallets');

      for (const row of result.rows) {
        try {
          const decrypted = decrypt(row.encrypted_seed_phrase, secret);
          const keypair = Keypair.fromSecretKey(decrypted);
          const address = keypair.publicKey.toBase58();

          if (address === targetAddress) {
            console.log(`\n✅ FOUND IN DATABASE!`);
            console.log(`   userId: ${row.user_id}`);
            console.log(`   address: ${address}`);
            return;
          }
        } catch (error: any) {
          // Skip decrypt errors
        }
      }
      console.log('Not found in database');
    } finally {
      await pool.end();
    }
  }

  console.log('\n❌ Wallet not found. It may have been created with a different SOLANA_WALLET_SECRET.');
}

main().catch(console.error);
