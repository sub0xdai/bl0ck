/**
 * BridgeService Tests
 *
 * TDD Phase: RED -> GREEN -> REFACTOR
 * Testing auto-bridge functionality for Hyperliquid margin provisioning
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { BridgeService } from '../src/services/bridge.service';
import type { BridgeResult, MarginCheck } from '../src/types';

// Mock dependencies
const mockGetTokenBalances = mock(() =>
  Promise.resolve({
    tokens: [
      {
        symbol: 'USDC',
        contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        balance: '1000',
        balanceFormatted: '1000.00',
        usdValue: 1000,
        decimals: 6,
      },
    ],
    totalUsdValue: 1000,
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
    fromCache: false,
  })
);

const mockGetViemClientsForAccount = mock(() =>
  Promise.resolve({
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00' as `0x${string}`,
    walletClient: {
      chain: { id: 42161, name: 'Arbitrum One' },
    },
    publicClient: {},
  })
);

const mockGetQuote = mock(() =>
  Promise.resolve({
    details: {
      rate: '1.0',
      totalFees: '0.01',
    },
  })
);

const mockExecuteBridge = mock(() =>
  Promise.resolve('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
);

const mockGetAccountState = mock(() =>
  Promise.resolve({
    marginSummary: {
      accountValue: '500', // $500 USDC on Hyperliquid
      totalMarginUsed: '0',
      totalNtlPos: '0',
      totalRawUsd: '500',
    },
    assetPositions: [],
    time: Date.now(),
    withdrawable: '500',
  })
);

// Mock CdpTransactionManager
mock.module('@/managers/cdp-transaction-manager', () => ({
  CdpTransactionManager: class {
    static getInstance() {
      return {
        getTokenBalances: mockGetTokenBalances,
        getViemClientsForAccount: mockGetViemClientsForAccount,
      };
    }
  },
}));

// Mock RelayService
mock.module('../../plugin-relay/src/services/relay.service', () => ({
  RelayService: class {
    constructor(runtime: any) {}
    getQuote = mockGetQuote;
    executeBridge = mockExecuteBridge;
  },
}));

// Mock HyperliquidCdpClient
mock.module('../src/services/hyperliquid-cdp-client', () => ({
  HyperliquidCdpClient: class {
    constructor(public userId: string, public testnet: boolean) {}
    async connect() {}
    getAddress() {
      return '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00';
    }
    getAccountState = mockGetAccountState;
  },
}));

describe('BridgeService - Auto-Bridge for Hyperliquid', () => {
  let bridgeService: BridgeService;

  beforeEach(() => {
    // Clear mocks
    mockGetTokenBalances.mockClear();
    mockGetViemClientsForAccount.mockClear();
    mockGetQuote.mockClear();
    mockExecuteBridge.mockClear();
    mockGetAccountState.mockClear();

    // Reset mock implementations to defaults
    mockGetAccountState.mockImplementation(() =>
      Promise.resolve({
        marginSummary: {
          accountValue: '500',
          totalMarginUsed: '0',
          totalNtlPos: '0',
          totalRawUsd: '500',
        },
        assetPositions: [],
        time: Date.now(),
        withdrawable: '500',
      })
    );

    mockGetTokenBalances.mockImplementation(() =>
      Promise.resolve({
        tokens: [
          {
            symbol: 'USDC',
            contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
            balance: '1000',
            balanceFormatted: '1000.00',
            usdValue: 1000,
            decimals: 6,
          },
        ],
        totalUsdValue: 1000,
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
        fromCache: false,
      })
    );

    mockGetViemClientsForAccount.mockImplementation(() =>
      Promise.resolve({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00' as `0x${string}`,
        walletClient: {
          chain: { id: 42161, name: 'Arbitrum One' },
        },
        publicClient: {},
      })
    );

    mockExecuteBridge.mockImplementation(() =>
      Promise.resolve('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
    );

    // Create new BridgeService instance
    bridgeService = new BridgeService(false); // testnet=false
  });

  describe('ensureMargin - Core Functionality', () => {
    it('should return early if Hyperliquid balance is sufficient', async () => {
      // HL has $500, need $400 - no bridge needed
      const result = await bridgeService.ensureMargin('user-123', 400);

      expect(result.success).toBe(true);
      expect(result.bridged).toBe(false);
      expect(result.amount).toBe(0);
      expect(mockGetAccountState).toHaveBeenCalled();
      expect(mockGetTokenBalances).not.toHaveBeenCalled(); // No need to check EVM
    });

    it('should bridge from Arbitrum when available', async () => {
      // HL has $500, need $1000, deficit = $500
      // Arbitrum has $1000 USDC
      const result = await bridgeService.ensureMargin('user-123', 1000);

      expect(result.success).toBe(true);
      expect(result.bridged).toBe(true);
      expect(result.amount).toBe(500); // Deficit amount
      expect(result.source).toBe('arbitrum');
      expect(result.txHash).toBeDefined();
      expect(mockGetTokenBalances).toHaveBeenCalledWith('user-123', 'arbitrum', false);
      expect(mockExecuteBridge).toHaveBeenCalled();
    });

    it('should bridge from Base when Arbitrum insufficient', async () => {
      // Arbitrum has only $200, Base has $1000
      mockGetTokenBalances.mockImplementation((userId: string, chain?: string) => {
        if (chain === 'arbitrum') {
          return Promise.resolve({
            tokens: [
              {
                symbol: 'USDC',
                contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
                balance: '200',
                balanceFormatted: '200.00',
                usdValue: 200,
                decimals: 6,
              },
            ],
            totalUsdValue: 200,
            address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
            fromCache: false,
          });
        }
        // Base
        return Promise.resolve({
          tokens: [
            {
              symbol: 'USDC',
              contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              balance: '1000',
              balanceFormatted: '1000.00',
              usdValue: 1000,
              decimals: 6,
            },
          ],
          totalUsdValue: 1000,
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
          fromCache: false,
        });
      });

      const result = await bridgeService.ensureMargin('user-123', 1000);

      expect(result.success).toBe(true);
      expect(result.bridged).toBe(true);
      expect(result.source).toBe('base');
      expect(mockGetTokenBalances).toHaveBeenCalledWith('user-123', 'arbitrum', false);
      expect(mockGetTokenBalances).toHaveBeenCalledWith('user-123', 'base', false);
    });

    it('should return error if all sources insufficient', async () => {
      // HL: $500, need $2000, deficit = $1500
      // All EVM chains: $200 each (total $800 < $1500)
      mockGetTokenBalances.mockImplementation(() =>
        Promise.resolve({
          tokens: [
            {
              symbol: 'USDC',
              balance: '200',
              balanceFormatted: '200.00',
              usdValue: 200,
              decimals: 6,
            },
          ],
          totalUsdValue: 200,
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
          fromCache: false,
        })
      );

      const result = await bridgeService.ensureMargin('user-123', 2000);

      expect(result.success).toBe(false);
      expect(result.bridged).toBe(false);
      expect(result.error).toContain('Insufficient USDC');
      expect(result.error).toContain('1500'); // Deficit
    });

    it('should try Ethereum after Base', async () => {
      mockGetTokenBalances.mockImplementation((userId: string, chain?: string) => {
        if (chain === 'arbitrum' || chain === 'base') {
          return Promise.resolve({
            tokens: [],
            totalUsdValue: 0,
            address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
            fromCache: false,
          });
        }
        // Ethereum has funds
        return Promise.resolve({
          tokens: [
            {
              symbol: 'USDC',
              balance: '1000',
              usdValue: 1000,
              decimals: 6,
            },
          ],
          totalUsdValue: 1000,
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
          fromCache: false,
        });
      });

      const result = await bridgeService.ensureMargin('user-123', 1000);

      expect(result.success).toBe(true);
      expect(result.source).toBe('ethereum');
      expect(mockGetTokenBalances).toHaveBeenCalledWith('user-123', 'arbitrum', false);
      expect(mockGetTokenBalances).toHaveBeenCalledWith('user-123', 'base', false);
      expect(mockGetTokenBalances).toHaveBeenCalledWith('user-123', 'ethereum', false);
    });

    it('should try Polygon after Ethereum', async () => {
      mockGetTokenBalances.mockImplementation((userId: string, chain?: string) => {
        if (chain === 'polygon') {
          return Promise.resolve({
            tokens: [
              {
                symbol: 'USDC',
                balance: '1000',
                usdValue: 1000,
                decimals: 6,
              },
            ],
            totalUsdValue: 1000,
            address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
            fromCache: false,
          });
        }
        return Promise.resolve({
          tokens: [],
          totalUsdValue: 0,
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
          fromCache: false,
        });
      });

      const result = await bridgeService.ensureMargin('user-123', 1000);

      expect(result.success).toBe(true);
      expect(result.source).toBe('polygon');
    });
  });

  describe('getMarginStatus - Diagnostic', () => {
    it('should return margin status across all chains', async () => {
      mockGetTokenBalances.mockImplementation((userId: string, chain?: string) => {
        const balances: Record<string, number> = {
          arbitrum: 500,
          base: 300,
          ethereum: 200,
          polygon: 100,
        };
        const usdValue = balances[chain || 'arbitrum'] || 0;
        return Promise.resolve({
          tokens: [
            {
              symbol: 'USDC',
              balance: usdValue.toString(),
              usdValue,
              decimals: 6,
            },
          ],
          totalUsdValue: usdValue,
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
          fromCache: false,
        });
      });

      const status = await bridgeService.getMarginStatus('user-123', 1500);

      expect(status.hyperliquidBalance).toBe(500);
      expect(status.required).toBe(1500);
      expect(status.deficit).toBe(1000);
      expect(status.evmBalances).toHaveLength(4);
      expect(status.evmBalances.find((b) => b.chain === 'arbitrum')?.amount).toBe(500);
      expect(status.evmBalances.find((b) => b.chain === 'base')?.amount).toBe(300);
      expect(status.solanaBalance).toBe(0); // Not implemented yet
    });

    it('should calculate deficit correctly when HL balance sufficient', async () => {
      const status = await bridgeService.getMarginStatus('user-123', 400);

      expect(status.hyperliquidBalance).toBe(500);
      expect(status.required).toBe(400);
      expect(status.deficit).toBe(0); // No deficit
    });

    it('should handle zero balances gracefully', async () => {
      mockGetAccountState.mockImplementation(() =>
        Promise.resolve({
          marginSummary: {
            accountValue: '0',
            totalMarginUsed: '0',
            totalNtlPos: '0',
            totalRawUsd: '0',
          },
          assetPositions: [],
          time: Date.now(),
          withdrawable: '0',
        })
      );

      mockGetTokenBalances.mockImplementation(() =>
        Promise.resolve({
          tokens: [],
          totalUsdValue: 0,
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
          fromCache: false,
        })
      );

      const status = await bridgeService.getMarginStatus('user-123', 1000);

      expect(status.hyperliquidBalance).toBe(0);
      expect(status.deficit).toBe(1000);
      expect(status.evmBalances.every((b) => b.amount === 0)).toBe(true);
    });
  });

  describe('Edge Cases & Error Handling', () => {
    it('should handle zero required margin', async () => {
      const result = await bridgeService.ensureMargin('user-123', 0);

      expect(result.success).toBe(true);
      expect(result.bridged).toBe(false);
      expect(result.amount).toBe(0);
    });

    it('should handle negative required margin (invalid input)', async () => {
      const result = await bridgeService.ensureMargin('user-123', -100);

      expect(result.success).toBe(true);
      expect(result.bridged).toBe(false);
      expect(result.amount).toBe(0);
    });

    it('should handle API errors gracefully', async () => {
      mockGetAccountState.mockImplementation(() => {
        throw new Error('Hyperliquid API error');
      });

      await expect(bridgeService.ensureMargin('user-123', 1000)).rejects.toThrow(
        'Hyperliquid API error'
      );
    });

    it('should handle USDC balance extraction when token not found', async () => {
      mockGetTokenBalances.mockImplementation(() =>
        Promise.resolve({
          tokens: [
            {
              symbol: 'ETH', // Wrong token
              balance: '10',
              usdValue: 20000,
              decimals: 18,
            },
          ],
          totalUsdValue: 20000,
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
          fromCache: false,
        })
      );

      const result = await bridgeService.ensureMargin('user-123', 1000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient USDC');
    });
  });

  describe('Chain Priority Order', () => {
    it('should try chains in correct priority: Arbitrum -> Base -> Ethereum -> Polygon', async () => {
      const chainOrder: string[] = [];

      mockGetTokenBalances.mockImplementation((userId: string, chain?: string) => {
        if (chain) {
          chainOrder.push(chain);
        }
        // All chains have insufficient funds - force full iteration
        return Promise.resolve({
          tokens: [],
          totalUsdValue: 0,
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
          fromCache: false,
        });
      });

      await bridgeService.ensureMargin('user-123', 1000);

      expect(chainOrder).toEqual(['arbitrum', 'base', 'ethereum', 'polygon']);
    });
  });
});
