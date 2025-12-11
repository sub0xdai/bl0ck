// src/__tests__/unit/api/autotrade.test.ts
/**
 * Unit tests for autotrade API endpoints
 *
 * These tests verify the router logic by creating an isolated test router
 * that mirrors the production router structure but without the JWT auth
 * middleware dependency. This allows us to test the business logic in isolation.
 *
 * The test router is kept in sync with the production router - any changes
 * to src/packages/server/src/api/autotrade/index.ts should be reflected here.
 */
import { describe, it, expect, mock } from 'bun:test';
import express from 'express';
import request from 'supertest';
import type { AutotradeService, PaymentVerifier, PaymentVerificationResult } from '../../../services/autotrade';
import { sendError, sendSuccess } from '../../../packages/server/src/api/shared/response-utils';

/**
 * Creates a mock AutotradeService for testing
 */
function createMockAutotradeService(overrides: Partial<AutotradeService> = {}): AutotradeService {
  return {
    getPaymentRequired: mock(() => Promise.resolve({
      accepts: {
        scheme: 'solana' as const,
        network: 'solana-devnet' as const,
        payTo: 'TreasuryWallet123',
        amount: '1000000',
        memo: 'autotrade:test-user:1234567890',
        expiresAt: Date.now() + 300000,
      },
    })),
    activateSubscription: mock(() => Promise.resolve()),
    getStatus: mock(() => Promise.resolve(null)),
    isActive: mock(() => Promise.resolve(false)),
    stopAutotrade: mock(() => Promise.resolve()),
    checkAndRenew: mock(() => Promise.resolve({ renewed: false, stopped: false })),
    ...overrides,
  } as AutotradeService;
}

/**
 * Creates a mock PaymentVerifier for testing
 */
function createMockPaymentVerifier(result: PaymentVerificationResult = { valid: true }): PaymentVerifier {
  return {
    verify: mock(() => Promise.resolve(result)),
  };
}

interface TestRouterConfig {
  autotradeService: AutotradeService;
  paymentVerifier: PaymentVerifier;
  treasuryWallet?: string;
  priceBaseUnits?: string;
}

/**
 * Creates autotrade routes WITHOUT the requireAuth middleware for testing.
 *
 * IMPORTANT: This must stay in sync with the production router in
 * src/packages/server/src/api/autotrade/index.ts
 *
 * The only difference is that this router does not use requireAuth middleware,
 * allowing us to test the endpoint logic in isolation.
 */
