/**
 * Configuration for automated trading system.
 * All limits use % of account equity for user-configurable risk management.
 */
export interface AutomationConfig {
    /** Whether automation is enabled for this user */
    enabled: boolean;

    /** Polling interval in minutes (1-5, default 5) */
    intervalMinutes: number;

    /** Max single position size as % of equity (default 5) */
    maxPositionPct: number;

    /** Max total exposure across all positions as % of equity (default 25) */
    maxExposurePct: number;

    /** Max leverage per position (default 3) */
    maxLeverage: number;

    /** Assets to trade (e.g., ['SOL-PERP', 'BTC-PERP', 'ETH-PERP']) */
    assets: string[];

    /** Allow short positions (default false for safety) */
    allowShorts: boolean;

    /** Stop trading if drawdown exceeds this % (default 10) */
    circuitBreakerPct: number;

    /** Minimum minutes between trades on same asset (default 5) */
    cooldownMinutes: number;
}

/**
 * Runtime state for a user's automation session.
 * Persisted to database to survive restarts.
 */
export interface AutomationState {
    /** User identifier */
    userId: string;

    /** Current configuration */
    config: AutomationConfig;

    /** Whether circuit breaker has been tripped */
    circuitBreakerTripped: boolean;

    /** Timestamp when circuit breaker was tripped (if applicable) */
    circuitBreakerTrippedAt?: number;

    /** Last trade timestamp per asset (for cooldown enforcement) */
    lastTradeTimestamps: Record<string, number>;

    /** Cumulative PnL for this session (for circuit breaker calculation) */
    sessionPnL: number;

    /** Number of cycles executed */
    cycleCount: number;

    /** Recent errors for debugging */
    errors: string[];

    /** Session start timestamp */
    startedAt: number;

    /** Last cycle timestamp */
    lastCycleAt?: number;
}

/**
 * Default configuration with conservative safety limits.
 */
export const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
    enabled: false,
    intervalMinutes: 5,
    maxPositionPct: 5,
    maxExposurePct: 25,
    maxLeverage: 3,
    assets: ['SOL-PERP', 'BTC-PERP', 'ETH-PERP'],
    allowShorts: false,
    circuitBreakerPct: 10,
    cooldownMinutes: 5,
};

/**
 * Create initial automation state for a user.
 */
export function createInitialState(
    userId: string,
    config: Partial<AutomationConfig> = {}
): AutomationState {
    return {
        userId,
        config: { ...DEFAULT_AUTOMATION_CONFIG, ...config },
        circuitBreakerTripped: false,
        circuitBreakerTrippedAt: undefined,
        lastTradeTimestamps: {},
        sessionPnL: 0,
        cycleCount: 0,
        errors: [],
        startedAt: Date.now(),
        lastCycleAt: undefined,
    };
}
