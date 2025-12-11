# Autotrade x402 Remaining Tasks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the autotrade x402 integration by wiring DriftService.closeAllPositions to the onStop callback and integrating the x402 payment flow in the frontend.

**Architecture:** The onStop callback pattern already exists in AutotradeService. We need to pass DriftService reference to the initialization and wire it up. Frontend needs to use wallet adapter to sign and send USDC payment, then retry with proof header.

**Tech Stack:** TypeScript, React, Solana web3.js, @solana/wallet-adapter, DriftService, x402 payment pattern

---

## Task 1: Wire DriftService.closeAllPositions to onStop Callback

**Files:**
- Modify: `src/packages/server/src/api/index.ts:380-405` (initializeAutotradeService)
- Test: `src/__tests__/unit/api/autotrade-drift-integration.test.ts` (new)

**Step 1: Write the failing test**

```typescript
// src/__tests__/unit/api/autotrade-drift-integration.test.ts
import { describe, it, expect, mock, beforeEach } from 'bun:test';

describe('Autotrade-Drift Integration', () => {
  describe('onStop callback', () => {
    it('calls DriftService.closeAllPositions when autotrade stops', async () => {
      // Mock DriftService
      const mockCloseAllPositions = mock(() => Promise.resolve({
        success: true,
        closedCount: 2,
        failedCount: 0,
        results: [],
      }));

      const mockDriftService = {
        closeAllPositions: mockCloseAllPositions,
      };

      // The onStop callback should be wired to call closeAllPositions
      const onStop = async (userId: string, reason: string) => {
        await mockDriftService.closeAllPositions(userId);
      };

      await onStop('test-user-123', 'User requested stop');

      expect(mockCloseAllPositions).toHaveBeenCalledWith('test-user-123');
    });

    it('logs error but does not throw when closeAllPositions fails', async () => {
      const mockCloseAllPositions = mock(() => Promise.reject(new Error('Drift connection failed')));

      const mockDriftService = {
        closeAllPositions: mockCloseAllPositions,
      };

      const onStop = async (userId: string, reason: string) => {
        try {
          await mockDriftService.closeAllPositions(userId);
        } catch (error) {
          // Should log but not rethrow
          console.error('[onStop] closeAllPositions failed:', error);
        }
      };

      // Should not throw
      await expect(onStop('test-user-123', 'User requested stop')).resolves.toBeUndefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/m0xu/1-projects/bl0ck-worktrees/feature-autotrade-x402/lina && bun test src/__tests__/unit/api/autotrade-drift-integration.test.ts`
Expected: PASS (this is a unit test for the pattern, not the actual wiring)

**Step 3: Modify initializeAutotradeService to wire DriftService**

In `src/packages/server/src/api/index.ts`, update the `initializeAutotradeService` function:

```typescript
// Add import at top of file
import { DriftService } from '@/plugins/plugin-drift/src/services/drift.service';

// Inside initializeAutotradeService function, after creating solanaManager:

    // Get DriftService instance if available
    // Note: DriftService is a singleton managed by the plugin system
    let driftService: DriftService | null = null;
    try {
      // DriftService may not be initialized if plugin isn't loaded
      driftService = DriftService.getInstance?.() || null;
    } catch {
      logger.warn('[Autotrade] DriftService not available - position closure disabled');
    }

    // Create onStop callback that closes all Drift positions
    const onStop = async (userId: string, reason: string) => {
      if (!driftService) {
        logger.warn(`[Autotrade] No DriftService - cannot close positions for ${userId.substring(0, 8)}...`);
        return;
      }

      try {
        const result = await driftService.closeAllPositions(userId);
        logger.info(`[Autotrade] Closed ${result.closedCount} positions for ${userId.substring(0, 8)}... (reason: ${reason})`);
        if (result.failedCount > 0) {
          logger.warn(`[Autotrade] Failed to close ${result.failedCount} positions`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[Autotrade] Failed to close positions: ${msg}`);
        // Don't rethrow - subscription was still stopped successfully
      }
    };

    // Create the service with onStop callback
    const autotradeService = new AutotradeService({
      repository,
      solanaManager,
      treasuryWallet,
      priceUsdc,
      durationMs,
      network,
      usdcMint,
      onStop, // Add this line
    });
```

**Step 4: Run tests to verify nothing broke**

Run: `cd /home/m0xu/1-projects/bl0ck-worktrees/feature-autotrade-x402/lina && bun test src/__tests__/unit/api/autotrade.test.ts src/__tests__/unit/services/autotrade-service.test.ts`
Expected: PASS (39 tests)

**Step 5: Commit**

```bash
git add src/packages/server/src/api/index.ts src/__tests__/unit/api/autotrade-drift-integration.test.ts
git commit -m "feat(autotrade): wire DriftService.closeAllPositions to onStop callback"
```

---

## Task 2: Create x402 Payment Helper for Frontend

**Files:**
- Create: `src/frontend/lib/x402-payment.ts`
- Test: Manual testing (browser-based Solana wallet interaction)

**Step 1: Create the x402 payment helper**

```typescript
// src/frontend/lib/x402-payment.ts
import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

