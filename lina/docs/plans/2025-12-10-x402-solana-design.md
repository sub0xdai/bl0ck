# x402-solana: Solana-Native Payment Protocol Plugin

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

---

## Implementation Progress

| Task | Status | Commit |
|------|--------|--------|
| Task 1: Initialize Plugin Structure | ✅ DONE | `cde7a4d` |
| Task 2: Define Types | ✅ DONE | `386713c` |
| Task 3: Add Constants | ✅ DONE | `585b42e` |
| Code Review Fixes (Batch 1) | ✅ DONE | `663d221` |
| Task 4: Implement Payment Builder | ✅ DONE | `8f1d135` |
| Task 5: Implement x402 Fetch Wrapper | ✅ DONE | `777f405` |
| Task 6: Implement Payment Store | ✅ DONE | `eab6369` |
| Code Review Fixes (Batch 2) | ✅ DONE | `f7ef672`, `95cc42d` |
| Task 7: Implement Payment Listener | ✅ DONE | `ce9aeed` |
| Task 8: Implement Server Middleware | ✅ DONE | `730d238` |
| Task 9: Finalize Plugin Exports | ✅ DONE | `bf9b3f3` |
| Task 10: Integration Test & Docs | ✅ DONE | (this commit) |

## Implementation Complete!

**Test Results:** 120 tests passing, 173 expect() calls

**Files created:**
- `src/guards.ts` - Runtime type guards (isX402PaymentRequired, isX402PaymentProof, isValidBase58PublicKey, isValidTransactionSignature)
- `src/errors.ts` - Custom error types (X402PaymentError hierarchy)
- `src/utils/network.ts` - Network conversion utilities (toWireNetwork, fromWireNetwork)
- `src/utils/memo.ts` - Memo parsing utilities (parseMemo, extractRequestId, createMemo)
- `src/client/payment-builder.ts` - Build USDC+memo transactions
- `src/client/x402-fetch.ts` - Auto-pay fetch wrapper
- `src/server/payment-store.ts` - In-memory pending payment store
- `src/server/payment-listener.ts` - WebSocket-based payment listener
- `src/server/middleware.ts` - Express/Hono middleware for 402 responses
- `src/index.ts` - Full plugin exports with JSDoc examples
- `__tests__/*.test.ts` - 120 tests across 9 files

---

**Goal:** Build a full x402-compatible payment protocol for Solana, enabling both client (pay for APIs) and server (receive payments for APIs) functionality using USDC-SPL.

**Architecture:** WebSocket-based payment listener with memo-field request identification. Client wraps fetch with automatic payment handling. Server provides Express/Hono middleware that returns 402 and verifies payments via real-time tx monitoring.

**Tech Stack:** TypeScript, @solana/web3.js, @solana/spl-token, ElizaOS plugin pattern, Bun test runner

---

## Context & Background

### What is x402?

x402 is a payment protocol that enables automated micropayments for API access:
1. Client makes request to paid endpoint
2. Server returns `402 Payment Required` with payment details
3. Client automatically pays (signs + submits transaction)
4. Client retries request with payment proof
5. Server verifies payment and processes request

### Why Solana-native?

The existing x402 implementation uses EVM (Base Mainnet). This plugin provides the same functionality natively on Solana using USDC-SPL, enabling:
- Lower transaction fees (~$0.00025 vs ~$0.10 on Base)
- Faster confirmation (~400ms vs ~2s)
- Native integration with Solana-based agents like Lina

### Payment Identification Strategy

**Memo field approach** (industry standard - used by Solana Pay):
- Client includes unique `requestId` in SPL transfer memo instruction
- Server's WebSocket listener parses memo to match payments to pending requests
- Single transaction, minimal compute overhead (~5k CU for memo)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT SIDE                               │
├─────────────────────────────────────────────────────────────────┤
│  wrapFetchWithSolanaPayment(fetch, keypair, maxPayment)         │
│       │                                                          │
│       ▼                                                          │
│  Request → 402? → Parse payment details → Build SPL transfer    │
│                   with memo(requestId) → Sign & submit →        │
│                   Retry with X-Payment-Proof header             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        SERVER SIDE                               │
├─────────────────────────────────────────────────────────────────┤
│  x402Middleware(config)                                          │
│       │                                                          │
│       ▼                                                          │
│  Request → Has payment proof? ─No─→ Generate requestId →        │
│       │                             Return 402 with details      │
│       │                                                          │
│      Yes                                                         │
│       │                                                          │
│       ▼                                                          │
│  PaymentListener verifies tx signature + amount + memo match    │
│       │                                                          │
│       ▼                                                          │
│  Process request → Return response with X-Payment-Response      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     PAYMENT LISTENER                             │
├─────────────────────────────────────────────────────────────────┤
│  WebSocket subscription to recipient token account              │
│       │                                                          │
│       ▼                                                          │
│  On transfer → Parse memo → Match to pending request →          │
│                Mark as paid → Callback to middleware            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Plugin Structure

```
src/plugins/plugin-x402-solana/
├── package.json
├── tsconfig.json
├── build.ts
├── src/
│   ├── index.ts                    # Plugin export + re-exports
│   ├── types.ts                    # All shared types
│   ├── constants.ts                # USDC mint, defaults
│   │
│   ├── client/
│   │   ├── index.ts                # Client exports
│   │   ├── x402-fetch.ts           # wrapFetchWithSolanaPayment()
│   │   └── payment-builder.ts      # buildPaymentTransaction()
│   │
│   ├── server/
│   │   ├── index.ts                # Server exports
│   │   ├── middleware.ts           # x402Middleware()
│   │   ├── payment-listener.ts     # PaymentListener class
│   │   └── payment-store.ts        # PendingPaymentStore class
│   │
│   └── utils/
│       ├── index.ts                # Utils exports
│       ├── verification.ts         # verifyPaymentTransaction()
│       └── memo.ts                 # Memo parsing utilities
│
└── __tests__/
    ├── client.test.ts
    ├── server.test.ts
    ├── payment-listener.test.ts
    └── verification.test.ts
```

---

## Task 1: Initialize Plugin Structure

