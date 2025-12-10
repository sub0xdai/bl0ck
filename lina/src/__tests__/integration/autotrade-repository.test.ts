// src/__tests__/unit/services/autotrade-repository.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { AutotradeRepository } from '../../../services/autotrade/repository';

describe('AutotradeRepository', () => {
  let repo: AutotradeRepository;

  beforeAll(async () => {
    repo = new AutotradeRepository(process.env.WALLET_DB_URL!);
    await repo.initialize();
  });

  afterAll(async () => {
    await repo.close();
  });

  it('creates and retrieves a subscription', async () => {
    const userId = 'test-user-' + Date.now();

    await repo.createSubscription({
      userId,
      expiresAt: Date.now() + 86400000,
      txSignature: 'test-sig-123',
    });

    const sub = await repo.getSubscription(userId);

    expect(sub).not.toBeNull();
    expect(sub!.userId).toBe(userId);
    expect(sub!.status).toBe('active');
  });

  it('returns null for non-existent subscription', async () => {
    const sub = await repo.getSubscription('non-existent-user');
    expect(sub).toBeNull();
  });

  it('deactivates a subscription', async () => {
    const userId = 'test-deactivate-' + Date.now();

    await repo.createSubscription({
      userId,
      expiresAt: Date.now() + 86400000,
      txSignature: 'test-sig-456',
    });

    await repo.deactivateSubscription(userId);

    const sub = await repo.getSubscription(userId);
    expect(sub!.status).toBe('inactive');
  });

  it('extends subscription expiry', async () => {
    const userId = 'test-extend-' + Date.now();
    const originalExpiry = Date.now() + 86400000;

    await repo.createSubscription({
      userId,
      expiresAt: originalExpiry,
      txSignature: 'test-sig-789',
    });

    const newExpiry = originalExpiry + 86400000;
    await repo.extendSubscription(userId, newExpiry, 'renewal-sig-123');

    const sub = await repo.getSubscription(userId);
    expect(sub!.expiresAt).toBe(newExpiry);
  });
});
