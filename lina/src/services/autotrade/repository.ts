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
