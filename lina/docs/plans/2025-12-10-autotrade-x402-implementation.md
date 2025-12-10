# Autotrade x402 Payment System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to pay $1 USDC/day for Lina to autonomously trade their entire wallet, with auto-renewal and clean shutdown.

**Architecture:** AutotradeService manages subscription state (PostgreSQL). API endpoints return x402 402 responses for payment. Frontend has Start/Stop buttons. Trading loop checks subscription before acting.

**Tech Stack:** TypeScript, PostgreSQL (existing WALLET_DB_URL), x402-solana plugin, Drift plugin (closeAllPositions)

---

## Task 1: Database Schema for Subscriptions

**Files:**
- Create: `src/services/autotrade/schema.sql`
- Create: `src/services/autotrade/repository.ts`
- Test: `src/__tests__/unit/services/autotrade-repository.test.ts`

**Step 1: Write the failing test**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd src/__tests__/unit/services && bun test autotrade-repository.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Create schema file**

```sql
-- src/services/autotrade/schema.sql
CREATE TABLE IF NOT EXISTS autotrade_subscriptions (
  user_id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expires_at BIGINT NOT NULL,
  activated_at BIGINT NOT NULL,
  last_renewal_at BIGINT NOT NULL,
  total_paid DECIMAL(18, 6) NOT NULL DEFAULT 1.0,
  tx_signatures TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_autotrade_status ON autotrade_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_autotrade_expires ON autotrade_subscriptions(expires_at);
```

**Step 4: Write repository implementation**

