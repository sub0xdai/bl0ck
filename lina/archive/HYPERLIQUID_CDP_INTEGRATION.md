# Hyperliquid CDP Wallet Integration

## Overview

Refactor the Hyperliquid plugin to use the existing CDP EVM wallet instead of a standalone private key. This eliminates the need for a third wallet and provides a unified trading experience.

---

## Current State

```
┌─────────────────────────────────────────────────────────────┐
│                    CURRENT ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Solana Wallet          EVM Wallet (CDP)    Hyperliquid   │
│   ─────────────          ───────────────     ────────────  │
│   plugin-solana-core     plugin-cdp          SEPARATE KEY  │
│   • SOL, USDC            • ETH, USDC         • Env var     │
│   • Jupiter              • Base, Arb         • Isolated    │
│                                                             │
│   Address: 7xKX...       Address: 0x742...   Address: 0xABC│
│                                                             │
│   ❌ THREE separate wallets                                 │
│   ❌ User must fund Hyperliquid separately                  │
│   ❌ Confusing UX                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Target State

```
┌─────────────────────────────────────────────────────────────┐
│                    TARGET ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Solana Wallet          EVM Wallet (CDP + Hyperliquid)    │
│   ─────────────          ──────────────────────────────    │
│   plugin-solana-core     plugin-cdp + plugin-hyperliquid   │
│   • SOL, USDC            • ETH, USDC (Base/Arb)            │
│   • Jupiter              • Perp positions (Hyperliquid)    │
│                                                             │
│   Address: 7xKX...       Address: 0x742... (SAME for both) │
│                                                             │
│   ✅ TWO wallets only                                       │
│   ✅ Unified EVM experience                                 │
│   ✅ Seamless perp trading                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## User Experience

### Deposit Flow

```
User: "I deposited 1000 USDC"

Lina checks:
  • Solana wallet: 500 USDC
  • EVM wallet (Base): 500 USDC
  • Hyperliquid margin: $0

Lina: "Got it! Your balance:
       • Solana: 500 USDC
       • Base: 500 USDC
       • Total: $1,000"
```

### Trading Flow

```
User: "Open a 5x long on BTC with $500"

Lina (internal):
  1. Check Hyperliquid margin: $0
  2. Check EVM wallet: 500 USDC on Base
  3. Bridge 500 USDC: Base → Hyperliquid (same address)
  4. Sign trade using CDP account
  5. Open position

Lina: "BTC long opened!
       Entry: $67,500 | Liq: $54,000

       Portfolio:
       • Solana: 500 USDC
       • Positions: $500 (BTC 5x Long)
       • Total: $1,000"
```

### What User Does NOT See

- ❌ "Bridging to Hyperliquid..."
- ❌ "Your Hyperliquid address is..."
- ❌ Balance dropping to $0
- ❌ Multiple wallet addresses
- ❌ Private key configuration

---

## Technical Implementation

### Phase 1: CDP Signer Adapter

Create an adapter that allows Hyperliquid operations using CDP's signing capability.

**File:** `src/plugins/plugin-hyperliquid/src/services/cdp-signer.ts`

```typescript
import { CdpTransactionManager } from '@/managers/cdp-transaction-manager';
import { Hex, Hash, SignableMessage } from 'viem';

/**
 * Adapter that provides Hyperliquid-compatible signing using CDP account
 */
export class CdpHyperliquidSigner {
  private cdpManager: CdpTransactionManager;
  private userId: string;
  private _address: string | null = null;

  constructor(userId: string) {
    this.cdpManager = CdpTransactionManager.getInstance();
    this.userId = userId;
  }

  /**
   * Get the wallet address (same as CDP EVM address)
   */
  async getAddress(): Promise<string> {
    if (!this._address) {
      const wallet = await this.cdpManager.getOrCreateWallet(this.userId);
      this._address = wallet.address;
    }
    return this._address;
  }

  /**
   * Sign a message hash (used by Hyperliquid for L1 actions)
   */
  async signHash(hash: Hash): Promise<Hex> {
    const { walletClient } = await this.cdpManager.getViemClientsForAccount({
      accountName: this.userId,
      network: 'base', // Network doesn't matter for signing
    });

    // Use the account's sign method
    const account = walletClient.account;
    return account.sign({ hash });
  }

  /**
   * Sign a message (EIP-191)
   */
  async signMessage(message: SignableMessage): Promise<Hex> {
    const { walletClient } = await this.cdpManager.getViemClientsForAccount({
      accountName: this.userId,
      network: 'base',
    });

    return walletClient.signMessage({ message });
  }

  /**
   * Sign typed data (EIP-712) - used by Hyperliquid
   */
  async signTypedData(typedData: any): Promise<Hex> {
    const { walletClient } = await this.cdpManager.getViemClientsForAccount({
      accountName: this.userId,
      network: 'base',
    });

    return walletClient.signTypedData(typedData);
  }
}
```