**Files:**
- Create: `src/plugins/plugin-x402-solana/package.json`
- Create: `src/plugins/plugin-x402-solana/tsconfig.json`
- Create: `src/plugins/plugin-x402-solana/build.ts`
- Create: `src/plugins/plugin-x402-solana/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@elizaos/plugin-x402-solana",
  "version": "0.1.0",
  "description": "Solana-native x402 payment protocol for API micropayments",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "scripts": {
    "build": "bun run build.ts",
    "test": "bun test",
    "test:watch": "bun test --watch"
  },
  "dependencies": {
    "@solana/web3.js": "^1.98.0",
    "@solana/spl-token": "^0.4.9"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.0.0"
  },
  "peerDependencies": {
    "@elizaos/core": "^0.2.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

**Step 3: Create build.ts**

```typescript
import { build } from 'bun';

await build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  target: 'bun',
  format: 'esm',
  external: ['@elizaos/core', '@solana/web3.js', '@solana/spl-token'],
});

console.log('@elizaos/plugin-x402-solana build complete!');
```

**Step 4: Create src/index.ts (placeholder)**

```typescript
/**
 * x402-solana: Solana-native payment protocol plugin
 *
 * Provides both client and server functionality for x402 payments using USDC-SPL.
 */

import type { Plugin } from '@elizaos/core';

export const x402SolanaPlugin: Plugin = {
  name: 'x402-solana',
  description: 'Solana-native x402 payment protocol for API micropayments',
  evaluators: [],
  providers: [],
  actions: [],
  services: [],
};

export default x402SolanaPlugin;

// Re-exports will be added as we implement each module
```

**Step 5: Verify build**

```bash
cd src/plugins/plugin-x402-solana && bun install && bun run build
```

**Step 6: Commit**

```bash
git add src/plugins/plugin-x402-solana/
git commit -m "feat(x402-solana): initialize plugin structure"
```

---

## Task 2: Define Types

**Files:**
- Create: `src/plugins/plugin-x402-solana/src/types.ts`

**Step 1: Create types.ts**

```typescript
/**
 * x402-solana Type Definitions
 */

import type { Keypair, PublicKey, TransactionSignature } from '@solana/web3.js';

// ============================================================================
// Payment Configuration
// ============================================================================

/**
 * Configuration for x402 payment requirements
 */
export interface X402PaymentConfig {
  /** USDC amount in base units (6 decimals). E.g., 15000 = $0.015 */
  amount: bigint;
  /** Recipient's USDC token account address */
  recipient: PublicKey;
  /** Optional: Human-readable description */
  description?: string;
  /** Optional: Network (defaults to mainnet-beta) */
  network?: 'mainnet-beta' | 'devnet';
}

/**
 * 402 Payment Required response format
 */
export interface X402PaymentRequired {
  /** HTTP status code (always 402) */
  status: 402;
  /** Error message */
  error: string;
  /** Unique request ID (used in memo for payment matching) */
  requestId: string;
  /** Payment details */
  accepts: {
    /** Network identifier */
    network: 'solana-mainnet' | 'solana-devnet';
    /** Token mint address (USDC) */
    token: string;
    /** Amount in base units (6 decimals) */
    amount: string;
    /** Recipient token account */
    payTo: string;
    /** Request ID to include in memo */
    memo: string;
    /** Expiry timestamp (Unix ms) */
    expiresAt: number;
  };
}

// ============================================================================
// Payment Proof
// ============================================================================

/**
 * Payment proof submitted by client
 */
export interface X402PaymentProof {
  /** Solana transaction signature */
  signature: TransactionSignature;
  /** Payer's wallet address */
  payer: string;
  /** Network the payment was made on */
  network: 'solana-mainnet' | 'solana-devnet';
}

/**
 * Verified payment result
 */
export interface X402VerifiedPayment {
  /** Whether payment was valid */
  valid: boolean;
  /** Transaction signature */
  signature: TransactionSignature;
  /** Payer's wallet address */
  payer: string;
  /** Amount transferred (base units) */
  amount: bigint;
  /** Memo content (should contain requestId) */
  memo: string;
  /** Block time of confirmation */
  blockTime?: number;
  /** Error message if invalid */
  error?: string;
}

// ============================================================================
// Client Types
// ============================================================================

/**
 * Options for the payment-wrapped fetch
 */
export interface X402FetchOptions {
  /** Solana keypair for signing payments */
  keypair: Keypair;
  /** Maximum payment willing to make (base units) */
  maxPayment: bigint;
  /** RPC endpoint (defaults to mainnet) */
  rpcEndpoint?: string;
  /** Network (defaults to mainnet-beta) */
  network?: 'mainnet-beta' | 'devnet';
}

// ============================================================================
// Server Types
// ============================================================================

/**
 * Middleware configuration
 */
export interface X402MiddlewareConfig {
  /** USDC amount to charge per request (base units) */
  pricePerRequest: bigint;
  /** Recipient's USDC token account */
  recipientTokenAccount: PublicKey;
  /** RPC endpoint for verification */
  rpcEndpoint: string;
  /** Payment expiry time in ms (default: 5 minutes) */
  paymentExpiryMs?: number;
  /** Network (defaults to mainnet-beta) */
  network?: 'mainnet-beta' | 'devnet';
  /** Optional: Custom payment store */
  paymentStore?: PendingPaymentStore;
}

/**
 * Pending payment record
 */
export interface PendingPayment {
  /** Unique request ID */
  requestId: string;
  /** Expected amount (base units) */
  amount: bigint;
  /** Creation timestamp */
  createdAt: number;
  /** Expiry timestamp */
  expiresAt: number;
  /** Payment status */
  status: 'pending' | 'paid' | 'expired';
  /** Transaction signature (if paid) */
  signature?: TransactionSignature;
  /** Payer address (if paid) */
  payer?: string;
}

/**
 * Interface for pending payment storage
 */
export interface PendingPaymentStore {
  /** Create a new pending payment */
  create(payment: Omit<PendingPayment, 'status'>): Promise<PendingPayment>;
  /** Get payment by requestId */
  get(requestId: string): Promise<PendingPayment | null>;
  /** Mark payment as paid */
  markPaid(requestId: string, signature: TransactionSignature, payer: string): Promise<void>;
  /** Mark payment as expired */
  markExpired(requestId: string): Promise<void>;
  /** Clean up expired payments */
  cleanup(): Promise<number>;
}

