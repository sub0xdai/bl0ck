/**
 * Execution Types and Utilities (Phase 3)
 *
 * Provides slippage protection, pre-trade validation,
 * and execution parameter types.
 */

import type { PositionSide } from '../../../../plugin-drift/src/types';

/**
 * Parameters for executing a trade with safeguards.
 */
export interface ExecutionParams {
    /** Market symbol (e.g., 'SOL-PERP') */
    marketSymbol: string;

    /** Position side */
    side: PositionSide;

    /** Size in USD */
    sizeUsd: number;

    /** Leverage multiplier */
    leverage: number;

    /** Slippage tolerance in basis points */
    slippageBps: number;

    /** Oracle price at signal generation time */
    signalPrice?: number;

    /** Maximum price drift allowed from signal time (bps) */
    maxPriceDriftBps?: number;
}

/**
 * Result of pre-trade price validation.
 */
export interface PriceValidationResult {
    /** Whether the trade should proceed */
    valid: boolean;

    /** Actual price drift in basis points */
    priceDriftBps: number;

    /** Error message if invalid */
    error?: string;
}

/**
 * Calculate the slippage-protected price for an order.
 *
 * For LONG positions: max price = oracle + slippage
 * For SHORT positions: min price = oracle - slippage
 *
 * @param oraclePrice Current oracle price
 * @param slippageBps Slippage tolerance in basis points (1 bps = 0.01%)
 * @param side Position side (long/short)
 * @returns Slippage-protected price limit
 */
export function calculateSlippagePrice(
    oraclePrice: number,
    slippageBps: number,
    side: PositionSide
): number {
    const slippageMultiplier = slippageBps / 10000; // Convert bps to decimal

    if (side === 'long') {
        // For longs, we set a maximum price (willing to pay up to X% more)
        return oraclePrice * (1 + slippageMultiplier);
    } else {
        // For shorts, we set a minimum price (willing to sell at X% less)
        return oraclePrice * (1 - slippageMultiplier);
    }
}

/**
 * Validate that the current price hasn't drifted too far from signal time.
 *
 * This prevents executing trades when the market has moved significantly
 * since the signal was generated, which could result in poor fills.
 *
 * @param signalPrice Price at signal generation time
 * @param currentPrice Current oracle price
 * @param maxDriftBps Maximum allowed drift in basis points
 * @returns Validation result with drift amount
 */
export function validatePreTradePrice(
    signalPrice: number,
    currentPrice: number,
    maxDriftBps: number
): PriceValidationResult {
    const priceDiff = Math.abs(currentPrice - signalPrice);
    const priceDriftBps = (priceDiff / signalPrice) * 10000;

    if (priceDriftBps > maxDriftBps) {
        return {
            valid: false,
            priceDriftBps,
            error: `Price drifted ${priceDriftBps.toFixed(0)}bps since signal (max: ${maxDriftBps}bps)`,
        };
    }

    return {
        valid: true,
        priceDriftBps,
    };
}

/**
 * Convert basis points to percentage for display.
 */
export function bpsToPercent(bps: number): number {
    return bps / 100;
}

/**
 * Convert percentage to basis points.
 */
export function percentToBps(percent: number): number {
    return percent * 100;
}
