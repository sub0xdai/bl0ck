import { logger } from '@elizaos/core';

/**
 * Encrypted wallet data structure (matches existing file-based format)
 */
export interface EncryptedWalletData {
  userId: string;
  encryptedSeedPhrase: string; // Base64-encoded: IV (12 bytes) + encrypted data + auth tag (16 bytes)
  network: 'solana' | 'solana-devnet';
  createdAt: number;
}

/**
 * Database row structure for solana_wallets table
 */
interface WalletRow {
  id: string;
  user_id: string;
  encrypted_seed_phrase: string;
  network: string;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * WalletRepository - Database-backed wallet storage
 *
 * Replaces file-based storage (solana-wallets.json) with PostgreSQL.
 * Survives server rebuilds when using external database (Supabase/Neon).
 *
 * Table schema:
 * CREATE TABLE solana_wallets (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id TEXT NOT NULL UNIQUE,
 *   encrypted_seed_phrase TEXT NOT NULL,
 *   network TEXT NOT NULL DEFAULT 'solana',
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ DEFAULT NOW()
 * );
 */
export class WalletRepository {
  private static instance: WalletRepository | null = null;
  private initialized = false;
  private postgresUrl: string | null = null;

  private constructor() {
    this.postgresUrl = process.env.POSTGRES_URL || null;
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): WalletRepository {
    if (!WalletRepository.instance) {
      WalletRepository.instance = new WalletRepository();
    }
    return WalletRepository.instance;
  }

  /**
   * Check if database is configured
   */
  public isConfigured(): boolean {
    return this.postgresUrl !== null;
  }

  /**
   * Initialize table if not exists
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!this.postgresUrl) {
      logger.warn('[WalletRepository] POSTGRES_URL not set. Wallet persistence disabled.');
      return;
    }

    try {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: this.postgresUrl });
      await client.connect();

      // Create table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS solana_wallets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL UNIQUE,
          encrypted_seed_phrase TEXT NOT NULL,
          network TEXT NOT NULL DEFAULT 'solana',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_solana_wallets_user_id ON solana_wallets(user_id);
      `);

      await client.end();
      this.initialized = true;
      logger.info('[WalletRepository] Database initialized successfully');
    } catch (error) {
      logger.error(
        '[WalletRepository] Failed to initialize database:',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * Get wallet by userId
   * @param userId User identifier
   * @returns Encrypted wallet data or null if not found
   */
  public async getByUserId(userId: string): Promise<EncryptedWalletData | null> {
    if (!this.postgresUrl) {
      logger.warn('[WalletRepository] Database not configured, returning null');
      return null;
    }

    try {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: this.postgresUrl });
      await client.connect();

      const result = await client.query<WalletRow>(
        'SELECT * FROM solana_wallets WHERE user_id = $1',
        [userId]
      );

      await client.end();

      if (result.rows.length === 0) {
        logger.info(`[WalletRepository] No wallet found for userId: ${userId.substring(0, 8)}...`);
        return null;
      }

      const row = result.rows[0];
      logger.info(`[WalletRepository] Wallet found for userId: ${userId.substring(0, 8)}...`);

      return {
        userId: row.user_id,
        encryptedSeedPhrase: row.encrypted_seed_phrase,
        network: row.network as 'solana' | 'solana-devnet',
        createdAt: new Date(row.created_at).getTime(),
      };
    } catch (error) {
      logger.error(
        '[WalletRepository] Failed to get wallet:',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * Save or update wallet
   * @param wallet Encrypted wallet data to save
   */
  public async save(wallet: EncryptedWalletData): Promise<void> {
    if (!this.postgresUrl) {
      throw new Error('Database not configured. Set POSTGRES_URL environment variable.');
    }

    try {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: this.postgresUrl });
      await client.connect();

      // Upsert: insert or update on conflict
      await client.query(
        `INSERT INTO solana_wallets (user_id, encrypted_seed_phrase, network, created_at, updated_at)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET
           encrypted_seed_phrase = EXCLUDED.encrypted_seed_phrase,
           network = EXCLUDED.network,
           updated_at = NOW()`,
        [wallet.userId, wallet.encryptedSeedPhrase, wallet.network, wallet.createdAt]
      );

      await client.end();
      logger.info(`[WalletRepository] Wallet saved for userId: ${wallet.userId.substring(0, 8)}...`);
    } catch (error) {
      logger.error(
        '[WalletRepository] Failed to save wallet:',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * Check if wallet exists for userId
   * @param userId User identifier
   * @returns True if wallet exists
   */
  public async exists(userId: string): Promise<boolean> {
    if (!this.postgresUrl) {
      return false;
    }

    try {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: this.postgresUrl });
      await client.connect();

      const result = await client.query(
        'SELECT 1 FROM solana_wallets WHERE user_id = $1',
        [userId]
      );

      await client.end();
      return result.rows.length > 0;
    } catch (error) {
      logger.error(
        '[WalletRepository] Failed to check wallet existence:',
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  /**
   * Update wallet network
   * @param userId User identifier
   * @param network New network value
   */
  public async updateNetwork(userId: string, network: 'solana' | 'solana-devnet'): Promise<void> {
    if (!this.postgresUrl) {
      throw new Error('Database not configured');
    }

    try {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: this.postgresUrl });
      await client.connect();

      await client.query(
        'UPDATE solana_wallets SET network = $1, updated_at = NOW() WHERE user_id = $2',
        [network, userId]
      );

      await client.end();
      logger.info(`[WalletRepository] Network updated for userId: ${userId.substring(0, 8)}...`);
    } catch (error) {
      logger.error(
        '[WalletRepository] Failed to update network:',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }
}
