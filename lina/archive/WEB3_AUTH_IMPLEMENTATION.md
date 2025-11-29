# Web3 Wallet Auth Implementation Plan

> **Current Focus**: This is the active workstream. Complete before resuming `LINA_IMPLEMENTATION_TASKS.md` (Solana Phase 2+).

## Overview

Replace CDP social auth (email/SMS/OAuth) with Web3 wallet signature auth (SIWE/SIWS). Agent-managed wallets remain unchanged.

```
User's External Wallet (Auth Only)
  - MetaMask, Phantom, Coinbase Wallet, etc.
  - Signs message to prove identity
  - userId derived from wallet address
              │
              │ Authenticates
              ▼
Lina Agent Wallets (Unchanged)
  - CDP Wallet (EVM) - Agent holds funds
  - Solana Wallet - Agent holds funds
  - User deposits into agent wallets to trade
```

## Status

| Phase | Status | Commits |
|-------|--------|---------|
| 1. Backend Auth | ✅ Complete | `a921af0` |
| 2. Frontend Auth | ✅ Complete | `0e206bc`, `ec7b892` |
| 3. Onboarding Flow | ✅ Complete | *pending commit* |
| 4. Cleanup | ✅ Complete | *pending commit* |

### Phase 1: Backend Auth Endpoints ✅ COMPLETE

**Files Modified:**
- `src/packages/server/src/api/auth/index.ts` - Added nonce + verify endpoints
- `src/packages/server/src/middleware/jwt.ts` - Added wallet auth token generation
- `src/packages/server/src/middleware/index.ts` - Export new function

**New Endpoints:**

```typescript
GET /api/auth/nonce
// Returns random nonce for signing
// Response: { nonce: string }

POST /api/auth/verify
// Verifies signed message, returns JWT
// Body: { message: string, signature: string, chain: 'evm' | 'solana' }
// Response: { token: string, userId: string, walletAddress: string, chain: string }
```

**Dependencies to Install:**
```bash
bun add siwe tweetnacl
```

---

## Phase 2: Frontend Auth Components ✅ COMPLETE

**Recent Fixes (ec7b892):**
- Fixed CDP API key SEC1→PKCS8 format conversion for SDK compatibility
- Fixed wallet secret hex→PKCS8 DER conversion for legacy formats
- Generate proper UUID format for userId (required by entity API)
- Require wallet connection before restoring auth session
- Handle profile sync errors gracefully (don't block app)
- Fix sign out button wiring
- Add back navigation button to Account page
- Display CDP-managed wallet addresses (not auth wallet)
- Fetch EVM/Solana addresses from server instead of using auth wallet

### 2.1 Install AppKit Dependencies ✅

```bash
bun add @reown/appkit @reown/appkit-adapter-wagmi @reown/appkit-adapter-solana wagmi viem @tanstack/react-query siwe
```

**Note:** Both EVM and Solana adapters now installed.

### 2.2 Create Web3Provider ✅

**File:** `src/frontend/providers/Web3Provider.tsx`

```tsx
import { createAppKit } from '@reown/appkit/react';
import { WagmiProvider } from 'wagmi';
import { base, mainnet } from '@reown/appkit/networks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { SolanaAdapter } from '@reown/appkit-adapter-solana';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const wagmiAdapter = new WagmiAdapter({
  networks: [mainnet, base],
  projectId,
});

const solanaAdapter = new SolanaAdapter();

createAppKit({
  adapters: [wagmiAdapter, solanaAdapter],
  networks: [mainnet, base],
  projectId,
  features: {
    analytics: false,
  },
});

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

### 2.3 Create WalletConnectModal ✅

**File:** `src/frontend/components/auth/WalletConnectModal.tsx`

```tsx
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useSignMessage } from 'wagmi';
import { SiweMessage } from 'siwe';

