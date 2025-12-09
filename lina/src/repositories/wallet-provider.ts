import { logger } from '@elizaos/core';
import { Keypair } from '@solana/web3.js';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import * as dns from 'dns';

// Force IPv4 resolution - fixes ENOTFOUND in containers with IPv6 DNS but no IPv6 routing
dns.setDefaultResultOrder('ipv4first');

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface EncryptedWalletData {
  userId: string;
  encryptedSeedPhrase: string; // Base64: IV + EncryptedData + AuthTag
  network: 'solana' | 'solana-devnet';
  createdAt: number;
}

export interface WalletData {
  userId: string;
  publicKey: string;
  keypair: Keypair;
  network: 'solana' | 'solana-devnet';
}

export interface IWalletProvider {
  initialize(): Promise<void>;
  isConfigured(): boolean;
  getOrCreateWallet(userId: string): Promise<WalletData>;
  getWallet(userId: string): Promise<WalletData | null>;
  updateNetwork(userId: string, network: 'solana' | 'solana-devnet'): Promise<void>;
}

// ============================================================================
// Encryption Helper
// ============================================================================

const ALGORITHM = 'aes-256-gcm' as const;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

class WalletEncryption {
  private readonly key: Buffer;

  constructor(secretHex: string) {
    if (!secretHex) {
      throw new Error('SOLANA_WALLET_SECRET not set. Generate with: openssl rand -hex 32');
    }
    const key = Buffer.from(secretHex, 'hex');
    if (key.length !== 32) {
      throw new Error(`Invalid SOLANA_WALLET_SECRET length: ${key.length} bytes (expected 32)`);
    }
    this.key = key;
  }

  encrypt(data: Uint8Array): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(data)),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // IV + Encrypted + Tag
    return Buffer.concat([iv, encrypted, authTag]).toString('base64');
  }

  decrypt(base64Data: string): Uint8Array {
    const buf = Buffer.from(base64Data, 'base64');

    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    return new Uint8Array(
      Buffer.concat([decipher.update(encrypted), decipher.final()])
    );
  }
}

// ============================================================================
// Unified Wallet Provider (Singleton)
// ============================================================================

/**
 * UnifiedWalletProvider - Single source of truth for wallet operations
 *
 * Features:
 * - Database-only storage (no file fallback)
 * - Mutex for concurrent operations (prevents race conditions)
 * - SERIALIZABLE transactions for atomicity
 * - Memory cache with 60s TTL
 * - Fail-fast configuration validation
 *
 * Usage:
 *   const provider = UnifiedWalletProvider.getInstance();
 *   await provider.initialize();
 *   const wallet = await provider.getOrCreateWallet(userId);
 */
export class UnifiedWalletProvider implements IWalletProvider {
  private static instance: UnifiedWalletProvider | null = null;

  private pool: Pool | null = null;
  private encryption: WalletEncryption | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // Configuration
  private readonly dbUrl: string | null;
  private readonly walletSecret: string | null;
  private network: 'solana' | 'solana-devnet' = 'solana-devnet';

  // Mutex for wallet operations
  private operationLocks = new Map<string, Promise<WalletData>>();

  // Memory cache
  private cache = new Map<string, { data: WalletData; timestamp: number }>();
  private readonly CACHE_TTL = 60 * 1000; // 60 seconds

  private constructor() {
    this.dbUrl = process.env.WALLET_DB_URL || null;
    this.walletSecret = process.env.SOLANA_WALLET_SECRET || null;

    const networkEnv = process.env.SOLANA_NETWORK as 'solana' | 'solana-devnet' | undefined;
    if (networkEnv === 'solana' || networkEnv === 'solana-devnet') {
      this.network = networkEnv;
    }

    logger.info(`[UnifiedWalletProvider] Created (network: ${this.network})`);
  }

  public static getInstance(): UnifiedWalletProvider {
    if (!UnifiedWalletProvider.instance) {
      UnifiedWalletProvider.instance = new UnifiedWalletProvider();
    }
    return UnifiedWalletProvider.instance;
  }

