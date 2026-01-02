# Display Drift Balance in UI

> **Status:** COMPLETED
> **Implemented:** Jan 2, 2026
> **Location:** `src/frontend/components/dashboard/cdp-wallet-card/DriftTab.tsx`

## Problem
User deposited $11 USDC to Drift but UI only shows wallet balance, not Drift margin account.

## Current Architecture

```
Frontend (CDPWalletCard)
    ↓
AgentWalletContext → elizaClient.wallet.getTokens()
    ↓
/api/wallet/tokens/:chain → Shows SOL/SPL tokens in WALLET
                          → Does NOT show Drift margin account
```

**Drift API exists but unused by frontend:**
- `GET /api/drift/account` → Returns collateral, freeCollateral, unrealizedPnl
- `GET /api/drift/positions` → Returns open positions

## Solution

### Option A: Add Drift section to "Perps" tab (Recommended)

The CDPWalletCard already has a "Perps" tab for Solana. Add Drift balance display there.

**Files to modify:**
1. `src/frontend/lib/elizaClient.ts` - Add drift API methods
2. `src/frontend/contexts/AgentWalletContext.tsx` - Add drift state
3. `src/frontend/components/dashboard/cdp-wallet-card/index.tsx` - Display in Perps tab

### Implementation

#### 1. Add Drift API client methods
```typescript
// elizaClient.ts
drift: {
  getAccount: () => this.get('/api/drift/account'),
  getPositions: () => this.get('/api/drift/positions'),
}
```

#### 2. Add Drift state to context
```typescript
// AgentWalletContext.tsx
const [driftAccount, setDriftAccount] = useState<DriftAccountInfo | null>(null);

const fetchDriftAccount = async () => {
  const { account } = await elizaClient.drift.getAccount();
  setDriftAccount(account);
};
```

#### 3. Display in Perps tab
```tsx
// In Perps tab section
<div className="drift-balance">
  <span>Drift Margin Account</span>
  <span>${driftAccount?.collateral}</span>
  <span>Free: ${driftAccount?.freeCollateral}</span>
  <span>P&L: ${driftAccount?.unrealizedPnl}</span>
</div>
```

## Files

| File | Change |
|------|--------|
| `src/frontend/lib/elizaClient.ts` | Add `drift.getAccount()` method |
| `src/frontend/contexts/AgentWalletContext.tsx` | Add drift state + fetch |
| `src/frontend/components/dashboard/cdp-wallet-card/index.tsx` | Display in Perps tab |

## Expected Result

```
┌─────────────────────────────────┐
│  Wallet: $X.XX                  │  ← Existing
│  Drift: $11.00                  │  ← NEW (summary)
├─────────────────────────────────┤
│  [Tokens] [Perps] [History]     │
├─────────────────────────────────┤
│  (When Perps tab selected)      │
│  ─────────────────────────────  │
│  Drift Margin Account           │  ← NEW (details)
│  Collateral: $11.00             │
│  Free: $8.43                    │
│  Unrealized P&L: $0.00          │
│  ─────────────────              │
│  Open Positions                 │
│  (none)                         │
└─────────────────────────────────┘
```

## Implementation Details

### 1. elizaClient.ts - Add Drift namespace

```typescript
drift: {
  getAccount: async () => {
    return this.get<{ account: DriftAccountInfo; hasAccount: boolean }>('/api/drift/account');
  },
  getPositions: async () => {
    return this.get<{ positions: DriftPosition[]; hasAccount: boolean }>('/api/drift/positions');
  },
}
```

### 2. AgentWalletContext.tsx - Add state

```typescript
interface DriftState {
  account: DriftAccountInfo | null;
  positions: DriftPosition[];
  loading: boolean;
  error: string | null;
}

const [driftState, setDriftState] = useState<DriftState>({
  account: null,
  positions: [],
  loading: false,
  error: null,
});

// Fetch on mount when Solana wallet is active
useEffect(() => {
  if (activeWallet === 'solana') {
    fetchDriftData();
  }
}, [activeWallet]);
```

### 3. CDPWalletCard - Display

**Top section (summary):**
```tsx
{driftState.account && (
  <div className="drift-summary">
    <span>Drift</span>
    <span>${formatUsdValue(driftState.account.collateral)}</span>
  </div>
)}
```

**Perps tab (details):**
```tsx
<div className="drift-details">
  <h4>Drift Margin Account</h4>
  <div>Collateral: ${account.collateral}</div>
  <div>Free: ${account.freeCollateral}</div>
  <div>P&L: ${account.unrealizedPnl}</div>

  <h4>Open Positions</h4>
  {positions.length === 0 ? (
    <span>No open positions</span>
  ) : (
    positions.map(p => <PositionRow key={p.marketIndex} position={p} />)
  )}
</div>
```