export function WalletConnectModal() {
  const { open } = useAppKit();
  const { address, isConnected, caipAddress } = useAppKitAccount();
  const { signMessageAsync } = useSignMessage();

  const handleSignIn = async () => {
    if (!address) {
      open(); // Open wallet modal
      return;
    }

    // Get nonce from backend
    const nonceRes = await fetch('/api/auth/nonce');
    const { nonce } = await nonceRes.json();

    // Determine chain from caipAddress (eip155:1:0x... or solana:...)
    const chain = caipAddress?.startsWith('solana') ? 'solana' : 'evm';

    if (chain === 'evm') {
      // Create SIWE message
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to Lina',
        uri: window.location.origin,
        version: '1',
        chainId: 1,
        nonce,
      });

      const signature = await signMessageAsync({
        message: message.prepareMessage(),
      });

      // Verify with backend
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.prepareMessage(),
          signature,
          chain: 'evm',
        }),
      });

      const { token, userId } = await verifyRes.json();
      localStorage.setItem('auth-token', token);
      // Redirect to dashboard...
    } else {
      // Solana signing (similar flow with Solana wallet adapter)
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1>Connect Wallet to Lina</h1>
      <button onClick={handleSignIn}>
        {isConnected ? 'Sign In' : 'Connect Wallet'}
      </button>
    </div>
  );
}
```

### 2.4 Create useWalletAuth Hook ✅

**File:** `src/frontend/hooks/useWalletAuth.ts`

```tsx
import { useAppKitAccount } from '@reown/appkit/react';
import { useState, useEffect } from 'react';
import { elizaClient } from '../lib/elizaClient';

interface WalletAuth {
  isConnected: boolean;
  isAuthenticated: boolean;
  walletAddress: string | null;
  chain: 'evm' | 'solana' | null;
  userId: string | null;
  connect: () => void;
  disconnect: () => void;
  signIn: () => Promise<void>;
}

export function useWalletAuth(): WalletAuth {
  const { address, isConnected, caipAddress } = useAppKitAccount();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing token
    const token = localStorage.getItem('auth-token');
    if (token) {
      // Validate token with /api/auth/me
      elizaClient.auth.me().then(user => {
        setIsAuthenticated(true);
        setUserId(user.userId);
      }).catch(() => {
        localStorage.removeItem('auth-token');
        setIsAuthenticated(false);
      });
    }
  }, []);

  const chain = caipAddress?.startsWith('solana') ? 'solana' : 'evm';

  return {
    isConnected,
    isAuthenticated,
    walletAddress: address || null,
    chain: isConnected ? chain : null,
    userId,
    connect: () => { /* open AppKit modal */ },
    disconnect: () => {
      localStorage.removeItem('auth-token');
      setIsAuthenticated(false);
      // disconnect wallet
    },
    signIn: async () => { /* SIWE/SIWS flow */ },
  };
}
```

### 2.5 Update App.tsx ✅

**File:** `src/frontend/App.tsx`

Implemented auth state machine pattern:

```tsx
// Auth states: loading -> none/expired -> authenticated
// loading    → SplashScreen (checking token)
// none       → LoginScreen (cold start)
// expired    → LoginScreen with message
// authenticated → MainApp

