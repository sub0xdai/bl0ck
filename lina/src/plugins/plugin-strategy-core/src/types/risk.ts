import type { Signal } from './signals';
import type { AutomationConfig } from './automation-config';

/**
 * Result of a risk assessment for a potential trade.
 */
export interface RiskAssessment {
    /** Whether the trade is allowed */
    canTrade: boolean;

    /** Reason for rejection (if canTrade is false) */
    reason?: string;

    /** Suggested position size in USD */
    suggestedSizeUsd: number;

    /** Suggested leverage to use */
    suggestedLeverage: number;

    /** Current total exposure as % of equity */
    currentExposurePct: number;

    /** Remaining capacity in USD before hitting maxExposurePct */
    remainingCapacityUsd: number;
}

/**
 * Parameters for calculating position size.
 */
export interface PositionSizeParams {
    /** User identifier */
    userId: string;

    /** Asset to trade */
    asset: string;

    /** Signal that triggered the trade */
    signal: Signal;

    /** User's automation config */
    config: AutomationConfig;
}

/**
 * Snapshot of current account exposure.
 */
export interface ExposureSnapshot {
    /** Total collateral (USD) */
    totalCollateral: number;

    /** Total notional value of all positions (USD) */
    totalNotional: number;

    /** Current exposure as % of collateral */
    exposurePct: number;

    /** Free collateral available */
    freeCollateral: number;

    /** Current account leverage */
    accountLeverage: number;

    /** Number of open positions */
    positionCount: number;

    /** Breakdown by asset */
    positionsByAsset: Record<string, {
        notionalValue: number;
        side: 'long' | 'short';
        unrealizedPnl: number;
    }>;
}

/**
 * Calculate maximum position size based on config and exposure.
 */
export function calculateMaxPositionSize(
    equity: number,
    currentExposurePct: number,
    config: AutomationConfig
): number {
    // Max single position is % of equity
    const maxFromConfig = (equity * config.maxPositionPct) / 100;

    // But also limited by remaining exposure capacity
    const remainingExposurePct = config.maxExposurePct - currentExposurePct;
    const maxFromExposure = (equity * remainingExposurePct) / 100;

    // Take the smaller of the two
    return Math.max(0, Math.min(maxFromConfig, maxFromExposure));
}

/**
 * Scale position size based on signal confidence.
 * Higher confidence = larger position (up to max).
 */
export function scalePositionByConfidence(
    maxSize: number,
    confidence: number,
    minConfidence: number = 0.6
): number {
    // Scale linearly from minConfidence to 1.0
    // At minConfidence, use 50% of max size
    // At 1.0, use 100% of max size
    const range = 1 - minConfidence;
    const confidenceAboveMin = confidence - minConfidence;
    const scaleFactor = 0.5 + (confidenceAboveMin / range) * 0.5;

    return maxSize * Math.min(1, Math.max(0.5, scaleFactor));
}

/**
 * Reasons why a trade might be rejected.
 */
export const REJECTION_REASONS = {
    CIRCUIT_BREAKER_TRIPPED: 'Circuit breaker has been tripped due to excessive losses',
    MAX_EXPOSURE_REACHED: 'Maximum exposure limit reached',
    COOLDOWN_ACTIVE: 'Asset is in cooldown period after recent trade',
    AUTOMATION_DISABLED: 'Automation is not enabled',
    ASSET_NOT_ALLOWED: 'Asset is not in the allowed list',
    SHORTS_NOT_ALLOWED: 'Short positions are not allowed',
    INSUFFICIENT_CONFIDENCE: 'Signal confidence below threshold',
    INSUFFICIENT_COLLATERAL: 'Insufficient collateral for minimum position',
} as const;

export type RejectionReason = keyof typeof REJECTION_REASONS;
