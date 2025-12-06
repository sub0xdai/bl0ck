# MY FUCK UP

## Summary

Claude made changes to fix a "userId mismatch" bug that **orphaned the user's wallet with 1.01 SOL**.

---

## The Lost Wallet

- **Address:** `4JhFhux9jAAQyivYJGng4v31ZPABKkbFGCeFGR96BwXF`
- **Balance:** 1.01 SOL (devnet)
- **Location:** Supabase Postgres database (encrypted)
- **Database:** `postgresql://postgres.brpgrylamqytottxnztc:%5ESupabase12%23%24@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres`
- **Table:** `solana_wallets` (29 rows total)

---

## What Claude Broke

### The "Fix" (Commit 298ef7b)

Changed `getEntityUserId()` in `src/plugins/plugin-jupiter/src/utils.ts`:

**Before:**
```typescript
if (!userId) {
    if (message.entityId) {
        return message.entityId;  // Fallback to entityId
    }
    throw new Error("User ID not found");
}
```

**After:**
```typescript
if (!userId) {
    throw new Error("User ID not found");  // No fallback
}
```

### The Problem

- Old wallets were created using `entityId` as the key
- New code uses `author_id` (from JWT) as the key
- These are DIFFERENT IDs for the same user
- System can't find old wallet → creates new empty wallet
- User's 1.01 SOL is stuck in the old wallet

---

## Files Changed in Bad Commit

```
src/managers/solana-transaction-manager.ts
src/plugins/plugin-jupiter/src/actions/jupiter-swap.ts
src/plugins/plugin-jupiter/src/utils.ts
src/plugins/plugin-drift/src/utils/action-factory.ts
src/packages/server/src/socketio/index.ts
src/packages/server/src/middleware/jwt.ts
src/packages/server/src/middleware/index.ts
src/packages/server/src/api/index.ts
.env.sample
```

---

## Additional Issue: Container Can't Reach Postgres

The container has DNS issues connecting to Supabase:
```
Error: getaddrinfo ENOTFOUND
```

This causes fallback to local JSON file (`/app/data/solana-wallets.json`) which doesn't have the wallet.

---

## How to Recover the Wallet

### Step 1: Find which user_id owns the wallet

Save this script to `/tmp/find_wallet.js`:

```javascript
const { Pool } = require('pg');
const { Keypair } = require('@solana/web3.js');
const crypto = require('crypto');

const TARGET = '4JhFhux9jAAQyivYJGng4v31ZPABKkbFGCeFGR96BwXF';
const pool = new Pool({ connectionString: process.env.WALLET_DB_URL });
const key = Buffer.from(process.env.SOLANA_WALLET_SECRET, 'hex');

async function main() {
  const { rows } = await pool.query('SELECT user_id, encrypted_seed_phrase, network FROM solana_wallets');
  for (const row of rows) {
    try {
      const enc = Buffer.from(row.encrypted_seed_phrase, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, enc.slice(0,12));
      decipher.setAuthTag(enc.slice(-16));
      const seed = Buffer.concat([decipher.update(enc.slice(12,-16)), decipher.final()]);
      const kp = Keypair.fromSeed(seed.slice(0,32));
      const pubkey = kp.publicKey.toBase58();
      console.log(row.user_id, '->', pubkey, '('+row.network+')');
      if (pubkey === TARGET) {
        console.log('\n*** FOUND TARGET ***');
        console.log('user_id:', row.user_id);
        console.log('network:', row.network);
      }
    } catch(e) {
      console.log(row.user_id, '-> DECRYPT ERROR:', e.message);
    }
  }
  pool.end();
}
main();
```

Run from HOST (not container, since container has DNS issues):

```bash
cd /root/bl0ck/lina
source .env
node /tmp/find_wallet.js
```

If node isn't installed, install it or run via bun on host.

### Step 2: Option A - Update the user_id

Once you find the old user_id, update it to match the current JWT user_id:

```sql
UPDATE solana_wallets
SET user_id = '3c7607f2-a7c2-4d87-b18b-bda857edbc4b'  -- new correct userId
WHERE user_id = 'OLD_USER_ID_FROM_STEP_1';
```

### Step 2: Option B - Extract private key

Modify the script to output the private key:

```javascript
if (pubkey === TARGET) {
  console.log('Private key (base58):', require('bs58').encode(Buffer.from(kp.secretKey)));
}
```

Then import into Phantom or another wallet.

### Step 3: Fix the container DNS issue

Either:
1. Use a different Postgres connection string that resolves
2. Or configure container DNS properly
3. Or switch to local-only wallet storage

---

## Current State of Wallets

### In Postgres (29 wallets):
```
d759f005-ae55-47b4-aa83-c965c56d673d | solana  | 2025-12-05 20:01:28
5c5cd2d0-375a-40bb-95a4-bb739a724c2a | solana  | 2025-12-05 20:01:37
... (27 more)
3c7607f2-a7c2-4d87-b18b-bda857edbc4b | solana  | 2025-12-05 22:33:38  <-- likely current user
```

### In JSON file (/var/lib/lina-data/solana-wallets.json):
```
32ea7bae-82d1-45b2-a474-478b3a9f3f2c -> 9JWJ6BATx... (solana)
a3f7b409d5afde8b6e5cf178c8c4a31f -> G5t8BzAq... (solana)
a3f7b409-d5af-4e8b-ae5c-f178c8c4a31f -> 6usMoYGu... (solana)
932cbead-5578-00a0-b0ff-7e727f465ef2 -> H3c4hNCk... (solana)
9fbf4828-00ed-4f25-b216-0fb37a9b734d -> 6u4h2cxU... (solana)
5b9d75ce-b068-4518-91cd-bd89f5c12df0 -> 6zB7FcWM... (solana-devnet)
3c7607f2-a7c2-4d87-b18b-bda857edbc4b -> 68Ro51QN... (solana-devnet)
```

**NOTE:** Wallet `4JhFhux9jAAQyivYJGng4v31ZPABKkbFGCeFGR96BwXF` is NOT in the JSON file. It's only in Postgres.

---

## Environment Variables Needed

```
WALLET_DB_URL=postgresql://postgres.brpgrylamqytottxnztc:%5ESupabase12%23%24@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres
SOLANA_WALLET_SECRET=<64-char hex string from .env>
```

---

## Rollback Option

Revert commit 298ef7b to restore old behavior:

```bash
git revert 298ef7b
```

This will bring back the `entityId` fallback, but doesn't fix the underlying userId inconsistency issue.

---

## Lesson Learned

**Never change wallet lookup logic without a migration plan for existing wallets.**

The "fix" was technically correct (using JWT userId instead of internal entityId), but it broke existing users whose wallets were stored under the old ID format.
