/**
 * DriftService Tests (TDD RED Phase)
 *
 * These tests define expected behavior BEFORE implementation.
 * All tests should FAIL until Phase 2 implementation is complete.
 *
 * Testing CDP-based Solana wallet integration (similar to Hyperliquid pattern)
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { DriftService } from '../src/services/drift.service';
import { CONFIG, ERRORS, DEVNET_MARKETS, MAINNET_MARKETS, PRIORITY_FEE_OPTS } from '../src/constants';
import type {
  OpenPositionParams,
  ClosePositionParams,
  DriftPosition,
  DriftAccountInfo,
  ValidationResult,
} from '../src/types';

// ============================================================
// MOCKS - Drift SDK & Solana Dependencies
// ============================================================

// Comprehensive BN (BigNumber) mock with chain-able methods
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

// Mock PublicKey
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
    spotPositions: [], // Required for validation
    settledPerpPnl: new MockBN(25000000),      // $25 settled PnL
    cumulativePerpFunding: new MockBN(-2000000), // -$2 funding paid
  }),
  getSpotPosition: (index: number) => ({
    scaledBalance: BigInt(1000000000), // 1000 USDC (6 decimals)
    marketIndex: index,
  }),
  getPerpPosition: (index: number) => ({
    baseAssetAmount: new MockBN(100000000), // 0.1 units
    quoteAssetAmount: new MockBN(-67000000000), // -$67,000 USDC
    lastCumulativeFundingRate: new MockBN(0),
    marketIndex: index,
  }),
  getFreeCollateral: () => new MockBN(50000000), // $50
  getTotalCollateral: () => new MockBN(100000000), // $100
  getTotalPerpPositionValue: () => new MockBN(200000000),
  getTotalAssetValue: () => new MockBN(200000000), // $200
  getUnrealizedPNL: () => new MockBN(5000000), // $5
  getLeverage: () => 50000 as number, // 5x (in basis points: 5 * 10000)
  isSubscribed: true, // Required for cache validation
  subscribe: mock(() => Promise.resolve(true)),
  fetchAccounts: mock(() => Promise.resolve()), // Required for getValidatedUser
}));

const mockInitializeUserAccount = mock(() => Promise.resolve('mockTxSig123'));
const mockDeposit = mock(() => Promise.resolve('mockDepositTx'));
const mockWithdraw = mock(() => Promise.resolve('mockWithdrawTx'));
const mockOpenPosition = mock(() => Promise.resolve('mockPositionTx'));
const mockClosePosition = mock(() => Promise.resolve('mockCloseTx'));
const mockGetPerpMarketAccount = mock(() => ({
  amm: {
    historicalOracleData: {
      lastOraclePrice: BigInt(67000000000), // $67,000
    },
  },
}));
const mockConfirmTransaction = mock(() => Promise.resolve({ value: { err: null } }));

// Mock DriftClient
mock.module('@drift-labs/sdk', () => ({
  DriftClient: class {
    constructor(public config: any) { }
    subscribe = mock(() => Promise.resolve(true)); // Must return true for validation
    unsubscribe = mock(() => Promise.resolve());
    hasUser = mock(() => true); // Account exists
    getUser = mockGetUser;
    initializeUserAccount = mockInitializeUserAccount;
    deposit = mockDeposit;
    withdraw = mockWithdraw;
    placeAndTakePerpOrder = mockOpenPosition;
    closePosition = mockClosePosition;
    getPerpMarketAccount = mockGetPerpMarketAccount;
  },
  Wallet: class {
    constructor(public keypair: any) { }
  },
  BN: MockBN,
  PositionDirection: {
    LONG: 0,
    SHORT: 1,
  },
  MarketType: {
    PERP: 0,
    SPOT: 1,
  },
  OrderType: {
    MARKET: 0,
    LIMIT: 1,
  },
  getMarketOrderParams: (params: any) => params,
}));

// Mock Solana Web3
const mockGetBalance = mock(() => Promise.resolve(50000000)); // 0.05 SOL (9 decimals)
const mockGetTokenAccountBalance = mock(() => Promise.resolve({
  value: {
    amount: '10000000000', // $10,000 USDC default
    decimals: 6,
    uiAmount: 10000,
  },
}));
const mockSendTransaction = mock(() => Promise.resolve('mockSolanaTx'));

mock.module('@solana/web3.js', () => ({
  Connection: class {
    constructor(public endpoint: string) { }
    getBalance = mockGetBalance;
    getTokenAccountBalance = mockGetTokenAccountBalance;
    sendTransaction = mockSendTransaction;
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

// Mock @solana/spl-token
mock.module('@solana/spl-token', () => ({
  getAssociatedTokenAddressSync: mock((mint: any, owner: any) => {
    return new MockPublicKey('mockUsdcAta');
  }),
}));

// Mock SolanaTransactionManager
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









// Mock Jupiter Service
const mockJupiterGetQuote = mock(() => Promise.resolve({
  inAmount: '500000000',      // 0.5 SOL in lamports
  outAmount: '55000000',      // 55 USDC (6 decimals)
  priceImpactPct: '0.1',
  routePlan: [{ swapInfo: { label: 'Orca' } }],
}));

const mockJupiterExecuteSwap = mock(() => Promise.resolve({
  transactionHash: 'mockJupiterSwapTx123',
  inputToken: 'So11111111111111111111111111111111111111112',
  outputToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  inputAmount: '500000000',
  outputAmount: '55000000',
  priceImpact: '0.1',
  explorerUrl: 'https://solscan.io/tx/mockJupiterSwapTx123',
}));

const mockJupiterService = {
  getQuote: mockJupiterGetQuote,
  executeSwap: mockJupiterExecuteSwap,
};

// Mock Runtime
const createMockRuntime = (settings: Record<string, string | undefined> = {}, options: { jupiterAvailable?: boolean } = {}) => ({
  getSetting: (key: string) => settings[key],
  agentId: 'test-agent-123',
  character: { name: 'Test Lina' },
  getService: (type: string) => {
    if (type === 'JUPITER_SERVICE' && options.jupiterAvailable !== false) {
      return mockJupiterService;
    }
    return null;
  },
}) as any;

// Helper to reset all mocks to default behavior
const resetMocksToDefault = () => {
  mockGetUser.mockImplementation(() => ({
    getUserAccount: () => ({
      authority: new MockPublicKey('mockAuthority123'),
      subAccountId: 0,
      spotPositions: [], // Required for validation
    }),
    getSpotPosition: (index: number) => ({ scaledBalance: BigInt(1000000000), marketIndex: index }),
    getPerpPosition: (index: number) => ({
      baseAssetAmount: new MockBN(100000000),
      quoteAssetAmount: new MockBN(-67000000000),
      lastCumulativeFundingRate: new MockBN(0),
      marketIndex: index,
    }),
    getFreeCollateral: () => new MockBN(50000000),
    getTotalCollateral: () => new MockBN(100000000),
    getTotalPerpPositionValue: () => new MockBN(200000000),
    getTotalAssetValue: () => new MockBN(200000000),
    getUnrealizedPNL: () => new MockBN(5000000),
    getLeverage: () => 50000 as number,
    isSubscribed: true, // Required for cache validation
    subscribe: mock(() => Promise.resolve(true)),
    fetchAccounts: mock(() => Promise.resolve()), // Required for getValidatedUser
  }));
  mockGetBalance.mockImplementation(() => Promise.resolve(50000000));
  mockGetTokenAccountBalance.mockImplementation(() => Promise.resolve({
    value: {
      amount: '10000000000',
      decimals: 6,
      uiAmount: 10000,
    },
  }));
  mockInitializeUserAccount.mockImplementation(() => Promise.resolve('mockTxSig123'));
  // Reset Jupiter mocks
  mockJupiterGetQuote.mockImplementation(() => Promise.resolve({
    inAmount: '500000000',
    outAmount: '55000000',
    priceImpactPct: '0.1',
    routePlan: [{ swapInfo: { label: 'Orca' } }],
  }));
  mockJupiterExecuteSwap.mockImplementation(() => Promise.resolve({
    transactionHash: 'mockJupiterSwapTx123',
    inputToken: 'So11111111111111111111111111111111111111112',
    outputToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    inputAmount: '500000000',
    outputAmount: '55000000',
    priceImpact: '0.1',
    explorerUrl: 'https://solscan.io/tx/mockJupiterSwapTx123',
  }));
};

// Global afterEach to reset mocks between tests
afterEach(() => {
  resetMocksToDefault();
});

// ============================================================
// TESTS
// ============================================================

describe('DriftService - Initialization', () => {
  let service: DriftService;
  let mockRuntime: any;

  beforeEach(() => {
    mockRuntime = createMockRuntime({
      SOLANA_NETWORK: 'solana-devnet',
    });
    service = new DriftService(mockRuntime);
  });

  it('should have correct service type', () => {
    expect(service.serviceType).toBe('DRIFT_SERVICE');
  });

  it('should initialize on devnet when SOLANA_NETWORK=solana-devnet', async () => {
    const devnetRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    const devnetService = await DriftService.start(devnetRuntime);

    const networkInfo = devnetService.getNetworkInfo();
    expect(networkInfo.isDevnet).toBe(true);
    expect(networkInfo.marketCount).toBe(Object.keys(DEVNET_MARKETS).length);
  });

  it('should initialize on mainnet when SOLANA_NETWORK=solana', async () => {
    const mainnetRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana' });
    const mainnetService = await DriftService.start(mainnetRuntime);

    const networkInfo = mainnetService.getNetworkInfo();
    expect(networkInfo.isDevnet).toBe(false);
    expect(networkInfo.marketCount).toBe(Object.keys(MAINNET_MARKETS).length);
  });

  it('should default to devnet when SOLANA_NETWORK not set', async () => {
    const defaultRuntime = createMockRuntime({});
    const defaultService = await DriftService.start(defaultRuntime);

    const networkInfo = defaultService.getNetworkInfo();
    expect(networkInfo.isDevnet).toBe(true);
  });

  it('should stop correctly', async () => {
    await DriftService.start(mockRuntime);
    await expect(service.stop()).resolves.toBeUndefined();
  });
});

describe('DriftService - Client Management (Per-User Isolation)', () => {
  let service: DriftService;
  let mockRuntime: any;

  beforeEach(async () => {
    mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);

    // Clear mocks
    mockGetOrCreateWallet.mockClear();
    mockGetUser.mockClear();
  });

  it('should create DriftClient on first user operation', async () => {
    await service.getPositions('user-123');

    expect(mockGetOrCreateWallet).toHaveBeenCalledTimes(1);
    expect(mockGetOrCreateWallet).toHaveBeenCalledWith('user-123');
  });

  it('should reuse DriftClient for same user', async () => {
    await service.getPositions('user-123');
    await service.getAccountInfo('user-123');

    // Wallet should only be created once
    expect(mockGetOrCreateWallet).toHaveBeenCalledTimes(1);
  });

  it('should create separate clients for different users', async () => {
    await service.getPositions('user-123');
    await service.getPositions('user-456');

    expect(mockGetOrCreateWallet).toHaveBeenCalledTimes(2);
    expect(mockGetOrCreateWallet).toHaveBeenNthCalledWith(1, 'user-123');
    expect(mockGetOrCreateWallet).toHaveBeenNthCalledWith(2, 'user-456');
  });

  it('should initialize Drift user account if not exists', async () => {
    // Clear mock call history
    mockInitializeUserAccount.mockClear();

    // Track initialization state
    let accountInitialized = false;

    // Mock: first call throws (account not initialized), subsequent calls work
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => {
        if (!accountInitialized) {
          throw new Error("User account not initialized");
        }
        return { authority: new MockPublicKey('mockAuth'), subAccountId: 0 };
      },
      getSpotPosition: () => ({ scaledBalance: BigInt(1000000000) }),
      getPerpPosition: () => ({ baseAssetAmount: new MockBN(100000000), quoteAssetAmount: new MockBN(-67000000000) }),
      getFreeCollateral: () => new MockBN(50000000),
      getTotalCollateral: () => new MockBN(100000000),
      getTotalPerpPositionValue: () => new MockBN(200000000),
  getTotalAssetValue: () => new MockBN(200000000),
      getUnrealizedPNL: () => new MockBN(5000000),
      getLeverage: () => 50000,
      subscribe: mock(() => Promise.resolve()),
    }));

    // When initializeUserAccount is called, mark account as initialized
    mockInitializeUserAccount.mockImplementation(() => {
      accountInitialized = true;
      return Promise.resolve('mockInitTx');
    });

    await service.openPosition('user-new-init', {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 5,
    });

    expect(mockInitializeUserAccount).toHaveBeenCalled();
    // afterEach will reset mocks
  });

  it('should check SOL balance before initializing Drift account', async () => {
    // Mock: account doesn't exist AND insufficient SOL
    mockGetUser.mockImplementationOnce(() => ({
      getUserAccount: () => { throw new Error("User account not initialized"); },
      getSpotPosition: () => ({ scaledBalance: BigInt(1000000000) }),
      getPerpPosition: () => ({ baseAssetAmount: new MockBN(100000000) }),
      getFreeCollateral: () => new MockBN(50000000),
      getTotalCollateral: () => new MockBN(100000000),
      getTotalPerpPositionValue: () => new MockBN(200000000),
  getTotalAssetValue: () => new MockBN(200000000),
      getUnrealizedPNL: () => new MockBN(5000000),
      getLeverage: () => 50000,
      subscribe: mock(() => Promise.resolve()),
    }));
    mockGetBalance.mockImplementationOnce(() => Promise.resolve(1000000)); // 0.001 SOL (insufficient)

    const result = await service.openPosition('user-broke', {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Need at least');
    expect(result.error).toContain('SOL');
  });

  it('should prevent race condition on concurrent user initialization', async () => {
    // Simulate two concurrent operations from same user
    const promise1 = service.getPositions('user-concurrent');
    const promise2 = service.openPosition('user-concurrent', {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
    });

    await Promise.all([promise1, promise2]);

    // Wallet is retrieved: once for client init + once for balance check + once for deposit
    // All should use same userId and share cached client
    expect(mockGetOrCreateWallet).toHaveBeenCalled();
    // All calls should be for same user
    const calls = mockGetOrCreateWallet.mock.calls;
    expect(calls.every((call: string[]) => call[0] === 'user-concurrent')).toBe(true);
  });
});

describe('DriftService - Position Parameter Validation', () => {
  let service: DriftService;

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
  });

  it('should validate valid long position parameters', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 5,
      orderType: 'market',
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate valid short position parameters', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'BTC-PERP',
      side: 'short',
      size: 500,
      leverage: 10,
      orderType: 'market',
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate valid limit order parameters', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'ETH-PERP',
      side: 'long',
      size: 200,
      leverage: 3,
      orderType: 'limit',
      limitPrice: 3500,
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(true);
  });

  it('should reject unknown market symbol', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'DOGE-PERP', // Not in DEVNET_MARKETS
      side: 'long',
      size: 100,
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Unknown market'))).toBe(true);
  });

  it('should reject empty market symbol', () => {
    const params: OpenPositionParams = {
      marketSymbol: '',
      side: 'long',
      size: 100,
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(false);
  });

  it('should reject size below minimum ($10)', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 5, // Below $10 minimum
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('below minimum'))).toBe(true);
  });

  it('should reject zero size', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 0,
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(false);
  });

  it('should reject negative size', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: -100,
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(false);
  });

  it('should reject leverage above maximum (20x)', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 25, // Above 20x max
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(true);
  });

  it('should reject leverage below minimum (1x)', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 0.5,
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(false);
  });

  it('should accept maximum leverage (20x)', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 20,
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(true);
  });

  it('should default to 1x leverage when not specified', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      // No leverage specified
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(true);
  });

  it('should reject limit order without price', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      orderType: 'limit',
      // Missing limitPrice
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('limit price'))).toBe(true);
  });

  it('should reject limit order with zero price', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      orderType: 'limit',
      limitPrice: 0,
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(false);
  });

  it('should collect multiple validation errors', () => {
    const params: OpenPositionParams = {
      marketSymbol: 'INVALID-PERP',
      side: 'long',
      size: 5, // Too small
      leverage: 30, // Too high
      orderType: 'limit',
      // Missing limitPrice
    };

    const result = service.validatePositionParams(params);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('DriftService - Close Position Validation', () => {
  let service: DriftService;

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
  });

  it('should validate full close (100%)', () => {
    const params: ClosePositionParams = {
      marketSymbol: 'SOL-PERP',
      percentage: 100,
    };

    const result = service.validateCloseParams(params);
    expect(result.valid).toBe(true);
  });

  it('should validate partial close (50%)', () => {
    const params: ClosePositionParams = {
      marketSymbol: 'BTC-PERP',
      percentage: 50,
    };

    const result = service.validateCloseParams(params);
    expect(result.valid).toBe(true);
  });

  it('should default to 100% when percentage not specified', () => {
    const params: ClosePositionParams = {
      marketSymbol: 'SOL-PERP',
    };

    const result = service.validateCloseParams(params);
    expect(result.valid).toBe(true);
  });

  it('should reject percentage below 1', () => {
    const params: ClosePositionParams = {
      marketSymbol: 'SOL-PERP',
      percentage: 0,
    };

    const result = service.validateCloseParams(params);
    expect(result.valid).toBe(false);
  });

  it('should reject percentage above 100', () => {
    const params: ClosePositionParams = {
      marketSymbol: 'SOL-PERP',
      percentage: 150,
    };

    const result = service.validateCloseParams(params);
    expect(result.valid).toBe(false);
  });

  it('should reject unknown market symbol', () => {
    const params: ClosePositionParams = {
      marketSymbol: 'SHIB-PERP', // Not in devnet
      percentage: 100,
    };

    const result = service.validateCloseParams(params);
    expect(result.valid).toBe(false);
  });
});

describe('DriftService - Position Operations', () => {
  let service: DriftService;
  let mockRuntime: any;

  beforeEach(async () => {
    mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);

    mockOpenPosition.mockClear();
    mockClosePosition.mockClear();
  });

  it('should open long position with valid parameters', async () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 5,
      orderType: 'market',
    };

    const result = await service.openPosition('user-123', params);

    expect(result.success).toBe(true);
    expect(result.txSignature).toBeDefined();
    expect(mockOpenPosition).toHaveBeenCalled();
  });

  it('should open short position with valid parameters', async () => {
    const params: OpenPositionParams = {
      marketSymbol: 'BTC-PERP',
      side: 'short',
      size: 500,
      leverage: 10,
    };

    const result = await service.openPosition('user-123', params);

    expect(result.success).toBe(true);
    expect(mockOpenPosition).toHaveBeenCalled();
  });

  it('should pass priority fee options to placeAndTakePerpOrder', async () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 2,
    };

    await service.openPosition('user-123', params);

    // Verify placeAndTakePerpOrder was called with priority fee options (6th argument)
    expect(mockOpenPosition).toHaveBeenCalledWith(
      expect.anything(), // orderParams
      undefined,         // makerInfo
      undefined,         // referrerInfo
      undefined,         // successCondition
      undefined,         // auctionDurationPercentage
      PRIORITY_FEE_OPTS  // txParams with priority fees
    );
  });

  it('should return validation error for invalid parameters', async () => {
    const params: OpenPositionParams = {
      marketSymbol: 'INVALID-PERP',
      side: 'long',
      size: 0,
      leverage: 50,
    };

    const result = await service.openPosition('user-123', params);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockOpenPosition).not.toHaveBeenCalled();
  });

  it('should close full position (100%)', async () => {
    const params: ClosePositionParams = {
      marketSymbol: 'SOL-PERP',
      percentage: 100,
    };

    const result = await service.closePosition('user-123', params);

    expect(result.success).toBe(true);
    expect(result.txSignature).toBeDefined();
    // Note: closePosition now uses placeAndTakePerpOrder with reduceOnly
    expect(mockOpenPosition).toHaveBeenCalled();
  });

  it('should close partial position (50%)', async () => {
    const params: ClosePositionParams = {
      marketSymbol: 'ETH-PERP',
      percentage: 50,
    };

    const result = await service.closePosition('user-123', params);

    expect(result.success).toBe(true);
    // Note: closePosition now uses placeAndTakePerpOrder with reduceOnly
    expect(mockOpenPosition).toHaveBeenCalled();
  });

  it('should return error when closing non-existent position', async () => {
    // Mock no position - need to set up for BOTH getUser() calls:
    // 1. During getClientForUser initialization check
    // 2. During the actual closePosition operation
    const noPositionMock = () => ({
      getUserAccount: () => ({ authority: new MockPublicKey('mockAuth'), subAccountId: 0, spotPositions: [] }),
      getPerpPosition: () => ({
        baseAssetAmount: new MockBN(0),
        quoteAssetAmount: new MockBN(0),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: 0,
      }), // No position
      getSpotPosition: () => ({ scaledBalance: BigInt(1000000000), marketIndex: 0 }),
      getFreeCollateral: () => new MockBN(50000000),
      getTotalCollateral: () => new MockBN(100000000),
      getTotalPerpPositionValue: () => new MockBN(200000000),
      getTotalAssetValue: () => new MockBN(200000000),
      getUnrealizedPNL: () => new MockBN(5000000),
      getLeverage: () => 50000,
      isSubscribed: true,
      subscribe: mock(() => Promise.resolve(true)),
      fetchAccounts: mock(() => Promise.resolve()),
    });
    mockGetUser.mockImplementationOnce(noPositionMock);
    mockGetUser.mockImplementationOnce(noPositionMock);

    const params: ClosePositionParams = {
      marketSymbol: 'SOL-PERP',
    };

    const result = await service.closePosition('user-no-position', params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No open position');
  });
});

describe('DriftService - Auto-Collateral (Jupiter Integration)', () => {
  let service: DriftService;
  let mainnetService: DriftService;

  beforeEach(async () => {
    // Devnet service (default)
    const devnetRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(devnetRuntime);

    // Mainnet service for Jupiter tests
    const mainnetRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana' });
    mainnetService = await DriftService.start(mainnetRuntime);

    // Clear Jupiter mock call history
    mockJupiterGetQuote.mockClear();
    mockJupiterExecuteSwap.mockClear();
  });

  it('should auto-swap SOL to USDC when insufficient collateral on mainnet', async () => {
    // Mock: wallet has only $10 USDC but needs $20 margin for position (size 100 at 5x)
    mockGetTokenAccountBalance.mockImplementation(() => Promise.resolve({
      value: {
        amount: '10000000', // $10 USDC - insufficient
        decimals: 6,
        uiAmount: 10,
      },
    }));
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({ authority: new MockPublicKey('mockAuth'), subAccountId: 0 }),
      getSpotPosition: () => ({ scaledBalance: BigInt(10000000), marketIndex: 0 }), // $10 USDC
      getPerpPosition: () => ({
        baseAssetAmount: new MockBN(0),
        quoteAssetAmount: new MockBN(0),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: 0,
      }),
      getFreeCollateral: () => new MockBN(10000000), // $10 - insufficient for $20 margin
      getTotalCollateral: () => new MockBN(10000000),
      getTotalPerpPositionValue: () => new MockBN(0),
  getTotalAssetValue: () => new MockBN(0),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 0,
      subscribe: mock(() => Promise.resolve()),
    }));

    // Mock sufficient SOL balance for swap (1 SOL)
    mockGetBalance.mockImplementation(() => Promise.resolve(1000000000));

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100, // $100 position at 5x = $20 margin required, user has $10
      leverage: 5,
    };

    const result = await mainnetService.openPosition('user-low-collateral', params);

    // Jupiter swap should have been called
    expect(mockJupiterGetQuote).toHaveBeenCalled();
    expect(mockJupiterExecuteSwap).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('should deposit USDC to Drift before opening position', async () => {
    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
    };

    await service.openPosition('user-123', params);

    expect(mockDeposit).toHaveBeenCalled();
  });

  it('should skip swap when user has sufficient USDC collateral', async () => {
    // Mock: user already has $100 USDC - sufficient for $50 position
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({ authority: new MockPublicKey('mockAuth'), subAccountId: 0 }),
      getSpotPosition: () => ({ scaledBalance: BigInt(100000000), marketIndex: 0 }),
      getPerpPosition: () => ({
        baseAssetAmount: new MockBN(0),
        quoteAssetAmount: new MockBN(0),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: 0,
      }),
      getFreeCollateral: () => new MockBN(100000000), // $100 USDC - sufficient
      getTotalCollateral: () => new MockBN(100000000),
      getTotalPerpPositionValue: () => new MockBN(0),
  getTotalAssetValue: () => new MockBN(0),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 0,
      subscribe: mock(() => Promise.resolve()),
    }));

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 50,
    };

    const result = await mainnetService.openPosition('user-123', params);

    expect(result.success).toBe(true);
    // Jupiter swap should NOT have been called
    expect(mockJupiterExecuteSwap).not.toHaveBeenCalled();
  });

  it('should fail gracefully when Jupiter service unavailable on mainnet', async () => {
    // Create runtime without Jupiter
    const noJupiterRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana' }, { jupiterAvailable: false });
    const noJupiterService = await DriftService.start(noJupiterRuntime);

    // Mock: wallet has no USDC - needs swap
    mockGetTokenAccountBalance.mockImplementation(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({ authority: new MockPublicKey('mockAuth'), subAccountId: 0 }),
      getSpotPosition: () => ({ scaledBalance: BigInt(0), marketIndex: 0 }),
      getPerpPosition: () => ({
        baseAssetAmount: new MockBN(0),
        quoteAssetAmount: new MockBN(0),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: 0,
      }),
      getFreeCollateral: () => new MockBN(0), // $0 - needs swap
      getTotalCollateral: () => new MockBN(0),
      getTotalPerpPositionValue: () => new MockBN(0),
  getTotalAssetValue: () => new MockBN(0),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 0,
      subscribe: mock(() => Promise.resolve()),
    }));

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 50,
    };

    const result = await noJupiterService.openPosition('user-no-jupiter', params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Jupiter');
  });

  it('should fail when SOL to USDC swap transaction fails', async () => {
    // Mock: wallet has no USDC - needs swap
    mockGetTokenAccountBalance.mockImplementation(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({ authority: new MockPublicKey('mockAuth'), subAccountId: 0 }),
      getSpotPosition: () => ({ scaledBalance: BigInt(0), marketIndex: 0 }),
      getPerpPosition: () => ({
        baseAssetAmount: new MockBN(0),
        quoteAssetAmount: new MockBN(0),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: 0,
      }),
      getFreeCollateral: () => new MockBN(0), // $0 - needs swap
      getTotalCollateral: () => new MockBN(0),
      getTotalPerpPositionValue: () => new MockBN(0),
  getTotalAssetValue: () => new MockBN(0),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 0,
      subscribe: mock(() => Promise.resolve()),
    }));

    // Mock Jupiter swap failure
    mockJupiterExecuteSwap.mockImplementationOnce(() => Promise.reject(new Error('Swap failed: insufficient liquidity')));

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 50,
    };

    const result = await mainnetService.openPosition('user-swap-fail', params);

    expect(result.success).toBe(false);
    expect(result.error?.toLowerCase()).toContain('swap');
  });

  it('should skip auto-swap on devnet with helpful error message', async () => {
    // Mock: wallet has no USDC - needs swap but on devnet
    mockGetTokenAccountBalance.mockImplementation(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({ authority: new MockPublicKey('mockAuth'), subAccountId: 0 }),
      getSpotPosition: () => ({ scaledBalance: BigInt(0), marketIndex: 0 }),
      getPerpPosition: () => ({
        baseAssetAmount: new MockBN(0),
        quoteAssetAmount: new MockBN(0),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: 0,
      }),
      getFreeCollateral: () => new MockBN(0), // $0 - needs swap
      getTotalCollateral: () => new MockBN(0),
      getTotalPerpPositionValue: () => new MockBN(0),
  getTotalAssetValue: () => new MockBN(0),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 0,
      subscribe: mock(() => Promise.resolve()),
    }));

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 50,
    };

    const result = await service.openPosition('user-devnet', params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('devnet');
    expect(result.error).toContain('manually swap');
    // Jupiter should NOT have been called
    expect(mockJupiterExecuteSwap).not.toHaveBeenCalled();
  });

  it('should calculate swap amount with 10% buffer', async () => {
    // Mock: wallet has $0 USDC, needs $50 for margin → should swap ~$55 worth
    mockGetTokenAccountBalance.mockImplementation(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({ authority: new MockPublicKey('mockAuth'), subAccountId: 0 }),
      getSpotPosition: () => ({ scaledBalance: BigInt(0), marketIndex: 0 }),
      getPerpPosition: () => ({
        baseAssetAmount: new MockBN(0),
        quoteAssetAmount: new MockBN(0),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: 0,
      }),
      getFreeCollateral: () => new MockBN(0), // $0
      getTotalCollateral: () => new MockBN(0),
      getTotalPerpPositionValue: () => new MockBN(0),
  getTotalAssetValue: () => new MockBN(0),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 0,
      subscribe: mock(() => Promise.resolve()),
    }));

    // Mock sufficient SOL balance for swap (1 SOL)
    mockGetBalance.mockImplementation(() => Promise.resolve(1000000000));

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 250, // $250 position at 5x = $50 margin needed
      leverage: 5,
    };

    await mainnetService.openPosition('user-buffer-test', params);

    // Verify getQuote was called (buffer logic is internal)
    expect(mockJupiterGetQuote).toHaveBeenCalled();
    expect(mockJupiterExecuteSwap).toHaveBeenCalled();
  });

  it('should fail when user has insufficient SOL for auto-swap', async () => {
    // Mock: wallet has no USDC - needs swap but has very low SOL
    mockGetTokenAccountBalance.mockImplementation(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({ authority: new MockPublicKey('mockAuth'), subAccountId: 0 }),
      getSpotPosition: () => ({ scaledBalance: BigInt(0), marketIndex: 0 }),
      getPerpPosition: () => ({
        baseAssetAmount: new MockBN(0),
        quoteAssetAmount: new MockBN(0),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: 0,
      }),
      getFreeCollateral: () => new MockBN(0), // $0 - needs swap
      getTotalCollateral: () => new MockBN(0),
      getTotalPerpPositionValue: () => new MockBN(0),
  getTotalAssetValue: () => new MockBN(0),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 0,
      subscribe: mock(() => Promise.resolve()),
    }));

    // Mock very low SOL balance (0.001 SOL - not enough for swap)
    mockGetBalance.mockImplementation(() => Promise.resolve(1000000)); // 0.001 SOL

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 5,
    };

    const result = await mainnetService.openPosition('user-low-sol', params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient SOL');
    // Jupiter should NOT have been called since SOL check happens first
    expect(mockJupiterExecuteSwap).not.toHaveBeenCalled();
  });

  it('should fail when price impact exceeds maximum threshold', async () => {
    // Mock: wallet has no USDC - needs swap
    mockGetTokenAccountBalance.mockImplementation(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({ authority: new MockPublicKey('mockAuth'), subAccountId: 0 }),
      getSpotPosition: () => ({ scaledBalance: BigInt(0), marketIndex: 0 }),
      getPerpPosition: () => ({
        baseAssetAmount: new MockBN(0),
        quoteAssetAmount: new MockBN(0),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: 0,
      }),
      getFreeCollateral: () => new MockBN(0), // $0 - needs swap
      getTotalCollateral: () => new MockBN(0),
      getTotalPerpPositionValue: () => new MockBN(0),
  getTotalAssetValue: () => new MockBN(0),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 0,
      subscribe: mock(() => Promise.resolve()),
    }));

    // Mock sufficient SOL balance for swap (1 SOL)
    mockGetBalance.mockImplementation(() => Promise.resolve(1000000000));

    // Mock high price impact from Jupiter quote
    mockJupiterGetQuote.mockImplementationOnce(() => Promise.resolve({
      inAmount: '500000000',
      outAmount: '55000000',
      priceImpactPct: '5.5', // 5.5% - exceeds MAX_PRICE_IMPACT_PERCENT (2%)
      routePlan: [{ swapInfo: { label: 'Orca' } }],
    }));

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 5,
    };

    const result = await mainnetService.openPosition('user-high-impact', params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Price impact too high');
    // Quote was called but swap should NOT have been called
    expect(mockJupiterGetQuote).toHaveBeenCalled();
    expect(mockJupiterExecuteSwap).not.toHaveBeenCalled();
  });
});

describe('DriftService - Query Operations', () => {
  let service: DriftService;

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
  });

  it('should get single position by market symbol', async () => {
    const position = await service.getPosition('user-123', 'SOL-PERP');

    expect(position).toBeDefined();
    expect(position?.marketSymbol).toBe('SOL-PERP');
    expect(position?.side).toBeOneOf(['long', 'short']);
  });

  it('should return null for non-existent position', async () => {
    // Mock no position - need to set up for both getUser() calls
    const noPositionMock = () => ({
      getUserAccount: () => ({ authority: new MockPublicKey('mockAuth'), subAccountId: 0 }),
      getPerpPosition: () => ({
        baseAssetAmount: new MockBN(0),
        quoteAssetAmount: new MockBN(0),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: 0,
      }), // No position
      getSpotPosition: () => ({ scaledBalance: BigInt(1000000000), marketIndex: 0 }),
      getFreeCollateral: () => new MockBN(50000000),
      getTotalCollateral: () => new MockBN(100000000),
      getTotalPerpPositionValue: () => new MockBN(200000000),
  getTotalAssetValue: () => new MockBN(200000000),
      getUnrealizedPNL: () => new MockBN(5000000),
      getLeverage: () => 50000,
      subscribe: mock(() => Promise.resolve()),
    });
    mockGetUser.mockImplementationOnce(noPositionMock);
    mockGetUser.mockImplementationOnce(noPositionMock);

    const position = await service.getPosition('user-no-btc', 'BTC-PERP');

    expect(position).toBeNull();
  });

  it('should get all open positions', async () => {
    const positions = await service.getPositions('user-123');

    expect(positions).toBeArray();
    expect(positions.length).toBeGreaterThanOrEqual(0);
  });

  it('should get account info with collateral and leverage', async () => {
    const accountInfo = await service.getAccountInfo('user-123');

    expect(accountInfo).toBeDefined();
    expect(accountInfo.authority).toBeDefined();
    expect(accountInfo.collateral).toBeDefined();
    expect(accountInfo.freeCollateral).toBeDefined();
    expect(accountInfo.leverage).toBeGreaterThanOrEqual(0);
  });

  it('should get markets with correct network filtering', async () => {
    const markets = await service.getMarkets();

    expect(markets).toBeArray();
    expect(markets.length).toBe(Object.keys(DEVNET_MARKETS).length);
    expect(markets.every(m => m.symbol.endsWith('-PERP'))).toBe(true);
  });

  it('should return different market count for mainnet', async () => {
    const mainnetRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana' });
    const mainnetService = await DriftService.start(mainnetRuntime);

    const markets = await mainnetService.getMarkets();

    expect(markets.length).toBe(Object.keys(MAINNET_MARKETS).length);
  });
});

describe('DriftService - Leverage Risk Assessment', () => {
  let service: DriftService;

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
  });

  it('should NOT require confirmation for 1x leverage', () => {
    expect(service.requiresHighRiskConfirmation(1)).toBe(false);
  });

  it('should NOT require confirmation for 5x leverage', () => {
    expect(service.requiresHighRiskConfirmation(5)).toBe(false);
  });

  it('should require confirmation for 6x leverage', () => {
    expect(service.requiresHighRiskConfirmation(6)).toBe(true);
  });

  it('should require confirmation for 10x leverage', () => {
    expect(service.requiresHighRiskConfirmation(10)).toBe(true);
  });

  it('should require confirmation for 20x leverage', () => {
    expect(service.requiresHighRiskConfirmation(20)).toBe(true);
  });
});

describe('DriftService - Liquidation Price Calculation', () => {
  let service: DriftService;

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
  });

  it('should calculate liquidation price for long position', () => {
    const entryPrice = 150; // $150 SOL
    const leverage = 10;
    const side = 'long';

    const liquidationPrice = service.calculateLiquidationPrice(entryPrice, leverage, side);

    // At 10x leverage, liq price should be ~9-10% below entry
    expect(liquidationPrice).toBeLessThan(entryPrice);
    expect(liquidationPrice).toBeGreaterThan(entryPrice * 0.85);
  });

  it('should calculate liquidation price for short position', () => {
    const entryPrice = 67000; // $67,000 BTC
    const leverage = 10;
    const side = 'short';

    const liquidationPrice = service.calculateLiquidationPrice(entryPrice, leverage, side);

    // At 10x leverage, liq price should be ~9-10% above entry for shorts
    expect(liquidationPrice).toBeGreaterThan(entryPrice);
    expect(liquidationPrice).toBeLessThan(entryPrice * 1.15);
  });

  it('should have tighter liquidation price for higher leverage (long)', () => {
    const entryPrice = 3500; // $3,500 ETH

    const liq5x = service.calculateLiquidationPrice(entryPrice, 5, 'long');
    const liq10x = service.calculateLiquidationPrice(entryPrice, 10, 'long');
    const liq20x = service.calculateLiquidationPrice(entryPrice, 20, 'long');

    // Higher leverage = closer liquidation price
    expect(liq20x).toBeGreaterThan(liq10x);
    expect(liq10x).toBeGreaterThan(liq5x);
  });

  it('should have tighter liquidation price for higher leverage (short)', () => {
    const entryPrice = 150;

    const liq5x = service.calculateLiquidationPrice(entryPrice, 5, 'short');
    const liq10x = service.calculateLiquidationPrice(entryPrice, 10, 'short');
    const liq20x = service.calculateLiquidationPrice(entryPrice, 20, 'short');

    // Higher leverage = closer liquidation price (lower for shorts)
    expect(liq20x).toBeLessThan(liq10x);
    expect(liq10x).toBeLessThan(liq5x);
  });
});

describe('DriftService - Deposit/Collateral Management', () => {
  let service: DriftService;

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    service = await DriftService.start(mockRuntime);
  });

  it('should deposit USDC to Drift account', async () => {
    const result = await service.deposit('user-123', 100);

    expect(result.success).toBe(true);
    expect(result.txSignature).toBeDefined();
    expect(result.amount).toBe(100);
    expect(mockDeposit).toHaveBeenCalled();
  });

  it('should reject deposit below minimum', async () => {
    const result = await service.deposit('user-123', 5); // Below $10 min

    expect(result.success).toBe(false);
    expect(result.error).toContain('minimum');
  });

  it('should reject deposit when user has no USDC', async () => {
    // Mock: wallet has 0 USDC
    mockGetTokenAccountBalance.mockImplementation(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC in wallet
        decimals: 6,
        uiAmount: 0,
      },
    }));

    const result = await service.deposit('user-no-usdc', 100);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient');
  });
});

// ============================================================
// WITHDRAW TESTS
// ============================================================

describe('DriftService - withdraw', () => {
  let service: DriftService;

  beforeEach(async () => {
    // Reset mocks
    mockWithdraw.mockClear();
    mockGetUser.mockClear();
    mockConfirmTransaction.mockClear();

    // Reset to default mock behavior (sufficient free collateral)
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({
        authority: new MockPublicKey('mockAuth'),
        subAccountId: 0,
        spotPositions: [],
      }),
      getFreeCollateral: () => new MockBN(100_000_000), // $100 free
      getTotalCollateral: () => new MockBN(150_000_000),
      getTotalAssetValue: () => new MockBN(50_000_000),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 10000,
      isSubscribed: true,
      subscribe: mock(() => Promise.resolve(true)),
      fetchAccounts: mock(() => Promise.resolve()),
    }));

    const mockRuntime = {
      getSetting: (key: string) => {
        if (key === 'SOLANA_NETWORK') return 'devnet';
        return undefined;
      },
      getService: () => null,
    };

    service = new DriftService(mockRuntime as any);
    await (service as any).initialize();
  });

  it('should withdraw USDC successfully', async () => {
    const result = await service.withdraw('user-123', 50);

    expect(result.success).toBe(true);
    expect(result.amount).toBe(50);
    expect(result.txSignature).toBe('mockWithdrawTx');
    expect(result.newFreeCollateral).toBeDefined();
    expect(mockWithdraw).toHaveBeenCalled();
  });

  it('should reject withdrawal exceeding free collateral', async () => {
    // Mock: only $30 free collateral
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({
        authority: new MockPublicKey('mockAuth'),
        subAccountId: 0,
        spotPositions: [],
      }),
      getFreeCollateral: () => new MockBN(30_000_000), // $30 free
      getTotalCollateral: () => new MockBN(100_000_000),
      getTotalAssetValue: () => new MockBN(70_000_000),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 50000,
      isSubscribed: true,
      subscribe: mock(() => Promise.resolve(true)),
      fetchAccounts: mock(() => Promise.resolve()),
    }));

    const result = await service.withdraw('user-123', 50);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient free collateral');
  });

  it('should reject withdrawal below minimum', async () => {
    const result = await service.withdraw('user-123', 5); // Below $10 min

    expect(result.success).toBe(false);
    expect(result.error).toContain('minimum');
  });

  it('should return updated free collateral after withdrawal', async () => {
    // Mock: starts with $100 free, should have ~$50 after withdrawing $50
    let callCount = 0;
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({
        authority: new MockPublicKey('mockAuth'),
        subAccountId: 0,
        spotPositions: [],
      }),
      getFreeCollateral: () => {
        // Return different values based on call count to simulate post-withdrawal balance
        callCount++;
        return new MockBN(callCount <= 1 ? 100_000_000 : 50_000_000);
      },
      getTotalCollateral: () => new MockBN(100_000_000),
      getTotalAssetValue: () => new MockBN(0),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 10000,
      isSubscribed: true,
      subscribe: mock(() => Promise.resolve(true)),
      fetchAccounts: mock(() => Promise.resolve()),
    }));

    const result = await service.withdraw('user-123', 50);

    expect(result.success).toBe(true);
    expect(result.newFreeCollateral).toBe(50); // $50 remaining
  });
});

describe('DriftService - closeAllPositions', () => {
  let service: DriftService;

  beforeEach(async () => {
    // Reset mocks
    mockClosePosition.mockClear();
    mockGetUser.mockClear();

    const mockRuntime = {
      getSetting: (key: string) => {
        if (key === 'SOLANA_NETWORK') return 'devnet';
        return undefined;
      },
      getService: () => null,
    };

    service = new DriftService(mockRuntime as any);
    await (service as any).initialize();
  });

  it('should close all positions successfully', async () => {
    // Mock: user has 2 open positions
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({
        authority: new MockPublicKey('mockAuth'),
        subAccountId: 0,
        spotPositions: [],
        settledPerpPnl: new MockBN(0),
        cumulativePerpFunding: new MockBN(0),
      }),
      getPerpPosition: (idx: number) => ({
        baseAssetAmount: idx === 0 ? new MockBN(100000000) : new MockBN(50000000),
        quoteAssetAmount: new MockBN(-67000000000),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: idx,
      }),
      getFreeCollateral: () => new MockBN(100000000),
      getTotalCollateral: () => new MockBN(200000000),
      getTotalAssetValue: () => new MockBN(200000000),
      getUnrealizedPNL: () => new MockBN(5000000),
      getLeverage: () => 20000,
      isSubscribed: true,
      subscribe: mock(() => Promise.resolve(true)),
      fetchAccounts: mock(() => Promise.resolve()),
    }));

    const result = await service.closeAllPositions('user-123');

    expect(result.success).toBe(true);
    expect(result.closedCount).toBeGreaterThan(0);
  });

  it('should handle no open positions', async () => {
    // Mock: user has no positions
    mockGetUser.mockImplementation(() => ({
      getUserAccount: () => ({
        authority: new MockPublicKey('mockAuth'),
        subAccountId: 0,
        spotPositions: [],
        settledPerpPnl: new MockBN(0),
        cumulativePerpFunding: new MockBN(0),
      }),
      getPerpPosition: () => ({
        baseAssetAmount: new MockBN(0), // No position
        quoteAssetAmount: new MockBN(0),
        lastCumulativeFundingRate: new MockBN(0),
        marketIndex: 0,
      }),
      getFreeCollateral: () => new MockBN(100000000),
      getTotalCollateral: () => new MockBN(100000000),
      getTotalAssetValue: () => new MockBN(0),
      getUnrealizedPNL: () => new MockBN(0),
      getLeverage: () => 0,
      isSubscribed: true,
      subscribe: mock(() => Promise.resolve(true)),
      fetchAccounts: mock(() => Promise.resolve()),
    }));

    const result = await service.closeAllPositions('user-123');

    expect(result.success).toBe(true);
    expect(result.closedCount).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});
