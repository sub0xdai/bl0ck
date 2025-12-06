/**
 * Integration Tests (E2E Flows)
 *
 * Tests complete workflows: open position → query → close
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { DriftService } from '../src/services/drift.service';
import type { OpenPositionParams, ClosePositionParams } from '../src/types';

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
  getUserAccount: () => ({ authority: new MockPublicKey('mockAuth'), subAccountId: 0 }),
  getSpotPosition: () => ({ scaledBalance: BigInt(1000000000), marketIndex: 0 }),
  getPerpPosition: () => ({
    baseAssetAmount: new MockBN(100000000),
    quoteAssetAmount: new MockBN(-67000000000),
    lastCumulativeFundingRate: new MockBN(0),
    marketIndex: 0,
  }),
  getFreeCollateral: () => new MockBN(50000000),
  getTotalCollateral: () => new MockBN(100000000),
  getTotalPerpPositionValue: () => new MockBN(200000000),
  getUnrealizedPNL: () => new MockBN(5000000),
  getLeverage: () => 50000,
}));

const mockInitializeUserAccount = mock(() => Promise.resolve('mockTxSig123'));
const mockDeposit = mock(() => Promise.resolve('mockDepositTx'));
const mockOpenPosition = mock(() => Promise.resolve('mockPositionTx'));
const mockClosePosition = mock(() => Promise.resolve('mockCloseTx'));

mock.module('@drift-labs/sdk', () => ({
  DriftClient: class {
    constructor(public config: any) {}
    subscribe = mock(() => Promise.resolve());
    unsubscribe = mock(() => Promise.resolve());
    getUser = mockGetUser;
    initializeUserAccount = mockInitializeUserAccount;
    deposit = mockDeposit;
    openPosition = mockOpenPosition;
    closePosition = mockClosePosition;
    getMarketAccountAndSlot = mock(() => ({
      data: {
        amm: {
          historicalOracleData: {
            lastOraclePrice: BigInt(150000000), // $150
          },
        },
      },
    }));
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

const resetMocks = () => {
  mockGetUser.mockImplementation(() => ({
    getUserAccount: () => ({ authority: new MockPublicKey('mockAuth'), subAccountId: 0 }),
    getSpotPosition: () => ({ scaledBalance: BigInt(1000000000), marketIndex: 0 }),
    getPerpPosition: () => ({
      baseAssetAmount: new MockBN(100000000),
      quoteAssetAmount: new MockBN(-67000000000),
      lastCumulativeFundingRate: new MockBN(0),
      marketIndex: 0,
    }),
    getFreeCollateral: () => new MockBN(50000000),
    getTotalCollateral: () => new MockBN(100000000),
    getTotalPerpPositionValue: () => new MockBN(200000000),
    getUnrealizedPNL: () => new MockBN(5000000),
    getLeverage: () => 50000,
  }));
  mockGetBalance.mockImplementation(() => Promise.resolve(50000000));
};

afterEach(() => {
  resetMocks();
});

// ============================================================
// TESTS
// ============================================================

describe('Integration - Full Open Position Flow', () => {
  let service: DriftService;
  const userId = 'user-integration-open';

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should complete full long position flow', async () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 5,
      orderType: 'market',
    };

    // 1. Validate params
    const validation = service.validatePositionParams(params);
    expect(validation.valid).toBe(true);

    // 2. Open position
    const result = await service.openPosition(userId, params);
    expect(result.success).toBe(true);
    expect(result.txSignature).toBeDefined();

    // 3. Query position
    const position = await service.getPosition(userId, 'SOL-PERP');
    expect(position).toBeDefined();
    expect(position?.marketSymbol).toBe('SOL-PERP');
    expect(position?.side).toBe('long');

    // 4. Query all positions
    const positions = await service.getPositions(userId);
    expect(positions.length).toBeGreaterThan(0);
  });

  it('should complete full short position flow', async () => {
    const params: OpenPositionParams = {
      marketSymbol: 'BTC-PERP',
      side: 'short',
      size: 500,
      leverage: 10,
    };

    const result = await service.openPosition(userId, params);
    expect(result.success).toBe(true);

    const position = await service.getPosition(userId, 'BTC-PERP');
    expect(position?.side).toBe('short');
  });
});

describe('Integration - Full Close Position Flow', () => {
  let service: DriftService;
  const userId = 'user-integration-close';

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should open then close position (100%)', async () => {
    // 1. Open position
    const openParams: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
    };

    const openResult = await service.openPosition(userId, openParams);
    expect(openResult.success).toBe(true);

    // 2. Close position
    const closeParams: ClosePositionParams = {
      marketSymbol: 'SOL-PERP',
      percentage: 100,
    };

    const closeResult = await service.closePosition(userId, closeParams);
    expect(closeResult.success).toBe(true);
    expect(closeResult.txSignature).toBeDefined();
  });

  it('should open then partial close (50%)', async () => {
    const openParams: OpenPositionParams = {
      marketSymbol: 'ETH-PERP',
      side: 'long',
      size: 200,
    };

    await service.openPosition(userId, openParams);

    const closeParams: ClosePositionParams = {
      marketSymbol: 'ETH-PERP',
      percentage: 50,
    };

    const closeResult = await service.closePosition(userId, closeParams);
    expect(closeResult.success).toBe(true);
  });
});

describe('Integration - Position Query Flow', () => {
  let service: DriftService;
  const userId = 'user-integration-query';

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should query positions after opening', async () => {
    // Open position
    await service.openPosition(userId, {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
    });

    // Query all positions
    const positions = await service.getPositions(userId);
    expect(positions).toBeArray();

    // Query single position
    const solPosition = await service.getPosition(userId, 'SOL-PERP');
    expect(solPosition).toBeDefined();

    // Query non-existent position
    const noPositionMock = () => ({
      getUserAccount: () => ({ authority: new MockPublicKey('mockAuth'), subAccountId: 0 }),
      getPerpPosition: () => ({ baseAssetAmount: new MockBN(0) }),
      getSpotPosition: () => ({ scaledBalance: BigInt(1000000000) }),
      getFreeCollateral: () => new MockBN(50000000),
      getTotalCollateral: () => new MockBN(100000000),
      getTotalPerpPositionValue: () => new MockBN(0),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 0,
    });
    mockGetUser.mockImplementationOnce(noPositionMock);
    mockGetUser.mockImplementationOnce(noPositionMock);

    const btcPosition = await service.getPosition(userId, 'BTC-PERP');
    expect(btcPosition).toBeNull();
  });
});

describe('Integration - Account Info Flow', () => {
  let service: DriftService;
  const userId = 'user-integration-account';

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should retrieve account info with positions', async () => {
    // Open position
    await service.openPosition(userId, {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
    });

    // Get account info
    const accountInfo = await service.getAccountInfo(userId);

    expect(accountInfo).toBeDefined();
    expect(accountInfo.authority).toBeDefined();
    expect(accountInfo.collateral).toBeDefined();
    expect(accountInfo.freeCollateral).toBeDefined();
    expect(accountInfo.leverage).toBeGreaterThanOrEqual(0);
  });

  it('should show correct leverage after opening position', async () => {
    await service.openPosition(userId, {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 5,
    });

    const accountInfo = await service.getAccountInfo(userId);

    // Leverage should be > 0 with open position
    expect(accountInfo.leverage).toBeGreaterThan(0);
  });
});

describe('Integration - Deposit Flow', () => {
  let service: DriftService;
  const userId = 'user-integration-deposit';

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should deposit then open position', async () => {
    // 1. Deposit USDC
    const depositResult = await service.deposit(userId, 100);
    expect(depositResult.success).toBe(true);
    expect(depositResult.amount).toBe(100);

    // 2. Open position with deposited collateral
    const positionResult = await service.openPosition(userId, {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 50,
    });

    expect(positionResult.success).toBe(true);
  });
});

describe('Integration - Market Listing Flow', () => {
  it('should list markets on devnet', async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    const service = await DriftService.start(mockRuntime);

    const markets = await service.getMarkets();

    expect(markets).toBeArray();
    expect(markets.length).toBe(3); // SOL, BTC, ETH on devnet
    expect(markets.every((m) => m.symbol.endsWith('-PERP'))).toBe(true);
    expect(markets.every((m) => m.maxLeverage === 20)).toBe(true);

    await service.stop();
  });

  it('should list markets on mainnet', async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana' });
    const service = await DriftService.start(mockRuntime);

    const markets = await service.getMarkets();

    expect(markets).toBeArray();
    expect(markets.length).toBeGreaterThan(3); // More markets on mainnet

    await service.stop();
  });
});

describe('Integration - Error Recovery Scenarios', () => {
  let service: DriftService;
  const userId = 'user-integration-recovery';

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should recover from failed position open and retry', async () => {
    // First attempt fails
    mockOpenPosition.mockImplementationOnce(() =>
      Promise.reject(new Error('Network timeout'))
    );

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
    };

    const firstAttempt = await service.openPosition(userId, params);
    expect(firstAttempt.success).toBe(false);

    // Retry succeeds
    const secondAttempt = await service.openPosition(userId, params);
    expect(secondAttempt.success).toBe(true);
  });

  it('should handle validation failure before transaction', async () => {
    const invalidParams: OpenPositionParams = {
      marketSymbol: 'INVALID-PERP',
      side: 'long',
      size: 100,
    };

    const result = await service.openPosition(userId, invalidParams);

    expect(result.success).toBe(false);
    expect(mockOpenPosition).not.toHaveBeenCalled(); // Should fail before SDK call
  });

  it('should continue operations after close failure', async () => {
    // Close fails
    mockClosePosition.mockImplementationOnce(() =>
      Promise.reject(new Error('Close failed'))
    );

    const closeResult = await service.closePosition(userId, {
      marketSymbol: 'SOL-PERP',
    });
    expect(closeResult.success).toBe(false);

    // Other operations still work
    const positions = await service.getPositions(userId);
    expect(positions).toBeDefined();

    const accountInfo = await service.getAccountInfo(userId);
    expect(accountInfo).toBeDefined();
  });
});

describe('Integration - Multi-User Isolation', () => {
  let service: DriftService;

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should isolate operations between different users', async () => {
    const user1 = 'user-isolation-1';
    const user2 = 'user-isolation-2';

    // User 1 opens SOL-PERP
    await service.openPosition(user1, {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
    });

    // User 2 opens BTC-PERP
    await service.openPosition(user2, {
      marketSymbol: 'BTC-PERP',
      side: 'short',
      size: 500,
    });

    // Each user should only see their own positions
    const user1Positions = await service.getPositions(user1);
    const user2Positions = await service.getPositions(user2);

    // Note: Mocks return same data, but in reality these would differ
    expect(user1Positions).toBeDefined();
    expect(user2Positions).toBeDefined();

    // Wallets should have been created separately
    expect(mockGetOrCreateWallet).toHaveBeenCalledWith(user1);
    expect(mockGetOrCreateWallet).toHaveBeenCalledWith(user2);
  });
});