```typescript
// src/services/autotrade/repository.ts
import { Pool } from 'pg';
import { logger } from '@elizaos/core';
import * as fs from 'fs';
import * as path from 'path';

export interface AutotradeSubscription {
  userId: string;
  status: 'active' | 'inactive';
  expiresAt: number;
  activatedAt: number;
  lastRenewalAt: number;
  totalPaid: number;
  txSignatures: string[];
}

export interface CreateSubscriptionParams {
  userId: string;
  expiresAt: number;
  txSignature: string;
}

export class AutotradeRepository {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async initialize(): Promise<void> {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await this.pool.query(schema);
    logger.info('[AutotradeRepository] Schema initialized');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getSubscription(userId: string): Promise<AutotradeSubscription | null> {
    const result = await this.pool.query(
      `SELECT user_id, status, expires_at, activated_at, last_renewal_at, total_paid, tx_signatures
       FROM autotrade_subscriptions WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      userId: row.user_id,
      status: row.status,
      expiresAt: Number(row.expires_at),
      activatedAt: Number(row.activated_at),
      lastRenewalAt: Number(row.last_renewal_at),
      totalPaid: parseFloat(row.total_paid),
      txSignatures: row.tx_signatures,
    };
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<void> {
    const now = Date.now();
    await this.pool.query(
      `INSERT INTO autotrade_subscriptions
       (user_id, status, expires_at, activated_at, last_renewal_at, total_paid, tx_signatures)
       VALUES ($1, 'active', $2, $3, $3, 1.0, ARRAY[$4])
       ON CONFLICT (user_id) DO UPDATE SET
         status = 'active',
         expires_at = $2,
         last_renewal_at = $3,
         total_paid = autotrade_subscriptions.total_paid + 1.0,
         tx_signatures = array_append(autotrade_subscriptions.tx_signatures, $4),
         updated_at = CURRENT_TIMESTAMP`,
      [params.userId, params.expiresAt, now, params.txSignature]
    );
  }

  async deactivateSubscription(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE autotrade_subscriptions SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
      [userId]
    );
  }

  async extendSubscription(userId: string, newExpiresAt: number, txSignature: string): Promise<void> {
    await this.pool.query(
      `UPDATE autotrade_subscriptions SET
         expires_at = $2,
         last_renewal_at = $3,
         total_paid = total_paid + 1.0,
         tx_signatures = array_append(tx_signatures, $4),
         updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId, newExpiresAt, Date.now(), txSignature]
    );
  }

  async getActiveSubscriptions(): Promise<AutotradeSubscription[]> {
    const result = await this.pool.query(
      `SELECT user_id, status, expires_at, activated_at, last_renewal_at, total_paid, tx_signatures
       FROM autotrade_subscriptions WHERE status = 'active'`
    );

    return result.rows.map(row => ({
      userId: row.user_id,
      status: row.status,
      expiresAt: Number(row.expires_at),
      activatedAt: Number(row.activated_at),
      lastRenewalAt: Number(row.last_renewal_at),
      totalPaid: parseFloat(row.total_paid),
      txSignatures: row.tx_signatures,
    }));
  }
}
```

**Step 5: Run test to verify it passes**

Run: `cd src/__tests__/unit/services && bun test autotrade-repository.test.ts`
Expected: PASS (4 tests)

**Step 6: Commit**

```bash
git add src/services/autotrade/ src/__tests__/unit/services/autotrade-repository.test.ts
git commit -m "feat(autotrade): add subscription repository with PostgreSQL schema"
```

---

## Task 2: AutotradeService Core Logic

**Files:**
- Create: `src/services/autotrade/autotrade.service.ts`
- Create: `src/services/autotrade/index.ts`
- Test: `src/__tests__/unit/services/autotrade-service.test.ts`

**Step 1: Write the failing test**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd src/__tests__/unit/services && bun test autotrade-service.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write service implementation**

```typescript
// src/services/autotrade/autotrade.service.ts
import { logger } from '@elizaos/core';
import type { AutotradeRepository } from './repository';
import type { SolanaTransactionManager } from '../../managers/solana-transaction-manager';
import { USDC_MINT } from '../../plugins/plugin-x402-solana/src/constants';

export interface X402PaymentRequired {
  accepts: {
    scheme: 'solana';
    network: 'solana-mainnet' | 'solana-devnet';
    payTo: string;
    amount: string;
    memo: string;
    expiresAt: number;
  };
}

export interface AutotradeServiceConfig {
  repository: AutotradeRepository;
  solanaManager: SolanaTransactionManager;
  treasuryWallet: string;
  priceUsdc: number;
  durationMs: number;
  network?: 'mainnet-beta' | 'devnet';
}

export interface CheckRenewResult {
  renewed: boolean;
  stopped: boolean;
  reason?: string;
}

export class AutotradeService {
  private repo: AutotradeRepository;
  private solanaManager: SolanaTransactionManager;
  private treasuryWallet: string;
  private priceUsdc: number;
  private durationMs: number;
  private network: 'solana-mainnet' | 'solana-devnet';

  constructor(config: AutotradeServiceConfig) {
    this.repo = config.repository;
    this.solanaManager = config.solanaManager;
    this.treasuryWallet = config.treasuryWallet;
    this.priceUsdc = config.priceUsdc;
    this.durationMs = config.durationMs;
    this.network = config.network === 'mainnet-beta' ? 'solana-mainnet' : 'solana-devnet';
  }

  async getPaymentRequired(userId: string): Promise<X402PaymentRequired> {
    const amountBaseUnits = Math.floor(this.priceUsdc * 1_000_000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    return {
      accepts: {
        scheme: 'solana',
        network: this.network,
        payTo: this.treasuryWallet,
        amount: amountBaseUnits,
        memo: `autotrade:${userId}:${Date.now()}`,
        expiresAt,
      },
    };
  }

  async activateSubscription(userId: string, txSignature: string): Promise<void> {
    const expiresAt = Date.now() + this.durationMs;

    await this.repo.createSubscription({
      userId,
      expiresAt,
      txSignature,
    });

    logger.info(`[AutotradeService] Activated subscription for ${userId.substring(0, 8)}... expires at ${new Date(expiresAt).toISOString()}`);
  }

  async getStatus(userId: string) {
    return this.repo.getSubscription(userId);
  }

  async isActive(userId: string): Promise<boolean> {
    const sub = await this.repo.getSubscription(userId);
    if (!sub) return false;
    if (sub.status !== 'active') return false;
    if (Date.now() > sub.expiresAt) return false;
    return true;
  }

  async stopAutotrade(userId: string): Promise<void> {
    const sub = await this.repo.getSubscription(userId);
    if (!sub || sub.status !== 'active') {
      throw new Error('No active subscription');
    }

    await this.repo.deactivateSubscription(userId);
    logger.info(`[AutotradeService] Stopped autotrade for ${userId.substring(0, 8)}...`);
  }

  async checkAndRenew(userId: string): Promise<CheckRenewResult> {
    const sub = await this.repo.getSubscription(userId);

    if (!sub || sub.status !== 'active') {
      return { renewed: false, stopped: false, reason: 'No active subscription' };
    }

    // Not expired yet
    if (Date.now() < sub.expiresAt) {
      return { renewed: false, stopped: false };
    }

    // Expired - try to renew
    logger.info(`[AutotradeService] Subscription expired for ${userId.substring(0, 8)}..., attempting renewal`);

    try {
      // Check USDC balance
      const priceBaseUnits = BigInt(Math.floor(this.priceUsdc * 1_000_000));
      const { balance } = await this.solanaManager.getTokenBalance(userId, USDC_MINT.devnet);

      if (balance < priceBaseUnits) {
        // Insufficient funds - stop autotrade
        await this.repo.deactivateSubscription(userId);
        logger.warn(`[AutotradeService] Insufficient USDC for renewal, stopping autotrade for ${userId.substring(0, 8)}...`);
        return { renewed: false, stopped: true, reason: 'Insufficient USDC balance' };
      }

      // Transfer payment to treasury
      const txSignature = await this.solanaManager.transferToken({
        userId,
        to: this.treasuryWallet,
        amount: priceBaseUnits.toString(),
        mint: USDC_MINT.devnet,
      });

      // Extend subscription
      const newExpiresAt = Date.now() + this.durationMs;
      await this.repo.extendSubscription(userId, newExpiresAt, txSignature);

      logger.info(`[AutotradeService] Renewed subscription for ${userId.substring(0, 8)}..., new expiry: ${new Date(newExpiresAt).toISOString()}`);
      return { renewed: true, stopped: false };

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[AutotradeService] Renewal failed for ${userId.substring(0, 8)}...: ${msg}`);

      // Deactivate on failure
      await this.repo.deactivateSubscription(userId);
      return { renewed: false, stopped: true, reason: msg };
    }
  }
}
```

**Step 4: Create index export**

```typescript
// src/services/autotrade/index.ts
export { AutotradeService, type X402PaymentRequired, type CheckRenewResult } from './autotrade.service';
export { AutotradeRepository, type AutotradeSubscription } from './repository';
```

**Step 5: Run test to verify it passes**

Run: `cd src/__tests__/unit/services && bun test autotrade-service.test.ts`
Expected: PASS (6 tests)

**Step 6: Commit**

```bash
git add src/services/autotrade/ src/__tests__/unit/services/autotrade-service.test.ts
git commit -m "feat(autotrade): add AutotradeService with payment and renewal logic"
```

---

## Task 3: API Endpoints

**Files:**
- Create: `src/packages/server/src/api/autotrade/index.ts`
- Modify: `src/packages/server/src/api/index.ts` (add route)

**Step 1: Write the API routes**

```typescript
// src/packages/server/src/api/autotrade/index.ts
import { Router, type Request, type Response } from 'express';
import { logger } from '@elizaos/core';
import { AutotradeService } from '../../../../services/autotrade';