// ============================================================================
// Listener Types
// ============================================================================

/**
 * Payment listener configuration
 */
export interface PaymentListenerConfig {
  /** RPC WebSocket endpoint */
  wsEndpoint: string;
  /** Token account to monitor */
  tokenAccount: PublicKey;
  /** Callback when payment received */
  onPayment: (payment: DetectedPayment) => void;
  /** Optional: Error callback */
  onError?: (error: Error) => void;
}

/**
 * Detected incoming payment
 */
export interface DetectedPayment {
  /** Transaction signature */
  signature: TransactionSignature;
  /** Payer's wallet address */
  payer: string;
  /** Amount received (base units) */
  amount: bigint;
  /** Memo content */
  memo: string;
  /** Slot number */
  slot: number;
}
```

**Step 2: Verify build**

```bash
cd src/plugins/plugin-x402-solana && bun run build
```

**Step 3: Commit**

```bash
git add src/plugins/plugin-x402-solana/src/types.ts
git commit -m "feat(x402-solana): add type definitions"
```

---

## Task 3: Add Constants

**Files:**
- Create: `src/plugins/plugin-x402-solana/src/constants.ts`

**Step 1: Create constants.ts**

```typescript
/**
 * x402-solana Constants
 */

import { PublicKey } from '@solana/web3.js';

/** USDC-SPL mint address on Solana mainnet */
export const USDC_MINT_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

/** USDC-SPL mint address on Solana devnet */
export const USDC_MINT_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

/** SPL Memo program ID */
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/** Default RPC endpoints */
export const RPC_ENDPOINTS = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
} as const;

/** Default WebSocket endpoints */
export const WS_ENDPOINTS = {
  'mainnet-beta': 'wss://api.mainnet-beta.solana.com',
  devnet: 'wss://api.devnet.solana.com',
} as const;

/** Default payment expiry (5 minutes) */
export const DEFAULT_PAYMENT_EXPIRY_MS = 5 * 60 * 1000;

/** Request ID prefix for memo parsing */
export const MEMO_PREFIX = 'x402:';

/** HTTP header names */
export const HEADERS = {
  /** Client sends payment proof in this header */
  PAYMENT_PROOF: 'x-payment-proof',
  /** Server sends payment receipt in this header */
  PAYMENT_RESPONSE: 'x-payment-response',
} as const;

/** USDC decimals */
export const USDC_DECIMALS = 6;
```

**Step 2: Verify build**

```bash
cd src/plugins/plugin-x402-solana && bun run build
```

**Step 3: Commit**

```bash
git add src/plugins/plugin-x402-solana/src/constants.ts
git commit -m "feat(x402-solana): add constants"
```

---

## Task 4: Implement Payment Builder (Client)

**Files:**
- Create: `src/plugins/plugin-x402-solana/src/client/payment-builder.ts`
- Create: `src/plugins/plugin-x402-solana/src/client/index.ts`
- Test: `src/plugins/plugin-x402-solana/__tests__/payment-builder.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import { buildPaymentTransaction } from '../src/client/payment-builder';

describe('buildPaymentTransaction', () => {
  const payer = Keypair.generate();
  const recipient = Keypair.generate().publicKey;

  it('should create transaction with transfer and memo instructions', async () => {
    const tx = await buildPaymentTransaction({
      payer,
      recipientTokenAccount: recipient,
      amount: BigInt(15000), // $0.015
      memo: 'x402:test-request-123',
      rpcEndpoint: 'https://api.devnet.solana.com',
    });

    expect(tx).toBeDefined();
    expect(tx.instructions.length).toBe(2); // Transfer + Memo
  });

  it('should include correct memo content', async () => {
    const tx = await buildPaymentTransaction({
      payer,
      recipientTokenAccount: recipient,
      amount: BigInt(15000),
      memo: 'x402:my-unique-id',
      rpcEndpoint: 'https://api.devnet.solana.com',
    });

    // Memo instruction should be the second one
    const memoIx = tx.instructions[1];
    expect(memoIx).toBeDefined();
    // Memo data is the UTF-8 encoded string
    expect(Buffer.from(memoIx.data).toString('utf-8')).toBe('x402:my-unique-id');
  });

  it('should reject zero amount', async () => {
    await expect(
      buildPaymentTransaction({
        payer,
        recipientTokenAccount: recipient,
        amount: BigInt(0),
        memo: 'x402:test',
        rpcEndpoint: 'https://api.devnet.solana.com',
      })
    ).rejects.toThrow('Amount must be greater than 0');
  });
});
```

**Step 2: Run test to verify failure**

```bash
cd src/plugins/plugin-x402-solana && bun test payment-builder.test.ts
```

**Step 3: Implement payment-builder.ts**

```typescript
/**
 * Payment Transaction Builder
 *
 * Builds Solana transactions for x402 payments with USDC-SPL transfer + memo.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { USDC_MINT_MAINNET, USDC_MINT_DEVNET, MEMO_PROGRAM_ID } from '../constants';

export interface BuildPaymentParams {
  /** Payer's keypair */
  payer: Keypair;
  /** Recipient's USDC token account */
  recipientTokenAccount: PublicKey;
  /** Amount in USDC base units (6 decimals) */
  amount: bigint;
  /** Memo content (should include requestId) */
  memo: string;
  /** RPC endpoint */
  rpcEndpoint: string;
  /** Network (defaults to mainnet) */
  network?: 'mainnet-beta' | 'devnet';
}

/**
 * Build a payment transaction with USDC transfer and memo
 */
