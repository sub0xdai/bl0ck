/**
 * ATR Position Sizing Service
 *
 * Calculates position sizes based on:
 * - ATR for volatility-adjusted stop placement
 * - Fixed risk per trade (% of account)
 * - Minimum R:R ratio for trade qualification
 *
 * Key Formulas:
 *   SL_distance = ATR × multiplier
 *   TP_distance = SL_distance × R:R ratio
 *   Position_size = (account × risk%) / SL_distance%
 */
import { logger } from '@elizaos/core';
import type { ATRPositionSizing, TradeQualification, PositionSizingInput } from '../types/atr-risk';
import type { OHLCVData } from './openbb.service';

/** Minimum position size for Drift protocol */
const MIN_POSITION_USD = 1.30;

/**
 * Calculate ATR-based position sizing
 *
 * @param input Position sizing parameters
 * @returns Sizing result with stop, target, and position size
 */
export function calculateATRPositionSizing(input: PositionSizingInput): ATRPositionSizing {
    const {
        entryPrice,
        accountEquity,
        direction,
        atrValue,
        atrStopMultiplier = 2.0,
        riskPerTradePct = 2.0,
        minRewardRiskRatio = 3.0,
    } = input;

    // Step 1: Calculate stop distance based on ATR
    const stopDistance = atrValue * atrStopMultiplier;
    const stopDistancePct = (stopDistance / entryPrice) * 100;

    // Step 2: Calculate stop and target prices based on direction
    let stopLossPrice: number;
    let takeProfitPrice: number;

    if (direction === 'LONG') {
        stopLossPrice = entryPrice - stopDistance;
        takeProfitPrice = entryPrice + (stopDistance * minRewardRiskRatio);
    } else {
        stopLossPrice = entryPrice + stopDistance;
        takeProfitPrice = entryPrice - (stopDistance * minRewardRiskRatio);
    }

    // Step 3: Calculate risk amount in USD
    const riskAmountUsd = (accountEquity * riskPerTradePct) / 100;

    // Step 4: Calculate position size
    // Formula: position_size = risk_amount / stop_distance_pct
    // Example: $1000 account, 2% risk, 3% stop = ($1000 × 0.02) / 0.03 = $666.67
    const positionSizeUsd = riskAmountUsd / (stopDistancePct / 100);

    // Step 5: Calculate target distance percentage
    const targetDistance = stopDistance * minRewardRiskRatio;
    const targetDistancePct = (targetDistance / entryPrice) * 100;

    logger.debug(
        `[ATR_SIZING] ${direction} @ $${entryPrice.toFixed(2)}: ` +
        `ATR=$${atrValue.toFixed(4)}, SL=$${stopLossPrice.toFixed(2)} (${stopDistancePct.toFixed(2)}%), ` +
        `TP=$${takeProfitPrice.toFixed(2)} (${targetDistancePct.toFixed(2)}%), ` +
        `Size=$${positionSizeUsd.toFixed(2)}, Risk=$${riskAmountUsd.toFixed(2)}`
    );

    return {
        positionSizeUsd,
        stopLossPrice,
        takeProfitPrice,
        stopLossDistancePct: stopDistancePct,
        targetDistancePct,
        rewardRiskRatio: minRewardRiskRatio,
        atrValue,
        riskAmountUsd,
    };
}

/**
 * Qualify a trade based on R:R ratio and other criteria
 *
 * Ensures:
 * - Valid stop-loss placement
 * - Position size above minimum
 * - R:R ratio meets requirements
 *
 * @param input Position sizing parameters
 * @returns Qualification result with sizing if approved
 */
export function qualifyTradeForRR(input: PositionSizingInput): TradeQualification {
    const { entryPrice, direction, atrValue } = input;
    const minRR = input.minRewardRiskRatio ?? 3.0;

    // Validate inputs
    if (entryPrice <= 0) {
        return {
            qualified: false,
            reason: 'Invalid entry price (must be positive)',
        };
    }

    if (atrValue <= 0) {
        return {
            qualified: false,
            reason: 'Invalid ATR value (must be positive)',
        };
    }

    // Calculate sizing
    const sizing = calculateATRPositionSizing(input);

    // Validate stop-loss price
    if (sizing.stopLossPrice <= 0) {
        return {
            qualified: false,
            reason: 'Invalid stop-loss price (would be negative or zero)',
        };
    }

    // Validate stop direction
    if (direction === 'LONG' && sizing.stopLossPrice >= entryPrice) {
        return {
            qualified: false,
            reason: 'Stop-loss must be below entry for LONG position',
        };
    }

    if (direction === 'SHORT' && sizing.stopLossPrice <= entryPrice) {
        return {
            qualified: false,
            reason: 'Stop-loss must be above entry for SHORT position',
        };
    }

    // Check minimum position size (Drift minimum ~$1.30)
    if (sizing.positionSizeUsd < MIN_POSITION_USD) {
        return {
            qualified: false,
            reason: `Position size $${sizing.positionSizeUsd.toFixed(2)} below minimum $${MIN_POSITION_USD}`,
        };
    }

    // Verify R:R ratio (should be guaranteed by calculation, but double-check)
    if (sizing.rewardRiskRatio < minRR) {
        return {
            qualified: false,
            reason: `R:R ratio ${sizing.rewardRiskRatio.toFixed(1)} below minimum ${minRR}`,
        };
    }

    return {
        qualified: true,
        sizing,
    };
}

/**
 * Calculate ATR from OHLCV data (pure function for testability)
 *
 * ATR = Average of True Range over N periods
 * True Range = max(high-low, abs(high-prev_close), abs(low-prev_close))
 *
 * @param ohlcv OHLCV data array (oldest first)
 * @param period ATR period (default: 14)
 * @returns ATR value or null if insufficient data
 */
export function calculateATRFromOHLCV(
    ohlcv: OHLCVData[],
    period: number = 14
): number | null {
    if (ohlcv.length < period + 1) {
        return null;
    }

    const trueRanges: number[] = [];
    for (let i = 1; i < ohlcv.length; i++) {
        const high = ohlcv[i].high;
        const low = ohlcv[i].low;
        const prevClose = ohlcv[i - 1].close;

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trueRanges.push(tr);
    }

    const recentTR = trueRanges.slice(-period);
    return recentTR.reduce((sum, tr) => sum + tr, 0) / period;
}

/**
 * Calculate position size for a specific dollar risk amount
 *
 * @param riskAmountUsd How much to risk in USD
 * @param stopDistancePct Stop-loss distance as percentage
 * @returns Position size in USD
 */
export function calculatePositionSizeFromRisk(
    riskAmountUsd: number,
    stopDistancePct: number
): number {
    if (stopDistancePct <= 0) {
        throw new Error('Stop distance must be positive');
    }
    return riskAmountUsd / (stopDistancePct / 100);
}

/**
 * Calculate the risk amount for a given position size and stop
 *
 * @param positionSizeUsd Position size in USD
 * @param stopDistancePct Stop-loss distance as percentage
 * @returns Risk amount in USD
 */
export function calculateRiskFromPosition(
    positionSizeUsd: number,
    stopDistancePct: number
): number {
    return positionSizeUsd * (stopDistancePct / 100);
}
