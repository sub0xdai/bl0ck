/**
 * Direction of a trading signal.
 */
export type SignalDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

/**
 * Individual signal source contribution.
 */
export interface SignalSource {
    /** Source name (e.g., 'trend', 'news', 'volume') */
    name: string;

    /** Signal value from -1 (bearish) to 1 (bullish) */
    value: number;

    /** Weight applied to this source (0-1) */
    weight: number;

    /** Optional raw data from the source for debugging */
    rawData?: unknown;
}

/**
 * Aggregated trading signal for an asset.
 */
export interface Signal {
    /** Asset symbol (e.g., 'SOL-PERP') */
    asset: string;

    /** Trading direction */
    direction: SignalDirection;

    /** Confidence level (0-1) */
    confidence: number;

    /** Contributing signal sources */
    sources: SignalSource[];

    /** Timestamp when signal was generated */
    timestamp: number;
}

/**
 * Configuration for signal source weights.
 */
export interface SignalWeights {
    trend: number;
    news: number;
    volume: number;
}

/**
 * Default uniform weights for signal aggregation.
 * Start simple, add asset-specific weights based on backtesting later.
 */
export const DEFAULT_SIGNAL_WEIGHTS: SignalWeights = {
    trend: 0.5,
    news: 0.3,
    volume: 0.2,
};

/**
 * Minimum confidence threshold to generate a non-NEUTRAL signal.
 */
export const SIGNAL_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Trend threshold for determining bullish/bearish (7d price change %).
 * Lower = more sensitive to small moves. Original: 5, lowered for testing.
 */
export const TREND_THRESHOLD_PCT = 2;

/**
 * Calculate aggregated signal from multiple sources.
 */
export function aggregateSignals(
    asset: string,
    sources: SignalSource[]
): Signal {
    // Calculate weighted sum
    const weightedSum = sources.reduce(
        (sum, source) => sum + source.value * source.weight,
        0
    );

    // Confidence is the absolute weighted sum, clamped to [0, 1]
    const confidence = Math.min(Math.abs(weightedSum), 1);

    // Direction based on weighted sum and confidence threshold
    let direction: SignalDirection = 'NEUTRAL';
    if (confidence >= SIGNAL_CONFIDENCE_THRESHOLD) {
        direction = weightedSum > 0 ? 'LONG' : 'SHORT';
    }

    return {
        asset,
        direction,
        confidence,
        sources,
        timestamp: Date.now(),
    };
}