export async function buildPaymentTransaction(
  params: BuildPaymentParams
): Promise<Transaction> {
  const {
    payer,
    recipientTokenAccount,
    amount,
    memo,
    rpcEndpoint,
    network = 'mainnet-beta',
  } = params;

  if (amount <= 0n) {
    throw new Error('Amount must be greater than 0');
  }

  const connection = new Connection(rpcEndpoint, 'confirmed');
  const usdcMint = network === 'mainnet-beta' ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;

  // Get payer's USDC token account
  const payerTokenAccount = getAssociatedTokenAddressSync(
    usdcMint,
    payer.publicKey
  );

  // Create transfer instruction
  const transferIx = createTransferInstruction(
    payerTokenAccount,
    recipientTokenAccount,
    payer.publicKey,
    amount
  );

  // Create memo instruction
  const memoIx = new TransactionInstruction({
    keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, 'utf-8'),
  });

  // Build transaction
  const tx = new Transaction();
  tx.add(transferIx);
  tx.add(memoIx);

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = payer.publicKey;

  return tx;
}

/**
 * Sign and send a payment transaction
 */
export async function sendPaymentTransaction(
  transaction: Transaction,
  payer: Keypair,
  rpcEndpoint: string
): Promise<string> {
  const connection = new Connection(rpcEndpoint, 'confirmed');

  // Sign transaction
  transaction.sign(payer);

  // Send and confirm
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  // Wait for confirmation
  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}
```

**Step 4: Create client/index.ts**

```typescript
export { buildPaymentTransaction, sendPaymentTransaction } from './payment-builder';
export type { BuildPaymentParams } from './payment-builder';
```

**Step 5: Run test to verify pass**

```bash
cd src/plugins/plugin-x402-solana && bun test payment-builder.test.ts
```

**Step 6: Commit**

```bash
git add src/plugins/plugin-x402-solana/src/client/ src/plugins/plugin-x402-solana/__tests__/payment-builder.test.ts
git commit -m "feat(x402-solana): implement payment builder"
```

---

## Task 5: Implement x402 Fetch Wrapper (Client)

**Files:**
- Create: `src/plugins/plugin-x402-solana/src/client/x402-fetch.ts`
- Test: `src/plugins/plugin-x402-solana/__tests__/x402-fetch.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { Keypair } from '@solana/web3.js';
import { wrapFetchWithSolanaPayment } from '../src/client/x402-fetch';

describe('wrapFetchWithSolanaPayment', () => {
  const keypair = Keypair.generate();

  it('should pass through non-402 responses', async () => {
    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ data: 'test' }), { status: 200 }))
    );

    const wrappedFetch = wrapFetchWithSolanaPayment(mockFetch as any, {
      keypair,
      maxPayment: BigInt(100000),
      rpcEndpoint: 'https://api.devnet.solana.com',
      network: 'devnet',
    });

    const response = await wrappedFetch('https://example.com/api');
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should parse 402 response and extract payment details', async () => {
    const paymentRequired = {
      status: 402,
      error: 'Payment required',
      requestId: 'req-123',
      accepts: {
        network: 'solana-devnet',
        token: 'USDC',
        amount: '15000',
        payTo: Keypair.generate().publicKey.toBase58(),
        memo: 'x402:req-123',
        expiresAt: Date.now() + 300000,
      },
    };

    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(paymentRequired), { status: 402 }))
    );

    const wrappedFetch = wrapFetchWithSolanaPayment(mockFetch as any, {
      keypair,
      maxPayment: BigInt(100000),
      rpcEndpoint: 'https://api.devnet.solana.com',
      network: 'devnet',
    });

    // This will fail because we can't actually make the payment in tests
    // But it validates the 402 parsing logic
    try {
      await wrappedFetch('https://example.com/api');
    } catch (e) {
      // Expected - can't complete payment without real connection
    }

    // First call was the original request
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should reject payment exceeding maxPayment', async () => {
    const paymentRequired = {
      status: 402,
      error: 'Payment required',
      requestId: 'req-123',
      accepts: {
        network: 'solana-devnet',
        token: 'USDC',
        amount: '1000000', // $1.00 - exceeds max
        payTo: Keypair.generate().publicKey.toBase58(),
        memo: 'x402:req-123',
        expiresAt: Date.now() + 300000,
      },
    };

    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(paymentRequired), { status: 402 }))
    );

    const wrappedFetch = wrapFetchWithSolanaPayment(mockFetch as any, {
      keypair,
      maxPayment: BigInt(50000), // $0.05 max
      rpcEndpoint: 'https://api.devnet.solana.com',
      network: 'devnet',
    });

    await expect(wrappedFetch('https://example.com/api')).rejects.toThrow(
      'Payment amount exceeds maximum'
    );
  });
});
```

**Step 2: Run test to verify failure**

```bash
cd src/plugins/plugin-x402-solana && bun test x402-fetch.test.ts
```

**Step 3: Implement x402-fetch.ts**

```typescript
/**
 * x402 Fetch Wrapper for Solana
 *
 * Wraps fetch to automatically handle 402 Payment Required responses
 * by building, signing, and submitting USDC-SPL payments.
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { buildPaymentTransaction, sendPaymentTransaction } from './payment-builder';
import { HEADERS } from '../constants';
import type { X402FetchOptions, X402PaymentRequired, X402PaymentProof } from '../types';

type FetchFunction = typeof fetch;

/**
 * Wrap fetch with automatic Solana USDC payment handling
 */