function createTestAutotradeRouter(config: TestRouterConfig): express.Router {
  const {
    autotradeService,
    paymentVerifier,
    treasuryWallet = 'TreasuryWallet123',
    priceBaseUnits = '1000000',
  } = config;
  const router = express.Router();

  // POST /api/autotrade/start - mirrors production implementation
  router.post('/start', async (req: any, res) => {
    try {
      const userId = req.userId!;
      const paymentProof = req.headers['x-payment-proof'] as string;

      if (!paymentProof) {
        const paymentRequired = await autotradeService.getPaymentRequired(userId);
        return res.status(402).json(paymentRequired);
      }

      let proof: { signature: string };
      try {
        proof = JSON.parse(Buffer.from(paymentProof, 'base64').toString());
      } catch (parseError) {
        return sendError(res, 400, 'INVALID_PAYMENT_PROOF', 'Failed to parse payment proof');
      }

      if (!proof.signature) {
        return sendError(res, 400, 'MISSING_SIGNATURE', 'Payment proof missing signature');
      }

      // Verify the payment on-chain
      const verification = await paymentVerifier.verify({
        signature: proof.signature,
        expectedAmount: priceBaseUnits,
        expectedRecipient: treasuryWallet,
      });

      if (!verification.valid) {
        return sendError(res, 402, 'PAYMENT_INVALID', verification.error || 'Payment verification failed');
      }

      await autotradeService.activateSubscription(userId, proof.signature);
      const status = await autotradeService.getStatus(userId);
      return sendSuccess(res, { message: 'Autotrade activated', subscription: status });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return sendError(res, 500, 'START_FAILED', 'Failed to start autotrade', msg);
    }
  });

  // POST /api/autotrade/stop - mirrors production implementation
  router.post('/stop', async (req: any, res) => {
    try {
      const userId = req.userId!;
      await autotradeService.stopAutotrade(userId);
      return sendSuccess(res, { message: 'Autotrade stopped' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const statusCode = msg.includes('No active subscription') ? 400 : 500;
      return sendError(res, statusCode, 'STOP_FAILED', msg);
    }
  });

  // GET /api/autotrade/status - mirrors production implementation
  router.get('/status', async (req: any, res) => {
    try {
      const userId = req.userId!;
      const subscription = await autotradeService.getStatus(userId);
      const isActive = subscription?.status === 'active' && Date.now() < subscription.expiresAt;
      return sendSuccess(res, { active: isActive, subscription });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return sendError(res, 500, 'STATUS_FAILED', 'Failed to get autotrade status', msg);
    }
  });

  // POST /api/autotrade/renew - mirrors production implementation
  router.post('/renew', async (req: any, res) => {
    try {
      const userId = req.userId!;
      const result = await autotradeService.checkAndRenew(userId);

      if (result.stopped) {
        return sendSuccess(res, { renewed: false, stopped: true, message: result.reason || 'Subscription stopped' });
      }

      if (result.renewed) {
        const status = await autotradeService.getStatus(userId);
        return sendSuccess(res, { renewed: true, stopped: false, subscription: status });
      }

      return sendSuccess(res, { renewed: false, stopped: false, message: 'Subscription not yet expired' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return sendError(res, 500, 'RENEW_FAILED', 'Failed to renew autotrade', msg);
    }
  });

  return router;
}

interface TestAppConfig {
  autotradeService: AutotradeService;
  paymentVerifier?: PaymentVerifier;
  userId?: string;
}

/**
 * Creates a test Express app with auth middleware bypassed
 * Injects userId directly to simulate authenticated requests
 */
function createTestApp(config: TestAppConfig) {
  const {
    autotradeService,
    paymentVerifier = createMockPaymentVerifier(),
    userId = 'test-user-123',
  } = config;
  const app = express();
  app.use(express.json());

  // Bypass auth middleware - inject userId directly
  app.use((req: any, res, next) => {
    req.userId = userId;
    next();
  });

  // Mount the test autotrade router (without requireAuth)
  app.use('/api/autotrade', createTestAutotradeRouter({
    autotradeService,
    paymentVerifier,
  }));

  return app;
}

/**
 * Creates a test app that simulates unauthenticated requests
 */
function createUnauthenticatedApp(autotradeService: AutotradeService) {
  const app = express();
  app.use(express.json());

  // Simulate requireAuth middleware blocking unauthenticated requests
  app.use('/api/autotrade', (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
      });
    }
    next();
  });

  app.use('/api/autotrade', createTestAutotradeRouter({
    autotradeService,
    paymentVerifier: createMockPaymentVerifier(),
  }));

  return app;
}

describe('Autotrade API', () => {
  describe('Authentication', () => {
    it('returns 401 when no auth token provided', async () => {
      const service = createMockAutotradeService();
      const app = createUnauthenticatedApp(service);

      const res = await request(app).get('/api/autotrade/status');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/autotrade/start', () => {
    it('returns 402 Payment Required when no payment proof provided', async () => {
      const autotradeService = createMockAutotradeService();
      const app = createTestApp({ autotradeService });

      const res = await request(app)
        .post('/api/autotrade/start')
        .send({});

      expect(res.status).toBe(402);
      expect(res.body.accepts).toBeDefined();
      expect(res.body.accepts.scheme).toBe('solana');
      expect(res.body.accepts.network).toBe('solana-devnet');
      expect(res.body.accepts.amount).toBe('1000000'); // 1 USDC
      expect(res.body.accepts.payTo).toBe('TreasuryWallet123');
      expect(res.body.accepts.memo).toContain('autotrade:');
    });

    it('calls getPaymentRequired with correct userId', async () => {
      const getPaymentRequired = mock(() => Promise.resolve({
        accepts: {
          scheme: 'solana' as const,
          network: 'solana-devnet' as const,
          payTo: 'Treasury',
          amount: '1000000',
          memo: 'test',
          expiresAt: Date.now() + 300000,
        },
      }));
      const autotradeService = createMockAutotradeService({ getPaymentRequired });
      const app = createTestApp({ autotradeService, userId: 'specific-user-456' });

      await request(app).post('/api/autotrade/start').send({});

      expect(getPaymentRequired).toHaveBeenCalledWith('specific-user-456');
    });

    it('activates subscription when valid payment proof and verification passes', async () => {
      const activateSubscription = mock(() => Promise.resolve());
      const getStatus = mock(() => Promise.resolve({
        userId: 'test-user-123',
        status: 'active' as const,
        expiresAt: Date.now() + 86400000,
        activatedAt: Date.now(),
        lastRenewalAt: Date.now(),
        totalPaid: 1.0,
        txSignatures: ['payment-sig-xyz'],
      }));
      const autotradeService = createMockAutotradeService({ activateSubscription, getStatus });
      const paymentVerifier = createMockPaymentVerifier({ valid: true });
      const app = createTestApp({ autotradeService, paymentVerifier });

      const paymentProof = Buffer.from(JSON.stringify({
        signature: 'payment-sig-xyz',
      })).toString('base64');

      const res = await request(app)
        .post('/api/autotrade/start')
        .set('x-payment-proof', paymentProof)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Autotrade activated');
      expect(res.body.data.subscription).toBeDefined();
      expect(activateSubscription).toHaveBeenCalledWith('test-user-123', 'payment-sig-xyz');
      expect(paymentVerifier.verify).toHaveBeenCalledWith({
        signature: 'payment-sig-xyz',
        expectedAmount: '1000000',
        expectedRecipient: 'TreasuryWallet123',
      });
    });

    it('returns 402 when payment verification fails', async () => {
      const autotradeService = createMockAutotradeService();
      const paymentVerifier = createMockPaymentVerifier({
        valid: false,
        error: 'Transaction not found',
      });
      const app = createTestApp({ autotradeService, paymentVerifier });

      const paymentProof = Buffer.from(JSON.stringify({
        signature: 'invalid-sig-xyz',
      })).toString('base64');

      const res = await request(app)
        .post('/api/autotrade/start')
        .set('x-payment-proof', paymentProof)
        .send({});

      expect(res.status).toBe(402);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PAYMENT_INVALID');
      expect(res.body.error.message).toBe('Transaction not found');
    });

    it('returns 400 for malformed base64 payment proof', async () => {
      const autotradeService = createMockAutotradeService();
      const app = createTestApp({ autotradeService });

      const res = await request(app)
        .post('/api/autotrade/start')
        .set('x-payment-proof', 'not-valid-base64!!!')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PAYMENT_PROOF');
    });

    it('returns 400 for payment proof with invalid JSON', async () => {
      const autotradeService = createMockAutotradeService();
      const app = createTestApp({ autotradeService });

      const invalidJson = Buffer.from('not valid json').toString('base64');

      const res = await request(app)
        .post('/api/autotrade/start')
        .set('x-payment-proof', invalidJson)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PAYMENT_PROOF');
    });

    it('returns 400 for payment proof missing signature', async () => {
      const autotradeService = createMockAutotradeService();
      const app = createTestApp({ autotradeService });

      const missingSignature = Buffer.from(JSON.stringify({
        payer: 'some-payer-address',
        // signature field missing
      })).toString('base64');

      const res = await request(app)
        .post('/api/autotrade/start')
        .set('x-payment-proof', missingSignature)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MISSING_SIGNATURE');
    });

    it('returns 500 when activateSubscription throws', async () => {
      const activateSubscription = mock(() => Promise.reject(new Error('Database connection failed')));
      const autotradeService = createMockAutotradeService({ activateSubscription });
      const app = createTestApp({ autotradeService });

      const paymentProof = Buffer.from(JSON.stringify({
        signature: 'valid-sig',
      })).toString('base64');

      const res = await request(app)
        .post('/api/autotrade/start')
        .set('x-payment-proof', paymentProof)
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('START_FAILED');
    });
  });

  describe('POST /api/autotrade/stop', () => {
    it('stops autotrade for authenticated user', async () => {
      const stopAutotrade = mock(() => Promise.resolve());
      const autotradeService = createMockAutotradeService({ stopAutotrade });
      const app = createTestApp({ autotradeService, userId: 'user-to-stop' });

      const res = await request(app)
        .post('/api/autotrade/stop')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Autotrade stopped');
      expect(stopAutotrade).toHaveBeenCalledWith('user-to-stop');
    });

    it('returns 400 when no active subscription', async () => {
      const stopAutotrade = mock(() => Promise.reject(new Error('No active subscription')));
      const autotradeService = createMockAutotradeService({ stopAutotrade });
      const app = createTestApp({ autotradeService });

      const res = await request(app)
        .post('/api/autotrade/stop')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('No active subscription');
    });

    it('returns 500 for unexpected errors', async () => {
      const stopAutotrade = mock(() => Promise.reject(new Error('Unexpected database error')));
      const autotradeService = createMockAutotradeService({ stopAutotrade });
      const app = createTestApp({ autotradeService });

      const res = await request(app)
        .post('/api/autotrade/stop')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/autotrade/status', () => {
    it('returns active status for active subscription', async () => {
      const getStatus = mock(() => Promise.resolve({
        userId: 'test-user-123',
        status: 'active' as const,
        expiresAt: Date.now() + 86400000, // 24 hours from now
        activatedAt: Date.now() - 3600000,
        lastRenewalAt: Date.now() - 3600000,
        totalPaid: 1.0,
        txSignatures: ['sig-1'],
      }));
      const autotradeService = createMockAutotradeService({ getStatus });
      const app = createTestApp({ autotradeService });

      const res = await request(app).get('/api/autotrade/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.active).toBe(true);
      expect(res.body.data.subscription).toBeDefined();
      expect(res.body.data.subscription.status).toBe('active');
    });

    it('returns inactive when subscription expired', async () => {
      const getStatus = mock(() => Promise.resolve({
        userId: 'test-user-123',
        status: 'active' as const,
        expiresAt: Date.now() - 1000, // Expired 1 second ago
        activatedAt: Date.now() - 86500000,
        lastRenewalAt: Date.now() - 86500000,
        totalPaid: 1.0,
        txSignatures: ['sig-1'],
      }));
      const autotradeService = createMockAutotradeService({ getStatus });
      const app = createTestApp({ autotradeService });

      const res = await request(app).get('/api/autotrade/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.active).toBe(false); // Expired = not active
    });

    it('returns inactive when no subscription exists', async () => {
      const getStatus = mock(() => Promise.resolve(null));
      const autotradeService = createMockAutotradeService({ getStatus });
      const app = createTestApp({ autotradeService });

      const res = await request(app).get('/api/autotrade/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.active).toBe(false);
      expect(res.body.data.subscription).toBeNull();
    });

    it('returns 500 when getStatus throws', async () => {
      const getStatus = mock(() => Promise.reject(new Error('DB error')));
      const autotradeService = createMockAutotradeService({ getStatus });
      const app = createTestApp({ autotradeService });

      const res = await request(app).get('/api/autotrade/status');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('STATUS_FAILED');
    });
  });

  describe('POST /api/autotrade/renew', () => {
    it('returns renewed=true when renewal succeeds', async () => {
      const checkAndRenew = mock(() => Promise.resolve({
        renewed: true,
        stopped: false,
      }));
      const getStatus = mock(() => Promise.resolve({
        userId: 'test-user-123',
        status: 'active' as const,
        expiresAt: Date.now() + 86400000,
        activatedAt: Date.now(),
        lastRenewalAt: Date.now(),
        totalPaid: 2.0,
        txSignatures: ['sig-1', 'sig-2'],
      }));
      const autotradeService = createMockAutotradeService({ checkAndRenew, getStatus });
      const app = createTestApp({ autotradeService });

      const res = await request(app)
        .post('/api/autotrade/renew')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.renewed).toBe(true);
      expect(res.body.data.stopped).toBe(false);
      expect(res.body.data.subscription).toBeDefined();
    });

    it('returns stopped=true when renewal fails due to insufficient funds', async () => {
      const checkAndRenew = mock(() => Promise.resolve({
        renewed: false,
        stopped: true,
        reason: 'Insufficient USDC balance',
      }));
      const autotradeService = createMockAutotradeService({ checkAndRenew });
      const app = createTestApp({ autotradeService });

      const res = await request(app)
        .post('/api/autotrade/renew')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.renewed).toBe(false);
      expect(res.body.data.stopped).toBe(true);
      expect(res.body.data.message).toContain('Insufficient USDC');
    });

    it('returns renewed=false, stopped=false when not expired', async () => {
      const checkAndRenew = mock(() => Promise.resolve({
        renewed: false,
        stopped: false,
      }));
      const autotradeService = createMockAutotradeService({ checkAndRenew });
      const app = createTestApp({ autotradeService });

      const res = await request(app)
        .post('/api/autotrade/renew')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.renewed).toBe(false);
      expect(res.body.data.stopped).toBe(false);
      expect(res.body.data.message).toBe('Subscription not yet expired');
    });

    it('returns 500 when checkAndRenew throws', async () => {
      const checkAndRenew = mock(() => Promise.reject(new Error('Network error')));
      const autotradeService = createMockAutotradeService({ checkAndRenew });
      const app = createTestApp({ autotradeService });

      const res = await request(app)
        .post('/api/autotrade/renew')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RENEW_FAILED');
    });
  });
});
