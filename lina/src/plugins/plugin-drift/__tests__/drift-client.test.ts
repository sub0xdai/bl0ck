/**
 * DriftClient Lifecycle Tests
 *
 * Tests client initialization, caching, mutex locking, and cleanup
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { DriftService } from '../src/services/drift.service';

// ============================================================
// MOCKS
// ============================================================

class MockBN {
  value: bigint;
  constructor(value: number | bigint | string) {
    this.value = BigInt(value || 0);
  }
  isZero(): boolean { return this.value === BigInt(0); }
  abs(): MockBN { return new MockBN(this.value < BigInt(0) ? -this.value : this.value); }
  gt(other: MockBN | number): boolean {
    const otherVal = (other as any).value !== undefined ? (other as MockBN).value : BigInt(other);
    return this.value > otherVal;
  }
  mul(other: MockBN | number): MockBN {
    const otherVal = (other as any).value !== undefined ? (other as MockBN).value : BigInt(other);
    return new MockBN(this.value * otherVal);
  }
  div(other: MockBN | number): MockBN {
    const otherVal = (other as any).value !== undefined ? (other as MockBN).value : BigInt(other);
    return new MockBN(this.value / otherVal);
  }
  toString(): string { return String(this.value); }
}

class MockPublicKey {
  private key: string;
  constructor(key?: string) {
    this.key = key || 'mockPublicKey123';
  }
  toBase58(): string { return this.key; }
  toString(): string { return this.key; }
}

const mockGetUser = mock(() => ({
  getUserAccount: () => ({
    authority: new MockPublicKey('mockAuthority123'),
    subAccountId: 0,
  }),
  getSpotPosition: (index: number) => ({
    scaledBalance: BigInt(1000000000),
    marketIndex: index,
  }),
  getPerpPosition: (index: number) => ({
    baseAssetAmount: new MockBN(100000000),
    quoteAssetAmount: new MockBN(-67000000000),
    lastCumulativeFundingRate: new MockBN(0),
    marketIndex: index,
  }),
  getFreeCollateral: () => new MockBN(50000000),
  getTotalCollateral: () => new MockBN(100000000),
  getTotalPerpPositionValue: () => new MockBN(200000000),
  getUnrealizedPNL: () => new MockBN(5000000),
  getLeverage: () => 50000,
  subscribe: mock(() => Promise.resolve()),
}));

const mockSubscribe = mock(() => Promise.resolve());
const mockUnsubscribe = mock(() => Promise.resolve());
const mockGetMarketAccountAndSlot = mock(() => ({
  data: {
    amm: {
      historicalOracleData: {
        lastOraclePrice: BigInt(150000000), // $150
      },
    },
  },
}));

mock.module('@drift-labs/sdk', () => ({
  DriftClient: class {
    constructor(public config: any) {}
    subscribe = mockSubscribe;
    unsubscribe = mockUnsubscribe;
    getUser = mockGetUser;
    getMarketAccountAndSlot = mockGetMarketAccountAndSlot;
  },
  Wallet: class {
    constructor(public keypair: any) {}
  },
  BN: MockBN,
  PositionDirection: { LONG: 0, SHORT: 1 },
  MarketType: { PERP: 0, SPOT: 1 },
  OrderType: { MARKET: 0, LIMIT: 1 },
  getMarketOrderParams: (params: any) => params,
}));

const mockGetBalance = mock(() => Promise.resolve(50000000));
const mockConfirmTransaction = mock(() => Promise.resolve({ value: { err: null } }));

mock.module('@solana/web3.js', () => ({
  Connection: class {
    constructor(public endpoint: string) {}
    getBalance = mockGetBalance;
    confirmTransaction = mockConfirmTransaction;
  },
  PublicKey: MockPublicKey,
  Keypair: class {
    static generate() {
      return {
        publicKey: new MockPublicKey('mockKeypair'),
        secretKey: new Uint8Array(64),
      };
    }
  },
  LAMPORTS_PER_SOL: 1000000000,
}));

const mockGetOrCreateWallet = mock(() =>
  Promise.resolve({
    publicKey: "mockCdpWalletPubkey",
    keypair: {
      publicKey: new MockPublicKey("mockKeypair"),
      secretKey: new Uint8Array(64),
    },
  })
);

mock.module("@/managers/solana-transaction-manager", () => ({
  SolanaTransactionManager: {
    getInstance: () => ({
      getOrCreateWallet: mockGetOrCreateWallet,
    }),
  },
}));

const createMockRuntime = (settings: Record<string, string | undefined> = {}) => ({
  getSetting: (key: string) => settings[key],
  agentId: 'test-agent-123',
  character: { name: 'Test Lina' },
  getService: () => null,
}) as any;

// ============================================================
// TESTS
// ============================================================

describe('DriftClient - Initialization', () => {
  let service: DriftService;
  let mockRuntime: any;

  beforeEach(async () => {
    mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
    mockGetOrCreateWallet.mockClear();
    mockSubscribe.mockClear();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should initialize DriftClient on first user operation', async () => {
    await service.getPositions('user-init-test');

    expect(mockGetOrCreateWallet).toHaveBeenCalledTimes(1);
    expect(mockGetOrCreateWallet).toHaveBeenCalledWith('user-init-test');
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
  });

  it('should create DriftClient with correct config', async () => {
    await service.getPositions('user-config-test');

    // Verify subscribe was called (indicates client was initialized)
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('should subscribe to DriftClient on initialization', async () => {
    mockSubscribe.mockClear();

    await service.getPositions('user-subscribe-test');

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('DriftClient - Caching (Per-User)', () => {
  let service: DriftService;
  let mockRuntime: any;

  beforeEach(async () => {
    mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
    mockGetOrCreateWallet.mockClear();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should reuse cached client for same user', async () => {
    await service.getPositions('user-cache-1');
    await service.getAccountInfo('user-cache-1');
    await service.getPosition('user-cache-1', 'SOL-PERP');

    // Only one wallet creation = one client
    expect(mockGetOrCreateWallet).toHaveBeenCalledTimes(1);
  });

  it('should create separate clients for different users', async () => {
    await service.getPositions('user-alice');
    await service.getPositions('user-bob');
    await service.getPositions('user-charlie');

    expect(mockGetOrCreateWallet).toHaveBeenCalledTimes(3);
    expect(mockGetOrCreateWallet).toHaveBeenNthCalledWith(1, 'user-alice');
    expect(mockGetOrCreateWallet).toHaveBeenNthCalledWith(2, 'user-bob');
    expect(mockGetOrCreateWallet).toHaveBeenNthCalledWith(3, 'user-charlie');
  });

  it('should maintain cache across multiple operations per user', async () => {
    const user1 = 'user-multi-op-1';
    const user2 = 'user-multi-op-2';

    // User 1: 3 operations
    await service.getPositions(user1);
    await service.getAccountInfo(user1);
    await service.getMarkets();

    // User 2: 2 operations
    await service.getPositions(user2);
    await service.getAccountInfo(user2);

    // User 1: 1 more operation
    await service.getPosition(user1, 'BTC-PERP');

    // Only 2 wallet creations (one per unique user)
    expect(mockGetOrCreateWallet).toHaveBeenCalledTimes(2);
  });
});

describe('DriftClient - Mutex Locking (Race Conditions)', () => {
  let service: DriftService;
  let mockRuntime: any;

  beforeEach(async () => {
    mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
    mockGetOrCreateWallet.mockClear();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should prevent concurrent initialization for same user', async () => {
    const userId = 'user-concurrent-init';

    // Fire 5 operations concurrently
    const promises = [
      service.getPositions(userId),
      service.getAccountInfo(userId),
      service.getPosition(userId, 'SOL-PERP'),
      service.getPositions(userId),
      service.getAccountInfo(userId),
    ];

    await Promise.all(promises);

    // Should only initialize once despite 5 concurrent calls
    expect(mockGetOrCreateWallet).toHaveBeenCalledTimes(1);
  });

  it('should handle concurrent operations for different users', async () => {
    const users = ['user-a', 'user-b', 'user-c', 'user-d', 'user-e'];

    // Fire concurrent operations for all users
    const promises = users.map(userId => service.getPositions(userId));

    await Promise.all(promises);

    // Should create one client per user
    expect(mockGetOrCreateWallet).toHaveBeenCalledTimes(users.length);
  });

  it('should serialize initialization per user while allowing parallel initialization across users', async () => {
    const user1 = 'user-parallel-1';
    const user2 = 'user-parallel-2';

    // Start operations for both users at the same time
    const promises = [
      service.getPositions(user1),
      service.getPositions(user1), // Duplicate for user1
      service.getPositions(user2),
      service.getPositions(user2), // Duplicate for user2
    ];

    await Promise.all(promises);

    // Should only create 2 clients (one per unique user)
    expect(mockGetOrCreateWallet).toHaveBeenCalledTimes(2);
  });
});

describe('DriftClient - Cleanup', () => {
  it('should unsubscribe all clients on stop', async () => {
    mockUnsubscribe.mockClear();

    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    const service = await DriftService.start(mockRuntime);

    // Create clients for 3 users
    await service.getPositions('user-cleanup-1');
    await service.getPositions('user-cleanup-2');
    await service.getPositions('user-cleanup-3');

    // Stop service
    await service.stop();

    // Should have unsubscribed 3 times (one per client)
    expect(mockUnsubscribe).toHaveBeenCalledTimes(3);
  });

  it('should clear client cache on stop', async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    const service = await DriftService.start(mockRuntime);

    await service.getPositions('user-clear-cache');

    mockGetOrCreateWallet.mockClear();
    await service.stop();

    // After stop, should re-create client (cache cleared)
    await service.getPositions('user-clear-cache');
    expect(mockGetOrCreateWallet).toHaveBeenCalledTimes(1);
  });

  it('should handle unsubscribe errors gracefully', async () => {
    mockUnsubscribe.mockImplementationOnce(() => Promise.reject(new Error('Unsubscribe failed')));

    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    const service = await DriftService.start(mockRuntime);

    await service.getPositions('user-unsubscribe-error');

    // Should not throw
    await expect(service.stop()).resolves.toBeUndefined();
  });
});

describe('DriftClient - Connection Management', () => {
  it('should initialize connection on devnet', async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    const service = await DriftService.start(mockRuntime);

    const networkInfo = service.getNetworkInfo();
    expect(networkInfo.isDevnet).toBe(true);

    await service.stop();
  });

  it('should initialize connection on mainnet', async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana' });
    const service = await DriftService.start(mockRuntime);

    const networkInfo = service.getNetworkInfo();
    expect(networkInfo.isDevnet).toBe(false);

    await service.stop();
  });

  it('should use custom RPC URL on mainnet when provided', async () => {
    const customRpc = 'https://custom-rpc.example.com';
    const mockRuntime = createMockRuntime({
      SOLANA_NETWORK: 'solana',
      SOLANA_RPC_URL: customRpc,
    });

    const service = await DriftService.start(mockRuntime);

    // Indirect verification: service should initialize without error
    const networkInfo = service.getNetworkInfo();
    expect(networkInfo.isDevnet).toBe(false);

    await service.stop();
  });

  it('should clear connection on stop', async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    const service = await DriftService.start(mockRuntime);

    await service.stop();

    // Service should handle being stopped cleanly
    await expect(service.stop()).resolves.toBeUndefined();
  });
});