export function createAutotradeRouter(autotradeService: AutotradeService): Router {
  const router = Router();

  // POST /api/autotrade/start
  // Returns 402 if not paid, activates on valid payment proof
  router.post('/start', async (req: Request, res: Response) => {
    try {
      const userId = req.body.userId || req.headers['x-user-id'];
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      // Check for payment proof header
      const paymentProof = req.headers['x-payment-proof'] as string;

      if (!paymentProof) {
        // Return 402 Payment Required
        const paymentRequired = await autotradeService.getPaymentRequired(userId);
        return res.status(402).json(paymentRequired);
      }

      // Verify payment proof and activate
      // TODO: Add on-chain verification in production
      const proof = JSON.parse(Buffer.from(paymentProof, 'base64').toString());

      await autotradeService.activateSubscription(userId, proof.signature);

      const status = await autotradeService.getStatus(userId);
      return res.status(200).json({
        success: true,
        message: 'Autotrade activated',
        subscription: status,
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('[Autotrade API] /start error:', msg);
      return res.status(500).json({ error: msg });
    }
  });

  // POST /api/autotrade/stop
  router.post('/stop', async (req: Request, res: Response) => {
    try {
      const userId = req.body.userId || req.headers['x-user-id'];
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      // Note: Position closure should be triggered separately by the caller
      // This endpoint only manages subscription state
      await autotradeService.stopAutotrade(userId);

      return res.status(200).json({
        success: true,
        message: 'Autotrade stopped',
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('[Autotrade API] /stop error:', msg);
      return res.status(400).json({ error: msg });
    }
  });

  // GET /api/autotrade/status
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string || req.headers['x-user-id'] as string;
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      const subscription = await autotradeService.getStatus(userId);
      const isActive = subscription?.status === 'active' && Date.now() < subscription.expiresAt;

      return res.status(200).json({
        active: isActive,
        subscription,
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('[Autotrade API] /status error:', msg);
      return res.status(500).json({ error: msg });
    }
  });

  return router;
}
```

**Step 2: Register route in main API (manual step - locate existing pattern)**

Find where routes are registered in `src/packages/server/src/api/index.ts` and add:

```typescript
import { createAutotradeRouter } from './autotrade';

// In the route setup section:
app.use('/api/autotrade', createAutotradeRouter(autotradeService));
```

**Step 3: Commit**

```bash
git add src/packages/server/src/api/autotrade/
git commit -m "feat(autotrade): add API endpoints for start/stop/status"
```

---

## Task 4: Frontend Buttons

**Files:**
- Create: `src/frontend/components/autotrade/AutotradeButton.tsx`
- Modify: `src/frontend/App.tsx` or relevant layout (add button)

**Step 1: Create the component**

```typescript
// src/frontend/components/autotrade/AutotradeButton.tsx
import React, { useState, useEffect } from 'react';

interface AutotradeButtonProps {
  userId: string;
  onStatusChange?: (active: boolean) => void;
}

export function AutotradeButton({ userId, onStatusChange }: AutotradeButtonProps) {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  // Check status on mount
  useEffect(() => {
    checkStatus();
  }, [userId]);

  const checkStatus = async () => {
    try {
      const res = await fetch(`/api/autotrade/status?userId=${userId}`);
      const data = await res.json();
      setIsActive(data.active);
      setExpiresAt(data.subscription?.expiresAt || null);
      onStatusChange?.(data.active);
    } catch (err) {
      console.error('Failed to check autotrade status:', err);
    }
  };

  const handleStart = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First call returns 402
      const res = await fetch('/api/autotrade/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (res.status === 402) {
        // Get payment details and process payment
        const paymentRequired = await res.json();

        // TODO: Integrate with x402 client to make payment
        // For now, show payment required info
        setError(`Payment required: $${(parseInt(paymentRequired.accepts.amount) / 1_000_000).toFixed(2)} USDC`);
        setIsLoading(false);
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start autotrade');
      }

      setIsActive(true);
      await checkStatus();
      onStatusChange?.(true);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/autotrade/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to stop autotrade');
      }

      setIsActive(false);
      setExpiresAt(null);
      onStatusChange?.(false);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimeRemaining = () => {
    if (!expiresAt) return '';
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return 'Expired';
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    return `${hours}h ${minutes}m remaining`;
  };

  return (
    <div className="autotrade-controls">
      {isActive ? (
        <button
          onClick={handleStop}
          disabled={isLoading}
          className="autotrade-btn autotrade-btn-stop"
        >
          {isLoading ? 'Stopping...' : 'Stop Autotrade'}
        </button>
      ) : (
        <button
          onClick={handleStart}
          disabled={isLoading}
          className="autotrade-btn autotrade-btn-start"
        >
          {isLoading ? 'Starting...' : 'Start Autotrade ($1/day)'}
        </button>
      )}

      {isActive && expiresAt && (
        <span className="autotrade-status">
          {formatTimeRemaining()}
        </span>
      )}

      {error && (
        <span className="autotrade-error">{error}</span>
      )}
    </div>
  );
}
```

**Step 2: Add styles (inline or CSS file)**

```css
/* Add to existing CSS or create src/frontend/components/autotrade/autotrade.css */
.autotrade-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.autotrade-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.autotrade-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.autotrade-btn-start {
  background: #10b981;
  color: white;
  border: none;
}

.autotrade-btn-start:hover:not(:disabled) {
  background: #059669;
}

.autotrade-btn-stop {
  background: #ef4444;
  color: white;
  border: none;
}

.autotrade-btn-stop:hover:not(:disabled) {
  background: #dc2626;
}

.autotrade-status {
  color: #9ca3af;
  font-size: 14px;
}

.autotrade-error {
  color: #ef4444;
  font-size: 14px;
}
```

**Step 3: Commit**

```bash
git add src/frontend/components/autotrade/
git commit -m "feat(autotrade): add frontend Start/Stop buttons"
```

---

## Task 5: Environment Configuration

**Files:**
- Modify: `.env.sample`

**Step 1: Add env vars to sample**

Add these lines to `.env.sample`:

```bash
# Autotrade Configuration
AUTOTRADE_TREASURY_WALLET=           # Solana pubkey to receive subscription payments
AUTOTRADE_PRICE_USDC=1.0             # Daily subscription price
AUTOTRADE_DURATION_HOURS=24          # Subscription period in hours
```

**Step 2: Commit**

```bash
git add .env.sample
git commit -m "chore: add autotrade environment variables to .env.sample"
```

---

## Task 6: Integration - Wire Everything Together

**Files:**
- Modify: `src/packages/server/src/index.ts` or server setup file

**Step 1: Initialize AutotradeService on server start**

Find where services are initialized and add:

```typescript
import { AutotradeService, AutotradeRepository } from '../../services/autotrade';
import { SolanaTransactionManager } from '../../managers/solana-transaction-manager';

// In initialization:
const autotradeRepo = new AutotradeRepository(process.env.WALLET_DB_URL!);
await autotradeRepo.initialize();

const autotradeService = new AutotradeService({
  repository: autotradeRepo,
  solanaManager: SolanaTransactionManager.getInstance(),
  treasuryWallet: process.env.AUTOTRADE_TREASURY_WALLET!,
  priceUsdc: parseFloat(process.env.AUTOTRADE_PRICE_USDC || '1.0'),
  durationMs: parseInt(process.env.AUTOTRADE_DURATION_HOURS || '24') * 60 * 60 * 1000,
  network: process.env.SOLANA_NETWORK === 'solana' ? 'mainnet-beta' : 'devnet',
});

// Register routes
app.use('/api/autotrade', createAutotradeRouter(autotradeService));
```

**Step 2: Commit**

```bash
git add src/packages/server/
git commit -m "feat(autotrade): wire up service and routes on server start"
```

---

## Task 7: Add Position Closure on Stop

**Files:**
- Modify: `src/services/autotrade/autotrade.service.ts`

**Step 1: Add DriftService integration**

```typescript
// In AutotradeService constructor config, add:
driftService?: DriftService;

// Add method:
async stopAutotradeWithClosure(userId: string): Promise<{ positionsClosed: number }> {
  const sub = await this.repo.getSubscription(userId);
  if (!sub || sub.status !== 'active') {
    throw new Error('No active subscription');
  }

  // Close all Drift positions first
  let positionsClosed = 0;
  if (this.driftService) {
    try {
      const result = await this.driftService.closeAllPositions(userId);
      positionsClosed = result.closed;
      logger.info(`[AutotradeService] Closed ${positionsClosed} positions for ${userId.substring(0, 8)}...`);
    } catch (error) {
      logger.error(`[AutotradeService] Failed to close positions: ${error}`);
      // Continue with deactivation even if position closure fails
    }
  }

  // Deactivate subscription
  await this.repo.deactivateSubscription(userId);

  return { positionsClosed };
}
```

**Step 2: Update /stop endpoint to use new method**

**Step 3: Commit**

```bash
git add src/services/autotrade/ src/packages/server/src/api/autotrade/
git commit -m "feat(autotrade): close all Drift positions on stop"
```

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Database schema + repository | 15 min |
| 2 | AutotradeService core logic | 20 min |
| 3 | API endpoints | 15 min |
| 4 | Frontend buttons | 15 min |
| 5 | Environment config | 5 min |
| 6 | Wire together | 10 min |
| 7 | Position closure | 10 min |

**Total: ~90 minutes**

---

## Testing Checklist

After implementation:

1. [ ] Run unit tests: `bun test`
2. [ ] Start server locally: `bun run dev`
3. [ ] Test /status endpoint: `curl localhost:3000/api/autotrade/status?userId=test`
4. [ ] Test /start returns 402: `curl -X POST localhost:3000/api/autotrade/start -d '{"userId":"test"}'`
5. [ ] Test frontend buttons render
6. [ ] Test with real devnet USDC payment
