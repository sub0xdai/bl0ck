const { Pool } = require('pg');
const { Keypair } = require('@solana/web3.js');
const crypto = require('crypto');
const bs58 = require('bs58');

const TARGET = '4JhFhux9jAAQyivYJGng4v31ZPABKkbFGCeFGR96BwXF';
const pool = new Pool({ connectionString: process.env.WALLET_DB_URL });
const key = Buffer.from(process.env.SOLANA_WALLET_SECRET, 'hex');

async function main() {
    console.log('Searching for wallet:', TARGET);
    try {
        const { rows } = await pool.query('SELECT user_id, encrypted_seed_phrase, network FROM solana_wallets');
        console.log(`Found ${rows.length} wallets in DB`);

        for (const row of rows) {
            try {
                const enc = Buffer.from(row.encrypted_seed_phrase, 'base64');
                const decipher = crypto.createDecipheriv('aes-256-gcm', key, enc.slice(0, 12));
                decipher.setAuthTag(enc.slice(-16));
                const seed = Buffer.concat([decipher.update(enc.slice(12, -16)), decipher.final()]);
                const kp = Keypair.fromSeed(seed.slice(0, 32));
                const pubkey = kp.publicKey.toBase58();

                if (pubkey === TARGET) {
                    console.log('\n*** FOUND TARGET ***');
                    console.log('user_id:', row.user_id);
                    console.log('network:', row.network);
                    console.log('Private Key (Base58):', bs58.encode(kp.secretKey));

                    // Optional: Update user_id if we knew the correct one. 
                    // For now just printing the private key is enough for recovery.
                }
            } catch (e) {
                // console.log(row.user_id, '-> DECRYPT ERROR:', e.message);
            }
        }
    } catch (err) {
        console.error('DB Connection Error:', err.message);
    } finally {
        pool.end();
    }
}
main();
