/**
 * AutomationStateStore - Database-backed automation state storage
 *
 * Persists automation configuration and state to PostgreSQL.
 * Survives server restarts when using external database.
 *
 * Uses WALLET_DB_URL and lina_automation schema to avoid conflicts with ElizaOS migrations.
 */
import { logger } from '@elizaos/core';
import type { Pool, PoolClient } from 'pg';
import dns from 'dns';
import type { AutomationState, AutomationConfig } from '../types';
import { DEFAULT_AUTOMATION_CONFIG, createInitialState } from '../types';

// Force IPv4 resolution - fixes ENOTFOUND in containers with IPv6 DNS but no IPv6 routing
dns.setDefaultResultOrder('ipv4first');

/**
 * Database row structure for automation_states table
 */
interface AutomationStateRow {
    user_id: string;
    config: string; // JSON stringified AutomationConfig
    channel_id: string | null; // Chat channel for trading updates
    circuit_breaker_tripped: boolean;
    circuit_breaker_tripped_at: number | null;
    last_trade_timestamps: string; // JSON stringified Record<string, number>
    position_open_times: string; // JSON stringified Record<string, number>
    position_metadata: string; // JSON stringified Record<string, PositionMetadata>
    session_pnl: string; // DECIMAL as string
    cycle_count: number;
    errors: string[]; // TEXT[]
    started_at: number;
    last_cycle_at: number | null;
    created_at: Date | string;
    updated_at: Date | string;
}

// Inline schema to avoid fs.readFileSync issues with bundled code
const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS lina_automation;

CREATE TABLE IF NOT EXISTS lina_automation.automation_states (
    user_id TEXT PRIMARY KEY,
    config JSONB NOT NULL,
    circuit_breaker_tripped BOOLEAN NOT NULL DEFAULT false,
    circuit_breaker_tripped_at BIGINT,
    last_trade_timestamps JSONB NOT NULL DEFAULT '{}'::jsonb,
    position_open_times JSONB NOT NULL DEFAULT '{}'::jsonb,
    session_pnl DECIMAL(18, 6) NOT NULL DEFAULT 0,
    cycle_count INTEGER NOT NULL DEFAULT 0,
    errors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    started_at BIGINT NOT NULL,
    last_cycle_at BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration for existing tables (Phase 3.1)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'lina_automation'
        AND table_name = 'automation_states'
        AND column_name = 'position_open_times'
    ) THEN
        ALTER TABLE lina_automation.automation_states
        ADD COLUMN position_open_times JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Migration for channel_id (chat messaging)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'lina_automation'
        AND table_name = 'automation_states'
        AND column_name = 'channel_id'
    ) THEN
        ALTER TABLE lina_automation.automation_states
        ADD COLUMN channel_id TEXT;
    END IF;
END $$;

-- Migration for position_metadata (ATR-based risk management - Phase 4)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'lina_automation'
        AND table_name = 'automation_states'
        AND column_name = 'position_metadata'
    ) THEN
        ALTER TABLE lina_automation.automation_states
        ADD COLUMN position_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_automation_enabled ON lina_automation.automation_states((config->>'enabled'));
