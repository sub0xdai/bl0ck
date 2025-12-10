# Autotrade x402 Payment System Design

## Overview

Autotrade is a one-click portfolio management mode where Lina autonomously trades the user's entire wallet - hedging, longing, shorting perps, holding spot, managing USDC allocation.

Users pay $1 USDC per day to activate autotrade. Payment auto-renews until user stops or funds run out.

## User Experience

**Two buttons in UI:**
- **[Start Autotrade]** - Pay $1 USDC → Lina takes full control
- **[Stop Autotrade]** - Lina closes all positions → Funds return to user

**Behavior:**
- Once active, Lina trades freely with entire wallet
- Every 24 hours, $1 USDC auto-deducted for renewal
- User can stop anytime - positions close, control returns
- If insufficient USDC for renewal - auto-stop, positions close

## Payment Flow

### Initial Activation

1. User clicks **[Start Autotrade]**
2. Frontend calls `POST /api/autotrade/start`
3. Backend returns `402 Payment Required`:
   ```json
   {
     "accepts": {
       "scheme": "solana",
       "network": "solana-mainnet",
       "payTo": "<AUTOTRADE_TREASURY_WALLET>",
       "amount": "1000000",
       "memo": "autotrade:24h:<userId>",
       "expiresAt": <timestamp + 5 minutes>
     }
   }
   ```
4. Frontend builds USDC transfer via x402 client
5. Frontend retries with `x-payment-proof` header
6. Backend verifies on-chain → activates subscription → returns success

### Auto-Renewal

1. Subscription nears expiry (checked in trading loop)
2. Lina checks wallet: ≥$1 USDC available?
3. **Yes** → Transfer $1 to treasury → Extend 24h → Continue trading
4. **No** → Close all positions → Deactivate → Notify user

### Stop Autotrade

1. User clicks **[Stop Autotrade]**
2. Mark subscription inactive immediately
3. Close all Drift positions via `closeAllPositions()`
4. Settle PnL to USDC
5. Return success: "Autotrade stopped. Closed X positions. Balance: $Y"

## Data Model

```typescript
interface AutotradeSubscription {
  userId: string;
  status: 'active' | 'inactive';
  expiresAt: number;        // Unix timestamp
  activatedAt: number;      // First activation
  lastRenewalAt: number;    // Last payment
  totalPaid: number;        // Cumulative USDC paid
  txSignatures: string[];   // Payment proof history
}
```

## Components

### 1. AutotradeService

Location: `src/services/autotrade.service.ts`

```typescript
class AutotradeService {
  startAutotrade(userId: string): Promise<X402PaymentRequired>
  activateAfterPayment(userId: string, proof: X402PaymentProof): Promise<void>
  stopAutotrade(userId: string): Promise<StopResult>
  renewSubscription(userId: string): Promise<boolean>
  checkAndRenew(userId: string): Promise<void>  // Called by trading loop
  getStatus(userId: string): Promise<AutotradeSubscription | null>
}
```

### 2. API Endpoints

Location: `src/packages/server/src/api/autotrade/`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/autotrade/start` | POST | Returns 402, activates on payment proof |
| `/api/autotrade/stop` | POST | Closes positions, deactivates |
| `/api/autotrade/status` | GET | Returns subscription state |

### 3. Frontend Components

Location: `src/frontend/components/autotrade/`

- `AutotradeButton.tsx` - Toggle button with state
- `AutotradeStatus.tsx` - Shows active/inactive, time remaining, total paid

### 4. Storage

Options (in order of preference):
1. PostgreSQL via existing `WALLET_DB_URL` - Add `autotrade_subscriptions` table
2. JSON file - `data/autotrade-subscriptions.json` for quick MVP

### 5. Configuration

```env
AUTOTRADE_TREASURY_WALLET=<base58 pubkey>  # Where payments go
AUTOTRADE_PRICE_USDC=1.0                   # Daily cost (configurable)
AUTOTRADE_DURATION_HOURS=24                # Subscription period
```

## Integration Points

### Existing Code Reuse

- `closeAllPositions()` from `plugin-drift` - Used on stop/expiry
- `SolanaTransactionManager` - For USDC transfers
- `x402-solana` plugin - Payment verification
- `UnifiedWalletProvider` - Wallet access

### Trading Loop Integration

The autotrade trading logic (strategies TBD) must:
1. Check `AutotradeService.checkAndRenew()` at start of each cycle
2. Respect `status === 'active'` before placing trades
3. Handle renewal failure gracefully (close positions, stop)

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Insufficient USDC for renewal | Close positions, deactivate, notify user |
| User stops mid-trade | Wait for pending orders, then close all |
| Liquidation during autotrade | Normal Drift rules apply, user bears risk |
| Network issues during renewal | Retry 3x, then close positions |
| Server restart | Load subscription state from DB, resume |

## Security Considerations

- Treasury wallet private key NOT on server - just receives payments
- Payment verification is on-chain, not trusting client
- Rate limit start/stop to prevent abuse
- Log all payment transactions for audit

## Future Enhancements

- Tiered pricing based on portfolio size
- Discount for longer commitments (7 days, 30 days)
- Referral system - reduced fees for referrers
- Performance fee - % of profits in addition to flat fee
