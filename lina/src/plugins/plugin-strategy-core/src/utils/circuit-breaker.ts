/**
 * CircuitBreaker - Prevents trading when drawdown exceeds threshold
 *
 * Uses AsyncMutex to prevent race conditions where a trade could slip
 * through during the check-and-update cycle.
 *
 * Thread-safe: All operations are protected by mutex to ensure
 * atomic check-and-execute semantics.
 */
import { logger } from '@elizaos/core';
import { TradingErrors } from '../types';

/**
 * Simple mutex for async lock management
 * Prevents race conditions in concurrent operations
 */
export class AsyncMutex {
    private locked = false;
    private waitQueue: Array<() => void> = [];

    /**
     * Acquire the lock. Returns a release function.
     */
    async acquire(): Promise<() => void> {
        while (this.locked) {
            await new Promise<void>((resolve) => {
                this.waitQueue.push(resolve);
            });
        }
        this.locked = true;

        return () => {
            this.locked = false;
            const next = this.waitQueue.shift();
            if (next) next();
        };
    }

    /**
     * Execute a function with the lock held
     */
    async withLock<T>(fn: () => Promise<T>): Promise<T> {
        const release = await this.acquire();
        try {
            return await fn();
        } finally {
            release();
        }
    }
}

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
    /** Whether the circuit breaker has been tripped */
    tripped: boolean;

    /** When the breaker was tripped (if applicable) */
    trippedAt?: number;

    /** Current cumulative PnL for the session */
    sessionPnL: number;

    /** Starting equity when session began */
    startingEquity: number;
}

/**
 * Options for circuit breaker
 */
export interface CircuitBreakerOptions {
    /** Drawdown percentage that triggers the breaker (default 10) */
    thresholdPct: number;

    /** Callback when breaker trips */
    onTrip?: (drawdownPct: number) => void | Promise<void>;
}

/**
 * Default circuit breaker options
 */
export const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
    thresholdPct: 10,
};

/**
 * CircuitBreaker implementation with mutex protection
 */
export class CircuitBreaker {
    private mutex = new AsyncMutex();
    private state: CircuitBreakerState;
    private options: CircuitBreakerOptions;

    constructor(
        startingEquity: number,
        options: Partial<CircuitBreakerOptions> = {}
    ) {
        this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
        this.state = {
            tripped: false,
            sessionPnL: 0,
            startingEquity,
        };
    }

    /**
     * Check if the circuit breaker is currently tripped
     */
    isTripped(): boolean {
        return this.state.tripped;
    }

    /**
     * Get current state (for serialization/logging)
     */
    getState(): Readonly<CircuitBreakerState> {
        return { ...this.state };
    }

    /**
     * Get current drawdown percentage
     */
    getDrawdownPct(): number {
        if (this.state.startingEquity === 0) return 0;
        return Math.abs(Math.min(0, this.state.sessionPnL)) / this.state.startingEquity * 100;
    }

    /**
     * Restore state from persisted storage
     */
    restoreState(state: Partial<CircuitBreakerState>): void {
        this.state = {
            ...this.state,
            ...state,
        };
    }

    /**
     * Check if trade is allowed and execute atomically
     *
     * This is the main entry point - it ensures the check and execution
     * are atomic (no other trade can slip through during the check).
     *
     * @param tradeFn Function that executes the trade and returns realized PnL
     * @returns Trade result or null if circuit breaker blocked
     * @throws TradingError if circuit breaker is tripped
     */
    async checkAndExecute<T>(
        tradeFn: () => Promise<{ result: T; realizedPnL: number }>
    ): Promise<T | null> {
        return this.mutex.withLock(async () => {
            // Check if already tripped
            if (this.state.tripped) {
                const drawdownPct = this.getDrawdownPct();
                logger.warn(`[CIRCUIT_BREAKER] Trade blocked - breaker tripped at ${drawdownPct.toFixed(2)}% drawdown`);
                throw TradingErrors.circuitBreakerActive(drawdownPct);
            }

            // Execute the trade
            const { result, realizedPnL } = await tradeFn();

            // Update PnL
            this.state.sessionPnL += realizedPnL;

            // Check if we should trip
            const currentDrawdownPct = this.getDrawdownPct();
            if (currentDrawdownPct >= this.options.thresholdPct) {
                await this.trip(currentDrawdownPct);
            }

            return result;
        });
    }

    /**
     * Update PnL without executing a trade (e.g., for position monitoring)
     *
     * @param pnlDelta Change in PnL to record
     */
    async updatePnL(pnlDelta: number): Promise<void> {
        await this.mutex.withLock(async () => {
            this.state.sessionPnL += pnlDelta;

            // Check if we should trip
            const currentDrawdownPct = this.getDrawdownPct();
            if (currentDrawdownPct >= this.options.thresholdPct && !this.state.tripped) {
                await this.trip(currentDrawdownPct);
            }
        });
    }

    /**
     * Trip the circuit breaker
     */
    private async trip(drawdownPct: number): Promise<void> {
        this.state.tripped = true;
        this.state.trippedAt = Date.now();

        logger.error(
            `[CIRCUIT_BREAKER] TRIPPED! Drawdown: ${drawdownPct.toFixed(2)}% ` +
            `(threshold: ${this.options.thresholdPct}%) | Session PnL: $${this.state.sessionPnL.toFixed(2)}`
        );

        // Call onTrip callback if provided
        if (this.options.onTrip) {
            try {
                await this.options.onTrip(drawdownPct);
            } catch (error) {
                logger.error('[CIRCUIT_BREAKER] onTrip callback failed:', error instanceof Error ? error.message : String(error));
            }
        }
    }

    /**
     * Reset the circuit breaker (typically after user acknowledgment)
     *
     * @param newStartingEquity New equity to use as baseline
     */
    async reset(newStartingEquity: number): Promise<void> {
        await this.mutex.withLock(async () => {
            this.state = {
                tripped: false,
                sessionPnL: 0,
                startingEquity: newStartingEquity,
            };
            logger.info(`[CIRCUIT_BREAKER] Reset with new starting equity: $${newStartingEquity.toFixed(2)}`);
        });
    }

    /**
     * Check if a trade is allowed (without executing)
     * Use checkAndExecute for atomic check-and-trade operations.
     */
    canTrade(): boolean {
        return !this.state.tripped;
    }

    /**
     * Calculate remaining loss capacity before breaker trips
     */
    getRemainingCapacity(): number {
        const maxLoss = (this.state.startingEquity * this.options.thresholdPct) / 100;
        const currentLoss = Math.abs(Math.min(0, this.state.sessionPnL));
        return Math.max(0, maxLoss - currentLoss);
    }
}