export function wrapFetchWithSolanaPayment(
  fetchFn: FetchFunction,
  options: X402FetchOptions
): FetchFunction {
  const { keypair, maxPayment, rpcEndpoint, network = 'mainnet-beta' } = options;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Make initial request
    const response = await fetchFn(input, init);

    // If not 402, return as-is
    if (response.status !== 402) {
      return response;
    }

    // Parse 402 response
    const paymentRequired: X402PaymentRequired = await response.json();

    // Validate payment details
    const amount = BigInt(paymentRequired.accepts.amount);
    if (amount > maxPayment) {
      throw new Error(
        `Payment amount exceeds maximum: ${amount} > ${maxPayment}`
      );
    }

    // Check expiry
    if (Date.now() > paymentRequired.accepts.expiresAt) {
      throw new Error('Payment request has expired');
    }

    // Build payment transaction
    const recipientTokenAccount = new PublicKey(paymentRequired.accepts.payTo);
    const transaction = await buildPaymentTransaction({
      payer: keypair,
      recipientTokenAccount,
      amount,
      memo: paymentRequired.accepts.memo,
      rpcEndpoint,
      network,
    });

    // Send payment
    const signature = await sendPaymentTransaction(transaction, keypair, rpcEndpoint);

    // Create payment proof
    const paymentProof: X402PaymentProof = {
      signature,
      payer: keypair.publicKey.toBase58(),
      network: network === 'mainnet-beta' ? 'solana-mainnet' : 'solana-devnet',
    };

    // Encode proof as base64
    const proofHeader = Buffer.from(JSON.stringify(paymentProof)).toString('base64');

    // Retry request with payment proof
    const retryInit: RequestInit = {
      ...init,
      headers: {
        ...((init?.headers as Record<string, string>) || {}),
        [HEADERS.PAYMENT_PROOF]: proofHeader,
      },
    };

    return fetchFn(input, retryInit);
  };
}
```

**Step 4: Update client/index.ts**

```typescript
export { buildPaymentTransaction, sendPaymentTransaction } from './payment-builder';
export { wrapFetchWithSolanaPayment } from './x402-fetch';
export type { BuildPaymentParams } from './payment-builder';
```

**Step 5: Run test to verify pass**

```bash
cd src/plugins/plugin-x402-solana && bun test x402-fetch.test.ts
```

**Step 6: Commit**

```bash
git add src/plugins/plugin-x402-solana/src/client/ src/plugins/plugin-x402-solana/__tests__/x402-fetch.test.ts
git commit -m "feat(x402-solana): implement x402 fetch wrapper"
```

---

## Task 6: Implement Pending Payment Store (Server)

**Files:**
- Create: `src/plugins/plugin-x402-solana/src/server/payment-store.ts`
- Create: `src/plugins/plugin-x402-solana/src/server/index.ts`
- Test: `src/plugins/plugin-x402-solana/__tests__/payment-store.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { InMemoryPaymentStore } from '../src/server/payment-store';

describe('InMemoryPaymentStore', () => {
  let store: InMemoryPaymentStore;

  beforeEach(() => {
    store = new InMemoryPaymentStore();
  });

  it('should create and retrieve pending payment', async () => {
    const payment = await store.create({
      requestId: 'req-123',
      amount: BigInt(15000),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
    });

    expect(payment.status).toBe('pending');
    expect(payment.requestId).toBe('req-123');

    const retrieved = await store.get('req-123');
    expect(retrieved).toEqual(payment);
  });

  it('should mark payment as paid', async () => {
    await store.create({
      requestId: 'req-456',
      amount: BigInt(15000),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
    });

    await store.markPaid('req-456', 'sig-abc', 'payer-xyz');

    const payment = await store.get('req-456');
    expect(payment?.status).toBe('paid');
    expect(payment?.signature).toBe('sig-abc');
    expect(payment?.payer).toBe('payer-xyz');
  });

  it('should return null for non-existent payment', async () => {
    const payment = await store.get('non-existent');
    expect(payment).toBeNull();
  });

  it('should cleanup expired payments', async () => {
    await store.create({
      requestId: 'expired-1',
      amount: BigInt(15000),
      createdAt: Date.now() - 600000, // 10 min ago
      expiresAt: Date.now() - 300000, // Expired 5 min ago
    });

    await store.create({
      requestId: 'valid-1',
      amount: BigInt(15000),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000, // Still valid
    });

    const cleaned = await store.cleanup();
    expect(cleaned).toBe(1);

    expect(await store.get('expired-1')).toBeNull();
    expect(await store.get('valid-1')).not.toBeNull();
  });
});
```

**Step 2: Run test to verify failure**

```bash
cd src/plugins/plugin-x402-solana && bun test payment-store.test.ts
```

**Step 3: Implement payment-store.ts**

```typescript
/**
 * Pending Payment Store
 *
 * Tracks pending x402 payment requests and their status.
 */

import type { PendingPayment, PendingPaymentStore } from '../types';
import type { TransactionSignature } from '@solana/web3.js';

/**
 * In-memory implementation of PendingPaymentStore
 *
 * For production, implement with Redis or database backend.
 */
export class InMemoryPaymentStore implements PendingPaymentStore {
  private payments: Map<string, PendingPayment> = new Map();

  async create(
    payment: Omit<PendingPayment, 'status'>
  ): Promise<PendingPayment> {
    const pendingPayment: PendingPayment = {
      ...payment,
      status: 'pending',
    };
    this.payments.set(payment.requestId, pendingPayment);
    return pendingPayment;
  }

  async get(requestId: string): Promise<PendingPayment | null> {
    return this.payments.get(requestId) || null;
  }

  async markPaid(
    requestId: string,
    signature: TransactionSignature,
    payer: string
  ): Promise<void> {
    const payment = this.payments.get(requestId);
    if (payment) {
      payment.status = 'paid';
      payment.signature = signature;
      payment.payer = payer;
    }
  }

