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

    // === Phase 3: Execution Safeguards ===

    /** Max slippage in basis points (default 50 = 0.5%) */
    maxSlippageBps: number;

    /** Max price drift from signal time in basis points (default 100 = 1%) */
    maxPriceDriftBps: number;

    /** Stop loss percentage (e.g., 5 = close if position drops 5%) */
    stopLossPct?: number;

    /** Take profit percentage (e.g., 10 = close if position gains 10%) */
    takeProfitPct?: number;

    /** Maximum hold time in minutes before forced exit */
    maxHoldMinutes?: number;

    // === Phase 4: ATR-Based Risk Management ===

    /** Enable ATR-based position sizing (default false for backward compatibility) */
    useAtrSizing?: boolean;

    /** ATR period for volatility calculation (default 14) */
    atrPeriod?: number;

    /** ATR multiplier for stop-loss distance (default 2.0) */
    atrStopMultiplier?: number;

    /** Risk per trade as % of account (default 2.0) */
    riskPerTradePct?: number;

    /** Minimum reward:risk ratio to take trade (default 3.0) */
    minRewardRiskRatio?: number;

    /** Trigger break-even when profit reaches X ratio of target (default 0.5 = 50%) */
    breakEvenTriggerRatio?: number;
}

/**
 * Metadata for a tracked position (ATR-based risk management).
 */
export interface PositionMetadata {
    /** Entry price when position was opened */
    entryPrice: number;

    /** Current stop-loss price (may be adjusted for break-even) */
    stopPrice: number;

    /** Take-profit target price */
    targetPrice: number;

    /** Whether break-even stop has been triggered */
    breakEvenTriggered: boolean;
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

    /** Chat channel ID for sending trading updates (set when automation enabled) */
    channelId?: string;

    /** Whether circuit breaker has been tripped */
    circuitBreakerTripped: boolean;

    /** Timestamp when circuit breaker was tripped (if applicable) */
    circuitBreakerTrippedAt?: number;

    /** Last trade timestamp per asset (for cooldown enforcement) */
    lastTradeTimestamps: Record<string, number>;

    /** Position open timestamps per asset (for maxHoldMinutes enforcement) */
    positionOpenTimes: Record<string, number>;

    /** Position metadata per asset (ATR-based stop/target tracking) */
    positionMetadata: Record<string, PositionMetadata>;

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
    maxPositionPct: 25,
    maxExposurePct: 25,
    maxLeverage: 3,
    assets: ['SOL-PERP', 'BTC-PERP', 'ETH-PERP'],
    allowShorts: false,
    circuitBreakerPct: 10,
    cooldownMinutes: 5,
    // Phase 3: Execution safeguards
    maxSlippageBps: 50,      // 0.5% default slippage tolerance
    maxPriceDriftBps: 100,   // 1% max price drift from signal time
    stopLossPct: undefined,  // Optional - no default stop loss
    takeProfitPct: undefined, // Optional - no default take profit
    maxHoldMinutes: undefined, // Optional - no default hold limit
    // Phase 4: ATR-Based Risk Management
    useAtrSizing: false,     // Disabled by default for backward compatibility
    atrPeriod: 14,           // Standard ATR period
    atrStopMultiplier: 2.0,  // SL = entry ± (ATR × 2)
    riskPerTradePct: 2.0,    // Risk 2% of account per trade
    minRewardRiskRatio: 3.0, // Only take 1:3+ R:R trades
    breakEvenTriggerRatio: 0.5, // Move SL to BE at 50% to target
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
        positionOpenTimes: {},
        positionMetadata: {},
        sessionPnL: 0,
        cycleCount: 0,
        errors: [],
        startedAt: Date.now(),
        lastCycleAt: undefined,
    };
}
