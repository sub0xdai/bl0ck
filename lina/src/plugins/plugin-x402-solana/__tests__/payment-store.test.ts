import { describe, it, expect, beforeEach } from 'bun:test';
import { InMemoryPaymentStore } from '../src/server/payment-store';

describe('InMemoryPaymentStore', () => {
  let store: InMemoryPaymentStore;

  beforeEach(() => {
    store = new InMemoryPaymentStore();
  });

  it('should create and retrieve pending payment', async () => {
    const payment = await store.create({
      requestId: 'req-123',
      amount: BigInt(15000),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
    });

    expect(payment.status).toBe('pending');
    expect(payment.requestId).toBe('req-123');

    const retrieved = await store.get('req-123');
    expect(retrieved).toEqual(payment);
  });

  it('should mark payment as paid', async () => {
    await store.create({
      requestId: 'req-456',
      amount: BigInt(15000),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
    });

    await store.markPaid('req-456', 'sig-abc', 'payer-xyz');

    const payment = await store.get('req-456');
    expect(payment?.status).toBe('paid');
    expect(payment?.signature).toBe('sig-abc');
    expect(payment?.payer).toBe('payer-xyz');
  });

  it('should mark payment as expired', async () => {
    await store.create({
      requestId: 'req-789',
      amount: BigInt(15000),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
    });

    await store.markExpired('req-789');

    const payment = await store.get('req-789');
    expect(payment?.status).toBe('expired');
  });

  it('should return null for non-existent payment', async () => {
    const payment = await store.get('non-existent');
    expect(payment).toBeNull();
  });

  it('should cleanup expired payments', async () => {
    await store.create({
      requestId: 'expired-1',
      amount: BigInt(15000),
      createdAt: Date.now() - 600000, // 10 min ago
      expiresAt: Date.now() - 300000, // Expired 5 min ago
    });

    await store.create({
      requestId: 'valid-1',
      amount: BigInt(15000),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000, // Still valid
    });

    const cleaned = await store.cleanup();
    expect(cleaned).toBe(1);

    expect(await store.get('expired-1')).toBeNull();
    expect(await store.get('valid-1')).not.toBeNull();
  });

  it('should not cleanup paid payments even if expired', async () => {
    await store.create({
      requestId: 'paid-expired',
      amount: BigInt(15000),
      createdAt: Date.now() - 600000,
      expiresAt: Date.now() - 300000, // Expired
    });

    await store.markPaid('paid-expired', 'sig-123', 'payer-abc');

    const cleaned = await store.cleanup();
    expect(cleaned).toBe(0);

    const payment = await store.get('paid-expired');
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe('paid');
  });

  it('should get all pending payments', async () => {
    await store.create({
      requestId: 'pending-1',
      amount: BigInt(15000),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
    });

    await store.create({
      requestId: 'pending-2',
      amount: BigInt(25000),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
    });

    await store.create({
      requestId: 'paid-1',
      amount: BigInt(10000),
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
    });
    await store.markPaid('paid-1', 'sig', 'payer');

    const pending = await store.getAllPending();
    expect(pending.length).toBe(2);
    expect(pending.map((p) => p.requestId).sort()).toEqual(['pending-1', 'pending-2']);
  });
});