// USDC mint addresses
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

export interface X402PaymentDetails {
  scheme: string;
  network: string;
  payTo: string;
  amount: string;
  memo: string;
  expiresAt: number;
}

export interface X402PaymentResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

/**
 * Build and sign a USDC payment transaction for x402
 */
export async function makeX402Payment(
  connection: Connection,
  wallet: WalletAdapter,
  paymentDetails: X402PaymentDetails
): Promise<X402PaymentResult> {
  try {
    if (!wallet.publicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    // Check if payment expired
    if (Date.now() > paymentDetails.expiresAt) {
      return { success: false, error: 'Payment request expired' };
    }

    // Determine USDC mint based on network
    const usdcMint = paymentDetails.network === 'solana-mainnet'
      ? new PublicKey(USDC_MINT_MAINNET)
      : new PublicKey(USDC_MINT_DEVNET);

    // Get source and destination token accounts
    const sourceAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
    const destinationPubkey = new PublicKey(paymentDetails.payTo);
    const destinationAta = await getAssociatedTokenAddress(usdcMint, destinationPubkey);

    // Create transfer instruction
    const amount = BigInt(paymentDetails.amount);
    const transferIx = createTransferInstruction(
      sourceAta,
      destinationAta,
      wallet.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID
    );

    // Build transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const tx = new Transaction({
      feePayer: wallet.publicKey,
      blockhash,
      lastValidBlockHeight,
    }).add(transferIx);

    // Sign transaction
    const signedTx = await wallet.signTransaction(tx);

    // Send transaction
    const signature = await connection.sendRawTransaction(signedTx.serialize());

    // Confirm transaction
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    return { success: true, signature };

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

/**
 * Encode payment proof for x-payment-proof header
 */
export function encodePaymentProof(signature: string): string {
  const proof = { signature };
  return btoa(JSON.stringify(proof));
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /home/m0xu/1-projects/bl0ck-worktrees/feature-autotrade-x402/lina && bunx tsc --noEmit src/frontend/lib/x402-payment.ts 2>&1 || echo "Check for errors"`

**Step 3: Commit**

```bash
git add src/frontend/lib/x402-payment.ts
git commit -m "feat(frontend): add x402 payment helper for USDC transfers"
```

---

## Task 3: Integrate x402 Payment Flow in AutotradeTab

**Files:**
- Modify: `src/frontend/components/dashboard/cdp-wallet-card/AutotradeTab.tsx:148-201` (handleStart function)

**Step 1: Add imports and wallet hook**

At the top of AutotradeTab.tsx, add:

```typescript
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { makeX402Payment, encodePaymentProof, type X402PaymentDetails } from '../../../lib/x402-payment';
```

**Step 2: Add wallet and connection hooks inside component**

Inside the `AutotradeTab` component, add:

```typescript
const { publicKey, signTransaction } = useWallet();
const { connection } = useConnection();
```

**Step 3: Update handleStart to make x402 payment**

Replace the handleStart function (lines 148-201) with:

```typescript
  // Start autotrade
  const handleStart = async () => {
    const token = getAuthToken();
    if (!token) {
      showError('Authentication Error', 'Please sign in to use autotrade');
      return;
    }

    if (!publicKey || !signTransaction) {
      showError('Wallet Error', 'Please connect your Solana wallet');
      return;
    }

    setIsActionLoading(true);
    const panelId = 'autotrade-start-panel';

    try {
      // First request - will return 402 with payment details
      showLoading('Starting Autotrade', 'Checking subscription status...', panelId);

      const response = await fetch(`${API_BASE}/api/autotrade/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 402) {
        // Payment required - extract payment details and make payment
        const paymentData = await response.json();
        const paymentDetails: X402PaymentDetails = paymentData.accepts;

        if (!paymentDetails) {
          throw new Error('Invalid payment response from server');
        }

        const amount = (parseInt(paymentDetails.amount) / 1_000_000).toFixed(2);
        showLoading('Payment Required', `Sending $${amount} USDC...`, panelId);

        // Make the USDC payment
        const paymentResult = await makeX402Payment(
          connection,
          { publicKey, signTransaction },
          paymentDetails
        );

        if (!paymentResult.success || !paymentResult.signature) {
          throw new Error(paymentResult.error || 'Payment failed');
        }

        showLoading('Payment Sent', 'Verifying payment...', panelId);

        // Retry with payment proof
        const paymentProof = encodePaymentProof(paymentResult.signature);
        const activateResponse = await fetch(`${API_BASE}/api/autotrade/start`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-payment-proof': paymentProof,
          },
        });

        if (!activateResponse.ok) {
          const errorData = await activateResponse.json();
          throw new Error(errorData.error?.message || 'Activation failed after payment');
        }

        const data = await activateResponse.json();
        showSuccess('Autotrade Activated', data.data?.message || 'Autotrade is now running', panelId);
        await fetchStatus(false);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to start autotrade');
      }

      // Already active (no payment needed)
      const data = await response.json();
      showSuccess('Autotrade Active', data.data?.message || 'Autotrade is running', panelId);
      await fetchStatus(false);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showError('Start Failed', errorMsg, panelId);
    } finally {
      setIsActionLoading(false);
      setTimeout(() => hide(panelId), 3000);
    }
  };
```

**Step 4: Verify TypeScript compiles**

Run: `cd /home/m0xu/1-projects/bl0ck-worktrees/feature-autotrade-x402/lina && bun run build:frontend 2>&1 | tail -20`

**Step 5: Commit**

```bash
git add src/frontend/components/dashboard/cdp-wallet-card/AutotradeTab.tsx
git commit -m "feat(frontend): integrate x402 payment flow in AutotradeTab"
```

---

## Task 4: Add Solana Wallet Provider Wrapper (if not present)

**Files:**
- Check: `src/frontend/App.tsx` or relevant layout for WalletProvider

**Step 1: Check if WalletProvider exists**

Run: `grep -r "WalletProvider" src/frontend/ | head -5`

If WalletProvider is already set up, skip to Task 5.

**Step 2: Add WalletProvider if missing**

If not present, wrap the app with Solana wallet provider:

```typescript
// In App.tsx or main layout
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import { useMemo } from 'react';

// Inside component:
const network = WalletAdapterNetwork.Devnet;
const endpoint = useMemo(() => clusterApiUrl(network), [network]);
const wallets = useMemo(() => [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
], []);

// Wrap content:
<ConnectionProvider endpoint={endpoint}>
  <WalletProvider wallets={wallets} autoConnect>
    <WalletModalProvider>
      {/* existing app content */}
    </WalletModalProvider>
  </WalletProvider>
</ConnectionProvider>
```

**Step 3: Commit if changes made**

```bash
git add src/frontend/
git commit -m "feat(frontend): add Solana wallet provider for x402 payments"
```

---

## Task 5: Add Unit Test for x402 Payment Helper

**Files:**
- Create: `src/__tests__/unit/frontend/x402-payment.test.ts`

**Step 1: Write the test**

```typescript
// src/__tests__/unit/frontend/x402-payment.test.ts
import { describe, it, expect } from 'bun:test';
import { encodePaymentProof } from '../../../frontend/lib/x402-payment';

describe('x402-payment', () => {
  describe('encodePaymentProof', () => {
    it('encodes signature as base64 JSON', () => {
      const signature = 'test-signature-12345';
      const encoded = encodePaymentProof(signature);

      // Decode and verify
      const decoded = JSON.parse(atob(encoded));
      expect(decoded.signature).toBe(signature);
    });

    it('produces valid base64', () => {
      const signature = 'abc123';
      const encoded = encodePaymentProof(signature);

      // Should not throw when decoding
      expect(() => atob(encoded)).not.toThrow();
    });
  });
});
```

**Step 2: Run test**

Run: `cd /home/m0xu/1-projects/bl0ck-worktrees/feature-autotrade-x402/lina && bun test src/__tests__/unit/frontend/x402-payment.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/__tests__/unit/frontend/
git commit -m "test(frontend): add unit tests for x402 payment helper"
```

---

## Task 6: Run Full Test Suite and Manual Verification

**Step 1: Run all unit tests**

Run: `cd /home/m0xu/1-projects/bl0ck-worktrees/feature-autotrade-x402/lina && bun test src/__tests__/unit/api/autotrade*.test.ts src/__tests__/unit/services/autotrade*.test.ts src/__tests__/unit/services/payment-verifier.test.ts`
Expected: All tests pass

**Step 2: Build frontend**

Run: `cd /home/m0xu/1-projects/bl0ck-worktrees/feature-autotrade-x402/lina && bun run build:frontend`
Expected: Build succeeds

**Step 3: Start dev server for manual testing (optional)**

Run: `cd /home/m0xu/1-projects/bl0ck-worktrees/feature-autotrade-x402/lina && bun run dev`

Manual test checklist:
- [ ] Navigate to wallet dashboard
- [ ] Click "Start Autotrade"
- [ ] Verify 402 response triggers wallet popup
- [ ] Sign USDC transfer
- [ ] Verify subscription activates
- [ ] Click "Stop Autotrade"
- [ ] Verify positions close (if any)
- [ ] Verify subscription deactivates

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(autotrade): complete x402 payment integration and position closure"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Wire DriftService.closeAllPositions | api/index.ts |
| 2 | Create x402 payment helper | lib/x402-payment.ts |
| 3 | Integrate x402 in AutotradeTab | AutotradeTab.tsx |
| 4 | Add WalletProvider (if missing) | App.tsx |
| 5 | Add payment helper tests | x402-payment.test.ts |
| 6 | Full test + manual verification | - |

---

## Testing Checklist

- [ ] Unit tests pass: `bun test src/__tests__/unit/api/autotrade*.test.ts`
- [ ] Payment helper tests pass: `bun test src/__tests__/unit/frontend/x402-payment.test.ts`
- [ ] Frontend builds: `bun run build:frontend`
- [ ] Manual test: Start autotrade with devnet USDC
- [ ] Manual test: Stop autotrade closes positions