CREATE INDEX IF NOT EXISTS idx_automation_circuit_breaker ON lina_automation.automation_states(circuit_breaker_tripped);
`;

/**
 * AutomationStateStore - Singleton for managing automation state persistence
 */
export class AutomationStateStore {
    private static instance: AutomationStateStore | null = null;
    private initialized = false;
    private postgresUrl: string | null = null;
    private pool: Pool | null = null;

    private constructor() {
        // Use WALLET_DB_URL for consistency with wallet persistence
        this.postgresUrl = process.env.WALLET_DB_URL || null;

        logger.info(`[AutomationStateStore] WALLET_DB_URL configured: ${this.postgresUrl ? 'YES' : 'NO'}`);
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): AutomationStateStore {
        if (!AutomationStateStore.instance) {
            AutomationStateStore.instance = new AutomationStateStore();
        }
        return AutomationStateStore.instance;
    }

    /**
     * Reset singleton instance (for testing)
     */
    public static resetInstance(): void {
        if (AutomationStateStore.instance?.pool) {
            AutomationStateStore.instance.pool.end().catch(() => {});
        }
        AutomationStateStore.instance = null;
    }

    /**
     * Check if database is configured
     */
    public isConfigured(): boolean {
        return this.postgresUrl !== null;
    }

    /**
     * Initialize connection pool and create schema/table if not exists
     */
    public async initialize(): Promise<void> {
        if (this.initialized) return;
        if (!this.postgresUrl) {
            logger.warn('[AutomationStateStore] WALLET_DB_URL not set. Automation state persistence disabled.');
            return;
        }

        try {
            const { Pool: PgPool } = await import('pg');

            this.pool = new PgPool({
                connectionString: this.postgresUrl,
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
            });

            // Test connection and create schema/table
            const client = await this.pool.connect();
            try {
                await client.query(SCHEMA);
            } finally {
                client.release();
            }

            this.initialized = true;
            logger.info('[AutomationStateStore] Database initialized successfully');
        } catch (error) {
            logger.error(
                '[AutomationStateStore] Failed to initialize database:',
                error instanceof Error ? error.message : String(error)
            );
            throw error;
        }
    }

    /**
     * Execute a query using the connection pool
     */
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

    /**
     * Map database row to AutomationState
     */
    private mapRowToState(row: AutomationStateRow): AutomationState {
        return {
            userId: row.user_id,
            config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
            channelId: row.channel_id ?? undefined,
            circuitBreakerTripped: row.circuit_breaker_tripped,
            circuitBreakerTrippedAt: row.circuit_breaker_tripped_at ?? undefined,
            lastTradeTimestamps: typeof row.last_trade_timestamps === 'string'
                ? JSON.parse(row.last_trade_timestamps)
                : row.last_trade_timestamps,
            positionOpenTimes: typeof row.position_open_times === 'string'
                ? JSON.parse(row.position_open_times)
                : (row.position_open_times || {}),
            positionMetadata: typeof row.position_metadata === 'string'
                ? JSON.parse(row.position_metadata)
                : (row.position_metadata || {}),
            sessionPnL: parseFloat(row.session_pnl),
            cycleCount: row.cycle_count,
            errors: row.errors || [],
            startedAt: row.started_at,
            lastCycleAt: row.last_cycle_at ?? undefined,
        };
    }

    /**
     * Get automation state for a user
     */
    public async getState(userId: string): Promise<AutomationState | null> {
        if (!this.pool) {
            logger.warn('[AutomationStateStore] Database not configured, returning null');
            return null;
        }

        try {
            return await this.withClient(async (client) => {
                const result = await client.query<AutomationStateRow>(
                    'SELECT * FROM lina_automation.automation_states WHERE user_id = $1',
                    [userId]
                );

                if (result.rows.length === 0) {
                    return null;
                }

                return this.mapRowToState(result.rows[0]);
            });
        } catch (error) {
            logger.error(
                '[AutomationStateStore] Failed to get state:',
                error instanceof Error ? error.message : String(error)
            );
            throw error;
        }
    }

    /**
     * Save or update automation state (upsert)
     */
    public async saveState(state: AutomationState): Promise<void> {
        if (!this.pool) {
            logger.warn('[AutomationStateStore] Database not configured, state not saved');
            return;
        }

        try {
            await this.withClient(async (client) => {
                await client.query(
                    `INSERT INTO lina_automation.automation_states (
                        user_id, config, channel_id, circuit_breaker_tripped, circuit_breaker_tripped_at,
                        last_trade_timestamps, position_open_times, position_metadata, session_pnl, cycle_count, errors,
                        started_at, last_cycle_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    ON CONFLICT (user_id) DO UPDATE SET
                        config = EXCLUDED.config,
                        channel_id = EXCLUDED.channel_id,
                        circuit_breaker_tripped = EXCLUDED.circuit_breaker_tripped,
                        circuit_breaker_tripped_at = EXCLUDED.circuit_breaker_tripped_at,
                        last_trade_timestamps = EXCLUDED.last_trade_timestamps,
                        position_open_times = EXCLUDED.position_open_times,
                        position_metadata = EXCLUDED.position_metadata,
                        session_pnl = EXCLUDED.session_pnl,
                        cycle_count = EXCLUDED.cycle_count,
                        errors = EXCLUDED.errors,
                        last_cycle_at = EXCLUDED.last_cycle_at,
                        updated_at = NOW()`,
                    [
                        state.userId,
                        JSON.stringify(state.config),
                        state.channelId ?? null,
                        state.circuitBreakerTripped,
                        state.circuitBreakerTrippedAt ?? null,
                        JSON.stringify(state.lastTradeTimestamps),
                        JSON.stringify(state.positionOpenTimes),
                        JSON.stringify(state.positionMetadata),
                        state.sessionPnL,
                        state.cycleCount,
                        state.errors,
                        state.startedAt,
                        state.lastCycleAt ?? null,
                    ]
                );
            });

            logger.debug(`[AutomationStateStore] State saved for userId: ${state.userId.substring(0, 8)}...`);
        } catch (error) {
            logger.error(
                '[AutomationStateStore] Failed to save state:',
                error instanceof Error ? error.message : String(error)
            );
            throw error;
        }
    }

    /**
     * Update specific fields of automation state (partial update)
     */
    public async updateState(
        userId: string,
        updates: Partial<Omit<AutomationState, 'userId'>>
    ): Promise<void> {
        if (!this.pool) {
            return;
        }

        try {
            // Build dynamic SET clause
            const setClauses: string[] = [];
            const values: unknown[] = [userId];
            let paramIndex = 2;

            if (updates.config !== undefined) {
                setClauses.push(`config = $${paramIndex++}`);
                values.push(JSON.stringify(updates.config));
            }
            if (updates.channelId !== undefined) {
                setClauses.push(`channel_id = $${paramIndex++}`);
                values.push(updates.channelId ?? null);
            }
            if (updates.circuitBreakerTripped !== undefined) {
                setClauses.push(`circuit_breaker_tripped = $${paramIndex++}`);
                values.push(updates.circuitBreakerTripped);
            }
            if (updates.circuitBreakerTrippedAt !== undefined) {
                setClauses.push(`circuit_breaker_tripped_at = $${paramIndex++}`);
                values.push(updates.circuitBreakerTrippedAt ?? null);
            }
            if (updates.lastTradeTimestamps !== undefined) {
                setClauses.push(`last_trade_timestamps = $${paramIndex++}`);
                values.push(JSON.stringify(updates.lastTradeTimestamps));
            }
            if (updates.positionOpenTimes !== undefined) {
                setClauses.push(`position_open_times = $${paramIndex++}`);
                values.push(JSON.stringify(updates.positionOpenTimes));
            }
            if (updates.positionMetadata !== undefined) {
                setClauses.push(`position_metadata = $${paramIndex++}`);
                values.push(JSON.stringify(updates.positionMetadata));
            }
            if (updates.sessionPnL !== undefined) {
                setClauses.push(`session_pnl = $${paramIndex++}`);
                values.push(updates.sessionPnL);
            }
            if (updates.cycleCount !== undefined) {
                setClauses.push(`cycle_count = $${paramIndex++}`);
                values.push(updates.cycleCount);
            }
            if (updates.errors !== undefined) {
                setClauses.push(`errors = $${paramIndex++}`);
                values.push(updates.errors);
            }
            if (updates.lastCycleAt !== undefined) {
                setClauses.push(`last_cycle_at = $${paramIndex++}`);
                values.push(updates.lastCycleAt ?? null);
            }

            if (setClauses.length === 0) return;

            setClauses.push('updated_at = NOW()');

            await this.withClient(async (client) => {
                await client.query(
                    `UPDATE lina_automation.automation_states SET ${setClauses.join(', ')} WHERE user_id = $1`,
                    values
                );
            });
        } catch (error) {
            logger.error(
                '[AutomationStateStore] Failed to update state:',
                error instanceof Error ? error.message : String(error)
            );
            throw error;
        }
    }

    /**
     * Delete automation state for a user
     */
    public async deleteState(userId: string): Promise<void> {
        if (!this.pool) return;

        try {
            await this.withClient(async (client) => {
                await client.query(
                    'DELETE FROM lina_automation.automation_states WHERE user_id = $1',
                    [userId]
                );
            });
            logger.info(`[AutomationStateStore] State deleted for userId: ${userId.substring(0, 8)}...`);
        } catch (error) {
            logger.error(
                '[AutomationStateStore] Failed to delete state:',
                error instanceof Error ? error.message : String(error)
            );
            throw error;
        }
    }

    /**
     * Get all users with automation enabled
     */
    public async getEnabledUsers(): Promise<AutomationState[]> {
        if (!this.pool) return [];

        try {
            return await this.withClient(async (client) => {
                const result = await client.query<AutomationStateRow>(
                    `SELECT * FROM lina_automation.automation_states WHERE config->>'enabled' = 'true'`
                );
                return result.rows.map((row) => this.mapRowToState(row));
            });
        } catch (error) {
            logger.error(
                '[AutomationStateStore] Failed to get enabled users:',
                error instanceof Error ? error.message : String(error)
            );
            throw error;
        }
    }

    /**
     * Get or create state for a user
     */
    public async getOrCreateState(
        userId: string,
        initialConfig?: Partial<AutomationConfig>
    ): Promise<AutomationState> {
        const existing = await this.getState(userId);
        if (existing) return existing;

        const newState = createInitialState(userId, initialConfig);
        await this.saveState(newState);
        return newState;
    }

    /**
     * Record a trade timestamp for cooldown tracking
     */
    public async recordTradeTimestamp(userId: string, asset: string): Promise<void> {
        const state = await this.getState(userId);
        if (!state) return;

        const updatedTimestamps = {
            ...state.lastTradeTimestamps,
            [asset]: Date.now(),
        };

        await this.updateState(userId, { lastTradeTimestamps: updatedTimestamps });
    }

    /**
     * Record when a position was opened (for maxHoldMinutes enforcement)
     */
    public async recordPositionOpen(userId: string, asset: string, timestamp?: number): Promise<void> {
        const state = await this.getState(userId);
        if (!state) return;

        const updatedTimes = {
            ...state.positionOpenTimes,
            [asset]: timestamp ?? Date.now(),
        };

        await this.updateState(userId, { positionOpenTimes: updatedTimes });
    }

    /**
     * Clear position open time when closed (for maxHoldMinutes)
     */
    public async clearPositionOpen(userId: string, asset: string): Promise<void> {
        const state = await this.getState(userId);
        if (!state) return;

        const { [asset]: _, ...remainingTimes } = state.positionOpenTimes;
        await this.updateState(userId, { positionOpenTimes: remainingTimes });
    }

    /**
     * Get position open time for an asset
     */
    public async getPositionOpenTime(userId: string, asset: string): Promise<number | undefined> {
        const state = await this.getState(userId);
        return state?.positionOpenTimes[asset];
    }

    /**
     * Trip the circuit breaker for a user
     */
    public async tripCircuitBreaker(userId: string, drawdownPct: number): Promise<void> {
        await this.updateState(userId, {
            circuitBreakerTripped: true,
            circuitBreakerTrippedAt: Date.now(),
            errors: [`Circuit breaker tripped at ${drawdownPct.toFixed(2)}% drawdown`],
        });
        logger.warn(`[AutomationStateStore] Circuit breaker tripped for userId: ${userId.substring(0, 8)}...`);
    }

    /**
     * Reset the circuit breaker for a user
     */
    public async resetCircuitBreaker(userId: string): Promise<void> {
        await this.updateState(userId, {
            circuitBreakerTripped: false,
            circuitBreakerTrippedAt: undefined,
            sessionPnL: 0, // Reset PnL on breaker reset
        });
        logger.info(`[AutomationStateStore] Circuit breaker reset for userId: ${userId.substring(0, 8)}...`);
    }

    /**
     * Gracefully close the connection pool
     */
    public async close(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.initialized = false;
            logger.info('[AutomationStateStore] Connection pool closed');
        }
    }
}

// Export singleton getter
export const getAutomationStateStore = (): AutomationStateStore =>
    AutomationStateStore.getInstance();