export function App() {
  const { authStatus } = useWalletAuth();

  if (authStatus === 'loading') return <SplashScreen />;
  if (authStatus === 'none' || authStatus === 'expired') return <LoginScreen />;
  return <MainApp />;
}
```

**New Files Created:**
- `src/frontend/screens/SplashScreen.tsx` - Loading state
- `src/frontend/screens/LoginScreen.tsx` - Full-page auth gate
- `src/frontend/screens/MainApp.tsx` - Extracted from App.tsx

**Key Changes:**
- App.tsx reduced from ~600 lines to ~70 lines
- Single `useWalletAuth` instance (fixes state sync issues)
- No auto-sign-in (user clicks explicitly)
- "Use Different Wallet" button to switch wallets

---

## Phase 3: Onboarding Flow ✅ COMPLETE

**Files Created:**
- `src/frontend/components/onboarding/DepositOnboarding.tsx`

**Integration:**
- Added to `MainApp.tsx` - shows modal for new users OR zero-balance users
- 24hr cooldown after dismissal
- Displays EVM (CDP) and Solana agent wallet addresses

---

## Phase 3: Onboarding Flow (Reference)

### 3.1 Create DepositOnboarding Modal

**File:** `src/frontend/components/onboarding/DepositOnboarding.tsx`

```tsx
export function DepositOnboarding({
  evmAddress,
  solanaAddress,
  onComplete
}: {
  evmAddress: string;
  solanaAddress: string;
  onComplete: () => void;
}) {
  return (
    <div className="modal">
      <h2>Welcome to Lina</h2>
      <p>
        Lina manages dedicated wallets for your trading.
        Deposit funds to get started.
      </p>

      <div className="wallet-addresses">
        <div>
          <h3>EVM (Base, Ethereum)</h3>
          <code>{evmAddress}</code>
          <CopyButton text={evmAddress} />
        </div>

        <div>
          <h3>Solana</h3>
          <code>{solanaAddress}</code>
          <CopyButton text={solanaAddress} />
        </div>
      </div>

      <div className="actions">
        <button onClick={onComplete}>I've Deposited</button>
        <button onClick={onComplete}>Skip for Now</button>
      </div>
    </div>
  );
}
```

### 3.2 First-Time User Detection

In App.tsx after auth:
```tsx
const wallet = await elizaClient.cdp.getOrCreateWallet(userId);
if (wallet.isNew) {
  setShowOnboarding(true);
}
```

---

## Phase 4: Cleanup ✅ COMPLETE

**Files Deleted:**
- `src/frontend/components/auth/SignInModal.tsx`
- `src/frontend/hooks/useCDPWallet.ts`

**Dependencies Removed:**
- `@coinbase/cdp-react`
- `@coinbase/cdp-hooks`

**CSS Cleaned:**
- Removed `.SignInModal-module__trigger` styles from `index.css`

---

## Phase 4: Cleanup (Reference)

### 4.1 Remove CDP Auth Dependencies

```bash
bun remove @coinbase/cdp-react
```

Keep `@coinbase/cdp-sdk` for agent wallet management.

### 4.2 Delete Old Auth Components

- `src/frontend/components/auth/SignInModal.tsx`
- `src/frontend/hooks/useCDPWallet.ts`

### 4.3 Update API Client ✅ (Moved to Phase 2)

**File:** `src/packages/api-client/src/services/auth.ts`

Added:
```typescript
getNonce(): Promise<NonceResponse>
verifyWalletSignature(request: WalletVerifyRequest): Promise<WalletVerifyResponse>
```

**Note:** Old `login()` method retained for backwards compatibility during migration.

---

## Environment Variables

**Add:**
```bash
VITE_WALLETCONNECT_PROJECT_ID=xxx  # Get from cloud.walletconnect.com
ADMIN_WALLETS=0x123...,0x456...    # Admin wallet addresses
```

**Keep:**
```bash
JWT_SECRET=xxx
HELIUS_API_KEY=xxx
ALCHEMY_API_KEY=xxx
CDP_API_KEY_ID=xxx
CDP_API_KEY_SECRET=xxx
CDP_WALLET_SECRET=xxx
```

**Remove (after migration):**
```bash
VITE_CDP_PROJECT_ID=xxx
```

---

## Testing

### Backend Endpoints

```bash
# Get nonce
curl http://localhost:3000/api/auth/nonce

# Verify EVM signature
curl -X POST http://localhost:3000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "message": "localhost wants you to sign in...",
    "signature": "0x...",
    "chain": "evm"
  }'

# Verify Solana signature
curl -X POST http://localhost:3000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Sign in to Lina\nWallet: ABC...\nNonce: xyz...",
    "signature": "base58signature...",
    "chain": "solana"
  }'
```

### Frontend Flow

1. User clicks "Connect Wallet"
2. AppKit modal opens (MetaMask, Phantom, etc.)
3. User connects wallet
4. App requests signature (SIWE/SIWS message)
5. User signs in wallet
6. App sends signature to `/api/auth/verify`
7. Backend returns JWT
8. App stores JWT, user is authenticated
9. If new user, show deposit onboarding

---

## Migration Notes

- **Clean break**: No migration of existing CDP users
- **New wallet = new account**: Each wallet address gets fresh agent wallets
- **Backward compat**: Agent wallet management (CDP SDK) unchanged
- **Rollback**: Old CDP auth code remains in git history
