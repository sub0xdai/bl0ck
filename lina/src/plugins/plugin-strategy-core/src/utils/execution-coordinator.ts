/**
 * ExecutionCoordinator - Prevents race conditions between PositionMonitor and StrategyLoop
 *
 * Problem: Both PositionMonitor (30s loop) and StrategyLoop (5min loop) can attempt
 * to close the same position simultaneously (e.g., stop-loss triggers while a flip
 * signal arrives). DriftService has a mutex, but this results in "Position not found"
 * errors in logs.
 *
 * Solution: Shared per-user, per-asset locks that both services acquire before
 * executing any position operations.
 */

import { logger } from '@elizaos/core';
import { AsyncMutex } from './circuit-breaker';

/**
 * Lock key format: userId:asset
 */
function makeLockKey(userId: string, asset: string): string {
    return `${userId}:${asset}`;
}

/**
 * Operation types for logging
 */
export type OperationType = 'open' | 'close' | 'flip' | 'stop_loss' | 'take_profit' | 'max_hold';

/**
 * Execution lock status
 */
export interface LockStatus {
    locked: boolean;
    holder?: OperationType;
    acquiredAt?: number;
}

/**
 * ExecutionCoordinator - Singleton that coordinates position operations
 */
export class ExecutionCoordinator {
    private static instance: ExecutionCoordinator | null = null;

    // Per-asset locks: Map<userId:asset, AsyncMutex>
    private locks: Map<string, AsyncMutex> = new Map();

    // Track who holds each lock for debugging
    private lockHolders: Map<string, { operation: OperationType; acquiredAt: number }> = new Map();

    // Timeout for stale locks (5 minutes)
    private readonly LOCK_TIMEOUT_MS = 5 * 60 * 1000;

    private constructor() {
        // Periodic cleanup of stale locks
        setInterval(() => this.cleanupStaleLocks(), 60_000);
    }

    /**
     * Get singleton instance
     */
    static getInstance(): ExecutionCoordinator {
        if (!ExecutionCoordinator.instance) {
            ExecutionCoordinator.instance = new ExecutionCoordinator();
        }
        return ExecutionCoordinator.instance;
    }

    /**
     * Get or create mutex for a user/asset pair
     */
    private getMutex(userId: string, asset: string): AsyncMutex {
        const key = makeLockKey(userId, asset);
        let mutex = this.locks.get(key);
        if (!mutex) {
            mutex = new AsyncMutex();
            this.locks.set(key, mutex);
        }
        return mutex;
    }

    /**
     * Acquire lock for a position operation
     *
     * @param userId User identifier
     * @param asset Asset symbol (e.g., 'SOL-PERP')
     * @param operation Type of operation for logging
     * @returns Release function to call when done
     */
    async acquireLock(
        userId: string,
        asset: string,
        operation: OperationType
    ): Promise<() => void> {
        const key = makeLockKey(userId, asset);
        const mutex = this.getMutex(userId, asset);

        // Check if already locked by another operation
        const existing = this.lockHolders.get(key);
        if (existing) {
            logger.debug(
                `[EXEC_COORD] ${operation} waiting for ${existing.operation} on ${asset} ` +
                `(held for ${Date.now() - existing.acquiredAt}ms)`
            );
        }

        const release = await mutex.acquire();

        // Record lock holder
        this.lockHolders.set(key, { operation, acquiredAt: Date.now() });

        logger.debug(`[EXEC_COORD] ${operation} acquired lock on ${asset}`);

        // Return wrapped release that cleans up tracking
        return () => {
            this.lockHolders.delete(key);
            release();
            logger.debug(`[EXEC_COORD] ${operation} released lock on ${asset}`);
        };
    }

    /**
     * Execute a function with the lock held
     *
     * @param userId User identifier
     * @param asset Asset symbol
     * @param operation Type of operation
     * @param fn Function to execute
     * @returns Result of the function
     */
    async withLock<T>(
        userId: string,
        asset: string,
        operation: OperationType,
        fn: () => Promise<T>
    ): Promise<T> {
        const release = await this.acquireLock(userId, asset, operation);
        try {
            return await fn();
        } finally {
            release();
        }
    }

    /**
     * Check if an asset is currently locked
     */
    isLocked(userId: string, asset: string): boolean {
        const key = makeLockKey(userId, asset);
        return this.lockHolders.has(key);
    }

    /**
     * Get lock status for an asset
     */
    getLockStatus(userId: string, asset: string): LockStatus {
        const key = makeLockKey(userId, asset);
        const holder = this.lockHolders.get(key);

        if (!holder) {
            return { locked: false };
        }

        return {
            locked: true,
            holder: holder.operation,
            acquiredAt: holder.acquiredAt,
        };
    }

    /**
     * Clean up stale locks (shouldn't happen, but safety net)
     */
    private cleanupStaleLocks(): void {
        const now = Date.now();

        for (const [key, holder] of this.lockHolders.entries()) {
            if (now - holder.acquiredAt > this.LOCK_TIMEOUT_MS) {
                logger.warn(
                    `[EXEC_COORD] Cleaning up stale lock: ${key} (${holder.operation}, ` +
                    `held for ${Math.round((now - holder.acquiredAt) / 1000)}s)`
                );
                this.lockHolders.delete(key);
                this.locks.delete(key);
            }
        }
    }

    /**
     * Reset for testing
     */
    static resetInstance(): void {
        ExecutionCoordinator.instance = null;
    }
}

/**
 * Convenience function to get the coordinator instance
 */
export function getExecutionCoordinator(): ExecutionCoordinator {
    return ExecutionCoordinator.getInstance();
}