### Phase 2: Hyperliquid Client Wrapper

Build a custom Hyperliquid client that uses CDP signing instead of raw private key.

**File:** `src/plugins/plugin-hyperliquid/src/services/hyperliquid-cdp-client.ts`

```typescript
import { CdpHyperliquidSigner } from './cdp-signer';

const HYPERLIQUID_API = {
  mainnet: 'https://api.hyperliquid.xyz',
  testnet: 'https://api.hyperliquid-testnet.xyz',
};

/**
 * Hyperliquid client using CDP wallet for signing
 */
export class HyperliquidCdpClient {
  private signer: CdpHyperliquidSigner;
  private baseUrl: string;
  private walletAddress: string | null = null;

  constructor(userId: string, testnet: boolean = true) {
    this.signer = new CdpHyperliquidSigner(userId);
    this.baseUrl = testnet ? HYPERLIQUID_API.testnet : HYPERLIQUID_API.mainnet;
  }

  async connect(): Promise<void> {
    this.walletAddress = await this.signer.getAddress();
  }

  getAddress(): string {
    if (!this.walletAddress) {
      throw new Error('Client not connected. Call connect() first.');
    }
    return this.walletAddress;
  }

  /**
   * Get account state (positions, margin, etc.)
   */
  async getAccountState(): Promise<AccountState> {
    const response = await fetch(`${this.baseUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: this.getAddress(),
      }),
    });
    return response.json();
  }

  /**
   * Get available markets
   */
  async getMarkets(): Promise<Market[]> {
    const response = await fetch(`${this.baseUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
    });
    const data = await response.json();
    return data.universe;
  }

  /**
   * Place an order (requires signing)
   */
  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    const timestamp = Date.now();
    const action = this.buildOrderAction(order, timestamp);

    // Sign using CDP
    const signature = await this.signer.signTypedData(
      this.buildOrderTypedData(action, timestamp)
    );

    const response = await fetch(`${this.baseUrl}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        nonce: timestamp,
        signature,
      }),
    });

    return response.json();
  }

  // ... additional methods for position management
}
```

### Phase 3: Refactor HyperliquidService

Update the service to use CDP wallet per-user instead of global private key.

**File:** `src/plugins/plugin-hyperliquid/src/services/hyperliquid.service.ts`

```typescript
// BEFORE (current)
export class HyperliquidService extends Service {
  private sdk: Hyperliquid | null = null; // Single global SDK

  async initialize(runtime: IAgentRuntime): Promise<void> {
    const privateKey = runtime.getSetting('HYPERLIQUID_PRIVATE_KEY'); // ❌ Env var
    this.sdk = new Hyperliquid({ privateKey, testnet });
  }
}

