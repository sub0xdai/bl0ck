// src/__tests__/unit/services/autotrade-service.test.ts
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { AutotradeService } from '../../../services/autotrade/autotrade.service';

describe('AutotradeService', () => {
  let service: AutotradeService;
  let mockRepo: any;
  let mockSolanaManager: any;

  beforeEach(() => {
    mockRepo = {
      getSubscription: mock(() => null),
      createSubscription: mock(() => Promise.resolve()),
      deactivateSubscription: mock(() => Promise.resolve()),
      extendSubscription: mock(() => Promise.resolve()),
    };

    mockSolanaManager = {
      getOrCreateWallet: mock(() => Promise.resolve({
        publicKey: 'TestPublicKey123',
        keypair: { publicKey: { toBase58: () => 'TestPublicKey123' } },
      })),
      getTokenBalance: mock(() => Promise.resolve({ balance: 10_000_000n })), // 10 USDC
      transferToken: mock(() => Promise.resolve('tx-signature-123')),
    };

    service = new AutotradeService({
      repository: mockRepo,
      solanaManager: mockSolanaManager,
      treasuryWallet: 'TreasuryWallet123',
      priceUsdc: 1.0,
      durationMs: 86400000, // 24 hours
    });
  });

  describe('getPaymentRequired', () => {
    it('returns x402 payment required format', async () => {
      const result = await service.getPaymentRequired('user-123');

      expect(result.accepts.scheme).toBe('solana');
      expect(result.accepts.amount).toBe('1000000'); // 1 USDC in base units
      expect(result.accepts.payTo).toBe('TreasuryWallet123');
      expect(result.accepts.memo).toContain('autotrade:user-123');
    });
  });

  describe('activateSubscription', () => {
    it('creates subscription after payment verification', async () => {
      await service.activateSubscription('user-123', 'payment-sig-456');

      expect(mockRepo.createSubscription).toHaveBeenCalledWith({
        userId: 'user-123',
        expiresAt: expect.any(Number),
        txSignature: 'payment-sig-456',
      });
    });
  });

  describe('stopAutotrade', () => {
    it('deactivates subscription', async () => {
      mockRepo.getSubscription = mock(() => Promise.resolve({
        userId: 'user-123',
        status: 'active',
        expiresAt: Date.now() + 86400000,
      }));

      await service.stopAutotrade('user-123');

      expect(mockRepo.deactivateSubscription).toHaveBeenCalledWith('user-123');
    });

    it('throws if no active subscription', async () => {
      mockRepo.getSubscription = mock(() => null);

      await expect(service.stopAutotrade('user-123')).rejects.toThrow('No active subscription');
    });
  });

  describe('checkAndRenew', () => {
    it('renews if expired and has funds', async () => {
      mockRepo.getSubscription = mock(() => Promise.resolve({
        userId: 'user-123',
        status: 'active',
        expiresAt: Date.now() - 1000, // expired
      }));

      const result = await service.checkAndRenew('user-123');

      expect(result.renewed).toBe(true);
      expect(mockSolanaManager.transferToken).toHaveBeenCalled();
      expect(mockRepo.extendSubscription).toHaveBeenCalled();
    });

    it('deactivates if expired and insufficient funds', async () => {
      mockRepo.getSubscription = mock(() => Promise.resolve({
        userId: 'user-123',
        status: 'active',
        expiresAt: Date.now() - 1000, // expired
      }));
      mockSolanaManager.getTokenBalance = mock(() => Promise.resolve({ balance: 500_000n })); // 0.5 USDC

      const result = await service.checkAndRenew('user-123');

      expect(result.renewed).toBe(false);
      expect(result.stopped).toBe(true);
      expect(mockRepo.deactivateSubscription).toHaveBeenCalled();
    });

    it('does nothing if not expired', async () => {
      mockRepo.getSubscription = mock(() => Promise.resolve({
        userId: 'user-123',
        status: 'active',
        expiresAt: Date.now() + 86400000, // not expired
      }));

      const result = await service.checkAndRenew('user-123');

      expect(result.renewed).toBe(false);
      expect(result.stopped).toBe(false);
      expect(mockSolanaManager.transferToken).not.toHaveBeenCalled();
    });
  });
});
