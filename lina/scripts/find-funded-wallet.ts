#!/usr/bin/env bun
/**
 * Find which backed-up wallet has SOL funds
 * Usage: railway run bun scripts/find-funded-wallet.ts
 */

import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
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
  const secret = process.env.SOLANA_WALLET_SECRET;
  if (!secret) {
    console.error('SOLANA_WALLET_SECRET not set');
    process.exit(1);
  }

  // Load JSON backup
  const jsonPath = './data/solana-wallets.json';
  if (!fs.existsSync(jsonPath)) {
    console.error('No wallet backup found at', jsonPath);
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const wallets = Object.entries(backup.wallets) as [string, any][];

  console.log(`Found ${wallets.length} wallets in backup\n`);

  // Connect to Solana mainnet
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

  const results: { userId: string; address: string; balance: number }[] = [];

  for (const [userId, wallet] of wallets) {
    try {
      const decrypted = decrypt(wallet.encryptedSeedPhrase, secret);
      const keypair = Keypair.fromSecretKey(decrypted);
      const address = keypair.publicKey.toBase58();

      const lamports = await connection.getBalance(keypair.publicKey);
      const balance = lamports / LAMPORTS_PER_SOL;

      results.push({ userId, address, balance });

      if (balance > 0) {
        console.log(`✅ FOUND FUNDS!`);
        console.log(`   userId: ${userId}`);
        console.log(`   address: ${address}`);
        console.log(`   balance: ${balance} SOL\n`);
      } else {
        console.log(`   ${address.substring(0, 8)}... - 0 SOL`);
      }
    } catch (error: any) {
      console.log(`   ${userId.substring(0, 8)}... - decrypt failed (different secret?)`);
    }
  }

  // Summary
  console.log('\n--- SUMMARY ---');
  const funded = results.filter(r => r.balance > 0);
  if (funded.length > 0) {
    console.log('Wallets with funds:');
    for (const w of funded) {
      console.log(`  ${w.address} (${w.balance} SOL) - userId: ${w.userId}`);
    }
  } else {
    console.log('No wallets with SOL found in backup.');
    console.log('Either the wallet was created with a different SOLANA_WALLET_SECRET,');
    console.log('or the funds are in the Railway database (not JSON backup).');
  }
}

main().catch(console.error);
