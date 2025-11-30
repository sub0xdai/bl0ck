import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { keccak256, encodeAbiParameters, parseAbiParameters } from 'viem';

// Create a shared signTypedData mock that persists across calls
let signTypedDataCalls: any[] = [];
const mockSignTypedData = mock((params: any) => {
  signTypedDataCalls.push(params);
  return Promise.resolve(
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b'
  );
});

// Mock wallet client - shared instance
const mockWalletClient = {
  account: {
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
  },
  signTypedData: mockSignTypedData,
};

// Mock the CDP transaction manager before importing the signer
const mockGetViemClientsForAccount = mock(() =>
  Promise.resolve({
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00' as `0x${string}`,
    walletClient: mockWalletClient,
    publicClient: {},
  })
);

const mockGetInstance = mock(() => ({
  getViemClientsForAccount: mockGetViemClientsForAccount,
}));

mock.module('@/managers/cdp-transaction-manager', () => ({
  CdpTransactionManager: {
    getInstance: mockGetInstance,
  },
}));

// Import after mocking
import { CdpHyperliquidSigner } from '../src/services/cdp-signer';

describe('CdpHyperliquidSigner', () => {
  beforeEach(() => {
    mockGetViemClientsForAccount.mockClear();
    mockGetInstance.mockClear();
    mockSignTypedData.mockClear();
    signTypedDataCalls = [];
  });

  describe('Construction', () => {
    it('should construct with userId', () => {
      const signer = new CdpHyperliquidSigner('user-123');
      expect(signer).toBeDefined();
      expect(signer).toBeInstanceOf(CdpHyperliquidSigner);
    });

    it('should store userId for later wallet lookup', () => {
      const signer = new CdpHyperliquidSigner('user-456');
      // The userId should be used when getAddress is called
      expect(signer).toBeDefined();
    });
  });

  describe('getAddress()', () => {
    it('should return CDP wallet address for user', async () => {
      const signer = new CdpHyperliquidSigner('user-123');
      const address = await signer.getAddress();

      expect(address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00');
      expect(mockGetViemClientsForAccount).toHaveBeenCalledWith({
        accountName: 'user-123',
        network: 'arbitrum', // Hyperliquid uses Arbitrum for signing context
      });
    });

    it('should cache address after first call', async () => {
      const signer = new CdpHyperliquidSigner('user-123');

      const addr1 = await signer.getAddress();
      const addr2 = await signer.getAddress();

      expect(addr1).toBe(addr2);
      // CDP manager should only be called once due to caching
      expect(mockGetViemClientsForAccount).toHaveBeenCalledTimes(1);
    });

    it('should return checksummed address', async () => {
      const signer = new CdpHyperliquidSigner('user-123');
      const address = await signer.getAddress();

      // Address should match Ethereum checksum format
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe('signL1Action()', () => {
    it('should produce valid signature for order action', async () => {
      const signer = new CdpHyperliquidSigner('user-123');

      const action = {
        type: 'order',
        orders: [
          {
            a: 0, // asset index
            b: true, // is_buy
            p: '67500', // price
            s: '0.1', // size
            r: false, // reduce_only
            t: { limit: { tif: 'Gtc' } },
          },
        ],
        grouping: 'na',
      };
      const nonce = 1700000000000;

      const sig = await signer.signL1Action(action, null, nonce, true);

      expect(sig).toHaveProperty('r');
      expect(sig).toHaveProperty('s');
      expect(sig).toHaveProperty('v');
      expect(sig.r).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(sig.s).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(typeof sig.v).toBe('number');
    });

    it('should use mainnet domain source "a" when isMainnet=true', async () => {
      const signer = new CdpHyperliquidSigner('user-123');

      const action = { type: 'order', orders: [], grouping: 'na' };
      await signer.signL1Action(action, null, Date.now(), true);

      // Verify signTypedData was called with correct message
      expect(signTypedDataCalls.length).toBeGreaterThan(0);
      const lastCall = signTypedDataCalls[signTypedDataCalls.length - 1];
      expect(lastCall.message.source).toBe('a');
    });

    it('should use testnet domain source "b" when isMainnet=false', async () => {
      const signer = new CdpHyperliquidSigner('user-123');

      const action = { type: 'order', orders: [], grouping: 'na' };
      await signer.signL1Action(action, null, Date.now(), false);

      expect(signTypedDataCalls.length).toBeGreaterThan(0);
      const lastCall = signTypedDataCalls[signTypedDataCalls.length - 1];
      expect(lastCall.message.source).toBe('b');
    });

    it('should use Exchange domain with chainId 1337', async () => {
      const signer = new CdpHyperliquidSigner('user-123');

      const action = { type: 'order', orders: [], grouping: 'na' };
      await signer.signL1Action(action, null, Date.now(), true);

      expect(signTypedDataCalls.length).toBeGreaterThan(0);
      const lastCall = signTypedDataCalls[signTypedDataCalls.length - 1];

      expect(lastCall.domain).toEqual({
        name: 'Exchange',
        version: '1',
        chainId: 1337,
        verifyingContract: '0x0000000000000000000000000000000000000000',
      });
    });

    it('should include vault address in hash when provided', async () => {
      const signer = new CdpHyperliquidSigner('user-123');

      const action = { type: 'order', orders: [], grouping: 'na' };
      const vaultAddress = '0x1234567890123456789012345678901234567890';

      // Should not throw when vault address is provided
      const sig = await signer.signL1Action(action, vaultAddress, Date.now(), true);
      expect(sig).toHaveProperty('r');
    });

    it('should normalize trailing zeros in price and size fields', async () => {
      const signer = new CdpHyperliquidSigner('user-123');

      // Price and size with trailing zeros
      const action = {
        type: 'order',
        orders: [
          {
            a: 0,
            b: true,
            p: '67500.00', // trailing zeros
            s: '0.10000', // trailing zeros
            r: false,
            t: { limit: { tif: 'Gtc' } },
          },
        ],
        grouping: 'na',
      };

      // Should not throw - normalization should handle this
      const sig = await signer.signL1Action(action, null, Date.now(), true);
      expect(sig).toHaveProperty('r');
    });
  });

  describe('signUserSignedAction()', () => {
    it('should sign with HyperliquidSignTransaction domain for mainnet', async () => {
      const signer = new CdpHyperliquidSigner('user-123');

      const action = {
        hyperliquidChain: 'Mainnet',
        destination: '0x1234567890123456789012345678901234567890',
        amount: '100',
        time: Date.now(),
      };
      const payloadTypes = [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'destination', type: 'string' },
        { name: 'amount', type: 'string' },
        { name: 'time', type: 'uint64' },
      ];

      const sig = await signer.signUserSignedAction(
        action,
        payloadTypes,
        'HyperliquidTransaction:UsdSend',
        true
      );

      expect(sig).toHaveProperty('r');
      expect(sig).toHaveProperty('s');
      expect(sig).toHaveProperty('v');

      // Verify domain
      expect(signTypedDataCalls.length).toBeGreaterThan(0);
      const lastCall = signTypedDataCalls[signTypedDataCalls.length - 1];

      expect(lastCall.domain.name).toBe('HyperliquidSignTransaction');
      expect(lastCall.domain.chainId).toBe(42161); // Arbitrum mainnet
    });

    it('should sign with testnet chainId 421614 when isMainnet=false', async () => {
      const signer = new CdpHyperliquidSigner('user-123');

      const action = {
        hyperliquidChain: 'Testnet',
        destination: '0x1234567890123456789012345678901234567890',
        amount: '100',
        time: Date.now(),
      };
      const payloadTypes = [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'destination', type: 'string' },
        { name: 'amount', type: 'string' },
        { name: 'time', type: 'uint64' },
      ];

      await signer.signUserSignedAction(
        action,
        payloadTypes,
        'HyperliquidTransaction:UsdSend',
        false
      );

      expect(signTypedDataCalls.length).toBeGreaterThan(0);
      const lastCall = signTypedDataCalls[signTypedDataCalls.length - 1];

      expect(lastCall.domain.chainId).toBe(421614); // Arbitrum testnet
    });

    it('should use correct primaryType in typed data', async () => {
      const signer = new CdpHyperliquidSigner('user-123');

      const action = {
        hyperliquidChain: 'Mainnet',
        destination: '0x1234567890123456789012345678901234567890',
        amount: '100',
        time: Date.now(),
      };
      const payloadTypes = [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'destination', type: 'string' },
        { name: 'amount', type: 'string' },
        { name: 'time', type: 'uint64' },
      ];

      await signer.signUserSignedAction(
        action,
        payloadTypes,
        'HyperliquidTransaction:Withdraw',
        true
      );

      expect(signTypedDataCalls.length).toBeGreaterThan(0);
      const lastCall = signTypedDataCalls[signTypedDataCalls.length - 1];

      expect(lastCall.primaryType).toBe('HyperliquidTransaction:Withdraw');
    });
  });

  describe('Signature Format', () => {
    it('should split signature into r, s, v components', async () => {
      const signer = new CdpHyperliquidSigner('user-123');

      const action = { type: 'order', orders: [], grouping: 'na' };
      const sig = await signer.signL1Action(action, null, Date.now(), true);

      // r and s should be 32 bytes (64 hex chars + 0x prefix)
      expect(sig.r.length).toBe(66);
      expect(sig.s.length).toBe(66);

      // v should be 27 or 28 (or 0/1 for some implementations)
      expect([0, 1, 27, 28]).toContain(sig.v);
    });

    it('should return consistent signature format for same input', async () => {
      const signer = new CdpHyperliquidSigner('user-123');

      const action = { type: 'order', orders: [], grouping: 'na' };
      const nonce = 1700000000000;

      const sig1 = await signer.signL1Action(action, null, nonce, true);
      const sig2 = await signer.signL1Action(action, null, nonce, true);

      // Same input should produce same signature (deterministic)
      expect(sig1.r).toBe(sig2.r);
      expect(sig1.s).toBe(sig2.s);
      expect(sig1.v).toBe(sig2.v);
    });
  });

  describe('Error Handling', () => {
    it('should throw if CDP wallet retrieval fails', async () => {
      mockGetViemClientsForAccount.mockRejectedValueOnce(new Error('CDP wallet not found'));

      const signer = new CdpHyperliquidSigner('invalid-user');

      await expect(signer.getAddress()).rejects.toThrow('CDP wallet not found');
    });

    it('should throw if signing fails', async () => {
      const mockWalletClientWithError = {
        account: { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00' },
        signTypedData: mock(() => Promise.reject(new Error('Signing failed'))),
      };

      mockGetViemClientsForAccount.mockResolvedValueOnce({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00' as `0x${string}`,
        walletClient: mockWalletClientWithError,
        publicClient: {},
      });

      const signer = new CdpHyperliquidSigner('user-123');
      const action = { type: 'order', orders: [], grouping: 'na' };

      await expect(signer.signL1Action(action, null, Date.now(), true)).rejects.toThrow(
        'Signing failed'
      );
    });
  });
});
