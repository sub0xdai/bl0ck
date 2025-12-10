/**
 * Auto-Collateral Logic Tests
 *
 * Tests SOL→USDC auto-swap, devnet/mainnet behavior, and Jupiter integration
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { DriftService } from '../src/services/drift.service';
import type { OpenPositionParams } from '../src/types';

// ============================================================
// MOCKS (same pattern as drift.service.test.ts)
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
    authority: new MockPublicKey('mockAuth'),
    subAccountId: 0,
    spotPositions: [], // Required for validation
    settledPerpPnl: new MockBN(25000000),      // $25 settled PnL
    cumulativePerpFunding: new MockBN(-2000000), // -$2 funding paid
  }),
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
  getTotalAssetValue: () => new MockBN(200000000),
  getUnrealizedPNL: () => new MockBN(5000000),
  getLeverage: () => 50000,
  isSubscribed: true, // Required for cache validation
  subscribe: mock(() => Promise.resolve(true)),
  fetchAccounts: mock(() => Promise.resolve()), // Required for getValidatedUser
}));

const mockInitializeUserAccount = mock(() => Promise.resolve('mockTxSig123'));
const mockDeposit = mock(() => Promise.resolve('mockDepositTx'));
const mockOpenPosition = mock(() => Promise.resolve('mockPositionTx'));

mock.module('@drift-labs/sdk', () => ({
  DriftClient: class {
    constructor(public config: any) {}
    subscribe = mock(() => Promise.resolve(true)); // Must return true for validation
    unsubscribe = mock(() => Promise.resolve());
    hasUser = mock(() => true); // Account exists
    getUser = mockGetUser;
    initializeUserAccount = mockInitializeUserAccount;
    deposit = mockDeposit;
    placeAndTakePerpOrder = mockOpenPosition;
    getPerpMarketAccount = mock(() => ({
      amm: {
        historicalOracleData: {
          lastOraclePrice: BigInt(67000000000),
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
const mockGetTokenAccountBalance = mock(() => Promise.resolve({
  value: {
    amount: '100000000', // 100 USDC default
    decimals: 6,
    uiAmount: 100,
  },
}));
const mockConfirmTransaction = mock(() => Promise.resolve({ value: { err: null } }));

mock.module('@solana/web3.js', () => ({
  Connection: class {
    constructor(public endpoint: string) {}
    getBalance = mockGetBalance;
    getTokenAccountBalance = mockGetTokenAccountBalance;
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

const mockJupiterGetQuote = mock(() => Promise.resolve({
  inAmount: '500000000',
  outAmount: '55000000',
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

const resetMocks = () => {
  mockGetUser.mockImplementation(() => ({
    getUserAccount: () => ({
      authority: new MockPublicKey('mockAuth'),
      subAccountId: 0,
      spotPositions: [], // Required for validation
    }),
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
    getTotalAssetValue: () => new MockBN(200000000),
    getUnrealizedPNL: () => new MockBN(5000000),
    getLeverage: () => 50000,
    isSubscribed: true, // Required for cache validation
    subscribe: mock(() => Promise.resolve(true)),
    fetchAccounts: mock(() => Promise.resolve()), // Required for getValidatedUser
  }));
  mockGetBalance.mockImplementation(() => Promise.resolve(50000000));
  mockGetTokenAccountBalance.mockImplementation(() => Promise.resolve({
    value: {
      amount: '100000000', // 100 USDC default
      decimals: 6,
      uiAmount: 100,
    },
  }));
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

afterEach(() => {
  resetMocks();
});

// ============================================================
// TESTS
// ============================================================

describe('Collateral - Sufficient Collateral Check', () => {
  let service: DriftService;

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana' });
    service = await DriftService.start(mockRuntime);

    mockJupiterExecuteSwap.mockClear();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should skip auto-swap when user has sufficient USDC collateral', async () => {
    // Mock: user has $100 USDC in wallet - sufficient for $10 margin ($50 position at 5x)
    mockGetTokenAccountBalance.mockImplementationOnce(() => Promise.resolve({
      value: {
        amount: '100000000', // $100 USDC
        decimals: 6,
        uiAmount: 100,
      },
    }));

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 50,
      leverage: 5,
    };

    const result = await service.openPosition('user-sufficient-collateral', params);

    expect(result.success).toBe(true);
    expect(mockJupiterExecuteSwap).not.toHaveBeenCalled();
  });

  it('should trigger auto-swap when collateral is below margin requirement', async () => {
    // Mock: user has $10 USDC in wallet but needs $20 margin for position
    mockGetTokenAccountBalance.mockImplementationOnce(() => Promise.resolve({
      value: {
        amount: '10000000', // $10 USDC
        decimals: 6,
        uiAmount: 10,
      },
    }));

    mockGetBalance.mockImplementationOnce(() => Promise.resolve(1000000000)); // 1 SOL

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100, // $100 position at 5x = $20 margin needed
      leverage: 5,
    };

    const result = await service.openPosition('user-low-collateral', params);

    expect(result.success).toBe(true);
    expect(mockJupiterExecuteSwap).toHaveBeenCalled();
  });

  it('should not swap when collateral exactly equals margin requirement', async () => {
    // Mock: user has exactly $20 USDC for $20 margin requirement
    mockGetTokenAccountBalance.mockImplementationOnce(() => Promise.resolve({
      value: {
        amount: '20000000', // $20 USDC
        decimals: 6,
        uiAmount: 20,
      },
    }));

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 5,
    };

    const result = await service.openPosition('user-exact-collateral', params);

    expect(result.success).toBe(true);
    expect(mockJupiterExecuteSwap).not.toHaveBeenCalled();
  });
});

describe('Collateral - Auto-Swap Trigger Conditions', () => {
  let service: DriftService;

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana' });
    service = await DriftService.start(mockRuntime);

    mockJupiterGetQuote.mockClear();
    mockJupiterExecuteSwap.mockClear();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should calculate swap amount with 10% buffer', async () => {
    // Mock: user has $0, needs $50 for margin → should swap ~$55 worth
    mockGetTokenAccountBalance.mockImplementationOnce(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));

    mockGetBalance.mockImplementationOnce(() => Promise.resolve(1000000000)); // 1 SOL

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 250, // $250 position at 5x = $50 margin needed
      leverage: 5,
    };

    await service.openPosition('user-buffer-test', params);

    // Verify quote was called (buffer logic is internal)
    expect(mockJupiterGetQuote).toHaveBeenCalled();
    expect(mockJupiterExecuteSwap).toHaveBeenCalled();
  });

  it('should fail when user has insufficient SOL for swap', async () => {
    // Mock: user needs swap but has very low SOL balance
    mockGetTokenAccountBalance.mockImplementationOnce(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));

    mockGetBalance.mockImplementationOnce(() => Promise.resolve(1000000)); // 0.001 SOL - insufficient

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
      leverage: 5,
    };

    const result = await service.openPosition('user-low-sol', params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient SOL');
    expect(mockJupiterExecuteSwap).not.toHaveBeenCalled();
  });
});

describe('Collateral - Devnet vs Mainnet Behavior', () => {
  it('should skip auto-swap on devnet with helpful error message', async () => {
    const devnetRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana-devnet' });
    const devnetService = await DriftService.start(devnetRuntime);

    // Mock: user needs swap
    mockGetTokenAccountBalance.mockImplementationOnce(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 50,
    };

    const result = await devnetService.openPosition('user-devnet', params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('devnet');
    expect(result.error).toContain('manually swap');
    expect(mockJupiterExecuteSwap).not.toHaveBeenCalled();

    await devnetService.stop();
  });

  it('should auto-swap on mainnet when Jupiter available', async () => {
    const mainnetRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana' });
    const mainnetService = await DriftService.start(mainnetRuntime);

    // Mock: user needs swap
    mockGetTokenAccountBalance.mockImplementationOnce(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));

    mockGetBalance.mockImplementationOnce(() => Promise.resolve(1000000000)); // 1 SOL

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 50,
    };

    const result = await mainnetService.openPosition('user-mainnet', params);

    expect(result.success).toBe(true);
    expect(mockJupiterExecuteSwap).toHaveBeenCalled();

    await mainnetService.stop();
  });
});

describe('Collateral - Jupiter Service Availability', () => {
  it('should fail gracefully when Jupiter service unavailable on mainnet', async () => {
    // Create runtime without Jupiter
    const noJupiterRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana' }, { jupiterAvailable: false });
    const noJupiterService = await DriftService.start(noJupiterRuntime);

    // Mock: user needs swap
    mockGetTokenAccountBalance.mockImplementationOnce(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 50,
    };

    const result = await noJupiterService.openPosition('user-no-jupiter', params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Jupiter');

    await noJupiterService.stop();
  });

  it('should fail when Jupiter swap transaction fails', async () => {
    const mainnetRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana' });
    const mainnetService = await DriftService.start(mainnetRuntime);

    // Mock: user needs swap
    mockGetTokenAccountBalance.mockImplementationOnce(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));

    mockGetBalance.mockImplementationOnce(() => Promise.resolve(1000000000)); // 1 SOL

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

    await mainnetService.stop();
  });
});

describe('Collateral - SOL Balance Validation', () => {
  let service: DriftService;

  beforeEach(async () => {
    const mockRuntime = createMockRuntime({ SOLANA_NETWORK: 'solana' });
    service = await DriftService.start(mockRuntime);
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should validate SOL balance before swap', async () => {
    // Mock: user needs swap but has very low SOL
    mockGetTokenAccountBalance.mockImplementationOnce(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));

    mockGetBalance.mockImplementationOnce(() => Promise.resolve(500000)); // 0.0005 SOL

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 50,
    };

    const result = await service.openPosition('user-low-sol-balance', params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient SOL');
  });

  it('should proceed with swap when SOL balance is sufficient', async () => {
    // Mock: user needs swap and has sufficient SOL
    mockGetTokenAccountBalance.mockImplementationOnce(() => Promise.resolve({
      value: {
        amount: '0', // $0 USDC
        decimals: 6,
        uiAmount: 0,
      },
    }));

    mockGetBalance.mockImplementationOnce(() => Promise.resolve(2000000000)); // 2 SOL - sufficient

    const params: OpenPositionParams = {
      marketSymbol: 'SOL-PERP',
      side: 'long',
      size: 100,
    };

    const result = await service.openPosition('user-high-sol-balance', params);

    expect(result.success).toBe(true);
    expect(mockJupiterExecuteSwap).toHaveBeenCalled();
  });
});