// AFTER (new)
export class HyperliquidService extends Service {
  private clients: Map<string, HyperliquidCdpClient> = new Map(); // Per-user clients
  private testnet: boolean = true;

  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.testnet = runtime.getSetting('HYPERLIQUID_TESTNET') !== 'false';
    // No private key needed - CDP handles it
  }

  /**
   * Get or create Hyperliquid client for user (uses their CDP wallet)
   */
  private async getClientForUser(userId: string): Promise<HyperliquidCdpClient> {
    if (!this.clients.has(userId)) {
      const client = new HyperliquidCdpClient(userId, this.testnet);
      await client.connect();
      this.clients.set(userId, client);
    }
    return this.clients.get(userId)!;
  }

  async getPositions(userId: string): Promise<Position[]> {
    const client = await this.getClientForUser(userId);
    const state = await client.getAccountState();
    return this.parsePositions(state);
  }

  async openPosition(params: OpenPositionParams): Promise<PositionResult> {
    const client = await this.getClientForUser(params.userId);
    // Use client to place order - signs with user's CDP wallet
    return client.placeOrder(/* ... */);
  }
}
```

### Phase 4: Auto-Bridge Service

Handle automatic bridging between chains when needed for perp trading.

**File:** `src/services/bridge-service.ts`

```typescript
/**
 * Handles automatic USDC bridging for perp trading
 */
export class BridgeService {

  /**
   * Ensure user has sufficient margin on Hyperliquid
   * Bridges from Solana or EVM if needed
   */
  async ensureHyperliquidMargin(
    userId: string,
    requiredAmount: number
  ): Promise<BridgeResult> {

    // 1. Check current Hyperliquid balance
    const hlBalance = await this.getHyperliquidBalance(userId);

    if (hlBalance >= requiredAmount) {
      return { bridged: false, amount: 0 };
    }

    const deficit = requiredAmount - hlBalance;

    // 2. Check EVM wallet (preferred - same address)
    const evmBalance = await this.getEvmUsdcBalance(userId);
    if (evmBalance >= deficit) {
      await this.bridgeFromEvm(userId, deficit);
      return { bridged: true, amount: deficit, source: 'evm' };
    }

    // 3. Check Solana wallet
    const solBalance = await this.getSolanaUsdcBalance(userId);
    if (solBalance >= deficit) {
      await this.bridgeFromSolana(userId, deficit);
      return { bridged: true, amount: deficit, source: 'solana' };
    }

    throw new Error(`Insufficient USDC. Need $${deficit} more.`);
  }

  /**
   * Bridge USDC from EVM (Arbitrum) to Hyperliquid
   * Uses same address - just cross-chain transfer
   */
  private async bridgeFromEvm(userId: string, amount: number): Promise<void> {
    // Hyperliquid accepts deposits from Arbitrum
    // Send USDC to Hyperliquid bridge contract
    // Funds appear at same address on Hyperliquid L1
  }

  /**
   * Bridge USDC from Solana to Hyperliquid
   * Uses Hyperliquid's Solana bridge
   */
  private async bridgeFromSolana(userId: string, amount: number): Promise<void> {
    // Use Hyperliquid's Solana deposit mechanism
    // Funds appear at user's EVM address on Hyperliquid L1
  }
}
```

### Phase 5: Unified Balance Provider

Show combined balance across all chains.

**File:** `src/plugins/plugin-cdp/providers/unifiedBalance.ts`

```typescript
/**
 * Provider that aggregates balances across Solana, EVM, and Hyperliquid
 */