  public static resetInstance(): void {
    if (UnifiedWalletProvider.instance?.pool) {
      UnifiedWalletProvider.instance.pool.end().catch(() => {});
    }
    UnifiedWalletProvider.instance = null;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  public isConfigured(): boolean {
    return this.dbUrl !== null && this.walletSecret !== null;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.initializeInternal();
    await this.initPromise;
  }

  private async initializeInternal(): Promise<void> {
    // Validate configuration (fail-fast)
    const issues: string[] = [];

    if (!this.dbUrl) {
      issues.push('WALLET_DB_URL not set - wallet storage will fail');
    }

    if (!this.walletSecret) {
      issues.push('SOLANA_WALLET_SECRET not set - wallet encryption will fail');
    }

    if (issues.length > 0) {
      logger.error('[UnifiedWalletProvider] Configuration errors:');
      issues.forEach((issue) => logger.error(`  - ${issue}`));
      throw new Error(`Wallet provider configuration failed: ${issues.join(', ')}`);
    }

    // Initialize encryption
    this.encryption = new WalletEncryption(this.walletSecret!);
    logger.info('[UnifiedWalletProvider] Encryption initialized');

    // Initialize database pool
    try {
      const { Pool: PgPool } = await import('pg');
      this.pool = new PgPool({
        connectionString: this.dbUrl!,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      // Create schema and table if not exists
      const client = await this.pool.connect();
      try {
        await client.query(`CREATE SCHEMA IF NOT EXISTS lina_wallets`);
        await client.query(`
          CREATE TABLE IF NOT EXISTS lina_wallets.solana_wallets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL UNIQUE,
            encrypted_seed_phrase TEXT NOT NULL,
            network TEXT NOT NULL DEFAULT 'solana',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_solana_wallets_user_id ON lina_wallets.solana_wallets(user_id);
        `);
      } finally {
        client.release();
      }

      this.initialized = true;
      logger.info('[UnifiedWalletProvider] Database initialized successfully');
    } catch (error) {
      logger.error(
        '[UnifiedWalletProvider] Database initialization failed:',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  // ============================================================================
  // Cache Helpers
  // ============================================================================

  private getCached(userId: string): WalletData | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(userId);
      return null;
    }

    return entry.data;
  }

  private setCache(userId: string, data: WalletData): void {
    this.cache.set(userId, { data, timestamp: Date.now() });
  }

  private invalidateCache(userId: string): void {
    this.cache.delete(userId);
  }

  // ============================================================================
  // Database Helpers
  // ============================================================================

  private async withClient<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Database pool not initialized. Call initialize() first.');
    }

    const client = await this.pool.connect();
    try {
      return await operation(client);
    } finally {
      client.release();
    }
  }

  private async withTransaction<T>(
    operation: (client: PoolClient) => Promise<T>,
    isolationLevel: 'READ COMMITTED' | 'SERIALIZABLE' = 'SERIALIZABLE'
  ): Promise<T> {
    return this.withClient(async (client) => {
      await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);
      try {
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  // ============================================================================
  // Wallet Operations
  // ============================================================================

  /**
   * Get or create a wallet for a user
   * Uses mutex to prevent race conditions (TOCTOU-safe implementation)
   */
  public async getOrCreateWallet(userId: string): Promise<WalletData> {
    // Ensure initialized
    await this.initialize();

    // Check cache first (fast path)
    const cached = this.getCached(userId);
    if (cached) {
      logger.debug(`[UnifiedWalletProvider] Cache hit for user: ${userId.substring(0, 8)}...`);
      return cached;
    }

    // MUTEX: Atomically get-or-create the lock promise
    // This fixes the TOCTOU race by combining check+set into atomic operation
    let operationPromise = this.operationLocks.get(userId);
    if (!operationPromise) {
      // Create new operation and set in map BEFORE awaiting
      operationPromise = this.getOrCreateWalletInternal(userId).finally(() => {
        this.operationLocks.delete(userId);
      });
      this.operationLocks.set(userId, operationPromise);
    } else {
      logger.info(`[UnifiedWalletProvider] Waiting for existing operation: ${userId.substring(0, 8)}...`);
    }

    return operationPromise;
  }

  private async getOrCreateWalletInternal(userId: string): Promise<WalletData> {
    return this.withTransaction(async (client) => {
      // Try to get existing wallet with row lock
      const result = await client.query(
        'SELECT * FROM lina_wallets.solana_wallets WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      if (result.rows.length > 0) {
        // Wallet exists - decrypt and return
        const row = result.rows[0];
        const decrypted = this.encryption!.decrypt(row.encrypted_seed_phrase);
        const keypair = Keypair.fromSecretKey(decrypted);

        const walletData: WalletData = {
          userId,
          publicKey: keypair.publicKey.toBase58(),
          keypair,
          network: row.network as 'solana' | 'solana-devnet',
        };

        // Update cache AFTER successful DB read
        this.setCache(userId, walletData);

        logger.info(`[UnifiedWalletProvider] Wallet restored: ${walletData.publicKey.substring(0, 8)}...`);
        return walletData;
      }

      // No wallet exists - create new one
      const keypair = Keypair.generate();
      const encryptedSeed = this.encryption!.encrypt(keypair.secretKey);

      await client.query(
        `INSERT INTO lina_wallets.solana_wallets (user_id, encrypted_seed_phrase, network, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())`,
        [userId, encryptedSeed, this.network]
      );

      const walletData: WalletData = {
        userId,
        publicKey: keypair.publicKey.toBase58(),
        keypair,
        network: this.network,
      };

      // Update cache AFTER successful DB write
      this.setCache(userId, walletData);

      logger.info(`[UnifiedWalletProvider] New wallet created: ${walletData.publicKey.substring(0, 8)}...`);
      return walletData;
    });
  }

  /**
   * Get wallet for a user (returns null if not found)
   */
  public async getWallet(userId: string): Promise<WalletData | null> {
    await this.initialize();

    // Check cache first
    const cached = this.getCached(userId);
    if (cached) return cached;

    return this.withClient(async (client) => {
      const result = await client.query(
        'SELECT * FROM lina_wallets.solana_wallets WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const decrypted = this.encryption!.decrypt(row.encrypted_seed_phrase);
      const keypair = Keypair.fromSecretKey(decrypted);

      const walletData: WalletData = {
        userId,
        publicKey: keypair.publicKey.toBase58(),
        keypair,
        network: row.network as 'solana' | 'solana-devnet',
      };

      this.setCache(userId, walletData);
      return walletData;
    });
  }

  /**
   * Update wallet network
   */
  public async updateNetwork(userId: string, network: 'solana' | 'solana-devnet'): Promise<void> {
    await this.initialize();

    await this.withTransaction(async (client) => {
      await client.query(
        'UPDATE lina_wallets.solana_wallets SET network = $1, updated_at = NOW() WHERE user_id = $2',
        [network, userId]
      );
    });

    // Invalidate cache so next read gets fresh data
    this.invalidateCache(userId);

    logger.info(`[UnifiedWalletProvider] Network updated for user: ${userId.substring(0, 8)}...`);
  }

  /**
   * Close the connection pool
   */
  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
      logger.info('[UnifiedWalletProvider] Connection pool closed');
    }
  }
}

// Export singleton getter for convenience
export function getWalletProvider(): UnifiedWalletProvider {
  return UnifiedWalletProvider.getInstance();
}
