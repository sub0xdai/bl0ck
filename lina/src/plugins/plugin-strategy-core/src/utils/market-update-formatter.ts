/**
 * Market Update Formatter
 *
 * Pure functions for generating conversational market update messages.
 * Lina uses these to communicate what she sees and what she's doing.
 */

import type { Signal } from '../types';

/**
 * Position data for formatting
 */
export interface FormattedPosition {
    marketSymbol: string;
    side: 'long' | 'short';
    entryPrice: number;
    markPrice: number;
    notionalValue: number;
    unrealizedPnl: number;
    unrealizedPnlPct: number;
}

/**
 * Context needed to generate a market update message
 */
export interface MarketUpdateContext {
    /** Signals from all tracked assets */
    signals: Signal[];
    /** Current open positions */
    positions: FormattedPosition[];
    /** Account collateral in USD */
    collateral: number;
    /** Total unrealized PnL in USD */
    unrealizedPnl: number;
}

/**
 * Extract asset name from perp symbol (SOL-PERP -> SOL)
 */
function getAssetName(symbol: string): string {
    return symbol.replace('-PERP', '').replace('1M', '');
}

/**
 * Get the strongest non-neutral signal
 */
function getTopSignal(signals: Signal[]): Signal | null {
    const actionable = signals.filter(s => s.direction !== 'NEUTRAL');
    if (actionable.length === 0) return null;
    return actionable.sort((a, b) => b.confidence - a.confidence)[0];
}

/**
 * Format price change percentage for display
 */
function formatPriceChange(change: number): string {
    const sign = change >= 0 ? 'up' : 'down';
    return `${sign} ${Math.abs(change).toFixed(1)}%`;
}

/**
 * Format PnL percentage for display
 */
function formatPnlPct(pct: number): string {
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(0)}%`;
}

/**
 * Format PnL USD for display
 */
function formatPnlUsd(usd: number): string {
    const sign = usd >= 0 ? '+' : '-';
    return `${sign}$${Math.abs(usd).toFixed(2)}`;
}

/**
 * Format a market scan message when not in a position
 */
function formatMarketScan(topSignal: Signal): string {
    const asset = getAssetName(topSignal.asset);
    const direction = topSignal.direction === 'LONG' ? 'bullish' : 'bearish';
    const confidence = (topSignal.confidence * 100).toFixed(0);

    // Extract price change from trend source if available
    const trendSource = topSignal.sources.find(s => s.name === 'trend');
    let trendText = '';
    if (trendSource?.rawData) {
        const data = trendSource.rawData as { priceChange7d?: number };
        if (data.priceChange7d !== undefined) {
            trendText = `, ${formatPriceChange(data.priceChange7d)} this week`;
        }
    }

    return `Scanning markets... ${asset} looks ${direction} (${confidence}% confidence)${trendText}.`;
}

/**
 * Format a holding position message
 */
function formatHoldingMessage(position: FormattedPosition, signal: Signal | null): string {
    const asset = getAssetName(position.marketSymbol);
    const side = position.side;
    const pnlPct = formatPnlPct(position.unrealizedPnlPct);
    const pnlUsd = formatPnlUsd(position.unrealizedPnl);

    // Determine market sentiment
    let marketSentiment = '';
    if (signal) {
        if (signal.direction === 'NEUTRAL') {
            marketSentiment = 'Markets quiet. ';
        } else {
            const direction = signal.direction === 'LONG' ? 'bullish' : 'bearish';
            marketSentiment = `Markets looking ${direction}. `;
        }
    }

    return `${marketSentiment}Holding ${asset} ${side} position, currently ${pnlPct} (${pnlUsd}).`;
}

/**
 * Format a conversational market update message
 */
export function formatMarketUpdate(context: MarketUpdateContext): string {
    const { signals, positions } = context;

    // Handle empty signals
    if (signals.length === 0) {
        return 'Scanning markets for opportunities...';
    }

    // Find positions we're holding
    const heldAssets = new Set(positions.map(p => p.marketSymbol));

    // Get the top signal
    const topSignal = getTopSignal(signals);

    // If we have positions, report on them
    if (positions.length > 0) {
        const position = positions[0]; // Focus on first position
        const signalForAsset = signals.find(s => s.asset === position.marketSymbol) || null;
        return formatHoldingMessage(position, signalForAsset);
    }

    // No positions - report market scan
    if (topSignal) {
        return formatMarketScan(topSignal);
    }

    // All signals neutral
    const firstSignal = signals[0];
    if (firstSignal) {
        const asset = getAssetName(firstSignal.asset);
        return `Scanning ${asset}... markets are quiet, no clear signals.`;
    }

    return 'Scanning markets for opportunities...';
}