export const unifiedBalanceProvider: Provider = {
  name: 'UNIFIED_BALANCE',

  async get(runtime, message, state): Promise<string> {
    const userId = extractUserId(message);

    // Fetch all balances in parallel
    const [solana, evm, hyperliquid] = await Promise.all([
      getSolanaBalance(userId),
      getEvmBalance(userId),
      getHyperliquidBalance(userId),
    ]);

    const totalAvailable = solana.usdc + evm.usdc + hyperliquid.available;
    const totalInPositions = hyperliquid.positionValue;
    const totalPnl = hyperliquid.unrealizedPnl;

    return `
USER_WALLET_STATE:
- Solana: ${solana.sol} SOL, ${solana.usdc} USDC
- Base: ${evm.eth} ETH, ${evm.usdc} USDC
- Positions: ${hyperliquid.positions.length} open
- Available margin: $${hyperliquid.available}
- Position value: $${totalInPositions}
- Unrealized P&L: ${totalPnl >= 0 ? '+' : ''}$${totalPnl}
- Total portfolio: $${totalAvailable + totalInPositions}
    `.trim();
  }
};
```

---

## Environment Changes

### Remove

```bash
# DELETE - No longer needed
HYPERLIQUID_PRIVATE_KEY="0x..."
```

### Keep

```bash
# KEEP - Controls testnet vs mainnet
HYPERLIQUID_TESTNET="true"
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/plugins/plugin-hyperliquid/src/services/cdp-signer.ts` | **NEW** - CDP signing adapter |
| `src/plugins/plugin-hyperliquid/src/services/hyperliquid-cdp-client.ts` | **NEW** - Custom HL client |
| `src/plugins/plugin-hyperliquid/src/services/hyperliquid.service.ts` | **MODIFY** - Use CDP per-user |
| `src/services/bridge-service.ts` | **NEW** - Auto-bridge logic |
| `src/plugins/plugin-cdp/providers/unifiedBalance.ts` | **NEW** - Combined balance |
| `.env.sample` | **MODIFY** - Remove HYPERLIQUID_PRIVATE_KEY |
| `src/character.ts` | **MODIFY** - Update perps guidance |

---

## Implementation Phases

### Phase 1: CDP Signer (4h)
- [ ] Create `CdpHyperliquidSigner` class
- [ ] Test signing with CDP account
- [ ] Verify signature format matches Hyperliquid requirements

### Phase 2: Custom HL Client (6h)
- [ ] Create `HyperliquidCdpClient` class
- [ ] Implement read operations (account state, markets)
- [ ] Implement write operations (place order, cancel)
- [ ] Test against Hyperliquid testnet

### Phase 3: Service Refactor (4h)
- [ ] Refactor `HyperliquidService` to use per-user clients
- [ ] Remove `HYPERLIQUID_PRIVATE_KEY` dependency
- [ ] Update all action handlers to pass userId
- [ ] Update tests

### Phase 4: Auto-Bridge (6h)
- [ ] Create `BridgeService`
- [ ] Implement EVM → Hyperliquid bridge
- [ ] Implement Solana → Hyperliquid bridge
- [ ] Integrate with perp trading flow

### Phase 5: Unified Balance (3h)
- [ ] Create unified balance provider
- [ ] Update wallet display to include positions
- [ ] Update character.ts with new guidance

### Phase 6: Testing & Polish (4h)
- [ ] Integration tests with testnet
- [ ] Update documentation
- [ ] Code-hound review

**Total Estimated Effort: ~27 hours**

---

## Testing Plan

### Unit Tests

```typescript
describe('CdpHyperliquidSigner', () => {
  it('should get address matching CDP wallet', async () => {});
  it('should sign message with CDP account', async () => {});
  it('should sign typed data for Hyperliquid', async () => {});
});

describe('HyperliquidCdpClient', () => {
  it('should connect and return CDP address', async () => {});
  it('should fetch account state', async () => {});
  it('should place order with CDP signature', async () => {});
});
```

### Integration Tests

```typescript
describe('Hyperliquid CDP Integration', () => {
  it('should open position using CDP wallet', async () => {});
  it('should close position using CDP wallet', async () => {});
  it('should auto-bridge from EVM when needed', async () => {});
});
```

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| CDP signing format incompatible | HIGH | Test early with Hyperliquid testnet |
| Bridge delays affect UX | MEDIUM | Show progress indicator, pre-bridge when possible |
| Rate limits on signing | LOW | Cache clients, batch operations |
| Hyperliquid API changes | LOW | Abstract API layer, version pin |

---

## Success Criteria

1. **No third wallet** - User has only Solana + EVM wallets
2. **Seamless trading** - User says "open long", position opens
3. **Unified balance** - User sees total across all chains
4. **No bridging UX** - User never sees "bridging" messages
5. **Same address** - Hyperliquid uses CDP wallet address
6. **Tests pass** - All existing + new tests green

---

## References

- [Hyperliquid API Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api)
- [CDP SDK Docs](https://docs.cdp.coinbase.com/)
- [EIP-712 Typed Data Signing](https://eips.ethereum.org/EIPS/eip-712)
- Current implementation: `src/plugins/plugin-hyperliquid/`
- CDP manager: `src/managers/cdp-transaction-manager.ts`
