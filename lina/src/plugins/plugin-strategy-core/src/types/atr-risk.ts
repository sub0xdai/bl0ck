/**
 * ATR-Based Risk Management Types
 *
 * Types for calculating position sizes based on:
 * - ATR (Average True Range) for volatility-adjusted stops
 * - Fixed risk per trade (% of account)
 * - Minimum R:R ratio for trade qualification
 */

/**
 * ATR calculation result from OpenBB or local computation.
 */
export interface ATRResult {
    /** Date/timestamp of the ATR value */
    date: string;

    /** ATR value (in price units, e.g., $1.50 for SOL) */
    atr: number;
}

/**
 * Position sizing result from ATR-based calculation.
 */
export interface ATRPositionSizing {
    /** Position size in USD */
    positionSizeUsd: number;

    /** Stop-loss price */
    stopLossPrice: number;

    /** Take-profit target price */
    takeProfitPrice: number;

    /** Stop-loss distance as percentage of entry */
    stopLossDistancePct: number;

    /** Target distance as percentage of entry */
    targetDistancePct: number;

    /** Actual reward:risk ratio achieved */
    rewardRiskRatio: number;

    /** ATR value used for calculation */
    atrValue: number;

    /** Risk amount in USD (account × riskPerTradePct) */
    riskAmountUsd: number;
}

/**
 * Trade qualification result - whether a trade meets R:R criteria.
 */
export interface TradeQualification {
    /** Whether the trade qualifies based on R:R and other criteria */
    qualified: boolean;

    /** Reason for rejection (if not qualified) */
    reason?: string;

    /** Position sizing details (if qualified) */
    sizing?: ATRPositionSizing;
}

/**
 * Input parameters for ATR position sizing calculation.
 */
export interface PositionSizingInput {
    /** Current/expected entry price */
    entryPrice: number;

    /** Account equity in USD */
    accountEquity: number;

    /** Trade direction */
    direction: 'LONG' | 'SHORT';

    /** ATR value (from OpenBB or local calculation) */
    atrValue: number;

    /** ATR multiplier for stop distance (default: 2.0) */
    atrStopMultiplier?: number;

    /** Risk per trade as % of account (default: 2.0) */
    riskPerTradePct?: number;

    /** Minimum reward:risk ratio (default: 3.0) */
    minRewardRiskRatio?: number;
}