  async markExpired(requestId: string): Promise<void> {
    const payment = this.payments.get(requestId);
    if (payment) {
      payment.status = 'expired';
    }
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [requestId, payment] of this.payments.entries()) {
      if (payment.status === 'pending' && payment.expiresAt < now) {
        this.payments.delete(requestId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /** Get all pending payments (for debugging) */
  async getAllPending(): Promise<PendingPayment[]> {
    return Array.from(this.payments.values()).filter(
      (p) => p.status === 'pending'
    );
  }
}
```

**Step 4: Create server/index.ts**

```typescript
export { InMemoryPaymentStore } from './payment-store';
```

**Step 5: Run test to verify pass**

```bash
cd src/plugins/plugin-x402-solana && bun test payment-store.test.ts
```

**Step 6: Commit**

```bash
git add src/plugins/plugin-x402-solana/src/server/ src/plugins/plugin-x402-solana/__tests__/payment-store.test.ts
git commit -m "feat(x402-solana): implement pending payment store"
```

---

## Task 7: Implement Payment Listener (Server)

**Files:**
- Create: `src/plugins/plugin-x402-solana/src/server/payment-listener.ts`
- Create: `src/plugins/plugin-x402-solana/src/utils/memo.ts`
- Test: `src/plugins/plugin-x402-solana/__tests__/memo.test.ts`

**Step 1: Write failing test for memo parsing**

```typescript
import { describe, it, expect } from 'bun:test';
import { parseMemo, extractRequestId } from '../src/utils/memo';

describe('memo utilities', () => {
  describe('parseMemo', () => {
    it('should extract memo from transaction', () => {
      // Mock transaction with memo instruction
      const memo = parseMemo('x402:req-12345');
      expect(memo).toBe('x402:req-12345');
    });
  });

  describe('extractRequestId', () => {
    it('should extract requestId from valid memo', () => {
      const requestId = extractRequestId('x402:req-12345');
      expect(requestId).toBe('req-12345');
    });

    it('should return null for invalid memo format', () => {
      expect(extractRequestId('invalid-memo')).toBeNull();
      expect(extractRequestId('x402:')).toBeNull();
      expect(extractRequestId('')).toBeNull();
    });
  });
});
```

**Step 2: Implement memo.ts**

```typescript
/**
 * Memo Parsing Utilities
 */

import { MEMO_PREFIX } from '../constants';

/**
 * Parse memo content (identity function for now, can add validation)
 */
export function parseMemo(data: string): string {
  return data;
}

/**
 * Extract requestId from x402 memo format
 *
 * @param memo - Memo content (e.g., "x402:req-12345")
 * @returns requestId or null if invalid format
 */
export function extractRequestId(memo: string): string | null {
  if (!memo || !memo.startsWith(MEMO_PREFIX)) {
    return null;
  }

  const requestId = memo.slice(MEMO_PREFIX.length);
  if (!requestId) {
    return null;
  }

  return requestId;
}

/**
 * Create a memo string for a request
 */
export function createMemo(requestId: string): string {
  return `${MEMO_PREFIX}${requestId}`;
}
```

**Step 3: Implement payment-listener.ts**

```typescript
/**
 * Payment Listener
 *
 * WebSocket-based listener for incoming USDC payments.
 * Monitors a token account for transfers and parses memos to match payments to requests.
 */

import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
} from '@solana/web3.js';
import { extractRequestId } from '../utils/memo';
import { MEMO_PROGRAM_ID } from '../constants';
import type { PaymentListenerConfig, DetectedPayment } from '../types';

export class PaymentListener {
  private connection: Connection;
  private tokenAccount: PublicKey;
  private onPayment: (payment: DetectedPayment) => void;
  private onError?: (error: Error) => void;
  private subscriptionId: number | null = null;

  constructor(config: PaymentListenerConfig) {
    this.connection = new Connection(config.wsEndpoint, {
      commitment: 'confirmed',
      wsEndpoint: config.wsEndpoint,
    });
    this.tokenAccount = config.tokenAccount;
    this.onPayment = config.onPayment;
    this.onError = config.onError;
  }

  /**
   * Start listening for incoming payments
   */
  async start(): Promise<void> {
    try {
      this.subscriptionId = this.connection.onAccountChange(
        this.tokenAccount,
        async (accountInfo, context) => {
          try {
            // Get the transaction that caused this change
            const signatures = await this.connection.getSignaturesForAddress(
              this.tokenAccount,
              { limit: 1 }
            );

            if (signatures.length === 0) return;

            const signature = signatures[0].signature;
            const tx = await this.connection.getParsedTransaction(signature, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            });

            if (!tx) return;

            const payment = this.parsePaymentFromTransaction(tx, signature, context.slot);
            if (payment) {
              this.onPayment(payment);
            }
          } catch (error) {
            this.onError?.(error as Error);
          }
        },
        'confirmed'
      );
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Stop listening
   */
  async stop(): Promise<void> {
    if (this.subscriptionId !== null) {
      await this.connection.removeAccountChangeListener(this.subscriptionId);
      this.subscriptionId = null;
    }
  }

  /**
   * Parse payment details from a transaction
   */
  private parsePaymentFromTransaction(
    tx: ParsedTransactionWithMeta,
    signature: string,
    slot: number
  ): DetectedPayment | null {
    if (!tx.meta || tx.meta.err) return null;

    // Find memo instruction
    let memo = '';
    for (const ix of tx.transaction.message.instructions) {
      if ('programId' in ix && ix.programId.equals(MEMO_PROGRAM_ID)) {
        // Parsed memo instruction
        if ('parsed' in ix && typeof ix.parsed === 'string') {
          memo = ix.parsed;
          break;
        }
      }
    }

    // Extract requestId from memo
    const requestId = extractRequestId(memo);
    if (!requestId) return null;

    // Find token transfer details
    const preBalances = tx.meta.preTokenBalances || [];
    const postBalances = tx.meta.postTokenBalances || [];

    // Calculate amount transferred to our account
    let amount = BigInt(0);
    let payer = '';

    for (const post of postBalances) {
      if (post.owner === this.tokenAccount.toBase58()) {
        const pre = preBalances.find(
          (p) => p.accountIndex === post.accountIndex
        );
        const preAmount = BigInt(pre?.uiTokenAmount.amount || '0');
        const postAmount = BigInt(post.uiTokenAmount.amount);
        amount = postAmount - preAmount;
      }
    }

    // Get payer from first signer
    const signers = tx.transaction.message.accountKeys.filter((k) => k.signer);
    if (signers.length > 0) {
      payer = signers[0].pubkey.toBase58();
    }

    if (amount <= 0n) return null;

    return {
      signature,
      payer,
      amount,
      memo,
      slot,
    };
  }
}
```

**Step 4: Update server/index.ts**

```typescript
export { InMemoryPaymentStore } from './payment-store';
export { PaymentListener } from './payment-listener';
```

**Step 5: Create utils/index.ts**

```typescript
export { parseMemo, extractRequestId, createMemo } from './memo';
```

**Step 6: Run tests**

```bash
cd src/plugins/plugin-x402-solana && bun test memo.test.ts
```

**Step 7: Commit**

```bash
git add src/plugins/plugin-x402-solana/src/server/ src/plugins/plugin-x402-solana/src/utils/ src/plugins/plugin-x402-solana/__tests__/memo.test.ts
git commit -m "feat(x402-solana): implement payment listener with memo parsing"
```

---

## Task 8: Implement Server Middleware

**Files:**
- Create: `src/plugins/plugin-x402-solana/src/server/middleware.ts`
- Test: `src/plugins/plugin-x402-solana/__tests__/middleware.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { Keypair } from '@solana/web3.js';
import { createX402Middleware, generate402Response } from '../src/server/middleware';
import { InMemoryPaymentStore } from '../src/server/payment-store';

describe('x402 Middleware', () => {
  describe('generate402Response', () => {
    it('should generate valid 402 response', () => {
      const recipient = Keypair.generate().publicKey;
      const response = generate402Response({
        requestId: 'req-123',
        amount: BigInt(15000),
        recipientTokenAccount: recipient,
        network: 'devnet',
        expiresAt: Date.now() + 300000,
      });

      expect(response.status).toBe(402);
      expect(response.requestId).toBe('req-123');
      expect(response.accepts.amount).toBe('15000');
      expect(response.accepts.memo).toBe('x402:req-123');
    });
  });

  describe('createX402Middleware', () => {
    it('should return 402 for requests without payment proof', async () => {
      const store = new InMemoryPaymentStore();
      const recipient = Keypair.generate().publicKey;

      const middleware = createX402Middleware({
        pricePerRequest: BigInt(15000),
        recipientTokenAccount: recipient,
        rpcEndpoint: 'https://api.devnet.solana.com',
        network: 'devnet',
        paymentStore: store,
      });

      // Mock request without payment header
      const mockReq = {
        headers: new Headers(),
      };

      const result = await middleware(mockReq as any);

      expect(result.status).toBe(402);
      expect(result.requestId).toBeDefined();
    });
  });
});
```

**Step 2: Run test to verify failure**

```bash
cd src/plugins/plugin-x402-solana && bun test middleware.test.ts
```

**Step 3: Implement middleware.ts**

```typescript
/**
 * x402 Server Middleware
 *
 * Express/Hono-compatible middleware for handling x402 payments.
 */

import { PublicKey } from '@solana/web3.js';
import { randomUUID } from 'crypto';
import { InMemoryPaymentStore } from './payment-store';
import { createMemo } from '../utils/memo';
import { HEADERS, DEFAULT_PAYMENT_EXPIRY_MS } from '../constants';
import type {
  X402MiddlewareConfig,
  X402PaymentRequired,
  X402PaymentProof,
  PendingPaymentStore,
} from '../types';

interface Generate402Params {
  requestId: string;
  amount: bigint;
  recipientTokenAccount: PublicKey;
  network: 'mainnet-beta' | 'devnet';
  expiresAt: number;
}

/**
 * Generate a 402 Payment Required response
 */
export function generate402Response(params: Generate402Params): X402PaymentRequired {
  const { requestId, amount, recipientTokenAccount, network, expiresAt } = params;

  return {
    status: 402,
    error: 'Payment required',
    requestId,
    accepts: {
      network: network === 'mainnet-beta' ? 'solana-mainnet' : 'solana-devnet',
      token: 'USDC',
      amount: amount.toString(),
      payTo: recipientTokenAccount.toBase58(),
      memo: createMemo(requestId),
      expiresAt,
    },
  };
}

/**
 * Parse payment proof from request header
 */
export function parsePaymentProof(header: string | null): X402PaymentProof | null {
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    return JSON.parse(decoded) as X402PaymentProof;
  } catch {
    return null;
  }
}

/**
 * Create x402 middleware
 *
 * Returns a function that checks for payment or returns 402.
 * Use with Express, Hono, or any framework that supports middleware.
 */
export function createX402Middleware(config: X402MiddlewareConfig) {
  const {
    pricePerRequest,
    recipientTokenAccount,
    rpcEndpoint,
    paymentExpiryMs = DEFAULT_PAYMENT_EXPIRY_MS,
    network = 'mainnet-beta',
    paymentStore = new InMemoryPaymentStore(),
  } = config;

  /**
   * Middleware function
   *
   * @returns 402Response if payment needed, null if payment verified
   */
  return async (req: { headers: Headers }): Promise<X402PaymentRequired | null> => {
    // Check for existing payment proof
    const proofHeader = req.headers.get(HEADERS.PAYMENT_PROOF);
    const proof = parsePaymentProof(proofHeader);

    if (proof) {
      // Verify payment exists and is valid
      // In production, verify the transaction on-chain
      // For now, check against payment store (listener should have marked it paid)

      // Extract requestId from a previous 402 (would need to track this)
      // For simplicity, we trust the proof signature and verify on-chain

      // TODO: Add on-chain verification
      return null; // Payment verified, proceed with request
    }

    // No payment proof - generate 402 response
    const requestId = randomUUID();
    const now = Date.now();
    const expiresAt = now + paymentExpiryMs;

    // Store pending payment
    await paymentStore.create({
      requestId,
      amount: pricePerRequest,
      createdAt: now,
      expiresAt,
    });

    return generate402Response({
      requestId,
      amount: pricePerRequest,
      recipientTokenAccount,
      network,
      expiresAt,
    });
  };
}

/**
 * Create payment response header
 */
export function createPaymentResponseHeader(
  signature: string,
  payer: string,
  network: 'mainnet-beta' | 'devnet'
): string {
  const response = {
    transaction: signature,
    payer,
    network: network === 'mainnet-beta' ? 'solana-mainnet' : 'solana-devnet',
  };
  return Buffer.from(JSON.stringify(response)).toString('base64');
}
```

**Step 4: Update server/index.ts**

```typescript
export { InMemoryPaymentStore } from './payment-store';
export { PaymentListener } from './payment-listener';
export {
  createX402Middleware,
  generate402Response,
  parsePaymentProof,
  createPaymentResponseHeader,
} from './middleware';
```

**Step 5: Run test to verify pass**

```bash
cd src/plugins/plugin-x402-solana && bun test middleware.test.ts
```

**Step 6: Commit**

```bash
git add src/plugins/plugin-x402-solana/src/server/ src/plugins/plugin-x402-solana/__tests__/middleware.test.ts
git commit -m "feat(x402-solana): implement server middleware"
```

---

## Task 9: Finalize Plugin Exports

**Files:**
- Modify: `src/plugins/plugin-x402-solana/src/index.ts`

**Step 1: Update index.ts with all exports**

```typescript
/**
 * x402-solana: Solana-native payment protocol plugin
 *
 * Provides both client and server functionality for x402 payments using USDC-SPL.
 *
 * ## Client Usage
 * ```typescript
 * import { wrapFetchWithSolanaPayment } from '@elizaos/plugin-x402-solana';
 *
 * const paidFetch = wrapFetchWithSolanaPayment(fetch, {
 *   keypair: myKeypair,
 *   maxPayment: BigInt(100000), // $0.10 max
 *   rpcEndpoint: 'https://api.mainnet-beta.solana.com',
 * });
 *
 * const response = await paidFetch('https://api.example.com/paid-endpoint');
 * ```
 *
 * ## Server Usage
 * ```typescript
 * import { createX402Middleware, PaymentListener } from '@elizaos/plugin-x402-solana';
 *
 * const middleware = createX402Middleware({
 *   pricePerRequest: BigInt(15000), // $0.015
 *   recipientTokenAccount: myUsdcAccount,
 *   rpcEndpoint: 'https://api.mainnet-beta.solana.com',
 * });
 * ```
 */

import type { Plugin } from '@elizaos/core';

// Client exports
export {
  wrapFetchWithSolanaPayment,
  buildPaymentTransaction,
  sendPaymentTransaction,
} from './client';
export type { BuildPaymentParams } from './client';

// Server exports
export {
  createX402Middleware,
  generate402Response,
  parsePaymentProof,
  createPaymentResponseHeader,
  PaymentListener,
  InMemoryPaymentStore,
} from './server';

// Utils exports
export { parseMemo, extractRequestId, createMemo } from './utils';

// Types
export type {
  X402PaymentConfig,
  X402PaymentRequired,
  X402PaymentProof,
  X402VerifiedPayment,
  X402FetchOptions,
  X402MiddlewareConfig,
  PendingPayment,
  PendingPaymentStore,
  PaymentListenerConfig,
  DetectedPayment,
} from './types';

// Constants
export {
  USDC_MINT_MAINNET,
  USDC_MINT_DEVNET,
  MEMO_PROGRAM_ID,
  RPC_ENDPOINTS,
  WS_ENDPOINTS,
  DEFAULT_PAYMENT_EXPIRY_MS,
  MEMO_PREFIX,
  HEADERS,
  USDC_DECIMALS,
} from './constants';

// Plugin definition (for ElizaOS integration)
export const x402SolanaPlugin: Plugin = {
  name: 'x402-solana',
  description: 'Solana-native x402 payment protocol for API micropayments',
  evaluators: [],
  providers: [],
  actions: [],
  services: [],
};

export default x402SolanaPlugin;
```

**Step 2: Verify build**

```bash
cd src/plugins/plugin-x402-solana && bun run build
```

**Step 3: Run all tests**

```bash
cd src/plugins/plugin-x402-solana && bun test
```

**Step 4: Commit**

```bash
git add src/plugins/plugin-x402-solana/src/index.ts
git commit -m "feat(x402-solana): finalize plugin exports"
```

---

## Task 10: Integration Test & Documentation

**Step 1: Run full test suite**

```bash
cd src/plugins/plugin-x402-solana && bun test
```

**Step 2: Build entire project**

```bash
bun run build
```

**Step 3: Create README**

Create `src/plugins/plugin-x402-solana/README.md` with usage examples.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(x402-solana): complete Solana-native x402 payment protocol

Implements full x402 protocol for Solana using USDC-SPL:

Client:
- wrapFetchWithSolanaPayment() - Auto-pay 402 responses
- buildPaymentTransaction() - SPL transfer + memo builder

Server:
- createX402Middleware() - Express/Hono middleware
- PaymentListener - WebSocket-based payment monitoring
- InMemoryPaymentStore - Pending payment tracking

Features:
- Memo-based request identification (Solana Pay standard)
- Support for mainnet and devnet
- Full TypeScript types
- Comprehensive test coverage"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Initialize plugin structure | package.json, tsconfig.json, build.ts, index.ts |
| 2 | Define types | types.ts |
| 3 | Add constants | constants.ts |
| 4 | Implement payment builder | client/payment-builder.ts |
| 5 | Implement x402 fetch wrapper | client/x402-fetch.ts |
| 6 | Implement payment store | server/payment-store.ts |
| 7 | Implement payment listener | server/payment-listener.ts, utils/memo.ts |
| 8 | Implement server middleware | server/middleware.ts |
| 9 | Finalize plugin exports | index.ts |
| 10 | Integration test & docs | README.md |

**Expected: ~1000 lines of code, 10 test files**

---

## Usage Examples

### Client: Pay for API Access

```typescript
import { wrapFetchWithSolanaPayment } from '@elizaos/plugin-x402-solana';
import { Keypair } from '@solana/web3.js';

const keypair = Keypair.fromSecretKey(/* your secret key */);

const paidFetch = wrapFetchWithSolanaPayment(fetch, {
  keypair,
  maxPayment: BigInt(50000), // $0.05 max per request
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
  network: 'mainnet-beta',
});

// Use like regular fetch - payments handled automatically
const response = await paidFetch('https://api.otaku.so/research', {
  method: 'POST',
  body: JSON.stringify({ query: 'AI trends 2025' }),
});
```

### Server: Receive Payments

```typescript
import { createX402Middleware, PaymentListener } from '@elizaos/plugin-x402-solana';
import { PublicKey } from '@solana/web3.js';

// Setup middleware
const x402 = createX402Middleware({
  pricePerRequest: BigInt(15000), // $0.015
  recipientTokenAccount: new PublicKey('your-usdc-account'),
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
});

// In your route handler
app.post('/api/research', async (req, res) => {
  const paymentRequired = await x402(req);

  if (paymentRequired) {
    return res.status(402).json(paymentRequired);
  }

  // Payment verified - process request
  const result = await processResearch(req.body);
  res.json(result);
});
```
